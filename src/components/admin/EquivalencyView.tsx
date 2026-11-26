import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { AcademicRuleConfig, Course, EquivalencyCaseSummary, EquivalencyEvaluation, EquivalencyItemInput, Student } from '../../types/index.js';
import { PageHeader, Panel, PanelHeader, Chip, Loader, EmptyState, Segmented, Toast, Field, cn, chipClass, gradeTone, personName, trackLabel, pick } from '../ui/index.js';
import {
  Repeat,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  UserPlus,
  Users,
  Building2,
  Scale,
  Wand2,
  KeyRound,
  RotateCcw,
  Info,
} from 'lucide-react';

type Row = EquivalencyItemInput & { key: string };

const errorText = (err: any, language: string, ar: string, en: string) => {
  const data = err?.response?.data;
  return (language === 'ar' ? data?.messageAr : data?.messageEn) || (language === 'ar' ? ar : en);
};

let rowSeq = 0;
const newRow = (over: Partial<EquivalencyItemInput> = {}): Row => ({
  key: `r${++rowSeq}`,
  externalCode: '',
  externalName: '',
  externalCredits: 3,
  externalMark: null,
  externalGrade: '',
  courseCode: '',
  ...over,
});

const STOP = new Set(['and', 'of', 'to', 'the', 'in', 'for', 'introduction', 'intro', 'i', 'ii', '1', '2', '&', 'و', 'في', 'إلى', 'مقدمة', 'مبادئ', 'ال']);
const tokens = (text: string) =>
  (text || '')
    .toLowerCase()
    .replace(/[()\-_,.:;/\\]+/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^ال/, ''))
    .filter(w => w.length > 1 && !STOP.has(w));

/** Our course that looks most like the one studied elsewhere (by code, then by name). */
function suggestCourse(row: EquivalencyItemInput, courses: Course[]): Course | null {
  const code = (row.externalCode || '').replace(/\s+/g, '').toUpperCase();
  if (code) {
    const exact = courses.find(c => c.code.replace(/\s+/g, '').toUpperCase() === code);
    if (exact) return exact;
  }
  const words = new Set(tokens(row.externalName || ''));
  if (words.size === 0) return null;
  let best: { c: Course; score: number } | null = null;
  for (const c of courses) {
    const mine = new Set([...tokens(c.nameEn), ...tokens(c.nameAr)]);
    const shared = [...words].filter(w => mine.has(w)).length;
    if (!shared) continue;
    const score = shared / Math.max(1, Math.min(words.size, mine.size));
    if (!best || score > best.score) best = { c, score };
  }
  return best && best.score >= 0.5 ? best.c : null;
}

/**
 * Equivalency (موازنة) of transfer students: what the student studied at the other
 * faculty, matched course by course to our bylaw and graded on our scale.
 */
