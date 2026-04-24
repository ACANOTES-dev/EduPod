// ─── Student Risk Assessment Prompt ────────────────────────────────────────

export const STUDENT_RISK_PROMPT_VERSION = 1;

interface StudentRiskData {
  student_code: string;
  student_name: string;
  year_group: string;
  recent_attendance_rate?: number;
  behaviour_incidents_30d?: number;
  recent_grades?: Array<{ subject: string; grade: string; score?: number }>;
  has_sen_profile?: boolean;
  has_open_safeguarding?: boolean;
  chronic_absenteeism?: boolean;
}

export function buildStudentRiskPrompt(data: StudentRiskData): string {
  const riskFactors = [];

  if ((data.recent_attendance_rate ?? 100) < 85) {
    riskFactors.push(`Low attendance rate: ${data.recent_attendance_rate}%`);
  }
  if ((data.behaviour_incidents_30d ?? 0) > 3) {
    riskFactors.push(
      `Multiple recent behaviour incidents: ${data.behaviour_incidents_30d} in last 30 days`,
    );
  }
  if (data.recent_grades && data.recent_grades.some((g) => g.grade === 'F' || (g.score ?? 100) < 50)) {
    riskFactors.push('Recent failing or very low grades');
  }
  if (data.has_sen_profile) {
    riskFactors.push('SEN profile on file');
  }
  if (data.has_open_safeguarding) {
    riskFactors.push('Active safeguarding concern');
  }
  if (data.chronic_absenteeism) {
    riskFactors.push('Pattern of chronic absenteeism');
  }

  return `You are an educational analytics AI assessing student risk. Given the data below, produce a risk score from 0 to 100 (0 = no risk, 100 = critical risk) and a 2-sentence plain-English explanation of the top contributing factors.

Student: ${data.student_name} (${data.student_code}), Year Group: ${data.year_group}

Risk Factors:
${riskFactors.length > 0 ? riskFactors.map((f) => `- ${f}`).join('\n') : '- No significant risk factors identified'}

Attendance: ${data.recent_attendance_rate ?? 'unknown'}%
Behaviour Incidents (30d): ${data.behaviour_incidents_30d ?? 0}
Recent Grades: ${data.recent_grades ? data.recent_grades.map((g) => `${g.subject}=${g.grade}`).join(', ') : 'none'}
SEN Profile: ${data.has_sen_profile ? 'yes' : 'no'}
Safeguarding: ${data.has_open_safeguarding ? 'active concern' : 'none'}
Chronic Absenteeism: ${data.chronic_absenteeism ? 'yes' : 'no'}

Respond with ONLY valid JSON (no explanation, no markdown):
{
  "risk_score": <0-100 integer>,
  "narrative": "<2-sentence explanation>",
  "factors": [
    { "label": "<string>", "weight": "<high|medium|low>" }
  ],
  "confidence": "<high|medium|low>"
}`;
}
