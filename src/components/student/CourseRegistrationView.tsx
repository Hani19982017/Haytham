import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Course, CourseOffering, Student } from '../../types/index.js';
import {
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  Users,
  Clock,
  ShieldCheck,
  Send,
  Building,
} from 'lucide-react';

export const CourseRegistrationView: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [student, setStudent] = useState<Student | null>(null);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [regResult, setRegResult] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      if (!currentUser?.studentId) return;
      try {
        setLoading(true);
        const [studentData, offeringsData, coursesData] = await Promise.all([
          api.getStudentById(currentUser.studentId),
          api.getOfferings(),
          api.getCourses(),
        ]);
        setStudent(studentData);
        setOfferings(offeringsData);
        setCourses(coursesData);

        // Pre-select current enrolled courses if any
        const enrolled = studentData.records.filter(r => r.status === 'IN_PROGRESS').map(r => r.courseCode);
        setSelectedCodes(enrolled);
      } catch (err) {
        console.error('Failed to load registration data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentUser]);

  if (loading || !student) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Calculate maximum allowed credits based on bylaws
  const maxAllowedCredits =
    student.cumulativeGpa >= 3.0 ? 21 :
    student.cumulativeGpa >= 2.0 ? 18 :
    student.cumulativeGpa >= 1.0 ? 15 : 12;

  const courseMap = new Map<string, Course>(courses.map(c => [c.code, c]));
  const passedCodes = new Set(
    student.records.filter(r => r.status === 'PASSED').map(r => r.courseCode)
  );

  const selectedCredits = selectedCodes.reduce((sum, code) => {
    const c = courseMap.get(code);
    return sum + (c ? c.credits : 3);
  }, 0);

  const isOverLimit = selectedCredits > maxAllowedCredits;

  const toggleSelectCourse = (code: string) => {
    setRegResult(null);
    setSelectedCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleRegister = async () => {
    if (!currentUser?.studentId) return;
    try {
      setSubmitting(true);
      const res = await api.registerCourses(currentUser.studentId, selectedCodes, false);
      setRegResult(res);
      if (res.success) {
        const updatedStudent = await api.getStudentById(currentUser.studentId);
        setStudent(updatedStudent);
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      setRegResult({
        success: false,
        messageAr: 'حدث خطأ أثناء الاتصال بالخادم وتسجيل المقررات.',
        messageEn: 'An error occurred during course registration.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-indigo-600">
            <FileCheck2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {t('بوابة التسجيل الفصلي المباشر (خريف 2026/2027)', 'Live Course Registration (Fall 2026/2027)')}
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            {t(
              'التسجيل يخضع مباشرة لمحرك اللائحة الأكاديمية الصارم للتحقق من العبء المسموح، المقاعد، والمتطلبات السابقة.',
              'Validated in real-time by the Academic Rules Engine for credit load, seats, and prerequisites.'
            )}
          </p>
        </div>

        {/* Live Credit Meter */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-4 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">{t('الحد الأقصى المسموح لمعدلك', 'Max Allowed')}</span>
            <span className="font-extrabold text-slate-900 text-sm">{maxAllowedCredits} {t('ساعة', 'hrs')}</span>
          </div>
          <div className="h-8 w-px bg-slate-200"></div>
          <div>
            <span className="text-slate-400 block text-[10px]">{t('الساعات المحددة حالياً', 'Selected')}</span>
            <span className={`font-extrabold text-sm ${isOverLimit ? 'text-rose-600' : 'text-indigo-600'}`}>
              {selectedCredits} {t('ساعة', 'hrs')}
            </span>
          </div>
        </div>
      </div>

      {/* Validation Message Box */}
      {regResult && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start gap-3 shadow-xs ${
            regResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {regResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h4 className="font-bold mb-1">
              {language === 'ar' ? regResult.messageAr : regResult.messageEn}
            </h4>
            {regResult.validation?.errorsAr && regResult.validation.errorsAr.length > 0 && (
              <ul className="list-disc list-inside space-y-1 mt-1 text-[11px] text-rose-700">
                {(language === 'ar'
                  ? regResult.validation.errorsAr
                  : regResult.validation.errorsEn
                ).map((err: string, i: number) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Offerings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            {t('المقررات والشعب المطروحة للتسجيل', 'Available Course Offerings')}
          </h3>
          <span className="text-xs text-slate-400">
            {offerings.length} {t('مقررات مطروحة', 'courses offered')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-center w-12">#</th>
                <th className="px-4 py-3">{t('المقرر', 'Course')}</th>
                <th className="px-4 py-3">{t('الساعات', 'Credits')}</th>
                <th className="px-4 py-3">{t('أستاذ المقرر', 'Instructor')}</th>
                <th className="px-4 py-3">{t('الموعد والقاعة', 'Schedule & Hall')}</th>
                <th className="px-4 py-3">{t('المقاعد والشواغر', 'Capacity')}</th>
                <th className="px-4 py-3 text-center">{t('المتطلب السابق', 'Prerequisite')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offerings.map(off => {
                const course = courseMap.get(off.courseCode);
                const isSelected = selectedCodes.includes(off.courseCode);
                const availableSeats = off.capacity - off.enrolledCount;
                const isFull = availableSeats <= 0;

                const prereqs = course?.prerequisites || [];
                const prereqMet = prereqs.every(p => passedCodes.has(p));

                return (
                  <tr
                    key={off.id}
                    onClick={() => toggleSelectCourse(off.courseCode)}
                    className={`hover:bg-slate-50 transition cursor-pointer ${
                      isSelected ? 'bg-indigo-50/50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectCourse(off.courseCode)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">
                        {language === 'ar' ? course?.nameAr : course?.nameEn}
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {off.courseCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-700">
                      {course?.credits || 3}h
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {off.instructorName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{language === 'ar' ? off.lectureDayTimeAr : off.lectureDayTimeEn}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building className="w-3 h-3" />
                        <span>{off.hall}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold ${
                          isFull ? 'text-rose-600' : availableSeats <= 5 ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {off.enrolledCount} / {off.capacity}
                      </span>
                      {isFull && (
                        <span className="text-[10px] text-rose-600 block">{t('شعبة ممتلئة', 'Full')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {prereqs.length === 0 ? (
                        <span className="text-[10px] text-slate-400">{t('لا يوجد', 'None')}</span>
                      ) : prereqMet ? (
                        <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {t('مستوفى', 'Satisfied')}
                        </span>
                      ) : (
                        <span className="text-rose-600 font-bold text-[10px] bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {prereqs.join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            <span>{t('المقررات المحددة: ', 'Selected Courses: ')}</span>
            <span className="font-bold text-slate-800">{selectedCodes.length} {t('مقررات', 'courses')}</span>
            <span className="mx-2">|</span>
            <span>{t('إجمالي الساعات: ', 'Total Credits: ')}</span>
            <span className={`font-bold ${isOverLimit ? 'text-rose-600' : 'text-indigo-600'}`}>
              {selectedCredits} / {maxAllowedCredits} {t('ساعة', 'hrs')}
            </span>
          </div>

          <button
            disabled={submitting || selectedCodes.length === 0 || isOverLimit}
            onClick={handleRegister}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
              isOverLimit || selectedCodes.length === 0
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{t('تأكيد وتسجيل المقررات رسمياً', 'Confirm Course Registration')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
