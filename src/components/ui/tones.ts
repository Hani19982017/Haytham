// Shared vocabulary for the "Wayfinding" design system.
// Every view maps domain states to the same tones and labels through this file,
// so a risk level or plan status looks and reads the same everywhere.

export type Tone = 'ink' | 'sign' | 'route' | 'signal' | 'caution' | 'lane' | 'plum';

export type Bilingual = { ar: string; en: string };

export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

/** CSS colour used for stripes, dots and lines for each tone. */
export const toneColor: Record<Tone, string> = {
  ink: 'var(--color-ink-400)',
  sign: 'var(--color-sign-600)',
  route: 'var(--color-route-500)',
  signal: 'var(--color-signal-500)',
  caution: 'var(--color-caution-500)',
  lane: 'var(--color-lane-500)',
  plum: 'var(--color-plum-500)',
};

/** Soft chip class for each tone. */
export const chipClass: Record<Tone, string> = {
  ink: 'chip chip-ink',
  sign: 'chip chip-sign',
  route: 'chip chip-route',
  signal: 'chip chip-signal',
  caution: 'chip chip-caution',
  lane: 'chip chip-lane',
  plum: 'chip chip-plum',
};

/** Text colour utility for each tone (for numbers and inline emphasis). */
export const toneText: Record<Tone, string> = {
  ink: 'text-ink-800',
  sign: 'text-sign-700',
  route: 'text-route-800',
  signal: 'text-signal-600',
  caution: 'text-caution-700',
  lane: 'text-lane-600',
  plum: 'text-plum-600',
};

/** Soft background utility for each tone (icon plates, highlights). */
export const toneSoftBg: Record<Tone, string> = {
  ink: 'bg-ink-100 text-ink-700',
  sign: 'bg-sign-50 text-sign-700',
  route: 'bg-route-100 text-route-800',
  signal: 'bg-signal-50 text-signal-600',
  caution: 'bg-caution-50 text-caution-700',
  lane: 'bg-lane-50 text-lane-600',
  plum: 'bg-plum-50 text-plum-600',
};

/** Solid background utility for icon plates on page headers. */
export const toneSolidBg: Record<Tone, string> = {
  ink: 'bg-ink-800 text-white',
  sign: 'bg-sign-600 text-white',
  route: 'bg-route-400 text-ink-950',
  signal: 'bg-signal-500 text-white',
  caution: 'bg-caution-500 text-white',
  lane: 'bg-lane-500 text-white',
  plum: 'bg-plum-500 text-white',
};

// --- Risk -------------------------------------------------------------------
export const riskTone: Record<string, Tone> = {
  LOW: 'sign',
  MEDIUM: 'route',
  HIGH: 'caution',
  CRITICAL: 'signal',
};

export const riskLabel: Record<string, Bilingual> = {
  LOW: { ar: 'مستقر', en: 'Low risk' },
  MEDIUM: { ar: 'متوسط', en: 'Medium risk' },
  HIGH: { ar: 'مرتفع', en: 'High risk' },
  CRITICAL: { ar: 'حرج', en: 'Critical' },
};

// --- Study plan status ---------------------------------------------------------
export const planStatusTone: Record<string, Tone> = {
  Draft: 'ink',
  'Pending Review': 'route',
  Approved: 'sign',
  Rejected: 'signal',
  Archived: 'ink',
};

export const planStatusLabel: Record<string, Bilingual> = {
  Draft: { ar: 'مسودة', en: 'Draft' },
  'Pending Review': { ar: 'بانتظار المرشد', en: 'Awaiting advisor' },
  Approved: { ar: 'معتمدة', en: 'Approved' },
  Rejected: { ar: 'مطلوب تعديل', en: 'Changes requested' },
  Archived: { ar: 'مؤرشفة', en: 'Archived' },
};

// --- Academic tracks -----------------------------------------------------------
export const trackTone: Record<string, Tone> = {
  General: 'ink',
  'Artificial Intelligence': 'plum',
  'Networks & Cyber Security': 'lane',
};

