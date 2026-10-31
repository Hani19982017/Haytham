import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Course } from '../../types/index.js';
import {
  PageHeader,
  Panel,
  PanelHeader,
  Chip,
  CodeBadge,
  Meter,
  EmptyState,
  GpaScale,
  cn,
  chipClass,
  riskTone,
  riskLabel,
  pick,
} from '../ui/index.js';
import { GitFork, Plus, Trash2, ShieldCheck, Scale, FlaskConical } from 'lucide-react';

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
  const [simError, setSimError] = useState(false);
  // Only the newest simulation may update the panel (responses can arrive out of order).
  const requestSeq = useRef(0);

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
      const seq = ++requestSeq.current;
      try {
        setLoading(true);
        setSimError(false);
        const res = await api.simulateWhatIf(studentId, selectedItems);
        if (seq === requestSeq.current) setSimulationResult(res);
      } catch (err) {
        console.error('Simulation error:', err);
        if (seq === requestSeq.current) setSimError(true);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
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
  const canAdd = courses.some(c => !selectedItems.some(si => si.courseCode === c.code));
  const hasRows = selectedItems.length > 0;
  const result = hasRows ? simulationResult : null;

  const original: number | undefined = result?.originalGpa;
  const projected: number | undefined = result?.newCumulativeGpa;
  const delta = original !== undefined && projected !== undefined ? projected - original : 0;
  const deltaText = `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta).toFixed(2)}`;
  const scenarioCredits = selectedItems.reduce((sum, item) => sum + (courses.find(c => c.code === item.courseCode)?.credits ?? 3), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={GitFork}
        tone="plum"
        title={t('ماذا لو؟', 'What-if simulator')}
        description={t(
          'اختر مقررات وتقديرات تتوقعها، وشاهد أثرها على معدلك وساعاتك فوراً. لا شيء هنا يغيّر سجلك الرسمي.',
          'Pick courses and the grades you expect, and see the effect on your GPA and credits at once. Nothing here changes your official record.'
        )}
        meta={
          <Chip tone="plum" icon={ShieldCheck}>
            {t('بيئة تجريبية آمنة', 'Safe sandbox')}
          </Chip>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ── Scenario builder ─────────────────────────────────────────── */}
        <Panel>
          <PanelHeader
            icon={FlaskConical}
            tone="plum"
            title={t('السيناريو', 'Your scenario')}
            description={t(
              `كل سطر مقرر وتقدير تتوقعه. ${selectedItems.length} مقرر، ${scenarioCredits} ساعة.`,
              `Each row is a course and the grade you expect. ${selectedItems.length} course${selectedItems.length === 1 ? '' : 's'}, ${scenarioCredits} credits.`
            )}
            actions={
              <button type="button" onClick={handleAddItem} disabled={!canAdd} className="btn btn-soft btn-sm">
                <Plus aria-hidden="true" />
                {t('أضف مقرراً', 'Add course')}
              </button>
            }
          />

          {!hasRows ? (
            <EmptyState
              icon={FlaskConical}
              tone="plum"
              title={t('السيناريو فارغ', 'The scenario is empty')}
              description={t('أضف مقرراً وتقديراً متوقعاً لتبدأ المحاكاة.', 'Add a course and an expected grade to start.')}
              action={
                <button type="button" onClick={handleAddItem} disabled={!canAdd} className="btn btn-primary btn-sm">
                  <Plus aria-hidden="true" />
                  {t('أضف مقرراً', 'Add course')}
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
              {selectedItems.map((item, idx) => {
                const courseObj = courses.find(c => c.code === item.courseCode);
                const courseId = `whatif-course-${idx}`;
                const gradeId = `whatif-grade-${idx}`;
                return (
                  <li key={idx} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_auto]">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <label htmlFor={courseId} className="field-label !mb-1 flex items-center gap-2">
                        <CodeBadge code={item.courseCode} variant="soft" />
                        <span className="truncate font-medium text-ink-500">
                          {courseObj ? t(`${courseObj.credits} ساعات`, `${courseObj.credits} credits`) : t('المقرر', 'Course')}
                        </span>
                      </label>
                      <select
                        id={courseId}
                        value={item.courseCode}
                        onChange={e => handleUpdateItem(idx, 'courseCode', e.target.value)}
                        className="field"
                      >
                        {/* Keep the current value selectable even before the catalogue loads */}
                        {!courses.some(c => c.code === item.courseCode) && <option value={item.courseCode}>{item.courseCode}</option>}
                        {courses.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {language === 'ar' ? c.nameAr : c.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={gradeId} className="field-label !mb-1">
                        {t('التقدير المتوقع', 'Expected grade')}
                      </label>
                      <select
                        id={gradeId}
                        value={item.projectedGrade}
                        onChange={e => handleUpdateItem(idx, 'projectedGrade', e.target.value)}
                        className="field font-bold"
                      >
                        {gradeOptions.map(g => (
                          <option key={g} value={g}>
                            {/* LRM marks keep "B+" from rendering as "+B" in right-to-left text */}
                            {`\u200E${g}\u200E`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="btn btn-ghost btn-icon text-ink-500 hover:bg-signal-50 hover:text-signal-600"
                      aria-label={t(`احذف ${item.courseCode} من السيناريو`, `Remove ${item.courseCode} from the scenario`)}
                      title={t('حذف', 'Remove')}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="callout callout-caution mt-5">
            <Scale aria-hidden="true" />
            <p>
              {t(
                'تقدير الإعادة يخضع لسقف اللائحة تلقائياً: حتى B+ في الإعادة الأولى، وحتى C+ في الإعادة الثانية.',
                'Retake grades follow the bylaw caps automatically: up to B+ on the first retake and C+ on the second.'
              )}
            </p>
          </div>
        </Panel>

        {/* ── Results ──────────────────────────────────────────────────── */}
        <Panel aria-live="polite" aria-busy={loading}>
          <PanelHeader
            icon={GitFork}
            tone="sign"
            title={t('النتيجة المتوقعة', 'Projected result')}
            description={t('تتحدث مع كل تغيير في السيناريو.', 'Updates with every change to the scenario.')}
            actions={
              loading && hasRows ? (
                <span className="inline-flex items-center gap-2 text-[12px] font-medium text-ink-500">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-200 border-t-sign-600" aria-hidden="true" />
                  {t('يُعاد الحساب…', 'Recalculating…')}
                </span>
              ) : undefined
            }
          />

          {!hasRows ? (
            <EmptyState
              icon={GitFork}
              title={t('لا نتيجة بعد', 'No result yet')}
              description={t('أضف مقرراً واحداً على الأقل إلى السيناريو.', 'Add at least one course to the scenario.')}
            />
          ) : simError && !result ? (
            <div className="callout callout-signal">
              <Scale aria-hidden="true" />
              <p>{t('تعذّر حساب السيناريو. تأكد من اتصال الخادم وغيّر أي قيمة لإعادة المحاولة.', 'The scenario could not be calculated. Check the server connection and change any value to try again.')}</p>
            </div>
          ) : !result ? (
            <div className="space-y-3 py-6" aria-hidden="true">
              <div className="h-10 w-32 rounded-lg bg-ink-100" />
              <div className="h-3 w-full rounded-full bg-ink-100" />
              <div className="h-16 w-full rounded-xl bg-ink-50" />
            </div>
          ) : (
            <div className={cn('space-y-5 transition-opacity', loading && 'opacity-60')}>
              <div>
                <span className="text-[12.5px] font-medium text-ink-500">{t('المعدل التراكمي المتوقع', 'Projected cumulative GPA')}</span>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={cn('t-num text-[40px] font-extrabold leading-none', (projected ?? 0) < 2 ? 'text-signal-600' : 'text-ink-950')}>
                    {(projected ?? 0).toFixed(2)}
                  </span>
                  <span
                    className={cn(
                      chipClass[delta > 0 ? 'sign' : delta < 0 ? 'signal' : 'ink'],
                      't-num !h-7 !px-2.5 !text-[13px] font-extrabold'
                    )}
                  >
                    {deltaText}
                  </span>
                  <span className="text-[13px] text-ink-500">
                    {t('بدلاً من', 'from')} <span className="t-num font-semibold text-ink-700">{(original ?? 0).toFixed(2)}</span>
                  </span>
                </div>
                <GpaScale gpa={projected ?? 0} className="mt-3" />
              </div>

              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink-100 bg-ink-50 p-4">
                <div className="kv">
                  <dt>{t('المعدل الفصلي التقديري', 'Projected term GPA')}</dt>
                  <dd className="t-num !text-[20px]">{(result.semesterGpa ?? 0).toFixed(2)}</dd>
                </div>
                <div className="kv">
                  <dt>{t('الخطر الأكاديمي المتوقع', 'Projected academic risk')}</dt>
                  <dd>
                    {result.projectedRisk ? (
                      <span className={chipClass[riskTone[result.projectedRisk] || 'ink']}>
                        {pick(language, riskLabel[result.projectedRisk], result.projectedRisk)}
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                  <span className="font-medium text-ink-500">{t('الساعات المنجزة بعد السيناريو', 'Credits after this scenario')}</span>
                  <span className="t-num font-bold text-ink-900">
                    {result.simulatedCredits} / 134
                  </span>
                </div>
                <Meter value={result.degreeProgress ?? 0} label={t('التقدم نحو التخرج', 'Progress to graduation')} />
                <p className="mt-1.5 text-[12px] text-ink-500">
                  {t(`${result.remainingCredits} ساعة متبقية حتى التخرج.`, `${result.remainingCredits} credit hours left to graduate.`)}
                </p>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};
