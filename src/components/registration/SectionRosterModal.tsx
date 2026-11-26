import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { SectionRoster } from '../../types/index.js';
import { Modal, Loader, EmptyState, Chip, CodeBadge, Meter, cn, personName, trackLabel, pick, registeredByLabel, registeredByTone } from '../ui/index.js';
import { Users, Download, Search, AlertTriangle, FileSpreadsheet } from 'lucide-react';

const errorText = (err: any, language: string, ar: string, en: string) => {
  const data = err?.response?.data;
  return (language === 'ar' ? data?.messageAr : data?.messageEn) || (language === 'ar' ? ar : en);
};

/** The students registered in one section, by name, with Excel downloads. */
export const SectionRosterModal: React.FC<{ offeringId: string; onClose: () => void }> = ({ offeringId, onClose }) => {
  const { t, language } = useLanguage();
  const [roster, setRoster] = useState<SectionRoster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [downloading, setDownloading] = useState<'SECTION' | 'COURSE' | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getSectionRoster(offeringId)
      .then(r => alive && setRoster(r))
      .catch(err => alive && setError(errorText(err, language, 'تعذّر تحميل كشف الشعبة.', 'The section list could not be loaded.')));
    return () => {
      alive = false;
    };
  }, [offeringId, language]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (roster?.students || []).filter(
      s => !term || s.nameAr.toLowerCase().includes(term) || s.nameEn.toLowerCase().includes(term) || s.studentCode.includes(term)
    );
  }, [roster, q]);

  const download = async (what: 'SECTION' | 'COURSE') => {
    if (!roster) return;
    try {
      setDownloading(what);
      if (what === 'SECTION') await api.downloadSectionRoster(offeringId);
      else await api.downloadCourseRoster(roster.section.offering.courseCode);
    } catch (err) {
      setError(errorText(err, language, 'تعذّر تنزيل الملف.', 'The file could not be downloaded.'));
    } finally {
      setDownloading(null);
    }
  };

  const sec = roster?.section;
  const o = sec?.offering;
  const fill = o ? Math.round((sec!.registeredCount / Math.max(1, o.capacity)) * 100) : 0;

  return (
    <Modal
      onClose={onClose}
      size="xl"
      icon={Users}
      tone="lane"
      title={o ? `${o.courseCode} — ${language === 'ar' ? sec!.courseNameAr : sec!.courseNameEn}` : t('كشف الطلاب', 'Student list')}
      subtitle={o ? `${personName(o.sectionCode, language) || o.sectionCode || ''} · ${personName(o.instructorName, language)}` : undefined}
      closeLabel={t('إغلاق', 'Close')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('إغلاق', 'Close')}
          </button>
          <button type="button" onClick={() => download('COURSE')} disabled={!roster || !!downloading} className="btn btn-secondary">
            <FileSpreadsheet aria-hidden="true" />
            {downloading === 'COURSE' ? t('جارٍ التنزيل…', 'Downloading…') : t('Excel للمقرر بكل شعبه', 'Excel: all sections')}
          </button>
          <button type="button" onClick={() => download('SECTION')} disabled={!roster || !!downloading} className="btn btn-primary">
            <Download aria-hidden="true" />
            {downloading === 'SECTION' ? t('جارٍ التنزيل…', 'Downloading…') : t('تنزيل الكشف Excel', 'Download Excel')}
          </button>
        </>
      }
    >
      {error && (
        <div className="callout callout-signal mb-4" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
      {!roster && !error && <Loader compact label={t('جارٍ تحميل الأسماء…', 'Loading the names…')} />}
      {roster && o && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 sm:grid-cols-3">
            <div>
              <p className="text-[12px] text-ink-500">{t('الموعد والقاعة', 'Time and room')}</p>
              <p className="text-[13px] font-semibold text-ink-800">{language === 'ar' ? o.lectureDayTimeAr : o.lectureDayTimeEn}</p>
              <p className="text-[12px] text-ink-500">{o.hall}</p>
            </div>
            <div>
              <p className="text-[12px] text-ink-500">{t('المسجلون', 'Registered')}</p>
              <p className="text-[13px] font-semibold text-ink-800">
                <span className="t-num">{sec!.registeredCount}</span> {t('من', 'of')} <span className="t-num">{o.capacity}</span> {t('مقعد', 'seats')}
              </p>
              <Meter value={fill} tone={fill >= 90 ? 'signal' : fill >= 75 ? 'caution' : 'sign'} className="mt-1.5" label={t('امتلاء الشعبة', 'Section fill')} />
            </div>
            <div>
              <p className="text-[12px] text-ink-500">{t('المقرر', 'Course')}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink-800">
                <CodeBadge code={o.courseCode} variant="soft" />
                <span>{t(`${sec!.credits} ساعات · المستوى ${sec!.level}`, `${sec!.credits} cr · level ${sec!.level}`)}</span>
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t('ابحث بالاسم أو الرقم الجامعي', 'Search by name or student code')}
              aria-label={t('بحث في الكشف', 'Search the list')}
              className="field ps-9"
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={roster.students.length === 0 ? t('لا يوجد طلاب مسجلون في هذه الشعبة بعد', 'No students are registered in this section yet') : t('لا يوجد طالب يطابق البحث', 'Nobody matches the search')}
            />
          ) : (
            <div className="scroll-x rounded-xl border border-ink-100">
              <table className="data-table min-w-[820px]">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>{t('الطالب', 'Student')}</th>
                    <th>{t('المستوى والمسار', 'Level and track')}</th>
                    <th className="num">{t('المعدل', 'GPA')}</th>
                    <th>{t('المرشد', 'Advisor')}</th>
                    <th className="num">{t('الحضور', 'Attendance')}</th>
                    <th>{t('سُجّل بواسطة', 'Registered by')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <tr key={s.studentId}>
                      <td className="num t-num text-ink-500">{i + 1}</td>
                      <td>
                        <p className="whitespace-nowrap font-semibold text-ink-900">{language === 'ar' ? s.nameAr : s.nameEn}</p>
                        <p className="text-[12px] text-ink-500">
                          <span className="t-num">{s.studentCode}</span>
                          {s.attempt > 1 && <span className="ms-2 text-caution-700">{t(`إعادة (محاولة ${s.attempt})`, `retake (attempt ${s.attempt})`)}</span>}
                        </p>
                      </td>
                      <td className="whitespace-nowrap">
                        <p className="text-ink-800">{t(`المستوى ${s.level}`, `Level ${s.level}`)}</p>
                        <p className="text-[12px] text-ink-500">{pick(language, trackLabel[s.track], s.track)}</p>
                      </td>
                      <td className="num">
                        <span className={cn('t-num font-bold', !s.isNewStudent && s.cumulativeGpa < 2 ? 'text-signal-600' : 'text-ink-900')}>
                          {s.isNewStudent ? '—' : s.cumulativeGpa.toFixed(2)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-[12.5px] text-ink-700">{personName(s.advisorName, language) || '—'}</td>
                      <td className="num">
                        <span className="t-num">{Math.round(s.attendancePercentage)}%</span>
                      </td>
                      <td className="text-[12px] text-ink-600">
                        {s.registeredBy ? <Chip tone={registeredByTone(s.registeredBy)}>{registeredByLabel(s.registeredBy, language)}</Chip> : registeredByLabel(null, language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
