import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { Course, CourseOffering, EnrollmentCheck, Student } from '../../types/index.js';
import {
  Modal,
  Loader,
  Chip,
  CodeBadge,
  cn,
  personName,
  registeredByLabel,
  isNewStudent,
  creditCapForStudent,
} from '../ui/index.js';
import { CalendarPlus, Search, AlertTriangle, CheckCircle2, ShieldAlert, Trash2, Info, Clock } from 'lucide-react';

const errorText = (err: any, language: string, ar: string, en: string) => {
  const data = err?.response?.data;
  return (language === 'ar' ? data?.messageAr : data?.messageEn) || (language === 'ar' ? ar : en);
};

const clash = (a: CourseOffering, b: CourseOffering) =>
  a.id !== b.id &&
  (a.days || []).some(d => (b.days || []).includes(d)) &&
  !!a.startTime && !!a.endTime && !!b.startTime && !!b.endTime &&
  a.startTime < b.endTime && b.startTime < a.endTime;

/**
 * Register sections for a student: the advisor for their own students within the
 * bylaw, the administrator for anyone — and, for exceptional cases, despite a
 * bylaw problem, with the reason recorded.
 */
export const RegisterForStudentModal: React.FC<{
  studentId: string;
  mode: 'advisor' | 'admin';
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ studentId, mode, onClose, onDone }) => {
  const { t, language } = useLanguage();
  const [student, setStudent] = useState<Student | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [check, setCheck] = useState<(EnrollmentCheck & { currentCredits: number }) | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropping, setDropping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exception, setException] = useState(false);
  const [reason, setReason] = useState('');
  const seq = useRef(0);

  const load = async () => {
    const [st, cs, os] = await Promise.all([api.getStudentById(studentId), api.getCourses(), api.getOfferings()]);
    setStudent(st);
    setCourses(cs);
    setOfferings(os);
  };

  useEffect(() => {
    load().catch(err => setError(errorText(err, language, 'تعذّر تحميل بيانات الطالب.', 'The student could not be loaded.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Check the chosen sections against the bylaw as they change.
  useEffect(() => {
    if (selected.length === 0) {
      setCheck(null);
      return;
    }
    const mine = ++seq.current;
    setChecking(true);
    const timer = setTimeout(() => {
      api
        .checkEnrollment(studentId, selected)
        .then(c => mine === seq.current && setCheck(c))
        .catch(err => mine === seq.current && setError(errorText(err, language, 'تعذّر فحص اللائحة.', 'The bylaw check failed.')))
        .finally(() => mine === seq.current && setChecking(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [selected, studentId, language]);

  const courseOf = (code: string) => courses.find(c => c.code === code);
  const current = (student?.records || []).filter(r => r.status === 'IN_PROGRESS' || r.status === 'ENROLLED');
  const currentCodes = new Set(current.map(r => r.courseCode));
  const takenSections = offerings.filter(o => current.some(r => r.offeringId === o.id));
  const passed = new Set((student?.records || []).filter(r => r.status === 'PASSED').map(r => r.courseCode));
  const chosen = offerings.filter(o => selected.includes(o.id));

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const byCode = new Map<string, CourseOffering[]>();
    for (const o of offerings) {
      const c = courses.find(x => x.code === o.courseCode);
      const hay = `${o.courseCode} ${c?.nameAr || ''} ${c?.nameEn || ''} ${o.instructorName}`.toLowerCase();
      if (term && !hay.includes(term)) continue;
      if (!byCode.has(o.courseCode)) byCode.set(o.courseCode, []);
      byCode.get(o.courseCode)!.push(o);
    }
    return [...byCode.entries()].sort((a, b) => (courseOf(a[0])?.level ?? 9) - (courseOf(b[0])?.level ?? 9) || a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, courses, q]);

  const toggle = (o: CourseOffering) => {
    setError(null);
    setSelected(prev => {
      if (prev.includes(o.id)) return prev.filter(id => id !== o.id);
      // One section per course.
      const otherSections = offerings.filter(x => x.courseCode === o.courseCode).map(x => x.id);
      return [...prev.filter(id => !otherSections.includes(id)), o.id];
    });
  };

  const register = async () => {
    if (selected.length === 0) return;
    try {
      setSaving(true);
      setError(null);
      const res = await api.enrollForStudent(studentId, selected, exception ? { override: true, reason } : {});
      onDone(
        res.exception
          ? t(`سُجّلت المقررات (${res.registered.join('، ')}) كاستثناء، وحُفظ السبب في سجل العمليات.`, `Registered ${res.registered.join(', ')} as an exception; the reason is in the audit log.`)
          : t(`سُجّلت المقررات (${res.registered.join('، ')}) للطالب وأُبلغ بذلك.`, `Registered ${res.registered.join(', ')}; the student was notified.`)
      );
      onClose();
    } catch (err: any) {
      if (err?.response?.data?.check) setCheck(err.response.data.check);
      setError(errorText(err, language, 'تعذّر التسجيل.', 'Registration failed.'));
    } finally {
      setSaving(false);
    }
  };

  const drop = async (offeringId: string, code: string) => {
    try {
      setDropping(offeringId);
      setError(null);
      await api.dropForStudent(studentId, offeringId, t('تعديل من صفحة متابعة التسجيل', 'Changed on the registration page'));
      await load();
      setSelected(prev => [...prev]);
      onDone(t(`حُذف ${code} من تسجيل الطالب.`, `${code} was removed from the student's registration.`));
    } catch (err) {
      setError(errorText(err, language, 'تعذّر حذف المقرر.', 'The course could not be removed.'));
    } finally {
      setDropping(null);
    }
  };

  const name = student ? personName(language === 'ar' ? student.nameAr : student.nameEn, language) : '';
  const cap = student ? creditCapForStudent(student) : 0;
  const currentCredits = current.reduce((sum, r) => sum + (r.credits || 3), 0);
  const newCredits = chosen.reduce((sum, o) => sum + (courseOf(o.courseCode)?.credits ?? 3), 0);
  const blocked = !!check && !check.valid;
  const canException = mode === 'admin' && blocked && !!check?.canOverride;

  return (
    <Modal
      onClose={onClose}
      size="xl"
      icon={CalendarPlus}
      tone="sign"
      dismissible={!saving}
      title={student ? t(`التسجيل للطالب: ${name}`, `Register for ${name}`) : t('التسجيل للطالب', 'Register for a student')}
      subtitle={
        student ? (
          <>
            <span className="t-num">{student.studentCode}</span>
            <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
            {mode === 'admin' ? t('مدير النظام: يمكنك التسجيل لأي طالب، وكاستثناء عند الحاجة', 'Administrator: any student, and as an exception when needed') : t('المرشد: التسجيل لطلابك وفق اللائحة', 'Advisor: your students, within the bylaw')}
          </>
        ) : undefined
      }
      closeLabel={t('إغلاق', 'Close')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-ghost">
            {t('إغلاق', 'Close')}
          </button>
          {canException && (
            <label className="me-auto flex items-center gap-2 text-[13px] font-semibold text-plum-700">
              <input type="checkbox" checked={exception} onChange={e => setException(e.target.checked)} />
              {t('تسجيل كاستثناء من اللائحة', 'Register as a bylaw exception')}
            </label>
          )}
          <button
            type="button"
            onClick={register}
            disabled={saving || checking || selected.length === 0 || (blocked && !(canException && exception && reason.trim().length >= 3))}
            className={cn('btn', exception && blocked ? 'btn-danger' : 'btn-primary')}
          >
            <CheckCircle2 aria-hidden="true" />
            {saving ? t('جارٍ التسجيل…', 'Registering…') : exception && blocked ? t('تسجيل كاستثناء', 'Register as exception') : t('تسجيل الآن', 'Register now')}
          </button>
        </>
      }
    >
      {!student && !error && <Loader compact label={t('جارٍ التحميل…', 'Loading…')} />}
      {student && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 sm:grid-cols-4">
            <div className="kv">
              <dt>{t('المعدل', 'GPA')}</dt>
              <dd className={!isNewStudent(student) && student.cumulativeGpa < 2 ? '!text-signal-600' : ''}>
                <span className="t-num">{isNewStudent(student) ? '—' : student.cumulativeGpa.toFixed(2)}</span>
              </dd>
            </div>
            <div className="kv">
              <dt>{t('الساعات المنجزة', 'Credits done')}</dt>
              <dd>
                <span className="t-num">{student.completedCredits}</span>
              </dd>
            </div>
            <div className="kv">
              <dt>{t('الإنذارات', 'Warnings')}</dt>
              <dd className={student.warningCount > 0 ? '!text-caution-700' : ''}>
                <span className="t-num">
                  {student.consecutiveWarnings}/{student.warningCount}
                </span>{' '}
                <span className="text-[11px] font-medium text-ink-500">{t('متتالية/إجمالي', 'in a row/all')}</span>
              </dd>
            </div>
            <div className="kv">
              <dt>{t('العبء', 'Load')}</dt>
              <dd>
                <span className="t-num">{currentCredits + newCredits}</span> / <span className="t-num">{cap}</span> {t('ساعة', 'cr')}
              </dd>
            </div>
          </dl>

          <section>
            <h3 className="mb-2 text-[13.5px] font-bold text-ink-900">{t('مسجّل هذا الفصل', 'Registered this term')}</h3>
            {current.length === 0 ? (
              <p className="text-[13px] text-ink-500">{t('لا توجد مقررات مسجلة بعد.', 'Nothing registered yet.')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {current.map(r => {
                  const o = offerings.find(x => x.id === r.offeringId);
                  const graded = r.courseworkMark !== undefined || r.finalMark !== undefined;
                  return (
                    <li key={`${r.courseCode}_${r.attempt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <CodeBadge code={r.courseCode} variant="soft" />
                        <span className="truncate text-[13px] font-semibold text-ink-800">{language === 'ar' ? r.courseNameAr : r.courseNameEn}</span>
                        {o && <span className="text-[12px] text-ink-500">{personName(o.sectionCode, language) || o.sectionCode}</span>}
                        <Chip tone="ink">{registeredByLabel(r.registeredByName, language)}</Chip>
                      </div>
                      {r.offeringId && !graded && (
                        <button type="button" onClick={() => drop(r.offeringId!, r.courseCode)} disabled={!!dropping} className="btn btn-ghost btn-sm !text-signal-700">
                          <Trash2 aria-hidden="true" />
                          {dropping === r.offeringId ? t('جارٍ الحذف…', 'Removing…') : t('حذف', 'Remove')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-[13.5px] font-bold text-ink-900">{t('اختر الشعب', 'Choose sections')}</h3>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                <input
                  type="search"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder={t('ابحث بكود المقرر أو اسمه', 'Search by course code or name')}
                  aria-label={t('بحث عن مقرر', 'Search courses')}
                  className="field field-sm ps-9"
                />
              </div>
            </div>
            <div className="max-h-[340px] overflow-y-auto rounded-xl border border-ink-100">
              <ul className="divide-y divide-ink-100">
                {groups.map(([code, secs]) => {
                  const c = courseOf(code);
                  const taking = currentCodes.has(code);
                  return (
                    <li key={code} className="px-3 py-2.5">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <CodeBadge code={code} variant={taking ? 'sign' : 'solid'} />
                        <span className="text-[13px] font-semibold text-ink-900">{c ? (language === 'ar' ? c.nameAr : c.nameEn) : code}</span>
                        <span className="text-[12px] text-ink-500">{t(`${c?.credits ?? 3} ساعات · المستوى ${c?.level ?? '—'}`, `${c?.credits ?? 3} cr · level ${c?.level ?? '—'}`)}</span>
                        {taking && <Chip tone="sign">{t('مسجّل', 'Registered')}</Chip>}
                        {!taking && passed.has(code) && <Chip tone="ink">{t('ناجح فيه', 'Passed')}</Chip>}
                        {!!c?.prerequisites?.length && (
                          <span className="text-[11.5px] text-ink-500">
                            {t('المتطلب:', 'Prerequisite:')} {c.prerequisites.join('، ')}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                        {secs.map(o => {
                          const on = selected.includes(o.id);
                          const full = o.enrolledCount >= o.capacity;
                          const clashing = !on && [...takenSections, ...chosen].some(x => x.courseCode !== o.courseCode && clash(x, o));
                          return (
                            <label
                              key={o.id}
                              className={cn(
                                'flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-[12.5px] transition',
                                on ? 'border-sign-600 bg-sign-50' : 'border-ink-200 hover:bg-ink-50',
                                taking && 'cursor-not-allowed opacity-60'
                              )}
                            >
                              <input type="checkbox" className="mt-0.5" checked={on} disabled={taking} onChange={() => toggle(o)} />
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-ink-800">
                                  {personName(o.sectionCode, language) || o.sectionCode} · {personName(o.instructorName, language)}
                                </span>
                                <span className="flex flex-wrap items-center gap-x-2 text-ink-500">
                                  <Clock className="h-3 w-3" aria-hidden="true" />
                                  {language === 'ar' ? o.lectureDayTimeAr : o.lectureDayTimeEn}
                                  <span className={cn('t-num', full ? 'font-bold text-signal-600' : '')}>
                                    {o.enrolledCount}/{o.capacity}
                                  </span>
                                  {full && <span className="font-semibold text-signal-600">{t('ممتلئة', 'Full')}</span>}
                                  {clashing && <span className="font-semibold text-caution-700">{t('تتعارض', 'Clashes')}</span>}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {selected.length > 0 && (
            <section aria-live="polite">
              {checking && !check ? (
                <Loader compact label={t('جارٍ فحص اللائحة…', 'Checking the bylaw…')} />
              ) : check && check.valid ? (
                <div className="callout callout-sign">
                  <CheckCircle2 aria-hidden="true" />
                  <div>
                    <p className="font-bold">{t('مطابق للائحة', 'Within the bylaw')}</p>
                    <p>
                      {t(
                        `العبء بعد التسجيل ${check.totalCredits} من ${check.maxAllowedCredits} ساعة.`,
                        `Load after registering: ${check.totalCredits} of ${check.maxAllowedCredits} credit hours.`
                      )}
                    </p>
                    {(language === 'ar' ? check.warningsAr : check.warningsEn).map((w, i) => (
                      <p key={i} className="text-[12.5px]">
                        {w}
                      </p>
                    ))}
                  </div>
                </div>
              ) : check ? (
                <div className={cn('callout', canException ? 'callout-caution' : 'callout-signal')} role="alert">
                  <ShieldAlert aria-hidden="true" />
                  <div className="flex-1">
                    <p className="font-bold">{t('مخالفات للائحة', 'Bylaw problems')}</p>
                    <ul className="mt-1 list-disc space-y-1 ps-4">
                      {check.issues.map((i, k) => (
                        <li key={k}>
                          {language === 'ar' ? i.ar : i.en}
                          {i.hard && <span className="ms-1 font-semibold">{t('(لا يُستثنى)', '(no exception)')}</span>}
                        </li>
                      ))}
                    </ul>
                    {mode === 'advisor' && (
                      <p className="mt-2 flex items-start gap-1.5 text-[12.5px] font-semibold">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {t('هذه حالة استثنائية تحتاج مدير النظام؛ يستطيع تسجيلها كاستثناء مع كتابة السبب.', 'This is an exceptional case for the administrator, who can register it as an exception with a reason.')}
                      </p>
                    )}
                    {canException && exception && (
                      <div className="mt-3">
                        <label htmlFor="exception-reason" className="field-label">
                          {t('سبب الاستثناء (يُحفظ في سجل العمليات ويصل للطالب ومرشده)', 'Reason for the exception (kept in the audit log, sent to the student and advisor)')}
                        </label>
                        <textarea
                          id="exception-reason"
                          rows={2}
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder={t('مثال: قرار مجلس الكلية رقم 15 بالسماح بتسجيل المقرر', 'e.g. Faculty council decision no. 15 allows this course')}
                          className="field"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {error && (
            <div className="callout callout-signal" role="alert">
              <AlertTriangle aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}
        </div>
      )}
      {!student && error && (
        <div className="callout callout-signal" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
    </Modal>
  );
};
