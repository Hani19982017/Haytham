import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import {
  BarChart3,
  Flame,
  PieChart,
  Users,
  ShieldAlert,
  AlertTriangle,
  GraduationCap,
  TrendingDown,
  CheckCircle,
} from 'lucide-react';

interface DepartmentHeadDashboardProps {
  currentTab?: string;
  onNavigateTab?: (tab: string) => void;
}

type HeadTab = 'ANALYTICS' | 'HOTSPOTS' | 'SEATS';

const mapHeadTab = (tab?: string): HeadTab => {
  if (tab === 'head-hotspots') return 'HOTSPOTS';
  if (tab === 'head-seats') return 'SEATS';
  return 'ANALYTICS';
};

export const DepartmentHeadDashboard: React.FC<DepartmentHeadDashboardProps> = ({ currentTab, onNavigateTab }) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<HeadTab>(() => mapHeadTab(currentTab));

  useEffect(() => {
    if (currentTab) {
      setActiveTab(mapHeadTab(currentTab));
    }
  }, [currentTab]);

  const handleSelectTab = (tab: HeadTab) => {
    setActiveTab(tab);
    if (onNavigateTab) {
      switch (tab) {
        case 'HOTSPOTS':
          onNavigateTab('head-hotspots');
          break;
        case 'SEATS':
          onNavigateTab('head-seats');
          break;
        case 'ANALYTICS':
        default:
          onNavigateTab('head-analytics');
          break;
      }
    }
  };

  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setLoading(true);
        const data = await api.getDepartmentAnalytics();
        setAnalytics(data);
      } catch (err) {
        console.error('Failed to load department analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  if (loading || !analytics) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const { totalStudents, riskSummary, hotspots, seatStats, trackDistribution, expectedGraduationDelays } = analytics;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-purple-600">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {t('التقرير التحليلي الاستراتيجي لرئاسة القسم', 'Department Head Strategic Analytics')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            {t(
              'مؤشرات الأداء الأكاديمي، كشف بؤر الرسوب الشائعة، التنبؤ بضغط المقاعد، ورصد احتمالات تأخر التخرج لطلاب برنامج علوم الحاسب.',
              'Strategic department analytics: failure hotspot detection, capacity pressure forecast, and degree completion bottlenecks.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 bg-purple-50 text-purple-800 px-3 py-1.5 rounded-xl border border-purple-200">
            {totalStudents} {t('طالباً مقيداً بالبرنامج', 'enrolled students')}
          </span>
        </div>
      </div>

      {/* Sub-Navigation Pills (All 3 Tabs) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-semibold">
          <button
            onClick={() => handleSelectTab('ANALYTICS')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ANALYTICS'
                ? 'bg-white text-purple-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{t('التحليلات والمؤشرات الاستراتيجية', 'Executive Analytics')}</span>
          </button>

          <button
            onClick={() => handleSelectTab('HOTSPOTS')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'HOTSPOTS'
                ? 'bg-white text-rose-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{t('بؤر الرسوب والمقررات الحرجة', 'Failure Hotspots')}</span>
            {hotspots.length > 0 && (
              <span className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {hotspots.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleSelectTab('SEATS')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'SEATS'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>{t('ضغط المقاعد والتنبؤ بالطلب', 'Seat Demand Forecast')}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('حالات الخطر الحرج (فصل)', 'Critical Dismissal Danger')}</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-3xl font-extrabold text-rose-600">{riskSummary.critical}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {Math.round((riskSummary.critical / totalStudents) * 100)}% {t('من إجمالي الطلاب', 'of total')}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('تحت الإنذار الأكاديمي (< 2.0)', 'Academic Warnings (<2.0)')}</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold text-amber-600">{riskSummary.below2Gpa}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {t('بحاجة لخطط إنقاذ معتمدة', 'Require recovery intervention')}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('احتمالية تأخر التخرج المتوقعة', 'Expected Graduation Delays')}</span>
            <TrendingDown className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">{expectedGraduationDelays}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            ~14% {t('بسبب تراكم المتطلبات السابقة', 'due to prerequisite bottlenecks')}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('الطلاب في وضع آمن ومستقر', 'Good Standing')}</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-600">{riskSummary.low}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {Math.round((riskSummary.low / totalStudents) * 100)}% {t('أداء طبيعي منتظم', 'on-track completion')}
          </span>
        </div>
      </div>

      <div className={`grid gap-6 ${activeTab === 'ANALYTICS' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Failure Hotspots Analysis */}
        {(activeTab === 'ANALYTICS' || activeTab === 'HOTSPOTS') && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-5 h-5 text-rose-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('بؤر الرسوب الأكثر تأثيراً على التعثر (Hotspots)', 'Top Failure Hotspots')}
                </h3>
                <p className="text-xs text-slate-500">
                  {t('المقررات التي تسجل أعلى نسب رسوب وتعيق مسار التخرج', 'Courses causing the highest prerequisite bottlenecks')}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {hotspots.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  {t('لا توجد بؤر رسوب حرجة مسجلة', 'No significant hotspots')}
                </div>
              ) : (
                (activeTab === 'HOTSPOTS' ? hotspots : hotspots.slice(0, 5)).map((h: any, idx: number) => (
                  <div key={h.code} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 text-xs">
                          {language === 'ar' ? h.nameAr : h.nameEn}
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">{h.code}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-rose-600 block">
                        {h.count} {t('حالات رسوب', 'failures')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {t('يتطلب زيادة ساعات الدعم', 'Needs TA tutoring')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Seat Pressure & Demand Forecast */}
        {(activeTab === 'ANALYTICS' || activeTab === 'SEATS') && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-5 h-5 text-indigo-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('ضغط المقاعد والتنبؤ بالطلب الفصلي', 'Seat Pressure & Capacity Forecast')}
                </h3>
                <p className="text-xs text-slate-500">
                  {t('تحديد الشعب القريبة من الامتلاء لفتح فصول إضافية', 'Sections nearing or at maximum capacity')}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {(activeTab === 'SEATS' ? seatStats : seatStats.slice(0, 5)).map((s: any, idx: number) => (
                <div key={`${s.courseCode}_${s.id || idx}`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      {s.courseCode} - {language === 'ar' ? s.courseNameAr : s.courseNameEn}
                    </span>
                    <span className={`font-bold ${s.pressurePct >= 90 ? 'text-rose-600' : 'text-slate-600'}`}>
                      {s.enrolledCount} / {s.capacity} ({s.pressurePct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        s.pressurePct >= 90 ? 'bg-rose-500' : s.pressurePct >= 75 ? 'bg-amber-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${Math.min(100, s.pressurePct)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
