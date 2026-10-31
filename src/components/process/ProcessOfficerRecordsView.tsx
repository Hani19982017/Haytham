import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student } from '../../types/index.js';
import { TranscriptReportModal } from '../reports/TranscriptReportModal.js';
import {
  PageHeader,
  Panel,
  Segmented,
  Modal,
  Loader,
  EmptyState,
  Chip,
  CodeBadge,
  Meter,
  cn,
  chipClass,
  gradeTone,
  recordTone,
  recordLabel,
  trackLabel,
  pick,
} from '../ui/index.js';
import { FileSpreadsheet, Search, Lock, Eye, FileText, Users } from 'lucide-react';

type StandingFilter = 'ALL' | 'GOOD' | 'WARNING';

export const ProcessOfficerRecordsView: React.FC = () => {
  const { t, language } = useLanguage();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [standingFilter, setStandingFilter] = useState<StandingFilter>('ALL');
  const [viewRecord, setViewRecord] = useState<Student | null>(null);
  const [transcriptStudentId, setTranscriptStudentId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await api.getStudents();
        setStudents(data);
      } catch (err) {
        console.error('Failed to load records:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const goodCount = students.filter(s => s.cumulativeGpa >= 2).length;
  const warningCount = students.length - goodCount;

  const filtered = students.filter(s => {
    if (levelFilter !== 'ALL' && String(s.level) !== levelFilter) return false;
    if (standingFilter === 'GOOD' && s.cumulativeGpa < 2) return false;
    if (standingFilter === 'WARNING' && s.cumulativeGpa >= 2) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.studentCode.toLowerCase().includes(q) ||
      s.nameAr.toLowerCase().includes(q) ||
      s.nameEn.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <Loader label={t('جارٍ تحميل سجلات الطلاب…', 'Loading student records…')} />;
  }

  const clearFilters = () => {
    setSearch('');
    setLevelFilter('ALL');
    setStandingFilter('ALL');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileSpreadsheet}
        tone="ink"
        title={t('سجلات الطلاب', 'Student records')}
        description={t(
          'ملفات الطلاب وبيانات التسجيل والسجل الأكاديمي. هذه الصفحة للاطلاع فقط؛ أي تعديل يتم عبر المرشد أو مدير النظام.',
          'Student files, registration data and academic records. This page is read-only; changes go through the advisor or the administrator.'
        )}
        meta={
          <>
            <Chip tone="ink" icon={Lock}>
              {t('اطلاع فقط', 'Read-only')}
            </Chip>
            <Chip tone="ink" icon={Users}>
              {t(`${students.length} سجل`, `${students.length} records`)}
            </Chip>
          </>
        }
      />

      <Panel padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              type="search"
              placeholder={t('ابحث بالرقم الجامعي أو الاسم أو البريد', 'Search by student code, name or email')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label={t('بحث في السجلات', 'Search records')}
              className="field ps-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel={t('الوضع الأكاديمي', 'Academic standing')}
              value={standingFilter}
              onChange={setStandingFilter}
              options={[
                { value: 'ALL', label: t('الكل', 'All'), count: students.length },
                { value: 'GOOD', label: t('وضع سليم', 'Good standing'), count: goodCount },
                { value: 'WARNING', label: t('تحت الإنذار', 'On warning'), count: warningCount },
              ]}
            />
            <select
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value)}
              className="field w-auto min-w-[150px]"
              aria-label={t('تصفية حسب المستوى', 'Filter by level')}
            >
              <option value="ALL">{t('كل المستويات', 'All levels')}</option>
              <option value="1">{t('المستوى الأول', 'Level 1')}</option>
              <option value="2">{t('المستوى الثاني', 'Level 2')}</option>
              <option value="3">{t('المستوى الثالث', 'Level 3')}</option>
              <option value="4">{t('المستوى الرابع', 'Level 4')}</option>
            </select>
          </div>
        </div>

        <div className="scroll-x border-t border-ink-100">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th>{t('الطالب', 'Student')}</th>
                <th>{t('البريد الجامعي', 'Email')}</th>
                <th>{t('المستوى والمسار', 'Level and track')}</th>
                <th className="num">{t('المعدل', 'GPA')}</th>
                <th>{t('الساعات من 134', 'Credits of 134')}</th>
                <th className="num">
                  <span className="sr-only">{t('إجراءات', 'Actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Search}
                      title={t('لا يوجد سجل يطابق البحث', 'No record matches your search')}
                      description={t('جرّب رقماً جامعياً أو اسماً آخر، أو امسح التصفية.', 'Try another code or name, or clear the filters.')}
                      action={
                        <button type="button" onClick={clearFilters} className="btn btn-secondary">
                          {t('مسح التصفية', 'Clear filters')}
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map(student => {
                  const pct = Math.min(100, Math.round((student.completedCredits / 134) * 100));
                  const onWarning = student.cumulativeGpa < 2;
                  return (
                    <tr key={student.id}>
                      <td>
                        <p className="whitespace-nowrap font-semibold text-ink-900">{language === 'ar' ? student.nameAr : student.nameEn}</p>
                        <p className="text-[12px] text-ink-500">
                          <span className="t-num">{student.studentCode}</span>
                        </p>
                      </td>
                      <td>
                        <span className="text-[12.5px] text-ink-600" dir="ltr">
                          {student.email}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <p className="text-ink-800">{t(`المستوى ${student.level}`, `Level ${student.level}`)}</p>
                        <p className="text-[12px] text-ink-500">{pick(language, trackLabel[student.track], student.track)}</p>
                      </td>
                      <td className="num">
                        <span className={cn('t-num text-[15px] font-bold', onWarning ? 'text-signal-600' : 'text-ink-900')}>
                          {student.cumulativeGpa.toFixed(2)}
                        </span>
                      </td>
                      <td className="min-w-[160px]">
                        <div className="mb-1 flex items-center justify-between text-[12px]">
                          <span className="t-num font-semibold text-ink-800">{student.completedCredits} / 134</span>
                          <span className="t-num text-ink-500">{pct}%</span>
                        </div>
                        <Meter value={pct} label={t('الساعات المنجزة', 'Credits completed')} />
                      </td>
                      <td className="num">
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => setViewRecord(student)} className="btn btn-secondary btn-sm">
                            <Eye aria-hidden="true" />
                            {t('المقررات', 'Courses')}
                          </button>
                          <button type="button" onClick={() => setTranscriptStudentId(student.id)} className="btn btn-ghost btn-sm">
                            <FileText aria-hidden="true" />
                            {t('السجل الموثق', 'Transcript')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Course record (read-only) */}
      {viewRecord && (
        <Modal
          onClose={() => setViewRecord(null)}
          size="lg"
          icon={FileSpreadsheet}
          tone="ink"
          title={language === 'ar' ? viewRecord.nameAr : viewRecord.nameEn}
          subtitle={
            <>
              {t('بيان المقررات المسجلة', 'Registered course record')}
              <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
              <span className="t-num">{viewRecord.studentCode}</span>
            </>
          }
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setViewRecord(null)} className="btn btn-ghost">
                {t('إغلاق', 'Close')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = viewRecord.id;
                  setViewRecord(null);
                  setTranscriptStudentId(id);
                }}
                className="btn btn-primary"
              >
                <FileText aria-hidden="true" />
                {t('السجل الموثق', 'Verified transcript')}
              </button>
            </>
          }
        >
          {viewRecord.records.length === 0 ? (
            <EmptyState icon={FileSpreadsheet} title={t('لا توجد مقررات في السجل بعد', 'No courses on record yet')} />
          ) : (
            <ul className="divide-y divide-ink-100">
              {viewRecord.records.map((r, i) => (
                <li key={`${r.courseCode}_${i}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <CodeBadge code={r.courseCode} />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-ink-900">{language === 'ar' ? r.courseNameAr : r.courseNameEn}</p>
                      <p className="text-[12px] text-ink-500">
                        {r.semesterName}
                        <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                        {t(`${r.credits} ساعات`, `${r.credits} credits`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.grade && <span className={cn(chipClass[gradeTone(r.grade)], 't-num !px-2.5 font-extrabold')}>{r.grade}</span>}
                    <span className={chipClass[recordTone[r.status] || 'ink']}>{pick(language, recordLabel[r.status], r.status)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {transcriptStudentId && (
        <TranscriptReportModal studentId={transcriptStudentId} onClose={() => setTranscriptStudentId(null)} />
      )}
    </div>
  );
};
