/**
 * Arabic diagnostic translations.
 *
 * Every code in DIAGNOSTIC_CODES must have an entry here.
 * The coverage spec asserts this at test time.
 */
import type { DiagnosticCode } from '../diagnostic-codes';
import type { DiagnosticTranslation } from '../diagnostic-types';

export const AR_TRANSLATIONS: Record<DiagnosticCode, DiagnosticTranslation> = {
  // ─── Feasibility sweep ──────────────────────────────────────────────────────

  global_capacity_shortfall: {
    headline: (ctx) => `لا توجد طاقة تدريسية كافية — ينقص ${ctx.shortfall_periods ?? 0} حصة/حصص`,
    detail: (ctx) =>
      `تحتاج المدرسة إلى ${ctx.demand_periods ?? 0} حصة تدريسية أسبوعياً، ` +
      `لكن المعلمين المؤهلين يمكنهم تغطية ${ctx.supply_periods ?? 0} حصة فقط. ` +
      `لا يمكن جدولة ${ctx.shortfall_periods ?? 0} حصة/حصص.`,
    solution_templates: [
      {
        id: 'global_add_teachers',
        effort: 'long',
        headline: () => 'توظيف أو تأهيل مزيد من المعلمين',
        detail: (ctx) =>
          `أضف ${ctx.additional_teachers ?? 1} معلم/معلمين مؤهلين إضافيين لتغطية النقص.`,
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'global_reduce_demand',
        effort: 'medium',
        headline: () => 'تقليل متطلبات المنهج',
        detail: () =>
          'قلل الحد الأدنى لعدد الحصص الأسبوعية للمواد الأقل أولوية لتتوافق مع القدرة المتاحة.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  subject_capacity_shortfall: {
    headline: (ctx) =>
      `لا يوجد معلمون كافون لمادة ${ctx.subject?.name ?? 'المادة'} — ينقص ${ctx.shortfall_periods ?? 0} حصة/حصص`,
    detail: (ctx) =>
      `تحتاج مادة ${ctx.subject?.name ?? 'هذه المادة'} إلى ${ctx.demand_periods ?? 0} حصة تدريسية، ` +
      `لكن المعلمين المؤهلين يمكنهم تغطية ${ctx.supply_periods ?? 0} حصة فقط.`,
    solution_templates: [
      {
        id: 'subject_broaden_comp',
        effort: 'quick',
        headline: (ctx) => `توسيع كفاءات ${ctx.subject?.name ?? 'المادة'}`,
        detail: (ctx) =>
          `أضف ${ctx.subject?.name ?? 'هذه المادة'} ككفاءة للمعلمين الذين يدرّسون مواد مشابهة.`,
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'subject_raise_cap',
        effort: 'medium',
        headline: () => 'رفع الحد الأقصى الأسبوعي للمعلمين',
        detail: () => 'زد الحد الأقصى لعدد الحصص الأسبوعية للمعلمين المؤهلين.',
        link_template: () => '/scheduling/teacher-config',
      },
    ],
  },

  unreachable_class_subject: {
    headline: (ctx) =>
      `لا يوجد معلم يستطيع تدريس ${ctx.subject?.name ?? 'المادة'} لـ ${ctx.class_label ?? 'الصف'}`,
    detail: (ctx) =>
      `يحتاج ${ctx.class_label ?? 'هذا الصف'} إلى ${ctx.subject?.name ?? 'هذه المادة'}، ` +
      `لكن لا يوجد معلم مؤهل لديه أوقات فراغ تتوافق مع جدول الصف.`,
    solution_templates: [
      {
        id: 'unreachable_add_comp',
        effort: 'quick',
        headline: () => 'تأهيل معلم لهذا الصف',
        detail: (ctx) =>
          `أضف كفاءة معلم لمادة ${ctx.subject?.name ?? 'هذه المادة'} في ${ctx.year_group?.name ?? 'هذه المرحلة'}.`,
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'unreachable_extend_avail',
        effort: 'medium',
        headline: () => 'توسيع أوقات توفر المعلم',
        detail: () =>
          'وسّع ساعات العمل المتاحة بحيث يتوفر معلم مؤهل واحد على الأقل يتوافق مع جدول الصف.',
        link_template: () => '/scheduling/availability',
      },
    ],
  },

  class_weekly_overbook: {
    headline: (ctx) =>
      `${ctx.class_label ?? 'الصف'} لديه حصص مطلوبة أكثر من الفترات المتاحة أسبوعياً`,
    detail: (ctx) =>
      `تتطلب المواد الإلزامية حصصاً أكثر من ${ctx.slot_count ?? 0} فترة متاحة ` +
      `(بعد احتساب الحصص المثبتة). لا يمكن استيعاب ${ctx.blocked_periods ?? 0} حصة/حصص.`,
    solution_templates: [
      {
        id: 'overbook_reduce_demand',
        effort: 'medium',
        headline: () => 'تقليل متطلبات المواد لهذا الصف',
        detail: () => 'قلل الحد الأدنى لعدد الحصص الأسبوعية لمادة أو أكثر.',
        link_template: () => '/scheduling/curriculum',
      },
      {
        id: 'overbook_remove_pins',
        effort: 'quick',
        headline: () => 'إزالة بعض الحصص المثبتة',
        detail: () => 'ألغِ تثبيت الحصص المحددة يدوياً لتحرير مساحة للمُجدول.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_conflict_teacher: {
    headline: (ctx) => `${ctx.teacher?.name ?? 'معلم'} مثبت لصفين في نفس الوقت`,
    detail: (ctx) =>
      `يوجد حصتان مثبتتان أو أكثر تُعيّن ${ctx.teacher?.name ?? 'هذا المعلم'} ` +
      `لفترات متداخلة. لا يمكن للمُجدول تلبية كليهما.`,
    solution_templates: [
      {
        id: 'pin_teacher_remove',
        effort: 'quick',
        headline: () => 'إزالة أحد التثبيتات المتعارضة',
        detail: () => 'ألغِ تثبيت أحد الإدخالات المتداخلة واترك المُجدول يضعه.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_conflict_class: {
    headline: (ctx) => `${ctx.class_label ?? 'صف'} مثبت لمادتين في نفس الوقت`,
    detail: (ctx) =>
      `يوجد حصتان مثبتتان أو أكثر تُعيّن ${ctx.class_label ?? 'هذا الصف'} ` +
      `لنفس الفترة. يمكن جدولة واحدة فقط.`,
    solution_templates: [
      {
        id: 'pin_class_remove',
        effort: 'quick',
        headline: () => 'إزالة أحد التثبيتات المتعارضة',
        detail: () => 'ألغِ تثبيت أحد الإدخالات المتداخلة.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_conflict_room: {
    headline: (ctx) => `${ctx.room?.name ?? 'غرفة'} مثبتة لإدخالين في نفس الوقت`,
    detail: (ctx) =>
      `يوجد حصتان مثبتتان أو أكثر تُعيّن ${ctx.room?.name ?? 'هذه الغرفة'} ` +
      `لنفس الفترة. يمكن لصف واحد فقط استخدامها.`,
    solution_templates: [
      {
        id: 'pin_room_remove',
        effort: 'quick',
        headline: () => 'إزالة أحد التثبيتات المتعارضة',
        detail: () => 'ألغِ تثبيت أحد تعيينات الغرفة المتداخلة.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  room_type_shortfall: {
    headline: (ctx) =>
      `لا توجد غرف ${ctx.room?.name ?? 'متخصصة'} كافية لمادة ${ctx.subject?.name ?? 'المادة'}`,
    detail: (ctx) =>
      `تتطلب مادة ${ctx.subject?.name ?? 'هذه المادة'} نوعاً محدداً من الغرف، ` +
      `لكن سعة الغرف (الغرف × الفترات) أقل من الطلب بـ ${ctx.shortfall_periods ?? 0} حصة/حصص.`,
    solution_templates: [
      {
        id: 'room_add',
        effort: 'long',
        headline: () => 'إضافة مزيد من الغرف من هذا النوع',
        detail: () => 'أنشئ أو خصص غرفاً إضافية تطابق النوع المطلوب.',
        link_template: () => '/scheduling/rooms',
      },
      {
        id: 'room_reduce_demand',
        effort: 'medium',
        headline: () => 'إزالة متطلب نوع الغرفة',
        detail: () => 'اسمح بتدريس المادة في أي غرفة إذا لم تكن الغرفة المخصصة ضرورية.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  double_period_infeasible: {
    headline: (ctx) =>
      `الحصة المزدوجة لمادة ${ctx.subject?.name ?? 'المادة'} في ${ctx.class_label ?? 'الصف'} مستحيلة`,
    detail: (ctx) =>
      `تتطلب مادة ${ctx.subject?.name ?? 'هذه المادة'} حصة مزدوجة، ` +
      `لكن لا يوجد زوج فترات متتالية يتوفر فيهما الصف والمعلم المؤهل معاً.`,
    solution_templates: [
      {
        id: 'double_extend_avail',
        effort: 'medium',
        headline: () => 'توسيع أوقات توفر المعلم ليوم واحد',
        detail: () =>
          'تأكد من أن معلماً مؤهلاً واحداً على الأقل لديه فترتان متتاليتان فارغتان في يوم واحد.',
        link_template: () => '/scheduling/availability',
      },
      {
        id: 'double_remove_req',
        effort: 'quick',
        headline: () => 'إزالة متطلب الحصة المزدوجة',
        detail: () =>
          'اضبط requires_double_period إلى false في المنهج إذا كانت الحصص المفردة مقبولة.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  per_day_cap_conflict: {
    headline: (ctx) => `${ctx.teacher?.name ?? 'معلم'} لا يمكنه تلبية طلبه اليومي ضمن حده اليومي`,
    detail: (ctx) =>
      `الحد الأقصى اليومي لـ ${ctx.teacher?.name ?? 'هذا المعلم'} (${ctx.cap_value ?? 0}) ` +
      `عبر أيام عمله أقل من إجمالي الطلب المُسند إليه. ` +
      `لا يمكن وضع ${ctx.blocked_periods ?? 0} حصة/حصص.`,
    solution_templates: [
      {
        id: 'day_cap_raise',
        effort: 'quick',
        headline: () => 'رفع الحد الأقصى اليومي',
        detail: (ctx) =>
          `زد الحد الأقصى لعدد الحصص اليومية لـ ${ctx.teacher?.name ?? 'هذا المعلم'}.`,
        link_template: () => '/scheduling/teacher-config',
      },
      {
        id: 'day_cap_spread',
        effort: 'medium',
        headline: () => 'توزيع الحمل على مزيد من المعلمين',
        detail: () => 'أهّل معلمين إضافيين للمادة لتقليل الحمل اليومي لكل معلم.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  // ─── IIS constraint types (§B) ────────────────────────────────────────────

  teacher_unavailable: {
    headline: (ctx) => `${ctx.teacher?.name ?? 'معلم'} غير متوفر عند الحاجة`,
    detail: (ctx) =>
      `${ctx.teacher?.name ?? 'هذا المعلم'} مطلوب لتدريس ` +
      `${ctx.subject?.name ?? 'مادة'} لكن ليس لديه توفر في الفترات المطلوبة.`,
    solution_templates: [
      {
        id: 'iis_extend_avail',
        effort: 'quick',
        headline: () => 'توسيع أوقات توفر المعلم',
        detail: () => 'أضف أوقات توفر للفترات الزمنية المطلوبة.',
        link_template: () => '/scheduling/availability',
      },
    ],
  },

  teacher_overloaded: {
    headline: (ctx) => `${ctx.teacher?.name ?? 'معلم'} تجاوز حده الأسبوعي`,
    detail: (ctx) =>
      `${ctx.teacher?.name ?? 'هذا المعلم'} وصل بالفعل إلى الحد الأقصى لحصصه الأسبوعية. ` +
      `لا يمكن تعيين حصص إضافية.`,
    solution_templates: [
      {
        id: 'iis_raise_cap',
        effort: 'quick',
        headline: () => 'رفع الحد الأقصى الأسبوعي',
        detail: () => 'زد الحد الأقصى لعدد الحصص الأسبوعية في إعدادات المعلم.',
        link_template: () => '/scheduling/teacher-config',
      },
    ],
  },

  room_capacity_exceeded: {
    headline: (ctx) => `${ctx.room?.name ?? 'غرفة'} مجدولة بشكل زائد`,
    detail: (ctx) => `${ctx.room?.name ?? 'هذه الغرفة'} مُعيّنة لصفوف أكثر مما لديها من فترات.`,
    solution_templates: [
      {
        id: 'iis_add_room',
        effort: 'long',
        headline: () => 'إضافة غرفة أخرى',
        detail: () => 'أنشئ غرفة إضافية لتوزيع الحمل.',
        link_template: () => '/scheduling/rooms',
      },
    ],
  },

  class_conflict: {
    headline: (ctx) => `${ctx.class_label ?? 'صف'} محجوز مرتين`,
    detail: (ctx) =>
      `${ctx.class_label ?? 'هذا الصف'} مُعيّن لمادتين مختلفتين ` +
      `في نفس الوقت. يجب على المُجدول اختيار واحدة.`,
    solution_templates: [
      {
        id: 'iis_reduce_demand',
        effort: 'medium',
        headline: () => 'تقليل متطلبات المادة',
        detail: () => 'قلل إجمالي الحصص المطلوبة لإحدى المواد المتنافسة.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  subject_demand_exceeds_capacity: {
    headline: (ctx) => `طلب مادة ${ctx.subject?.name ?? 'المادة'} يتجاوز القدرة التدريسية المتاحة`,
    detail: (ctx) =>
      `تتطلب مادة ${ctx.subject?.name ?? 'هذه المادة'} ${ctx.demand_periods ?? 0} حصة، ` +
      `لكن يمكن تغطية ${ctx.supply_periods ?? 0} حصة فقط. ` +
      `يجب ترك ${ctx.shortfall_periods ?? 0} حصة/حصص بدون جدولة.`,
    solution_templates: [
      {
        id: 'iis_broaden',
        effort: 'quick',
        headline: () => 'توسيع كفاءات المعلمين',
        detail: () => 'أهّل مزيداً من المعلمين لهذه المادة.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_blocks_placement: {
    headline: () => 'الحصص المثبتة تمنع الترتيب الأمثل',
    detail: () =>
      'إدخال مثبت يدوياً واحد أو أكثر يمنع المُجدول من وضع الحصص. ' +
      'إلغاء تثبيتها سيتيح للمُجدول إيجاد ترتيب أفضل.',
    solution_templates: [
      {
        id: 'iis_unpin',
        effort: 'quick',
        headline: () => 'مراجعة وإلغاء التثبيت',
        detail: () => 'ألغِ تثبيت الإدخالات غير الضرورية لمنح المُجدول مرونة أكبر.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  double_period_blocked: {
    headline: (ctx) => `لا يمكن جدولة الحصة المزدوجة لمادة ${ctx.subject?.name ?? 'المادة'}`,
    detail: (ctx) =>
      `تتطلب مادة ${ctx.subject?.name ?? 'هذه المادة'} فترات متتالية، ` +
      `لكن لا يوجد زوج صالح بالنظر إلى القيود الحالية.`,
    solution_templates: [
      {
        id: 'iis_double_avail',
        effort: 'medium',
        headline: () => 'تحرير فترات متتالية',
        detail: () => 'تأكد من أن توفر المعلم يسمح بحصتين متتاليتين في يوم واحد على الأقل.',
        link_template: () => '/scheduling/availability',
      },
    ],
  },

  student_overlap_conflict: {
    headline: (ctx) => `صفوف ${ctx.class_label ?? ''} تتشارك طلاباً وتتعارض`,
    detail: () => 'صفان يتشاركان طلاباً مجدولان في نفس الوقت. ' + 'لا يمكن للطلاب حضور كليهما.',
    solution_templates: [
      {
        id: 'iis_overlap_separate',
        effort: 'medium',
        headline: () => 'فصل الصفوف المتداخلة',
        detail: () => 'تأكد من عدم جدولة هذه الصفوف في نفس الفترة، أو أزل تداخل الطلاب.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  // ─── Post-solve categories ────────────────────────────────────────────────

  teacher_supply_shortage: {
    headline: (ctx) =>
      `لا يوجد معلمون كافون لمادة ${ctx.subject?.name ?? 'المادة'} في ${ctx.year_group?.name ?? 'المرحلة'}`,
    detail: (ctx) =>
      `تحتاج مادة ${ctx.subject?.name ?? 'هذه المادة'} إلى ${ctx.demand_periods ?? 0} حصة/أسبوع، ` +
      `لكن المعلمين المؤهلين يمكنهم تغطية ${ctx.supply_periods ?? 0} حصة فقط. ` +
      `${ctx.blocked_periods ?? 0} حصة/حصص لم تُوضع.`,
    solution_templates: [
      {
        id: 'supply_broaden',
        effort: 'quick',
        headline: () => 'توسيع كفاءات المعلمين',
        detail: (ctx) => `أضف ${ctx.subject?.name ?? 'هذه المادة'} ككفاءة لمعلمي المواد ذات الصلة.`,
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'supply_raise_cap',
        effort: 'medium',
        headline: () => 'رفع الحدود الأسبوعية',
        detail: () => 'زد الحد الأقصى لعدد الحصص الأسبوعية للمعلمين المؤهلين.',
        link_template: () => '/scheduling/teacher-config',
      },
      {
        id: 'supply_hire',
        effort: 'long',
        headline: (ctx) => `توظيف ${ctx.additional_teachers ?? 1} معلم/معلمين إضافيين`,
        detail: (ctx) =>
          `عيّن ${ctx.additional_teachers ?? 1} من الموظفين المؤهلين لتدريس ${ctx.subject?.name ?? 'هذه المادة'}.`,
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  workload_cap_hit: {
    headline: (ctx) => `${ctx.teacher?.name ?? 'المعلم/المعلمون'} وصلوا للحد الأقصى الأسبوعي`,
    detail: (ctx) =>
      `${ctx.teacher?.name ?? 'هؤلاء المعلمون'} مجدولون عند أو فوق ` +
      `حدهم الأقصى البالغ ${ctx.cap_value ?? 25} حصة أسبوعياً.`,
    solution_templates: [
      {
        id: 'workload_raise',
        effort: 'quick',
        headline: () => 'رفع الحدود الأسبوعية',
        detail: () => 'زد الحد الأقصى لعدد الحصص الأسبوعية (تحقق من حدود الرفاهية/العقد أولاً).',
        link_template: () => '/scheduling/teacher-config',
      },
      {
        id: 'workload_spread',
        effort: 'medium',
        headline: () => 'توزيع الحمل على مزيد من المعلمين',
        detail: () => 'وسّع تغطية الكفاءات ليتمكن معلمون آخرون من تحمل بعض الحصص.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  availability_pinch: {
    headline: (ctx) =>
      `أوقات التوفر ضيقة لمادة ${ctx.subject?.name ?? 'المادة'} في ${ctx.year_group?.name ?? 'المرحلة'}`,
    detail: (ctx) =>
      `المعلمون المؤهلون لديهم ~${ctx.supply_periods ?? 0} حصة متاحة/أسبوع — ` +
      `غير كافية لتغطية ${ctx.blocked_periods ?? 0} حصة/حصص غير موضوعة.`,
    solution_templates: [
      {
        id: 'avail_extend',
        effort: 'quick',
        headline: () => 'توسيع نوافذ التوفر',
        detail: () => 'وسّع ساعات العمل الأسبوعية للمعلمين المؤهلين.',
        link_template: () => '/scheduling/availability',
      },
      {
        id: 'avail_qualify',
        effort: 'medium',
        headline: () => 'تأهيل مزيد من المعلمين',
        detail: (ctx) => `اجعل موظفين إضافيين مؤهلين لمادة ${ctx.subject?.name ?? 'هذه المادة'}.`,
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_conflict: {
    headline: () => 'تم اكتشاف حصص مثبتة متعارضة',
    detail: () =>
      'حصتان مثبتتان يدوياً أو أكثر تتعارض — نفس المعلم أو الصف أو الغرفة في نفس الفترة. ' +
      'لا يمكن للمُجدول تلبية كليهما.',
    solution_templates: [
      {
        id: 'pin_review',
        effort: 'quick',
        headline: () => 'مراجعة وإلغاء تثبيت الحصص المتعارضة',
        detail: () => 'افتح عرض الحصص المثبتة وأزل أحد التثبيتات المتعارضة.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  unassigned_slots: {
    headline: (ctx) =>
      `${ctx.subject?.name ?? 'المادة'} في ${ctx.year_group?.name ?? 'المرحلة'}: ` +
      `${ctx.blocked_periods ?? 0} حصة/حصص لم تُوضع`,
    detail: (ctx) =>
      `لم يتمكن المُجدول من وضع ${ctx.blocked_periods ?? 0} حصة/حصص لمادة ` +
      `${ctx.subject?.name ?? 'هذه المادة'}. قد تكون شبكة الفترات مشبعة لهذه المادة.`,
    solution_templates: [
      {
        id: 'unassigned_pin',
        effort: 'quick',
        headline: () => 'تثبيت الحصص ذات الأولوية يدوياً',
        detail: () => 'ثبّت الحصص الأهم في فترات محددة ليتجنبها المُجدول بدلاً من إسقاطها.',
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'unassigned_grid',
        effort: 'medium',
        headline: () => 'فتح شبكة الفترات',
        detail: () =>
          'تحقق من وجود فترات تدريسية غير مستخدمة أو إغلاقات غرف تمنع فترات قابلة للاستخدام.',
        link_template: () => '/scheduling/period-grid',
      },
    ],
  },

  solver_budget_exhausted: {
    headline: () => 'نفد وقت المُجدول',
    detail: (ctx) =>
      `استخدم المُجدول كامل ميزانيته الزمنية ولم يتمكن من وضع ${ctx.blocked_periods ?? 0} حصة/حصص. ` +
      `قد تكون هذه قابلة للوضع مع مزيد من الوقت، أو قد تشير إلى مشكلة هيكلية.`,
    solution_templates: [
      {
        id: 'budget_retry',
        effort: 'quick',
        headline: () => 'إعادة التشغيل بميزانية زمنية أطول',
        detail: () =>
          'زد max_solver_duration_seconds وأعد التشغيل. قد يجد المُجدول حلولاً مع مزيد من الوقت.',
        link_template: () => '/scheduling/runs',
      },
      {
        id: 'budget_simplify',
        effort: 'medium',
        headline: () => 'تبسيط القيود',
        detail: () => 'أزل التثبيتات غير الضرورية أو قلل أوزان التفضيلات لمنح المُجدول مساحة أكبر.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },
};
