import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { CourseRecommendation } from '../../types/index.js';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Key,
  Users,
  Flame,
  PlusCircle,
  HelpCircle,
  Filter,
} from 'lucide-react';

interface RecommendationsViewProps {
  onNavigateTab: (tab: string) => void;
}

export const RecommendationsView: React.FC<RecommendationsViewProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [recommendations, setRecommendations] = useState<CourseRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [addedCourses, setAddedCourses] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadRecs() {
      if (!currentUser?.studentId) return;
      try {
        setLoading(true);
        const data = await api.getRecommendations(currentUser.studentId);
        setRecommendations(data);
      } catch (err) {
        console.error('Failed to load recommendations:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRecs();
  }, [currentUser]);

  const handleAddToPlan = (code: string) => {
    setAddedCourses(prev => new Set(prev).add(code));
  };

  const priorityBadge: Record<string, string> = {
    CRITICAL: 'bg-rose-100 text-rose-800 border-rose-200',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    MEDIUM: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    NORMAL: 'bg-slate-100 text-slate-800 border-slate-200',
  };

  const priorityLabel: Record<string, { ar: string; en: string }> = {
    CRITICAL: { ar: 'أولوية قصوى (إعادة رسوب/إنقاذ)', en: 'Critical (Retake/Deficit)' },
    HIGH: { ar: 'أولوية مرتفعة (مقرر مفتاحي)', en: 'High (Key Gateway)' },
    MEDIUM: { ar: 'أولوية متوسطة (متطلب أساسي)', en: 'Medium (Core Requirement)' },
    NORMAL: { ar: 'أولوية عادية', en: 'Normal' },
  };

  const filtered = filterPriority === 'ALL'
    ? recommendations
    : recommendations.filter(r => r.priority === filterPriority);

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
          <div className="flex items-center gap-2 mb-1 text-indigo-600">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900">
              {t('نظام التوصيات الأكاديمية الذكية', 'AI Course Recommendation Engine')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            {t(
              'يقوم النموذج بتحليل سجلك الأكاديمي، فك شفرة بؤر التعطيل (Bottlenecks)، والتأكد من مطابقة شروط اللائحة والمتطلبات السابقة قبل التوصية بأي مقرر.',
              'The algorithm analyzes your academic standing, prerequisite unlock chains, and bylaw credit capacities to prioritize optimal course registration.'
            )}
          </p>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">{t('جميع التوصيات', 'All Recommendations')}</option>
            <option value="CRITICAL">{t('أولوية قصوى فقط', 'Critical Only')}</option>
            <option value="HIGH">{t('أولوية مرتفعة', 'High Priority')}</option>
            <option value="MEDIUM">{t('أولوية متوسطة', 'Medium Priority')}</option>
          </select>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(rec => {
          const isAdded = addedCourses.has(rec.courseCode);

          return (
            <div
              key={rec.courseCode}
              className={`bg-white rounded-2xl p-5 border transition-all hover:shadow-md flex flex-col justify-between ${
                rec.priority === 'CRITICAL'
                  ? 'border-rose-300 ring-1 ring-rose-200'
                  : 'border-slate-200'
              }`}
            >
              <div>
                {/* Top Row: Code, Name, Priority Badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                        {rec.courseCode}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {rec.credits} {t('ساعات معتمدة', 'Credits')}
                      </span>
                      {rec.isRetake && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-rose-500" />
                          {t('إعادة مقرر', 'Retake')}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-1">
                      {language === 'ar' ? rec.courseNameAr : rec.courseNameEn}
                    </h3>
                  </div>

                  <span
                    className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      priorityBadge[rec.priority] || 'bg-slate-100'
                    }`}
                  >
                    {language === 'ar' ? priorityLabel[rec.priority]?.ar : priorityLabel[rec.priority]?.en}
                  </span>
                </div>

                {/* Score & Key Stats */}
                <div className="grid grid-cols-3 gap-2 py-2 px-3 bg-slate-50 rounded-xl mb-3 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">{t('درجة التوصية', 'Score')}</span>
                    <span className="font-bold text-indigo-600">{rec.score} / 100</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{t('يفتح مقررات', 'Unlocks')}</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <Key className="w-3 h-3 text-amber-500" />
                      {rec.unlocksCount} {t('مقررات', 'courses')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{t('المقاعد المتاحة', 'Seats')}</span>
                    <span
                      className={`font-bold ${
                        rec.availableSeats <= 3 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {rec.availableSeats} / {rec.capacity}
                    </span>
                  </div>
                </div>

                {/* Why Recommended? (Human Readable Explanations) */}
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{t('لماذا يوصى بهذا المقرر؟ (التفسير الذكي)', 'Why is this recommended?')}</span>
                  </div>
                  <ul className="space-y-1">
                    {(language === 'ar' ? rec.reasonsAr : rec.reasonsEn).map((reason, i) => (
                      <li key={i} className="text-[11px] text-slate-600 flex items-start gap-1.5 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Impact Statement */}
                <div className="text-[11px] font-medium text-slate-700 bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100/60 mb-4">
                  <span className="font-bold text-indigo-700">{t('الأثر على التخرج: ', 'Graduation Impact: ')}</span>
                  <span>{language === 'ar' ? rec.impactAr : rec.impactEn}</span>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px]">
                  {rec.prerequisitesMet ? (
                    <span className="text-emerald-600 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('المتطلبات مستوفاة', 'Prerequisites met')}
                    </span>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {t('يتطلب متطلبات سابقة', 'Missing prereqs')}
                    </span>
                  )}
                </div>

                <button
                  disabled={!rec.prerequisitesMet || isAdded}
                  onClick={() => handleAddToPlan(rec.courseCode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    isAdded
                      ? 'bg-emerald-100 text-emerald-800'
                      : !rec.prerequisitesMet
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  }`}
                >
                  {isAdded ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('تمت الإضافة للخطة', 'Added to Plan')}</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>{t('إضافة إلى الخطة', 'Add to Plan')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