export const trackLabel: Record<string, Bilingual> = {
  General: { ar: 'المسار العام', en: 'General track' },
  'Artificial Intelligence': { ar: 'الذكاء الاصطناعي', en: 'Artificial Intelligence' },
  'Networks & Cyber Security': { ar: 'الشبكات والأمن السيبراني', en: 'Networks & Cyber Security' },
};

// --- Summer training -----------------------------------------------------------
export const trainingTone: Record<string, Tone> = {
  Pending: 'route',
  Accepted: 'lane',
  Passed: 'sign',
  Failed: 'signal',
};

export const trainingLabel: Record<string, Bilingual> = {
  Pending: { ar: 'قيد المراجعة', en: 'Under review' },
  Accepted: { ar: 'مقبول', en: 'Accepted' },
  Passed: { ar: 'مجتاز', en: 'Passed' },
  Failed: { ar: 'غير مجتاز', en: 'Not passed' },
};

// --- Course record status --------------------------------------------------------
export const recordTone: Record<string, Tone> = {
  PASSED: 'sign',
  FAILED: 'signal',
  ENROLLED: 'lane',
  IN_PROGRESS: 'lane',
  WITHDRAWN: 'ink',
  INCOMPLETE: 'caution',
};

export const recordLabel: Record<string, Bilingual> = {
  PASSED: { ar: 'ناجح', en: 'Passed' },
  FAILED: { ar: 'راسب', en: 'Failed' },
  ENROLLED: { ar: 'مسجّل', en: 'Enrolled' },
  IN_PROGRESS: { ar: 'قيد الدراسة', en: 'In progress' },
  WITHDRAWN: { ar: 'منسحب', en: 'Withdrawn' },
  INCOMPLETE: { ar: 'غير مكتمل', en: 'Incomplete' },
};

// --- Roles -------------------------------------------------------------------
export const roleLabel: Record<string, Bilingual> = {
  ADMIN: { ar: 'مدير النظام', en: 'Administrator' },
  ACADEMIC_ADVISOR: { ar: 'مرشد أكاديمي', en: 'Academic advisor' },
  INSTRUCTOR: { ar: 'عضو هيئة التدريس', en: 'Instructor' },
  STUDENT: { ar: 'طالب', en: 'Student' },
  PROCESS_OFFICER: { ar: 'شؤون الطلاب', en: 'Student affairs' },
  DEPARTMENT_HEAD: { ar: 'رئيس القسم', en: 'Department head' },
};

/** Each role travels on its own coloured "line". */
export const roleTone: Record<string, Tone> = {
  ADMIN: 'signal',
  ACADEMIC_ADVISOR: 'lane',
  INSTRUCTOR: 'plum',
  STUDENT: 'sign',
  PROCESS_OFFICER: 'ink',
  DEPARTMENT_HEAD: 'caution',
};

// --- Grades --------------------------------------------------------------------
export const gradeTone = (grade?: string | null): Tone => {
  if (!grade) return 'ink';
  const g = grade.toUpperCase();
  if (g.startsWith('F')) return 'signal';
  if (g.startsWith('D')) return 'caution';
  if (g.startsWith('C')) return 'route';
  if (g.startsWith('B')) return 'lane';
  return 'sign';
};

/** Bylaw credit ceiling for a regular semester, by cumulative GPA (README §1). */
export const creditCapForGpa = (gpa: number): number => {
  if (gpa >= 3) return 21;
  if (gpa >= 2) return 18;
  if (gpa >= 1) return 15;
  return 12;
};

export const pick = (lang: string, value?: Bilingual | null, fallback = ''): string =>
  value ? (lang === 'ar' ? value.ar : value.en) : fallback;

/**
 * Seed and SIS names often carry extra context in brackets, e.g.
 * "د. حسن البدري (Dr. Hassan El-Badry)" or "عمر فاروق (طالب - تحت الإنذار)".
 * Return just the person's name in the requested language.
 */
export const personName = (raw: string | undefined | null, lang: string): string => {
  if (!raw) return '';
  const s = raw.trim();
  const head = s.split('(')[0].trim();
  if (lang === 'ar' || /^[A-Za-z]/.test(s)) return head || s;
  const latin = s.match(/\(([A-Za-z][^()]*)/);
  return latin ? latin[1].trim() : head || s;
};