export const EquivalencyView: React.FC = () => {
  const { t, language } = useLanguage();
  const [cases, setCases] = useState<EquivalencyCaseSummary[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [rules, setRules] = useState<AcademicRuleConfig[]>([]);
  const [open, setOpen] = useState<EquivalencyCaseSummary | 'NEW' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'sign' | 'signal'; text: string } | null>(null);
  const [account, setAccount] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const [cs, crs, sts, rl] = await Promise.all([api.getEquivalencyCases(), api.getCourses(), api.getStudents().catch(() => []), api.getAcademicRules().catch(() => [])]);
      setCases(cs);
      setCourses(crs);
      setStudents(sts);
      setRules(rl);
    } catch (err) {
      setFailed(errorText(err, language, 'تعذّر تحميل ملفات الموازنة.', 'Equivalency files could not be loaded.'));
    }
  }, [language]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const rule = (key: string, fallback: number) => Number(rules.find(r => r.key === key)?.value ?? fallback);
  const minPercent = rule('EQUIVALENCY_MIN_PERCENT', 60);
  const maxPercent = rule('EQUIVALENCY_MAX_CREDITS_PERCENT', 50);
  const totalCredits = rule('TOTAL_DEGREE_CREDITS', 134);

  if (failed) {
    return (
      <Panel>
        <EmptyState
          icon={AlertTriangle}
          tone="caution"
          title={t('تعذّر التحميل', 'Could not load')}
          description={failed}
          action={
            <button type="button" onClick={load} className="btn btn-primary">
              <RotateCcw aria-hidden="true" />
              {t('إعادة المحاولة', 'Try again')}
            </button>
          }
        />
      </Panel>
    );
  }
  if (!cases) return <Loader label={t('جارٍ تحميل ملفات الموازنة…', 'Loading equivalency files…')} />;

  if (open) {
    return (
      <EquivalencyEditor
        initial={open === 'NEW' ? null : open}
        courses={courses}
        students={students}
        minPercent={minPercent}
        maxPercent={maxPercent}
        totalCredits={totalCredits}
        onBack={() => {
          setOpen(null);
          load();
        }}
        onSaved={(c, created, text) => {
          if (created) setAccount(created);
          setToast({ tone: 'sign', text });
          setOpen(c);
          load();
        }}
        onDeleted={text => {
          setToast({ tone: 'sign', text });
          setOpen(null);
          load();
        }}
        account={account}
        onDismissAccount={() => setAccount(null)}
        toast={toast}
        onCloseToast={() => setToast(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <Toast tone={toast.tone} onClose={() => setToast(null)} closeLabel={t('إغلاق', 'Close')}>
          {toast.text}
        </Toast>
      )}
      <PageHeader
        icon={Repeat}
        tone="plum"
        title={t('طلاب الموازنة', 'Transfer students (equivalency)')}
        description={t(
          'الطالب المحوَّل من جامعة أو كلية أخرى: سجّل المقررات التي درسها هناك، وطابِق كل مقرر بما يكافئه في لائحتنا. يُحسب تقديره بمقياس الكلية من النسبة التي حصل عليها، وتدخل المقررات المقبولة في سجله ومعدله بعد الاعتماد.',
          'A student transferring from another university or faculty: record the courses studied there and match each to its equivalent in our bylaw. The grade is worked out on our scale from the mark obtained, and credited courses join the record and GPA once approved.'
        )}
        meta={
          <>
            <Chip tone="plum">{t(`${cases.length} ملف موازنة`, `${cases.length} equivalency files`)}</Chip>
            <Chip tone="caution">{t(`${cases.filter(c => c.status === 'DRAFT').length} مسودة`, `${cases.filter(c => c.status === 'DRAFT').length} drafts`)}</Chip>
          </>
        }
        actions={
          <button type="button" onClick={() => setOpen('NEW')} className="btn btn-primary">
            <Plus aria-hidden="true" />
            {t('موازنة جديدة', 'New equivalency')}
          </button>
        }
      />

      <div className="callout callout-lane">
        <Scale aria-hidden="true" />
        <div>
          <p className="font-bold">{t('قواعد الموازنة المطبقة (من صفحة اللائحة)', 'Equivalency rules applied (from the bylaw page)')}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-4 text-[13px]">
            <li>{t(`تُعادَل المادة إذا كانت النسبة ${minPercent}% فأكثر، وساعاتها هناك لا تقل عن ساعات المقرر المكافئ عندنا.`, `A course is credited with ${minPercent}% or more, and at least as many credit hours as ours.`)}</li>
            <li>{t('التقدير يُحسب بمقياس الكلية من النسبة (أو التقدير المكتوب)، ويدخل في المعدل التراكمي والساعات المنجزة.', 'The grade is worked out on our scale from the percentage (or the written grade) and counts in the GPA and the hours.')}</li>
            <li>{t(`الحد الأقصى ${maxPercent}% من ساعات البرنامج (${Math.floor((totalCredits * maxPercent) / 100)} ساعة)، ومشروع التخرج لا يُعادَل.`, `At most ${maxPercent}% of the degree (${Math.floor((totalCredits * maxPercent) / 100)} credit hours); the graduation project is never credited.`)}</li>
          </ul>
        </div>
      </div>

      <Panel padded={false}>
        {cases.length === 0 ? (
          <EmptyState
            icon={Repeat}
            tone="plum"
            title={t('لا توجد ملفات موازنة بعد', 'No equivalency files yet')}
            description={t('ابدأ بموازنة جديدة لطالب محوَّل.', 'Start a new equivalency for a transfer student.')}
            action={
              <button type="button" onClick={() => setOpen('NEW')} className="btn btn-primary">
                <Plus aria-hidden="true" />
                {t('موازنة جديدة', 'New equivalency')}
              </button>
            }
          />
        ) : (
          <div className="scroll-x">
            <table className="data-table min-w-[920px]">
              <thead>
                <tr>
                  <th>{t('الطالب', 'Student')}</th>
                  <th>{t('جاء من', 'Came from')}</th>
                  <th>{t('الحالة', 'Status')}</th>
                  <th className="num">{t('المقررات المعادلة', 'Credited')}</th>
                  <th className="num">{t('المعدل', 'GPA')}</th>
                  <th className="num">{t('المستوى', 'Level')}</th>
                  <th className="num">
                    <span className="sr-only">{t('فتح', 'Open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id}>
                    <td>
                      <p className="font-semibold text-ink-900">{language === 'ar' ? c.studentNameAr : c.studentNameEn}</p>
                      <p className="t-num text-[12px] text-ink-500">{c.studentCode}</p>
                    </td>
                    <td>
                      <p className="text-ink-800">{c.previousInstitution}</p>
                      {c.previousProgram && <p className="text-[12px] text-ink-500">{c.previousProgram}</p>}
                    </td>
                    <td>
                      <span className={chipClass[c.status === 'APPROVED' ? 'sign' : 'caution']}>
                        {c.status === 'APPROVED' ? t('معتمدة', 'Approved') : t('مسودة', 'Draft')}
                      </span>
                      {c.approvedByName && <p className="mt-1 text-[11.5px] text-ink-500">{c.approvedByName}</p>}
                    </td>
                    <td className="num">
                      <span className="t-num font-semibold">{c.evaluation.acceptedCourses}</span>
                      <span className="text-[12px] text-ink-500"> {t(`مقرر · ${c.evaluation.acceptedCredits} ساعة`, `courses · ${c.evaluation.acceptedCredits} cr`)}</span>
                    </td>
                    <td className="num t-num font-bold">{c.evaluation.gpa.toFixed(2)}</td>
                    <td className="num t-num">{c.evaluation.level}</td>
                    <td className="num">
                      <button type="button" onClick={() => setOpen(c)} className="btn btn-primary btn-sm">
                        {c.status === 'APPROVED' ? t('عرض', 'View') : t('متابعة', 'Continue')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};

const EquivalencyEditor: React.FC<{
  initial: EquivalencyCaseSummary | null;
  courses: Course[];
  students: Student[];
  minPercent: number;
  maxPercent: number;
  totalCredits: number;
  onBack: () => void;
  onSaved: (c: EquivalencyCaseSummary, created: { email: string; password: string } | undefined, text: string) => void;
  onDeleted: (text: string) => void;
  account: { email: string; password: string } | null;
  onDismissAccount: () => void;
  toast: { tone: 'sign' | 'signal'; text: string } | null;
  onCloseToast: () => void;
}> = ({ initial, courses, students, minPercent, maxPercent, totalCredits, onBack, onSaved, onDeleted, account, onDismissAccount, toast, onCloseToast }) => {
  const { t, language } = useLanguage();
  const readOnly = initial?.status === 'APPROVED';
  const [who, setWho] = useState<'NEW' | 'EXISTING'>('NEW');
  const [fresh, setFresh] = useState({ nameAr: '', nameEn: '', email: '', studentCode: '', track: 'General' });
  const [studentQ, setStudentQ] = useState('');
  const [studentId, setStudentId] = useState(initial?.studentId || '');
  const [institution, setInstitution] = useState(initial?.previousInstitution || '');
  const [program, setProgram] = useState(initial?.previousProgram || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [rows, setRows] = useState<Row[]>(() =>
    initial ? initial.evaluation.items.map(i => newRow({ ...i, externalMark: i.externalMark ?? null, externalGrade: i.externalGrade || '', courseCode: i.courseCode || '' })) : [newRow(), newRow()]
  );
  const [evaluation, setEvaluation] = useState<EquivalencyEvaluation | null>(initial?.evaluation || null);
  const [busy, setBusy] = useState<'save' | 'approve' | 'delete' | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const Back = language === 'ar' ? ArrowRight : ArrowLeft;
  const sortedCourses = useMemo(() => [...courses].sort((a, b) => a.level - b.level || a.code.localeCompare(b.code)), [courses]);
  const items = (): EquivalencyItemInput[] =>
    rows
      .filter(r => (r.externalName || '').trim() || r.courseCode)
      .map(({ key: _k, ...r }) => ({
        ...r,
        externalMark: r.externalMark === null || (r.externalMark as any) === '' || Number.isNaN(Number(r.externalMark)) ? null : Number(r.externalMark),
        externalGrade: r.externalGrade || null,
        courseCode: r.courseCode || null,
      }));

  // Grades and decisions worked out by the server as the table changes.
  useEffect(() => {
    if (readOnly) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      api
        .previewEquivalency(items(), who === 'EXISTING' || initial ? studentId || undefined : undefined)
        .then(ev => mine === seq.current && setEvaluation(ev))
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, studentId, who, readOnly]);

  const decisionOf = (index: number) => {
    const filled = rows.map((r, i) => ({ r, i })).filter(({ r }) => (r.externalName || '').trim() || r.courseCode);
    const pos = filled.findIndex(x => x.i === index);
    return pos >= 0 ? evaluation?.items[pos] : undefined;
  };

  const update = (key: string, patch: Partial<Row>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const matches = useMemo(() => {
    const term = studentQ.trim().toLowerCase();
    return students
      .filter(s => !term || s.nameAr.toLowerCase().includes(term) || s.nameEn.toLowerCase().includes(term) || s.studentCode.includes(term))
      .slice(0, 40);
  }, [students, studentQ]);

  const save = async () => {
    try {
      setBusy('save');
      setError(null);
      if (initial) {
        const res = await api.updateEquivalency(initial.id, { previousInstitution: institution, previousProgram: program, notes, items: items() });
        onSaved(res.case, undefined, t('حُفظت المسودة.', 'Draft saved.'));
      } else {
        const res = await api.createEquivalency({
          ...(who === 'EXISTING' ? { studentId } : { newStudent: fresh }),
          previousInstitution: institution,
          previousProgram: program,
          notes,
          items: items(),
        });
        onSaved(res.case, res.createdAccount, res.createdAccount ? t('أُنشئ حساب الطالب وحُفظت المسودة.', 'Student account created and draft saved.') : t('حُفظت المسودة.', 'Draft saved.'));
      }
    } catch (err) {
      setError(errorText(err, language, 'تعذّر الحفظ.', 'Could not save.'));
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!initial) return;
    try {
      setBusy('approve');
      setError(null);
      await api.updateEquivalency(initial.id, { previousInstitution: institution, previousProgram: program, notes, items: items() });
      const res = await api.approveEquivalency(initial.id);
      setConfirmApprove(false);
      onSaved(res.case, undefined, t('اعتُمدت الموازنة وأُضيفت المقررات المعادلة إلى سجل الطالب.', 'Equivalency approved; the credited courses are on the student’s record.'));
    } catch (err) {
      setError(errorText(err, language, 'تعذّر الاعتماد.', 'Could not approve.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!initial) return;
    try {
      setBusy('delete');
      await api.deleteEquivalency(initial.id);
      onDeleted(t('حُذفت المسودة.', 'Draft deleted.'));
    } catch (err) {
      setError(errorText(err, language, 'تعذّر الحذف.', 'Could not delete.'));
    } finally {
      setBusy(null);
    }
  };

  const ev = evaluation;
  const canSave = !readOnly && institution.trim().length >= 2 && items().length > 0 && (initial || who === 'EXISTING' ? !!(studentId || initial) : fresh.nameAr.trim().length >= 3 && /\S+@\S+\.\S+/.test(fresh.email) && fresh.studentCode.trim().length >= 4);

  return (
    <div className="space-y-6">
      {toast && (
        <Toast tone={toast.tone} onClose={onCloseToast} closeLabel={t('إغلاق', 'Close')}>
          {toast.text}
        </Toast>
      )}
      <PageHeader
        icon={Repeat}
        tone="plum"
        title={initial ? t(`موازنة: ${initial.studentNameAr}`, `Equivalency: ${initial.studentNameEn}`) : t('موازنة جديدة لطالب محوَّل', 'New equivalency for a transfer student')}
        description={
          readOnly
            ? t(`اعتمدها ${initial?.approvedByName || ''}؛ المقررات المقبولة في سجل الطالب الآن.`, `Approved by ${initial?.approvedByName || ''}; the credited courses are on the student’s record.`)
            : t('اكتب كل مقرر درسه الطالب ونسبته هناك، واختر ما يكافئه عندنا؛ يظهر تقديرنا وقرار المعادلة فوراً.', 'Write each course the student took and the mark obtained, and pick our equivalent; our grade and the decision show at once.')
        }
        meta={initial ? <span className={chipClass[readOnly ? 'sign' : 'caution']}>{readOnly ? t('معتمدة', 'Approved') : t('مسودة', 'Draft')}</span> : undefined}
        actions={
          <button type="button" onClick={onBack} className="btn btn-secondary">
            <Back aria-hidden="true" />
            {t('كل ملفات الموازنة', 'All equivalency files')}
          </button>
        }
      />

      {account && (
        <div className="callout callout-sign" role="status">
          <KeyRound aria-hidden="true" />
          <div className="flex-1">
            <p className="font-bold">{t('أُنشئ حساب الطالب', 'The student account was created')}</p>
            <p>
              {t('البريد:', 'Email:')} <span className="t-num font-semibold">{account.email}</span> · {t('كلمة المرور المبدئية:', 'Initial password:')}{' '}
              <span className="t-num font-semibold">{account.password}</span>
            </p>
          </div>
          <button type="button" onClick={onDismissAccount} className="btn btn-ghost btn-sm">
            {t('تم', 'Done')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader icon={who === 'NEW' && !initial ? UserPlus : Users} tone="plum" title={t('الطالب', 'Student')} />
          {initial ? (
            <p className="text-[14px] font-semibold text-ink-900">
              {language === 'ar' ? initial.studentNameAr : initial.studentNameEn} <span className="t-num text-[12.5px] text-ink-500">({initial.studentCode})</span>
            </p>
          ) : (
            <div className="space-y-4">
              <Segmented
                ariaLabel={t('الطالب', 'Student')}
                value={who}
                onChange={setWho}
                options={[
                  { value: 'NEW', label: t('طالب جديد محوَّل', 'New transfer student'), icon: UserPlus },
                  { value: 'EXISTING', label: t('طالب مسجل بالفعل', 'Existing student'), icon: Users },
                ]}
              />
              {who === 'NEW' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t('الاسم بالعربية', 'Name in Arabic')} htmlFor="eq-name-ar">
                    <input id="eq-name-ar" className="field" value={fresh.nameAr} onChange={e => setFresh({ ...fresh, nameAr: e.target.value })} />
                  </Field>
                  <Field label={t('الاسم بالإنجليزية', 'Name in English')} htmlFor="eq-name-en">
                    <input id="eq-name-en" className="field" dir="ltr" value={fresh.nameEn} onChange={e => setFresh({ ...fresh, nameEn: e.target.value })} />
                  </Field>
                  <Field label={t('البريد الجامعي', 'University email')} htmlFor="eq-email">
                    <input id="eq-email" className="field" dir="ltr" type="email" value={fresh.email} onChange={e => setFresh({ ...fresh, email: e.target.value })} />
                  </Field>
                  <Field label={t('الرقم الجامعي', 'Student code')} htmlFor="eq-code">
                    <input id="eq-code" className="field" dir="ltr" value={fresh.studentCode} onChange={e => setFresh({ ...fresh, studentCode: e.target.value })} />
                  </Field>
                  <Field label={t('المسار', 'Track')} htmlFor="eq-track" className="sm:col-span-2">
                    <select id="eq-track" className="field" value={fresh.track} onChange={e => setFresh({ ...fresh, track: e.target.value })}>
                      {['General', 'Artificial Intelligence', 'Networks & Cyber Security'].map(tr => (
                        <option key={tr} value={tr}>
                          {pick(language, trackLabel[tr], tr)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="search"
                    className="field"
                    value={studentQ}
                    onChange={e => setStudentQ(e.target.value)}
                    placeholder={t('ابحث بالاسم أو الرقم الجامعي', 'Search by name or student code')}
                    aria-label={t('بحث عن طالب', 'Search students')}
                  />
                  <select className="field" size={6} value={studentId} onChange={e => setStudentId(e.target.value)} aria-label={t('اختر الطالب', 'Choose the student')}>
                    {matches.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.studentCode} — {language === 'ar' ? s.nameAr : s.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader icon={Building2} tone="plum" title={t('جاء من', 'Came from')} />
          <div className="grid grid-cols-1 gap-3">
            <Field label={t('الجامعة / الكلية', 'University / faculty')} htmlFor="eq-inst">
              <input id="eq-inst" className="field" disabled={readOnly} value={institution} onChange={e => setInstitution(e.target.value)} placeholder={t('مثال: جامعة عين شمس — كلية الحاسبات', 'e.g. Ain Shams University — Faculty of Computers')} />
            </Field>
            <Field label={t('البرنامج هناك', 'Programme there')} htmlFor="eq-prog">
              <input id="eq-prog" className="field" disabled={readOnly} value={program} onChange={e => setProgram(e.target.value)} />
            </Field>
            <Field label={t('ملاحظات (مثل رقم قرار لجنة المقاصة)', 'Notes (e.g. committee decision number)')} htmlFor="eq-notes">
              <input id="eq-notes" className="field" disabled={readOnly} value={notes} onChange={e => setNotes(e.target.value)} />
            </Field>
          </div>
        </Panel>
      </div>

      <Panel padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-[15px] font-bold text-ink-900">{t('المقررات ومعادلتها', 'Courses and their equivalents')}</h2>
            <p className="text-[12.5px] text-ink-500">
              {t(`النسبة من 100. يُقبل ${minPercent}% فأكثر، وتقديرنا يُحسب بمقياس الكلية.`, `Mark out of 100. ${minPercent}% or more is credited, graded on our scale.`)}
            </p>
          </div>
          {!readOnly && (
            <button type="button" onClick={() => setRows(prev => [...prev, newRow()])} className="btn btn-secondary">
              <Plus aria-hidden="true" />
              {t('إضافة مقرر', 'Add a course')}
            </button>
          )}
        </div>
        <div className="scroll-x border-t border-ink-100">
          <table className="data-table min-w-[1120px]">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>{t('كود المقرر هناك', 'Code there')}</th>
                <th>{t('اسم المقرر هناك', 'Course there')}</th>
                <th className="num">{t('الساعات', 'Credits')}</th>
                <th className="num">{t('النسبة %', 'Mark %')}</th>
                <th>{t('أو التقدير', 'Or grade')}</th>
                <th>{t('المقرر المكافئ عندنا', 'Our equivalent')}</th>
                <th>{t('تقديرنا', 'Our grade')}</th>
                <th>{t('القرار', 'Decision')}</th>
                {!readOnly && (
                  <th>
                    <span className="sr-only">{t('حذف', 'Remove')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const d = decisionOf(i);
                const suggestion = !readOnly && !r.courseCode ? suggestCourse(r, courses) : null;
                return (
                  <tr key={r.key}>
                    <td className="num t-num text-ink-500">{i + 1}</td>
                    <td>
                      <input className="field field-sm w-24" dir="ltr" disabled={readOnly} value={r.externalCode || ''} onChange={e => update(r.key, { externalCode: e.target.value })} aria-label={t(`كود المقرر ${i + 1}`, `Code of course ${i + 1}`)} />
                    </td>
                    <td>
                      <input className="field field-sm min-w-[180px]" disabled={readOnly} value={r.externalName} onChange={e => update(r.key, { externalName: e.target.value })} aria-label={t(`اسم المقرر ${i + 1}`, `Name of course ${i + 1}`)} />
                    </td>
                    <td className="num">
                      <input className="field field-sm w-16 text-center" type="number" min={0} max={12} disabled={readOnly} value={r.externalCredits} onChange={e => update(r.key, { externalCredits: Number(e.target.value) })} aria-label={t(`ساعات المقرر ${i + 1}`, `Credits of course ${i + 1}`)} />
                    </td>
                    <td className="num">
                      <input
                        className="field field-sm w-20 text-center"
                        type="number"
                        min={0}
                        max={100}
                        disabled={readOnly}
                        value={r.externalMark ?? ''}
                        onChange={e => update(r.key, { externalMark: e.target.value === '' ? null : Number(e.target.value) })}
                        aria-label={t(`نسبة المقرر ${i + 1}`, `Mark of course ${i + 1}`)}
                      />
                    </td>
                    <td>
                      <select className="field field-sm w-20" disabled={readOnly} value={r.externalGrade || ''} onChange={e => update(r.key, { externalGrade: e.target.value })} aria-label={t(`تقدير المقرر ${i + 1}`, `Grade of course ${i + 1}`)}>
                        <option value="">—</option>
                        {['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'].map(g => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="field field-sm min-w-[220px]" disabled={readOnly} value={r.courseCode || ''} onChange={e => update(r.key, { courseCode: e.target.value })} aria-label={t(`المقرر المكافئ ${i + 1}`, `Equivalent of course ${i + 1}`)}>
                        <option value="">{t('— لا يوجد مكافئ —', '— no equivalent —')}</option>
                        {sortedCourses.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {language === 'ar' ? c.nameAr : c.nameEn} ({c.credits})
                          </option>
                        ))}
                      </select>
                      {suggestion && (
                        <button type="button" onClick={() => update(r.key, { courseCode: suggestion.code })} className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-lane-700 hover:underline">
                          <Wand2 className="h-3 w-3" aria-hidden="true" />
                          {t(`اقتراح: ${suggestion.code}`, `Suggest: ${suggestion.code}`)}
                        </button>
                      )}
                    </td>
                    <td>
                      {d?.grade ? (
                        <span className={cn(chipClass[gradeTone(d.grade)], 't-num font-extrabold')}>
                          {d.grade}
                          {d.gradePoints !== undefined && <span className="font-semibold opacity-75">({Number(d.gradePoints).toFixed(1)})</span>}
                        </span>
                      ) : (
                        <span className="text-[12px] text-ink-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[260px]">
                      {d ? (
                        d.accepted ? (
                          <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-sign-700">
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            {t('يُعادَل', 'Credited')}
                          </span>
                        ) : (
                          <span className="inline-flex items-start gap-1 text-[12px] font-semibold text-signal-700">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{language === 'ar' ? d.reasonAr : d.reasonEn}</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[12px] text-ink-400">—</span>
                      )}
                    </td>
                    {!readOnly && (
                      <td>
                        <button type="button" onClick={() => setRows(prev => (prev.length > 1 ? prev.filter(x => x.key !== r.key) : [newRow()]))} className="btn btn-ghost btn-sm" aria-label={t(`حذف المقرر ${i + 1}`, `Remove course ${i + 1}`)}>
                          <Trash2 aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {ev && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[12.5px] text-ink-500">{t('المقررات المعادلة', 'Credited courses')}</p>
            <p className="t-num mt-1 text-[26px] font-extrabold text-sign-700">{ev.acceptedCourses}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[12.5px] text-ink-500">{t('الساعات المعادلة', 'Credited hours')}</p>
            <p className="mt-1 text-[26px] font-extrabold text-ink-900">
              <span className="t-num">{ev.acceptedCredits}</span>
              <span className="text-[13px] font-medium text-ink-500"> / {ev.maxTransferableCredits}</span>
            </p>
          </div>
          <div className="panel p-4">
            <p className="text-[12.5px] text-ink-500">{t('المعدل بمقياس الكلية', 'GPA on our scale')}</p>
            <p className={cn('t-num mt-1 text-[26px] font-extrabold', ev.gpa < 2 && ev.acceptedCourses > 0 ? 'text-signal-600' : 'text-ink-900')}>{ev.gpa.toFixed(2)}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[12.5px] text-ink-500">{t('المستوى بعد الموازنة', 'Level after equivalency')}</p>
            <p className="mt-1 text-[26px] font-extrabold text-ink-900">
              <span className="t-num">{ev.level}</span>
              <span className="text-[13px] font-medium text-ink-500"> · {t(`متبقٍ ${ev.remainingCredits} ساعة`, `${ev.remainingCredits} cr left`)}</span>
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="callout callout-signal" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {!readOnly && (
        <Panel>
          {confirmApprove ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-[13.5px] font-semibold text-ink-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-lane-600" aria-hidden="true" />
                {t(
                  `سيُضاف ${ev?.acceptedCourses ?? 0} مقرراً (${ev?.acceptedCredits ?? 0} ساعة) إلى سجل الطالب كمقررات معادلة، ويُحسب معدله ومستواه. لا يمكن التراجع عن الاعتماد.`,
                  `${ev?.acceptedCourses ?? 0} courses (${ev?.acceptedCredits ?? 0} credit hours) will join the student's record as credited courses, and the GPA and level are worked out. Approval cannot be undone.`
                )}
              </p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setConfirmApprove(false)} className="btn btn-ghost">
                  {t('رجوع', 'Back')}
                </button>
                <button type="button" onClick={approve} disabled={!!busy} className="btn btn-primary">
                  <CheckCircle2 aria-hidden="true" />
                  {busy === 'approve' ? t('جارٍ الاعتماد…', 'Approving…') : t('تأكيد الاعتماد', 'Confirm approval')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {initial && (
                <button type="button" onClick={remove} disabled={!!busy} className="btn btn-ghost me-auto !text-signal-700">
                  <Trash2 aria-hidden="true" />
                  {busy === 'delete' ? t('جارٍ الحذف…', 'Deleting…') : t('حذف المسودة', 'Delete draft')}
                </button>
              )}
              <button type="button" onClick={save} disabled={!canSave || !!busy} className="btn btn-secondary">
                <Save aria-hidden="true" />
                {busy === 'save' ? t('جارٍ الحفظ…', 'Saving…') : initial ? t('حفظ التعديلات', 'Save changes') : who === 'NEW' ? t('إنشاء حساب الطالب وحفظ المسودة', 'Create the student and save') : t('حفظ المسودة', 'Save draft')}
              </button>
              {initial && (
                <button type="button" onClick={() => setConfirmApprove(true)} disabled={!!busy || !ev || ev.acceptedCourses === 0} className="btn btn-primary">
                  <CheckCircle2 aria-hidden="true" />
                  {t('اعتماد الموازنة', 'Approve equivalency')}
                </button>
              )}
            </div>
          )}
          {!initial && (
            <p className="mt-3 text-[12.5px] text-ink-500">
              {t('احفظ المسودة أولاً، ثم راجعها واعتمدها؛ الاعتماد يضيف المقررات المقبولة إلى سجل الطالب.', 'Save the draft first, then review and approve it; approval adds the credited courses to the student’s record.')}
            </p>
          )}
        </Panel>
      )}

      {readOnly && initial && (
        <Panel>
          <p className="text-[13px] text-ink-700">
            {t('تجد المقررات المعادلة في سجل الطالب الموثق مكتوباً عليها «معادلة (موازنة)».', 'The credited courses appear on the student’s verified transcript marked “equivalency”.')}{' '}
            {personName(initial.approvedByName, language)}
            {initial.approvedAt && ` · ${new Date(initial.approvedAt).toLocaleDateString(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB')}`}
          </p>
        </Panel>
      )}
    </div>
  );
};
