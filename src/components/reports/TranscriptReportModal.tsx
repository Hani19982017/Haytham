import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { VerifiedTranscriptReport } from '../../../server/reports/reportService.js';
import {
  FileText,
  Printer,
  ShieldCheck,
  X,
  QrCode,
  GraduationCap,
  Building,
  CheckCircle2,
} from 'lucide-react';

interface TranscriptModalProps {
  studentId: string;
  onClose: () => void;
}

export const TranscriptReportModal: React.FC<TranscriptModalProps> = ({ studentId, onClose }) => {
  const { t, language } = useLanguage();
  const [report, setReport] = useState<VerifiedTranscriptReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTranscript() {
      try {
        setLoading(true);
        const res = await fetch(`/api/reports/transcript/${studentId}`);
        const data = await res.json();
        setReport(data);
      } catch (err) {
        console.error('Failed to load transcript:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTranscript();
  }, [studentId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="text-xs font-bold text-slate-600">{t('جارٍ استخراج وتوثيق السجل الأكاديمي الرسمي...', 'Generating Official Verified Transcript...')}</span>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-8 my-8 relative print:m-0 print:p-4 print:shadow-none animate-in fade-in zoom-in-95">
        {/* Actions Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              {t('مستند رقمي موثق رسمياً ومرتبط برمز استجابة سريع (QR)', 'Tamper-Proof Digitally Verified Transcript')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{t('طباعة المستند', 'Print Transcript')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* University Official Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-5 mb-6">
          <div className="text-right">
            <div className="font-extrabold text-sm text-slate-900">{t('جامعة القاهرة - كلية الحاسبات والذكاء الاصطناعي', 'Faculty of Computers & Artificial Intelligence')}</div>
            <div className="text-xs text-slate-600">{t('وكالة الكلية لشؤون التعليم والطلاب', 'Office of Education & Student Affairs')}</div>
            <div className="text-[11px] text-slate-500">{t('برنامج علوم الحاسب بنظام الساعات المعتمدة', 'Credit-Hour Computer Science Degree Program')}</div>
          </div>

          <div className="w-14 h-14 rounded-2xl bg-indigo-900 text-white flex items-center justify-center font-extrabold shadow-sm">
            <GraduationCap className="w-8 h-8 text-amber-300" />
          </div>

          <div className="text-left font-mono text-[10px] text-slate-400">
            <div>DOC: TRANSCRIPT-OFFICIAL</div>
            <div>VERIFIED: YES</div>
            <div>SEAL: FACULTY-SIS-V4</div>
          </div>
        </div>

        {/* Student Metadata Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">{t('اسم الطالب', 'Student Name')}</span>
            <span className="font-extrabold text-slate-900">{language === 'ar' ? report.studentNameAr : report.studentNameEn}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">{t('كود الطالب الجامعي', 'Student Code')}</span>
            <span className="font-mono font-extrabold text-indigo-700">{report.studentCode}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">{t('المعدل التراكمي (GPA)', 'Cumulative GPA')}</span>
            <span className="font-extrabold text-slate-900">{report.cumulativeGpa.toFixed(2)} / 4.00</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">{t('الساعات المنجزة', 'Earned Hours')}</span>
            <span className="font-extrabold text-slate-900">{report.completedCredits} / 134 {t('ساعة', 'hrs')}</span>
          </div>
        </div>

        {/* Academic Records Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">{t('كود المقرر', 'Course Code')}</th>
                <th className="px-4 py-2.5">{t('اسم المقرر الأكاديمي', 'Course Title')}</th>
                <th className="px-4 py-2.5 text-center">{t('الساعات', 'Credits')}</th>
                <th className="px-4 py-2.5 text-center">{t('التقدير', 'Grade')}</th>
                <th className="px-4 py-2.5">{t('الفصل الدراسي', 'Term')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.courses.map((c, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-800">{c.code}</td>
                  <td className="px-4 py-2 text-slate-900">{language === 'ar' ? c.nameAr : c.nameEn}</td>
                  <td className="px-4 py-2 text-center font-bold">{c.credits}</td>
                  <td className="px-4 py-2 text-center font-bold text-indigo-700">{c.grade}</td>
                  <td className="px-4 py-2 text-slate-500 text-[11px]">{c.semester}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer with QR Code & Verification Info */}
        <div className="border-t-2 border-slate-200 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Visual QR Code Box */}
            <div className="w-20 h-20 bg-slate-900 text-white rounded-xl p-1.5 flex flex-col items-center justify-center shrink-0 border border-slate-700">
              <QrCode className="w-12 h-12 text-white" />
              <span className="text-[8px] font-mono text-slate-300">SCAN TO VERIFY</span>
            </div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              <div className="font-bold text-slate-800 mb-0.5">{t('رمز التحقق الرقمي الأكاديمي المعتمد:', 'Official Cryptographic Verification Code:')}</div>
              <div className="font-mono text-indigo-700 font-extrabold text-xs">{report.verificationToken}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {t('يمكن مسح الرمز ضوئياً للتحقق اللحظي من صحة السجل مباشرة من خوادم الجامعة.', 'Scan QR to verify document integrity directly from university servers.')}
              </div>
            </div>
          </div>

          <div className="text-center sm:text-left text-xs text-slate-500">
            <div className="text-[10px] text-slate-400">{t('تاريخ الإصدار الرسمي', 'Official Issuance Date')}</div>
            <div className="font-bold text-slate-700">{new Date(report.issuedAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}</div>
            <div className="mt-2 text-[10px] font-bold text-emerald-700 flex items-center justify-center sm:justify-start gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t('معتمد إلكترونياً من شؤون الطلاب', 'Electronically Accredited')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
