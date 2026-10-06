import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student } from '../../types/index.js';
import {
  FileSpreadsheet,
  Search,
  Lock,
  Eye,
  FileText,
  User,
} from 'lucide-react';

export const ProcessOfficerRecordsView: React.FC = () => {
  const { t, language } = useLanguage();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewRecord, setViewRecord] = useState<Student | null>(null);

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

  const filtered = students.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.studentCode.includes(q) ||
      s.nameAr.toLowerCase().includes(q) ||
      s.nameEn.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-slate-700">
            <FileSpreadsheet className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-bold text-slate-900">
              {t('سجلات شؤون الطلاب والبيانات الأكاديمية (للاطلاع فقط)', 'Student Affairs & Registration Records (Read-Only)')}
            </h2>
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              <Lock className="w-3 h-3 text-slate-400" />
              {t('صلاحية قراءة فقط', 'Read-Only Access')}
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">
            {t(
              'استعراض ملفات الطلاب، بيانات الاتصال، المقررات المسجلة، والسجل الأكاديمي الشامل دون صلاحيات تعديل مباشرة.',
              'Inspect student files, contact records, enrolled courses, and transcripts under strictly governed read-only access.'
            )}
          </p>
        </div>

        <div className="text-xs font-bold text-slate-500">
          {students.length} {t('سجلاً أكاديمياً مقيداً', 'registered records')}
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder={t('البحث بكود الطالب، الاسم، أو البريد...', 'Search by ID, name or email...')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">{t('كود الطالب', 'Student ID')}</th>
                <th className="px-4 py-3">{t('اسم الطالب', 'Student Name')}</th>
                <th className="px-4 py-3">{t('البريد الجامعي', 'Email')}</th>
                <th className="px-4 py-3">{t('المستوى والمسار', 'Level & Track')}</th>
                <th className="px-4 py-3">{t('المعدل التراكمي', 'Cumulative GPA')}</th>
                <th className="px-4 py-3">{t('الساعات المنجزة', 'Credits')}</th>
                <th className="px-4 py-3 text-center">{t('السجل الأكاديمي', 'Transcript')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(student => (
                <tr key={student.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">{student.studentCode}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {language === 'ar' ? student.nameAr : student.nameEn}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-500">{student.email}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{t(`المستوى ${student.level}`, `Level ${student.level}`)}</div>
                    <span className="text-[10px] text-slate-400">{student.track}</span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-800">{student.cumulativeGpa.toFixed(2)}</td>
                  <td className="px-4 py-3 font-bold text-slate-800">{student.completedCredits} / 134</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setViewRecord(student)}
                      className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      {t('استعراض', 'View')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transcript Modal */}
      {viewRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-slate-400 block">{t('بيان الحالة الأكاديمية (رسمي)', 'Academic Transcript Record')}</span>
                <h3 className="text-base font-bold text-slate-900">
                  {language === 'ar' ? viewRecord.nameAr : viewRecord.nameEn} ({viewRecord.studentCode})
                </h3>
              </div>
              <button
                onClick={() => setViewRecord(null)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
              >
                {t('إغلاق', 'Close')}
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
              {viewRecord.records.length === 0 ? (
                <div className="py-6 text-center text-slate-400">{t('لا توجد مقررات مسجلة بالسجل بعد', 'No courses registered')}</div>
              ) : (
                viewRecord.records.map((r, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">
                        {language === 'ar' ? r.courseNameAr : r.courseNameEn}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {r.courseCode} | {r.semesterName}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${r.status === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : r.status === 'FAILED' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                        {r.grade || r.status}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{r.credits}h</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
