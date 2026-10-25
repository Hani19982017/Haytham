import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Course } from '../../types/index.js';
import {
  Calculator,
  Plus,
  Trash2,
  TrendingUp,
  Award,
  Sparkles,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface SimulatorItem {
  courseCode: string;
  projectedGrade: string;
}

export const WhatIfSimulator: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedItems, setSelectedItems] = useState<SimulatorItem[]>([
    { courseCode: 'CS 201', projectedGrade: 'B+' },
    { courseCode: 'CS 304', projectedGrade: 'B' },
    { courseCode: 'CS 312', projectedGrade: 'A-' },
  ]);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadCourses() {
      try {
        const data = await api.getCourses();
        setCourses(data);
      } catch (err) {
        console.error('Failed to load courses:', err);
      }
    }
    loadCourses();
  }, []);

  useEffect(() => {
    async function runSim() {
      const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
      if (selectedItems.length === 0) return;
      try {
        setLoading(true);
        const res = await api.simulateWhatIf(studentId, selectedItems);
        setSimulationResult(res);
      } catch (err) {
        console.error('Simulation error:', err);
      } finally {
        setLoading(false);
      }
    }
    runSim();
  }, [selectedItems, currentUser]);

  const handleAddItem = () => {
    const available = courses.find(c => !selectedItems.some(si => si.courseCode === c.code));
    if (available) {
      setSelectedItems(prev => [...prev, { courseCode: available.code, projectedGrade: 'B' }]);
    }
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: 'courseCode' | 'projectedGrade', val: string) => {
    setSelectedItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const gradeOptions = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 mb-1 text-indigo-600">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900">
            {t('محاكي السيناريوهات التقديرية (What-If Simulator)', 'Academic What-If Simulator')}
          </h2>
        </div>
        <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
          {t(
            'بيئة تجريبية آمنة لا تعدل سجلك الأكاديمي الحقيقي. اختر المقررات والتقديرات المتوقعة لاحتساب الأثر الفوري على المعدل الفصلي والتراكمي وتاريخ التخرج.',
            'A secure sandbox that does NOT mutate your official records. Experiment with prospective course grades to simulate GPA and graduation progress.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Input Selection Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {t('المقررات والتقديرات المفترضة للسيناريو', 'Hypothetical Courses & Grades')}
            </h3>
            <button
              onClick={handleAddItem}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('إضافة مقرر للمحاكاة', 'Add Course')}</span>
            </button>
          </div>

          <div className="space-y-3">
            {selectedItems.map((item, idx) => {
              const courseObj = courses.find(c => c.code === item.courseCode);

              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">
                      {t('اختر المقرر', 'Course')}
                    </label>
                    <select
                      value={item.courseCode}
                      onChange={e => handleUpdateItem(idx, 'courseCode', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {courses.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.code} - {language === 'ar' ? c.nameAr : c.nameEn} ({c.credits}h)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-full sm:w-32">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">
                      {t('التقدير المتوقع', 'Projected Grade')}
                    </label>
                    <select
                      value={item.projectedGrade}
                      onChange={e => handleUpdateItem(idx, 'projectedGrade', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {gradeOptions.map(g => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex sm:flex-col justify-end pt-2 sm:pt-4">
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title={t('حذف', 'Remove')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Real-time Simulation Results */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4 text-emerald-400">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold tracking-tight">
                {t('النتائج التقديرية للسيناريو', 'Simulation Projections')}
              </h3>
            </div>

            {simulationResult ? (
              <div className="space-y-4">
                {/* Projected GPA */}
                <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
                  <span className="text-xs text-slate-400 block mb-1">
                    {t('المعدل التراكمي الجديد المتوقع', 'Projected Cumulative GPA')}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-emerald-400">
                      {simulationResult.newCumulativeGpa.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {t('بدلاً من', 'from')} {simulationResult.originalGpa.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-medium text-emerald-300 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>
                      +{(simulationResult.newCumulativeGpa - simulationResult.originalGpa).toFixed(2)} {t('نقطة تحسن', 'gain')}
                    </span>
                  </div>
                </div>

                {/* Projected Semester GPA */}
                <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
                  <span className="text-xs text-slate-400 block mb-1">
                    {t('المعدل الفصلي التقديري', 'Projected Semester GPA')}
                  </span>
                  <span className="text-2xl font-bold text-white">
                    {simulationResult.semesterGpa.toFixed(2)}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{t('إنجاز الساعات المعتمدة', 'Completed Credits')}</span>
                    <span className="font-bold text-white">
                      {simulationResult.simulatedCredits} / 134
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${simulationResult.degreeProgress}%` }}
                    ></div>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    {simulationResult.remainingCredits} {t('ساعة متبقية للتخرج', 'credits left for graduation')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                {t('جارٍ حساب السيناريو...', 'Calculating scenario...')}
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            {t(
              'ملاحظة: درجات إعادة المقررات تخضع تلقائياً لسقف التقدير المعتمد (B+ للإعادة الأولى، C+ للإعادة الثانية).',
              'Note: Retakes automatically adhere to grade caps (B+ for 1st retake, C+ for 2nd retake).'
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
