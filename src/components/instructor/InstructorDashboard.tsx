import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Course, CourseOffering } from '../../types/index.js';
import {
  BookOpen,
  Save,
  CheckCircle2,
  AlertTriangle,
  Users,
  Award,
  Clock,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface InstructorDashboardProps {
  currentTab?: string;
  onNavigateTab?: (tab: string) => void;
}

export const InstructorDashboard: React.FC<InstructorDashboardProps> = ({ currentTab, onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'GRADES' | 'ATTENDANCE'>(() =>
    currentTab === 'instructor-attendance' ? 'ATTENDANCE' : 'GRADES'
  );

  useEffect(() => {
    if (currentTab === 'instructor-attendance') {
      setActiveTab('ATTENDANCE');
    } else if (currentTab === 'instructor-grades') {
      setActiveTab('GRADES');
    }
  }, [currentTab]);

  const handleSelectTab = (tab: 'GRADES' | 'ATTENDANCE') => {
    setActiveTab(tab);
    if (onNavigateTab) {
      onNavigateTab(tab === 'ATTENDANCE' ? 'instructor-attendance' : 'instructor-grades');
    }
  };

  const [courses, setCourses] = useState<Course[]>([]);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('CS 201');
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successAlert, setSuccessAlert] = useState<string | null>(null);

  useEffect(() => {
    async function loadInstructorData() {
      try {
        setLoading(true);
        const data = await api.getInstructorCourses();
        setCourses(data.courses);
        setOfferings(data.offerings);
        if (data.courses.length > 0) {
          setSelectedCourseCode(data.courses[0].code);
        }
      } catch (err) {
        console.error('Failed to load instructor courses:', err);
      } finally {
        setLoading(false);
      }
    }
    loadInstructorData();
  }, []);

  useEffect(() => {
    async function loadStudents() {
      if (!selectedCourseCode) return;
      try {
        const list = await api.getCourseEnrolledStudents(selectedCourseCode);
        setEnrolledStudents(list);
      } catch (err) {
        console.error('Failed to load enrolled students:', err);
      }
    }
    loadStudents();
  }, [selectedCourseCode]);

  const handleUpdateGrade = async (studentId: string, cw: number, fin: number) => {
    try {
      setSavingId(studentId);
      const res = await api.saveGrades(selectedCourseCode, studentId, cw, fin);
      if (res.success) {
        setSuccessAlert(
          t(
            `تم حفظ الدرجة وحساب التقدير تلقائياً (${res.record.grade}). تم تحديث المعدل التراكمي للطالب إلى (${res.newCumulativeGpa}).`,
            `Grade saved & auto-calculated (${res.record.grade}). Student cumulative GPA updated to (${res.newCumulativeGpa}).`
          )
        );
        // Refresh list
        const updatedList = await api.getCourseEnrolledStudents(selectedCourseCode);
        setEnrolledStudents(updatedList);
      }
    } catch (err) {
      console.error('Failed to save grades:', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdateAttendance = async (studentId: string, att: number) => {
    try {
      setSavingId(studentId);
      const res = await api.saveAttendance(selectedCourseCode, studentId, att);
      if (res.success) {
        setSuccessAlert(
          t(
            `تم تحديث نسبة الحضور إلى ${res.attendancePercentage}%. ${res.attendancePercentage < 75 ? 'تم إرسال إنذار غياب للطالب.' : ''}`,
            `Attendance updated to ${res.attendancePercentage}%.`
          )
        );
        const updatedList = await api.getCourseEnrolledStudents(selectedCourseCode);
        setEnrolledStudents(updatedList);
      }
    } catch (err) {
      console.error('Attendance update error:', err);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const activeCourse = courses.find(c => c.code === selectedCourseCode);
  const warningAttendanceCount = enrolledStudents.filter(item => (item.record?.attendancePercentage ?? 100) < 75).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-indigo-600">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {t('بوابة أستاذ المقرر: رصد الدرجات ومتابعة الحضور', 'Instructor Portal: Grade Entry & Attendance')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            {t(
              'حساب الدرجات والتقديرات تلقائياً وفق سلم الدرجات الرسمي مع مراعاة سقف الإعادة. يتم تحديث المعدلات التراكمية ومؤشرات الخطر فورياً عند الحفظ.',
              'Automated letter grading & retake capping. Student GPA and risk scores are automatically recalculated upon saving marks.'
            )}
          </p>
        </div>

        {/* Course Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500">{t('المقرر:', 'Course:')}</label>
          <select
            value={selectedCourseCode}
            onChange={e => setSelectedCourseCode(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {courses.map(c => (
              <option key={c.code} value={c.code}>
                {c.code} - {language === 'ar' ? c.nameAr : c.nameEn}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sub-Navigation Pills (Grades vs Attendance) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-semibold">
          <button
            onClick={() => handleSelectTab('GRADES')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'GRADES'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t('مقرراتي ورصد الدرجات', 'Courses & Grade Entry')}</span>
          </button>

          <button
            onClick={() => handleSelectTab('ATTENDANCE')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ATTENDANCE'
                ? 'bg-white text-amber-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t('متابعة الغياب ونسبة الحضور', 'Attendance & 75% Alerts')}</span>
            {warningAttendanceCount > 0 && (
              <span className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {warningAttendanceCount} {t('إنذار', 'alert')}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          {activeTab === 'ATTENDANCE'
            ? t('يتم إرسال إنذار فوري للطالب عندما تقل نسبة الحضور عن 75%.', 'Immediate alert sent when attendance drops below 75%.')
            : t('يتم حفظ الدرجات وتحديث المعدلات التراكمية في قاعدة البيانات.', 'Grades auto-calculate letter marks and update cumulative GPA.')}
        </div>
      </div>

      {successAlert && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successAlert}</span>
          </div>
          <button onClick={() => setSuccessAlert(null)} className="text-emerald-600 font-bold hover:underline cursor-pointer">
            {t('إغلاق', 'Dismiss')}
          </button>
        </div>
      )}

      {/* Enrolled Students Grade & Attendance Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {language === 'ar' ? activeCourse?.nameAr : activeCourse?.nameEn} ({selectedCourseCode})
            </h3>
            <span className="text-xs text-slate-400">
              {enrolledStudents.length} {t('طالباً مسجلاً في الشعبة', 'students enrolled')}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">{t('الطالب', 'Student')}</th>
                <th className="px-4 py-3">{t('المعدل التراكمي', 'Current GPA')}</th>
                <th className="px-4 py-3 text-center">{t('أعمال السنة (50)', 'Coursework (50)')}</th>
                <th className="px-4 py-3 text-center">{t('النهائي (50)', 'Final Exam (50)')}</th>
                <th className="px-4 py-3 text-center">{t('المجموع والتقدير', 'Total & Grade')}</th>
                <th className="px-4 py-3 text-center">{t('نسبة الحضور %', 'Attendance %')}</th>
                <th className="px-4 py-3 text-center">{t('إجراء', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrolledStudents.map(item => {
                const rec = item.record;
                const att = rec.attendancePercentage ?? 100;
                const isAttWarning = att < 75;

                return (
                  <GradeRow
                    key={item.studentId}
                    item={item}
                    rec={rec}
                    isAttWarning={isAttWarning}
                    onSaveGrade={handleUpdateGrade}
                    onSaveAttendance={handleUpdateAttendance}
                    saving={savingId === item.studentId}
                    t={t}
                    language={language}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Row component to hold local form state for each student
const GradeRow: React.FC<{
  item: any;
  rec: any;
  isAttWarning: boolean;
  onSaveGrade: (studentId: string, cw: number, fin: number) => void;
  onSaveAttendance: (studentId: string, att: number) => void;
  saving: boolean;
  t: any;
  language: string;
}> = ({ item, rec, isAttWarning, onSaveGrade, onSaveAttendance, saving, t, language }) => {
  const [cw, setCw] = useState<number>(rec.courseworkMark ?? 0);
  const [fin, setFin] = useState<number>(rec.finalMark ?? 0);
  const [att, setAtt] = useState<number>(rec.attendancePercentage ?? 100);

  const total = cw + fin;

  return (
    <tr className="hover:bg-slate-50 transition">
      <td className="px-4 py-3">
        <div className="font-bold text-slate-900">
          {language === 'ar' ? item.nameAr : item.nameEn}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 mt-0.5">
          <span>{item.studentCode}</span>
          {rec.attempt > 1 && (
            <span className="text-rose-600 bg-rose-50 px-1 rounded font-bold">
              {t(`محاولة ${rec.attempt}`, `Attempt ${rec.attempt}`)}
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3 font-bold text-slate-800">
        <span className={item.cumulativeGpa < 2.0 ? 'text-rose-600' : 'text-slate-800'}>
          {item.cumulativeGpa.toFixed(2)}
        </span>
      </td>

      <td className="px-4 py-3 text-center">
        <input
          type="number"
          min="0"
          max="50"
          value={cw}
          onChange={e => setCw(Number(e.target.value))}
          className="w-16 px-2 py-1 text-center font-bold rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        />
      </td>

      <td className="px-4 py-3 text-center">
        <input
          type="number"
          min="0"
          max="50"
          value={fin}
          onChange={e => setFin(Number(e.target.value))}
          className="w-16 px-2 py-1 text-center font-bold rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        />
      </td>

      <td className="px-4 py-3 text-center">
        <div className="font-bold text-slate-900">
          {total} / 100
        </div>
        {rec.grade ? (
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
              rec.grade === 'F'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {rec.grade} ({rec.gradePoints?.toFixed(1)})
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">{t('غير مرصود', 'Unset')}</span>
        )}
      </td>

      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <input
            type="number"
            min="0"
            max="100"
            value={att}
            onChange={e => setAtt(Number(e.target.value))}
            onBlur={() => onSaveAttendance(item.studentId, att)}
            className={`w-16 px-2 py-1 text-center font-bold rounded-lg border ${
              isAttWarning ? 'border-rose-400 text-rose-600 bg-rose-50' : 'border-slate-200 bg-white'
            }`}
          />
          <span className="text-[10px] text-slate-400">%</span>
        </div>
        {isAttWarning && (
          <span className="text-[9px] text-rose-600 font-bold block mt-0.5">
            {t('تحت 75% (حرمان)', 'Ban (<75%)')}
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-center">
        <button
          disabled={saving}
          onClick={() => onSaveGrade(item.studentId, cw, fin)}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 mx-auto"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? '...' : t('رصد', 'Save')}</span>
        </button>
      </td>
    </tr>
  );
};
