import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { AcademicAlertType, AcademicRiskLevel, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type GradebookRiskDetectionPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const GRADEBOOK_DETECT_RISKS_JOB = 'gradebook:detect-risks';

// ─── Settings shape (parsed from tenant JSONB) ──────────────────────────────

interface RiskDetectionConfig {
  enabled: boolean;
  /** Minimum assessments required before risk analysis runs */
  minAssessments: number;
  /** Threshold percentage below class mean to flag at-risk (e.g. 15 = 15%) */
  belowClassMeanThresholdPct: number;
  /** Percentage drop in trajectory to flag medium risk (e.g. 10 = 10%) */
  trajectoryDropMediumPct: number;
  /** Percentage drop in trajectory to flag high risk (e.g. 20 = 20%) */
  trajectoryDropHighPct: number;
  /** Number of standard deviations for score anomaly detection */
  scoreAnomalyStdDevThreshold: number;
  /** Percentage drop in class average vs previous assessment to flag class anomaly */
  classAnomalyDropPct: number;
  /** Max standard deviation for teacher grading pattern anomaly (suspiciously uniform) */
  gradingPatternMaxStdDev: number;
}

const DEFAULT_CONFIG: RiskDetectionConfig = {
  enabled: true,
  minAssessments: 3,
  belowClassMeanThresholdPct: 15,
  trajectoryDropMediumPct: 10,
  trajectoryDropHighPct: 20,
  scoreAnomalyStdDevThreshold: 2,
  classAnomalyDropPct: 25,
  gradingPatternMaxStdDev: 2,
};

// ─── Internal types ───────────────────────────────────────────────────────────

interface GradeDataPoint {
  assessment_id: string;
  student_id: string;
  subject_id: string;
  class_id: string;
  raw_score: number;
  max_score: number;
  /** percentage 0–100 */
  pct: number;
  entered_by_user_id: string;
  created_at: Date;
}

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.GRADEBOOK)
export class GradebookRiskDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(GradebookRiskDetectionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<GradebookRiskDetectionPayload>): Promise<void> {
    if (job.name !== GRADEBOOK_DETECT_RISKS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${GRADEBOOK_DETECT_RISKS_JOB} — tenant ${tenant_id}`,
    );

    const innerJob = new GradebookRiskDetectionJob(this.prisma);
    await innerJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class GradebookRiskDetectionJob extends TenantAwareJob<GradebookRiskDetectionPayload> {
  private readonly logger = new Logger(GradebookRiskDetectionJob.name);

  protected async processJob(
    data: GradebookRiskDetectionPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // 1. Read tenant settings
    const config = await this.readRiskConfig(tx, tenant_id);

    if (!config.enabled) {
      this.logger.log(`Risk detection disabled for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 2. Load all graded records for this tenant (graded/closed assessments counted toward report cards).
    //    We join through Assessment to get max_score, subject_id and class_id.
    const gradeRows = await tx.grade.findMany({
      where: {
        tenant_id,
        is_missing: false,
        raw_score: { not: null },
        assessment: {
          status: { in: ['closed', 'locked'] },
          counts_toward_report_card: true,
        },
      },
      include: {
        assessment: {
          select: {
            max_score: true,
            subject_id: true,
            class_id: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    if (gradeRows.length === 0) {
      this.logger.log(`Tenant ${tenant_id}: no graded assessments found, skipping.`);
      return;
    }

    // 3. Flatten into GradeDataPoint array with percentage scores
    const grades: GradeDataPoint[] = gradeRows.map((g) => {
      const rawScore = Number(g.raw_score);
      const maxScore = Number(g.assessment.max_score);
      const pct = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
      return {
        assessment_id: g.assessment_id,
        student_id: g.student_id,
        subject_id: g.assessment.subject_id,
        class_id: g.assessment.class_id,
        raw_score: rawScore,
        max_score: maxScore,
        pct,
        entered_by_user_id: g.entered_by_user_id,
        created_at: g.created_at,
      };
    });

    // 4. Get active students
    const students = await tx.student.findMany({
      where: { tenant_id, status: 'active' },
      select: { id: true },
    });

    const activeStudentIds = new Set(students.map((s) => s.id));

    const today = new Date();
    const detectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let alertsCreated = 0;

    // ── A. Per-student risk analysis ────────────────────────────────────────
    // Group grades by student → subject
    const gradesByStudentSubject = new Map<string, GradeDataPoint[]>();
    for (const g of grades) {
      if (!activeStudentIds.has(g.student_id)) continue;
      const key = `${g.student_id}::${g.subject_id}`;
      const bucket = gradesByStudentSubject.get(key) ?? [];
      bucket.push(g);
      gradesByStudentSubject.set(key, bucket);
    }

    // Class mean per subject (across all students in the class)
    const classMeanByClassSubject = new Map<string, number>();
    const gradesByClassSubject = new Map<string, GradeDataPoint[]>();
    for (const g of grades) {
      const key = `${g.class_id}::${g.subject_id}`;
      const bucket = gradesByClassSubject.get(key) ?? [];
      bucket.push(g);
      gradesByClassSubject.set(key, bucket);
    }
    for (const [key, pts] of gradesByClassSubject) {
      classMeanByClassSubject.set(key, mean(pts.map((p) => p.pct)));
    }

    for (const [studentSubjectKey, studentGrades] of gradesByStudentSubject) {
      const [studentId, subjectId] = studentSubjectKey.split('::');
      if (!studentId || !subjectId) continue;

      if (studentGrades.length < config.minAssessments) continue;

      const classId = studentGrades[0]!.class_id;

      // a) At-risk detection — trajectory + class mean comparison
      const trajectoryAlert = this.detectAtRisk(
        studentId,
        subjectId,
        tenant_id,
        studentGrades,
        classMeanByClassSubject.get(`${classId}::${subjectId}`) ?? 0,
        config,
        detectedDate,
      );
      if (trajectoryAlert) {
        alertsCreated += await this.createAlertSafe(tx, trajectoryAlert);
      }

      // b) Score anomaly detection — individual grades > N stddev from student's mean
      const anomalyAlerts = this.detectScoreAnomalies(
        studentId,
        subjectId,
        tenant_id,
        studentGrades,
        config,
        detectedDate,
      );
      for (const alert of anomalyAlerts) {
        alertsCreated += await this.createAlertSafe(tx, alert);
      }
    }

    // ── B. Class-level anomaly detection ────────────────────────────────────
    // Group grades by class + subject + assessment, ordered by assessment creation time
    const gradesByAssessment = new Map<string, { classSubjectKey: string; grades: GradeDataPoint[] }>();
    for (const g of grades) {
      const key = g.assessment_id;
      const existing = gradesByAssessment.get(key);
      if (existing) {
        existing.grades.push(g);
      } else {
        gradesByAssessment.set(key, {
          classSubjectKey: `${g.class_id}::${g.subject_id}`,
          grades: [g],
        });
      }
    }

    // For each class+subject pair, check consecutive assessment averages
    const assessmentsByClassSubject = new Map<
      string,
      Array<{ assessment_id: string; avg_pct: number; created_at: Date }>
    >();
    for (const [assessmentId, { classSubjectKey, grades: asmGrades }] of gradesByAssessment) {
      const avg = mean(asmGrades.map((g) => g.pct));
      const createdAt = asmGrades[0]!.created_at;
      const bucket = assessmentsByClassSubject.get(classSubjectKey) ?? [];
      bucket.push({ assessment_id: assessmentId, avg_pct: avg, created_at: createdAt });
      assessmentsByClassSubject.set(classSubjectKey, bucket);
    }

    for (const [classSubjectKey, assessmentAverages] of assessmentsByClassSubject) {
      if (assessmentAverages.length < 2) continue;

      // Sort by created_at ascending
      assessmentAverages.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

      const [classId, subjectId] = classSubjectKey.split('::');
      if (!classId || !subjectId) continue;

      for (let i = 1; i < assessmentAverages.length; i++) {
        const prev = assessmentAverages[i - 1]!;
        const curr = assessmentAverages[i]!;

        if (prev.avg_pct === 0) continue;

        const dropPct = ((prev.avg_pct - curr.avg_pct) / prev.avg_pct) * 100;

        if (dropPct >= config.classAnomalyDropPct) {
          // Find any student in this class to associate the alert — use null subject approach
          // Class anomaly is not student-specific; pick no student (we attach it tenant-wide).
          // However, StudentAcademicRiskAlert requires student_id.
          // We'll skip per student and instead skip — the schema requires student_id.
          // Instead emit one alert per affected student in that class+subject.
          const studentsInClass = grades
            .filter(
              (g) =>
                g.class_id === classId &&
                g.subject_id === subjectId &&
                activeStudentIds.has(g.student_id),
            )
            .map((g) => g.student_id);
          const uniqueStudents = [...new Set(studentsInClass)];

          for (const studentId of uniqueStudents) {
            alertsCreated += await this.createAlertSafe(tx, {
              tenant_id,
              student_id: studentId,
              subject_id: subjectId,
              risk_level: 'medium',
              alert_type: 'class_anomaly',
              trigger_reason: `Class average dropped ${dropPct.toFixed(1)}% from assessment ${prev.assessment_id} to ${curr.assessment_id}`,
              details_json: {
                previous_assessment_id: prev.assessment_id,
                current_assessment_id: curr.assessment_id,
                previous_avg_pct: Math.round(prev.avg_pct * 100) / 100,
                current_avg_pct: Math.round(curr.avg_pct * 100) / 100,
                drop_pct: Math.round(dropPct * 100) / 100,
                threshold_pct: config.classAnomalyDropPct,
              },
              detected_date: detectedDate,
            });
          }
        }
      }
    }

    // ── C. Teacher grading pattern anomaly ──────────────────────────────────
    // Group grades by teacher (entered_by_user_id) + assessment
    const gradesByTeacherAssessment = new Map<string, number[]>();
    for (const g of grades) {
      const key = `${g.entered_by_user_id}::${g.assessment_id}`;
      const bucket = gradesByTeacherAssessment.get(key) ?? [];
      bucket.push(g.pct);
      gradesByTeacherAssessment.set(key, bucket);
    }

    // Group assessments per teacher
    const assessmentsByTeacher = new Map<string, Array<{ assessment_id: string; stddev: number; pcts: number[] }>>();
    for (const [key, pcts] of gradesByTeacherAssessment) {
      const [teacherId, assessmentId] = key.split('::');
      if (!teacherId || !assessmentId) continue;
      if (pcts.length < 3) continue; // Need enough grades to measure uniformity

      const sd = stddev(pcts);
      const bucket = assessmentsByTeacher.get(teacherId) ?? [];
      bucket.push({ assessment_id: assessmentId, stddev: sd, pcts });
      assessmentsByTeacher.set(teacherId, bucket);
    }

    for (const [, teacherAssessments] of assessmentsByTeacher) {
      // Flag assessments where teacher's grades have suspiciously low variance
      for (const { assessment_id: assessmentId, stddev: sd, pcts } of teacherAssessments) {
        if (sd < config.gradingPatternMaxStdDev && pcts.length >= 5) {
          // Find students who received grades in this assessment
          const affectedGrades = grades.filter(
            (g) => g.assessment_id === assessmentId && activeStudentIds.has(g.student_id),
          );

          for (const g of affectedGrades) {
            alertsCreated += await this.createAlertSafe(tx, {
              tenant_id,
              student_id: g.student_id,
              subject_id: g.subject_id,
              risk_level: 'low',
              alert_type: 'grading_pattern_anomaly',
              trigger_reason: `Teacher grading pattern shows suspiciously uniform scores (stddev ${sd.toFixed(2)}) on assessment ${assessmentId}`,
              details_json: {
                assessment_id: assessmentId,
                stddev: Math.round(sd * 100) / 100,
                grade_count: pcts.length,
                threshold_stddev: config.gradingPatternMaxStdDev,
              },
              detected_date: detectedDate,
            });
          }
        }
      }
    }

    this.logger.log(
      `Tenant ${tenant_id}: risk detection complete — ${alertsCreated} new alert(s) created`,
    );
  }

  // ─── At-risk detection ───────────────────────────────────────────────────

  private detectAtRisk(
    studentId: string,
    subjectId: string,
    tenantId: string,
    studentGrades: GradeDataPoint[],
    classMean: number,
    config: RiskDetectionConfig,
    detectedDate: Date,
  ): AlertCreateData | null {
    // Sort ascending by created_at to get chronological order
    const sorted = [...studentGrades].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const pcts = sorted.map((g) => g.pct);

    // Calculate trajectory: avg of last 3 vs avg of previous 3
    let trajectoryDrop = 0;
    let recentAvg = 0;
    let previousAvg = 0;

    if (pcts.length >= 6) {
      recentAvg = mean(pcts.slice(-3));
      previousAvg = mean(pcts.slice(-6, -3));
      if (previousAvg > 0) {
        trajectoryDrop = ((previousAvg - recentAvg) / previousAvg) * 100;
      }
    } else if (pcts.length >= 3) {
      const half = Math.floor(pcts.length / 2);
      recentAvg = mean(pcts.slice(-half));
      previousAvg = mean(pcts.slice(0, half));
      if (previousAvg > 0) {
        trajectoryDrop = ((previousAvg - recentAvg) / previousAvg) * 100;
      }
    }

    const overallAvg = mean(pcts);
    const belowClassMeanPct = classMean > 0 ? ((classMean - overallAvg) / classMean) * 100 : 0;

    // Determine risk level
    let riskLevel: AcademicRiskLevel | null = null;
    let alertType: AcademicAlertType | null = null;

    if (trajectoryDrop >= config.trajectoryDropHighPct) {
      riskLevel = 'high';
      alertType = 'at_risk_high';
    } else if (
      trajectoryDrop >= config.trajectoryDropMediumPct ||
      belowClassMeanPct >= config.belowClassMeanThresholdPct
    ) {
      riskLevel = 'medium';
      alertType = 'at_risk_medium';
    } else if (
      trajectoryDrop > 0 &&
      belowClassMeanPct > config.belowClassMeanThresholdPct / 2
    ) {
      riskLevel = 'low';
      alertType = 'at_risk_low';
    }

    if (!riskLevel || !alertType) return null;

    return {
      tenant_id: tenantId,
      student_id: studentId,
      subject_id: subjectId,
      risk_level: riskLevel,
      alert_type: alertType,
      trigger_reason: `Student average ${overallAvg.toFixed(1)}% is ${belowClassMeanPct.toFixed(1)}% below class mean; trajectory dropped ${trajectoryDrop.toFixed(1)}%`,
      details_json: {
        overall_avg_pct: Math.round(overallAvg * 100) / 100,
        class_mean_pct: Math.round(classMean * 100) / 100,
        below_class_mean_pct: Math.round(belowClassMeanPct * 100) / 100,
        recent_avg_pct: Math.round(recentAvg * 100) / 100,
        previous_avg_pct: Math.round(previousAvg * 100) / 100,
        trajectory_drop_pct: Math.round(trajectoryDrop * 100) / 100,
        assessment_count: pcts.length,
      },
      detected_date: detectedDate,
    };
  }

  // ─── Score anomaly detection ─────────────────────────────────────────────

  private detectScoreAnomalies(
    studentId: string,
    subjectId: string,
    tenantId: string,
    studentGrades: GradeDataPoint[],
    config: RiskDetectionConfig,
    detectedDate: Date,
  ): AlertCreateData[] {
    const pcts = studentGrades.map((g) => g.pct);
    const m = mean(pcts);
    const sd = stddev(pcts);

    if (sd === 0) return []; // All scores identical — no variance to flag

    const alerts: AlertCreateData[] = [];
    const threshold = config.scoreAnomalyStdDevThreshold;

    for (const g of studentGrades) {
      const zScore = (g.pct - m) / sd;
      if (Math.abs(zScore) > threshold) {
        alerts.push({
          tenant_id: tenantId,
          student_id: studentId,
          subject_id: subjectId,
          risk_level: 'low',
          alert_type: 'score_anomaly',
          trigger_reason: `Score ${g.pct.toFixed(1)}% on assessment ${g.assessment_id} is ${Math.abs(zScore).toFixed(2)} standard deviations from student mean`,
          details_json: {
            assessment_id: g.assessment_id,
            score_pct: Math.round(g.pct * 100) / 100,
            student_mean_pct: Math.round(m * 100) / 100,
            student_stddev: Math.round(sd * 100) / 100,
            z_score: Math.round(zScore * 100) / 100,
            threshold_stddev: threshold,
          },
          detected_date: detectedDate,
        });
      }
    }

    return alerts;
  }

  // ─── Config reader ───────────────────────────────────────────────────────

  private async readRiskConfig(
    tx: PrismaClient,
    tenantId: string,
  ): Promise<RiskDetectionConfig> {
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const gradebookSettings = (settings.gradebook as Record<string, unknown>) ?? {};
    const riskConfig = (gradebookSettings.riskDetection as Record<string, unknown>) ?? {};

    return {
      enabled:
        typeof riskConfig.enabled === 'boolean'
          ? riskConfig.enabled
          : DEFAULT_CONFIG.enabled,
      minAssessments:
        typeof riskConfig.minAssessments === 'number'
          ? riskConfig.minAssessments
          : DEFAULT_CONFIG.minAssessments,
      belowClassMeanThresholdPct:
        typeof riskConfig.belowClassMeanThresholdPct === 'number'
          ? riskConfig.belowClassMeanThresholdPct
          : DEFAULT_CONFIG.belowClassMeanThresholdPct,
      trajectoryDropMediumPct:
        typeof riskConfig.trajectoryDropMediumPct === 'number'
          ? riskConfig.trajectoryDropMediumPct
          : DEFAULT_CONFIG.trajectoryDropMediumPct,
      trajectoryDropHighPct:
        typeof riskConfig.trajectoryDropHighPct === 'number'
          ? riskConfig.trajectoryDropHighPct
          : DEFAULT_CONFIG.trajectoryDropHighPct,
      scoreAnomalyStdDevThreshold:
        typeof riskConfig.scoreAnomalyStdDevThreshold === 'number'
          ? riskConfig.scoreAnomalyStdDevThreshold
          : DEFAULT_CONFIG.scoreAnomalyStdDevThreshold,
      classAnomalyDropPct:
        typeof riskConfig.classAnomalyDropPct === 'number'
          ? riskConfig.classAnomalyDropPct
          : DEFAULT_CONFIG.classAnomalyDropPct,
      gradingPatternMaxStdDev:
        typeof riskConfig.gradingPatternMaxStdDev === 'number'
          ? riskConfig.gradingPatternMaxStdDev
          : DEFAULT_CONFIG.gradingPatternMaxStdDev,
    };
  }

  // ─── Alert creation with dedup ───────────────────────────────────────────

  /**
   * Create a risk alert, skipping if an active alert of the same type
   * already exists for this student + subject + detected_date combination.
   *
   * Unlike AttendancePatternAlert (which has a unique index), StudentAcademicRiskAlert
   * has no unique constraint, so we guard with a findFirst check before creating.
   */
  private async createAlertSafe(
    tx: PrismaClient,
    data: AlertCreateData,
  ): Promise<number> {
    try {
      const existing = await tx.studentAcademicRiskAlert.findFirst({
        where: {
          tenant_id: data.tenant_id,
          student_id: data.student_id,
          subject_id: data.subject_id ?? null,
          alert_type: data.alert_type,
          detected_date: data.detected_date,
          status: 'active',
        },
        select: { id: true },
      });

      if (existing) return 0;

      await tx.studentAcademicRiskAlert.create({
        data: {
          tenant_id: data.tenant_id,
          student_id: data.student_id,
          subject_id: data.subject_id ?? null,
          risk_level: data.risk_level,
          alert_type: data.alert_type,
          trigger_reason: data.trigger_reason,
          details_json: JSON.parse(JSON.stringify(data.details_json)),
          detected_date: data.detected_date,
          status: 'active',
        },
      });
      return 1;
    } catch (err: unknown) {
      // P2002 = unique constraint violation (belt-and-suspenders if index is added later)
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return 0;
      }
      throw err;
    }
  }
}

// ─── Internal alert create data ───────────────────────────────────────────────

interface AlertCreateData {
  tenant_id: string;
  student_id: string;
  subject_id: string | undefined;
  risk_level: AcademicRiskLevel;
  alert_type: AcademicAlertType;
  trigger_reason: string;
  details_json: Record<string, unknown>;
  detected_date: Date;
}

// ─── Math utilities ───────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
