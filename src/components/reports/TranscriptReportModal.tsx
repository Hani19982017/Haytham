import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { VerifiedTranscriptReport } from '../../../server/reports/reportService.js';
import { INSTITUTION } from '../../config/institution.js';
import { Modal, Loader, EmptyState, BrandMark, CodeBadge, cn, chipClass, gradeTone, personName } from '../ui/index.js';
import { Printer, ShieldCheck, AlertCircle, BadgeCheck, RotateCcw } from 'lucide-react';

interface TranscriptModalProps {
  studentId: string;
  onClose: () => void;
}

export const TranscriptReportModal: React.FC<TranscriptModalProps> = ({ studentId, onClose }) => {
  const { t, language } = useLanguage();
  const [report, setReport] = useState<VerifiedTranscriptReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    async function loadTranscript() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getOfficialTranscript(studentId || 'stu_omar');
        if (data && data.verificationToken) {
          setReport(data);
        } else {
          setError(t('تعذر إصدار السجل الموثق لهذا الطالب.', 'The verified transcript could not be issued for this student.'));
        }
      } catch (err: any) {
        console.error('Failed to load transcript:', err);
        setError(
          err?.response?.data?.messageAr && language === 'ar'
            ? err.response.data.messageAr
            : t('تعذر إصدار السجل الموثق. تأكد من اتصال الخادم ثم أعد المحاولة.', 'The verified transcript could not be issued. Check the server connection and try again.')
        );
      } finally {
        setLoading(false);
      }
    }
    loadTranscript();
  }, [studentId, attempt]);

  const issued = report
    ? new Date(report.issuedAt).toLocaleDateString(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  const totalCredits = report?.totalRequiredCredits || INSTITUTION.totalCredits;
  const goodStanding = (report?.cumulativeGpa ?? 0) >= 2;
  const qrPayload = report
    ? `${INSTITUTION.universityAr} - ${INSTITUTION.facultyAr}\nسجل أكاديمي موثق\nالطالب: ${report.studentNameAr}\nالكود: ${report.studentCode}\nالمعدل: ${(report.cumulativeGpa ?? 0).toFixed(2)}\nالساعات: ${report.completedCredits}/${totalCredits}\nرمز التحقق: ${report.verificationToken}\nالرابط: ${window.location.origin}/api/reports/verify/${report.verificationToken}`
    : '';

  return (
    <Modal
      onClose={onClose}
      size="xl"
      icon={ShieldCheck}
      title={t('السجل الأكاديمي الموثق', 'Verified academic transcript')}
      subtitle={t('مستند رسمي برمز تحقق يمكن مسحه بكاميرا الهاتف', 'An official document with a scannable verification code')}
      closeLabel={t('إغلاق', 'Close')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('إغلاق', 'Close')}
          </button>
          <button type="button" onClick={() => window.print()} className="btn btn-primary" disabled={!report}>
            <Printer aria-hidden="true" />
            {t('طباعة أو حفظ PDF', 'Print or save as PDF')}
          </button>
        </>
      }
    >
      {loading ? (
        <Loader compact label={t('جارٍ إصدار السجل الموثق…', 'Issuing the verified transcript…')} />
      ) : error || !report ? (
        <EmptyState
          icon={AlertCircle}
          tone="signal"
          title={t('لم يصدر السجل', 'Transcript not issued')}
          description={error || t('السجل غير متوفر حالياً.', 'The transcript is not available right now.')}
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setAttempt(a => a + 1)}>
              <RotateCcw aria-hidden="true" />
              {t('أعد المحاولة', 'Try again')}
            </button>
          }
        />
      ) : (
        <article className="text-ink-900">
          {/* Letterhead */}
          <div className="flex items-start justify-between gap-4 border-b-[3px] border-sign-600 pb-4">
            <div>
              <p className="text-[15px] font-extrabold">{language === 'ar' ? INSTITUTION.universityAr : INSTITUTION.universityEn}</p>
              <p className="text-[13px] font-semibold text-ink-700">{language === 'ar' ? INSTITUTION.facultyAr : INSTITUTION.facultyEn}</p>
              <p className="text-[12px] text-ink-500">{language === 'ar' ? INSTITUTION.officeAr : INSTITUTION.officeEn}</p>
            </div>
            <BrandMark size={48} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-500">
            <span>
              {t('تاريخ الإصدار:', 'Issued on:')} <span className="font-semibold text-ink-800">{issued}</span>
            </span>
            <span>
              {t('رقم المستند:', 'Document no.:')}{' '}
              <span className="font-semibold text-ink-800" dir="ltr">
                {report.verificationToken.slice(0, 15)}
              </span>
            </span>
          </div>

          {/* Student */}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-ink-200 bg-ink-50 p-4 sm:grid-cols-3">
            <div className="kv col-span-2 sm:col-span-1">
              <dt>{t('اسم الطالب', 'Student')}</dt>
              <dd>{personName(language === 'ar' ? report.studentNameAr : report.studentNameEn, language)}</dd>
            </div>
            <div className="kv">
              <dt>{t('الرقم الجامعي', 'Student code')}</dt>
              <dd className="t-num">{report.studentCode}</dd>
            </div>
            <div className="kv">
              <dt>{t('البرنامج', 'Programme')}</dt>
              <dd>{language === 'ar' ? report.degreeProgramAr : report.degreeProgramEn}</dd>
            </div>
            <div className="kv">
              <dt>{t('المعدل التراكمي', 'Cumulative GPA')}</dt>
              <dd className="t-num">{(report.cumulativeGpa ?? 0).toFixed(2)} / 4.00</dd>
            </div>
            <div className="kv">
              <dt>{t('الساعات المكتسبة', 'Credits earned')}</dt>
              <dd className="t-num">
                {report.completedCredits ?? 0} / {totalCredits}
              </dd>
            </div>
            <div className="kv">
              <dt>{t('الوضع الأكاديمي', 'Academic standing')}</dt>
              <dd className={goodStanding ? 'text-sign-700' : 'text-signal-600'}>
                {language === 'ar' ? report.academicStandingAr : report.academicStandingEn}
              </dd>
            </div>
          </dl>

          {/* Courses */}
          <h3 className="mb-2 mt-6 text-[14px] font-bold">{t('المقررات المجتازة', 'Courses passed')}</h3>
          <div className="overflow-hidden rounded-xl border border-ink-200">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('المقرر', 'Course')}</th>
                  <th className="num">{t('الساعات', 'Credits')}</th>
                  <th className="num">{t('التقدير', 'Grade')}</th>
                  <th>{t('الفصل', 'Term')}</th>
                </tr>
              </thead>
              <tbody>
                {(report.courses || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="!py-8 text-center text-ink-500">
                      {t('لا توجد مقررات مجتازة بعد.', 'No courses passed yet.')}
                    </td>
                  </tr>
                ) : (
                  (report.courses || []).map((c, i) => (
                    <tr key={`${c.code}_${i}`}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <CodeBadge code={c.code} />
                          <span className="font-medium">{language === 'ar' ? c.nameAr : c.nameEn}</span>
                        </div>
                      </td>
                      <td className="num font-semibold">{c.credits}</td>
                      <td className="num">
                        <span className={cn(chipClass[gradeTone(c.grade)], 't-num font-extrabold')}>{c.grade}</span>
                      </td>
                      <td className="whitespace-nowrap text-ink-500">{c.semester}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Verification */}
          <div className="mt-6 flex flex-col gap-5 border-t border-ink-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-xl border-2 border-ink-900 bg-white p-1.5">
                {!qrFailed ? (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(qrPayload)}`}
                    alt={t('رمز التحقق QR', 'Verification QR code')}
                    className="h-full w-full object-contain"
                    onError={() => setQrFailed(true)}
                  />
                ) : (
                  <span className="px-1 text-center text-[10.5px] leading-4 text-ink-500">
                    {t('رمز QR يحتاج اتصالاً بالإنترنت', 'QR code needs an internet connection')}
                  </span>
                )}
              </div>
              <div className="min-w-0 text-[12.5px] leading-6">
                <p className="font-bold text-ink-900">{t('رمز التحقق', 'Verification code')}</p>
                <p className="break-all font-bold text-sign-700" dir="ltr">
                  {report.verificationToken}
                </p>
                <p className="text-ink-500">
                  {t('امسح الرمز بكاميرا الهاتف للتأكد من صحة المستند.', 'Scan the code with a phone camera to confirm the document is genuine.')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start rounded-xl border border-sign-200 bg-sign-50 px-3 py-2 text-[12.5px] font-bold text-sign-800 sm:self-center">
              <BadgeCheck className="h-5 w-5 text-sign-600" aria-hidden="true" />
              {t('معتمد إلكترونياً من شؤون الطلاب', 'Electronically certified by Student Affairs')}
            </div>
          </div>
        </article>
      )}
    </Modal>
  );
};
