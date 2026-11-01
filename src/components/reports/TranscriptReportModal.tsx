import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { VerifiedTranscriptReport } from '../../../server/reports/reportService.js';
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
  // Verification codes look like VT-<student code>-<GPA>-<credits>-<issue stamp>-<signature>.
  const tokenParts = report?.verificationToken.split('-') ?? [];
  const documentNumber = tokenParts.length === 6 ? `VT-${tokenParts[1]}-${tokenParts[4]}` : report?.verificationToken.slice(0, 15) ?? '';

  // The QR code holds only the short verification link (made on the server), so phones read it easily.
  const qrImage = report?.qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(report.qrSvg)}` : null;

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
                {documentNumber}
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
              <div className="grid h-[136px] w-[136px] shrink-0 place-items-center rounded-xl border-2 border-ink-900 bg-white p-1">
                {qrImage ? (
                  <img src={qrImage} alt={t('رمز QR للتحقق من المستند', 'QR code to verify this document')} className="h-full w-full" />
                ) : (
                  <span className="px-1 text-center text-[10.5px] leading-4 text-ink-500">
                    {t('رمز QR غير متاح', 'QR code unavailable')}
                  </span>
                )}
              </div>
              <div className="min-w-0 text-[12.5px] leading-6">
                <p className="font-bold text-ink-900">{t('رمز التحقق', 'Verification code')}</p>
                <p className="break-all font-bold text-sign-700" dir="ltr">
                  {report.verificationToken}
                </p>
                <p className="text-ink-500">
                  {t(
                    'امسح الرمز بكاميرا الهاتف لفتح صفحة التحقق من المستند وبيانات الطالب.',
                    'Scan with a phone camera to open the verification page with the student’s record.'
                  )}
                </p>
                {report.verificationUrl && (
                  <a
                    href={report.verificationUrl}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                    className="no-print block break-all text-[11.5px] leading-5 text-lane-600 underline underline-offset-2 hover:text-lane-700"
                  >
                    {report.verificationUrl}
                  </a>
                )}
                {report.verificationReachable === false && (
                  <p className="no-print mt-1 text-[11.5px] leading-5 text-caution-700">
                    {t(
                      'الرابط يعمل على هذا الجهاز فقط (localhost)، فلن يفتح من الموبايل. اضبط PUBLIC_APP_URL على عنوان يصل إليه الموبايل.',
                      'This link only works on this computer (localhost), so a phone cannot open it. Set PUBLIC_APP_URL to an address the phone can reach.'
                    )}
                  </p>
                )}
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
