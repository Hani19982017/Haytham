import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student, PlanStatus } from '../../types/index.js';
import { TranscriptReportModal } from '../reports/TranscriptReportModal.js';
import {
  PageHeader,
  Panel,
  Stat,
  Segmented,
  Modal,
  Toast,
  Loader,
  EmptyState,
  Chip,
  Meter,
  cn,
  chipClass,
  toneColor,
  riskTone,
  riskLabel,
  planStatusTone,
  planStatusLabel,
  trackTone,
  trackLabel,
  pick,
} from '../ui/index.js';
import {
  ShieldAlert,
  Users,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Search,
  TrendingDown,
  FileText,
  Check,
  XCircle,
  Pencil,
  NotebookPen,
  UserRound,
} from 'lucide-react';

interface AdvisorDashboardProps {
  currentTab?: string;
  onNavigateTab?: (tab: string) => void;
}

const mapAdvisorTab = (tab?: string): 'TRIAGE' | 'PLANS' | 'STUDENTS' => {
  if (tab === 'advisor-plans') return 'PLANS';
  if (tab === 'advisor-students') return 'STUDENTS';
  return 'TRIAGE';
};

/** Search input with a leading icon. */
const SearchField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}> = ({ value, onChange, placeholder, label, className }) => (
  <div className={cn('relative', className)}>
    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="field ps-9"
    />
  </div>
);

/** Thin vertical bar at the start of a row, coloured by risk. */
const RiskBar: React.FC<{ level: string }> = ({ level }) => (
  <span
    className="h-10 w-1 shrink-0 rounded-full"
    style={{ background: toneColor[riskTone[level] || 'ink'] }}
    aria-hidden="true"
  />
);

export const AdvisorDashboard: React.FC<AdvisorDashboardProps> = ({ currentTab, onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'TRIAGE' | 'PLANS' | 'STUDENTS'>(() => mapAdvisorTab(currentTab));

  useEffect(() => {
    if (currentTab) {
      setActiveTab(mapAdvisorTab(currentTab));
    }
  }, [currentTab]);

  const handleSelectTab = (tab: 'TRIAGE' | 'PLANS' | 'STUDENTS') => {
    setActiveTab(tab);
    if (onNavigateTab) {
      if (tab === 'PLANS') onNavigateTab('advisor-plans');
      else if (tab === 'STUDENTS') onNavigateTab('advisor-students');
      else onNavigateTab('advisor-dashboard');
    }
  };

  const [students, setStudents] = useState<Student[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('ALL');
  const [below2Only, setBelow2Only] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [selectedTrack, setSelectedTrack] = useState('ALL');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<'PENDING' | 'REVIEWED' | 'ALL'>('PENDING');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transcriptStudentId, setTranscriptStudentId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'>('APPROVE');
  const [processing, setProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadAdvisorStudents() {
      try {
        setLoading(true);
        const data = await api.getAdvisorStudents();
        setStudents(data);
      } catch (err) {
        console.error('Failed to load advisor students:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAdvisorStudents();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4000);
  };

  const applyStudentDecisionOptimistically = (
    student: Student,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'
  ) => {
    const newStatus: PlanStatus = action === 'APPROVE' ? 'Approved' : 'Rejected';
    setReviewedIds(prev => {
      const next = new Set(prev);
      next.add(student.id);
      return next;
    });
    setStudents(prev =>
      prev.map(s => (s.id === student.id ? { ...s, currentPlanStatus: newStatus } : s))
    );
  };

  const handleDecision = async () => {
    if (!selectedStudent) return;
    const targetStudent = selectedStudent;
    const action = decisionAction;
    const notes = decisionNotes;

    try {
      setProcessing(true);
      // 1. Optimistically update local state immediately so student is removed from active queue right away
      applyStudentDecisionOptimistically(targetStudent, action);
      setSelectedStudent(null);
      setDecisionNotes('');

      showToast(
        t(
          `تم حفظ القرار للطالب "${targetStudent.nameAr}" وخرج من قائمة الانتظار.`,
          `Decision saved for "${targetStudent.nameEn}"; removed from the queue.`
        )
      );

      // 2. Persist decision on backend
      await api.decidePlan(targetStudent.id, action, notes);
    } catch (err) {
      console.error('Decision error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleQuickPlanDecision = async (
    student: Student,
    action: 'APPROVE' | 'REJECT'
  ) => {
    applyStudentDecisionOptimistically(student, action);
    showToast(
      action === 'APPROVE'
        ? t(
            `تم اعتماد خطة الطالب "${student.nameAr}".`,
            `Study plan approved for "${student.nameEn}".`
          )
        : t(
            `تم رفض خطة الطالب "${student.nameAr}" وطُلب منه تعديلها.`,
            `Study plan rejected for "${student.nameEn}"; changes requested.`
          )
    );
    try {
      await api.decidePlan(
        student.id,
        action,
        action === 'APPROVE'
          ? 'تم اعتماد الخطة الدراسية من المرشد الأكاديمي.'
          : 'يرجى مراجعة المرشد الأكاديمي وتعديل المقررات المختارة.'
      );
    } catch (err) {
      console.error('Quick decision error:', err);
    }
  };

  const isStudentReviewed = (s: Student): boolean => {
    if (reviewedIds.has(s.id)) return true;
    return s.currentPlanStatus === 'Approved' || s.currentPlanStatus === 'Rejected';
  };

  const criticalCount = students.filter(s => s.riskLevel === 'CRITICAL').length;
  const highCount = students.filter(s => s.riskLevel === 'HIGH').length;
  const below2Count = students.filter(s => s.cumulativeGpa < 2.0).length;
  const pendingPlansCount = students.filter(s => !isStudentReviewed(s)).length;
  const reviewedPlansCount = students.filter(s => isStudentReviewed(s)).length;

  const matchesSearch = (s: Student) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.studentCode.toLowerCase().includes(q) ||
      s.nameAr.toLowerCase().includes(q) ||
      s.nameEn.toLowerCase().includes(q)
    );
  };

  // Filtered list for TRIAGE tab
  const triageFiltered = students.filter(s => {
    const reviewed = isStudentReviewed(s);
    if (reviewStatusFilter === 'PENDING' && reviewed) return false;
    if (reviewStatusFilter === 'REVIEWED' && !reviewed) return false;
    if (selectedRisk !== 'ALL' && s.riskLevel !== selectedRisk) return false;
    if (below2Only && s.cumulativeGpa >= 2.0) return false;
    return matchesSearch(s);
  });

  // Filtered list for PLANS tab (only unreviewed plans by default, or search)
  const plansFiltered = students.filter(s => {
    if (isStudentReviewed(s)) return false;
    return matchesSearch(s);
  });

  // Filtered list for STUDENTS directory tab (shows all assigned students with level/track filters)
  const directoryFiltered = students.filter(s => {
    if (selectedLevel !== 'ALL' && String(s.level) !== selectedLevel) return false;
    if (selectedTrack !== 'ALL' && s.track !== selectedTrack) return false;
    if (selectedRisk !== 'ALL' && s.riskLevel !== selectedRisk) return false;
    return matchesSearch(s);
  });

  const getMaxAllowedCredits = (gpa: number) => {
    if (gpa >= 3.0) return 21;
    if (gpa >= 2.0) return 18;
    if (gpa >= 1.5) return 15;
    return 12;
  };

  const nameOf = (s: Student) => (language === 'ar' ? s.nameAr : s.nameEn);
  const riskChip = (s: Student) => (
    <span className={chipClass[riskTone[s.riskLevel] || 'ink']}>{pick(language, riskLabel[s.riskLevel], s.riskLevel)}</span>
  );
  const planChip = (s: Student) => (
    <span className={chipClass[planStatusTone[s.currentPlanStatus] || 'ink']}>
      {pick(language, planStatusLabel[s.currentPlanStatus], s.currentPlanStatus)}
    </span>
  );
  const warningsCell = (s: Student) =>
    s.warningCount > 0 ? (
      <span className={chipClass[s.warningCount >= 3 ? 'signal' : 'caution']}>
        <span className="t-num">{s.warningCount}</span>
        {t(s.warningCount === 1 ? 'إنذار' : 'إنذارات', s.warningCount === 1 ? 'warning' : 'warnings')}
      </span>
    ) : (
      <span className="t-num text-ink-400">0</span>
    );

  const riskOptions = (
    <>
      <option value="ALL">{t('كل مستويات الخطر', 'All risk levels')}</option>
      <option value="CRITICAL">{pick(language, riskLabel.CRITICAL)}</option>
      <option value="HIGH">{pick(language, riskLabel.HIGH)}</option>
      <option value="MEDIUM">{pick(language, riskLabel.MEDIUM)}</option>
      <option value="LOW">{pick(language, riskLabel.LOW)}</option>
    </>
  );

  if (loading) {
    return <Loader label={t('جارٍ تحميل الطلاب المسندين إليك…', 'Loading your assigned students…')} />;
  }

  const decisionOptions: Array<{
    value: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
    label: string;
    icon: typeof Check;
    activeCls: string;
  }> = [
    { value: 'APPROVE', label: t('اعتماد الخطة', 'Approve plan'), icon: Check, activeCls: 'border-sign-600 bg-sign-600 text-white' },
    {
      value: 'REQUEST_CHANGES',
      label: t('طلب تعديلات', 'Request changes'),
      icon: Pencil,
      activeCls: 'border-caution-500 bg-caution-500 text-white',
    },
    { value: 'REJECT', label: t('رفض الخطة', 'Reject plan'), icon: XCircle, activeCls: 'border-signal-500 bg-signal-500 text-white' },
  ];

  return (
    <div className="space-y-6">
      {/* ===================================================== */}
      {/* TRIAGE — the risk queue                                */}
      {/* ===================================================== */}
      {activeTab === 'TRIAGE' && (
        <>
          <PageHeader
            icon={ShieldAlert}
            tone="signal"
            title={t('فرز الطلاب حسب الخطر', 'Risk triage')}
            description={t(
              'الطلاب مرتبون من الأعلى خطراً. بعد مراجعة الطالب وحفظ قرارك يخرج من قائمة الانتظار.',
              'Students are ordered from highest risk. Once you review a student and save a decision, they leave the queue.'
            )}
            meta={
              <Chip tone="ink" icon={Users}>
                {t(`${students.length} طالباً مسنداً إليك`, `${students.length} students assigned to you`)}
              </Chip>
            }
            actions={
              <button type="button" onClick={() => handleSelectTab('PLANS')} className="btn btn-secondary">
                <FileCheck2 aria-hidden="true" />
                {t(`خطط تنتظر قرارك (${pendingPlansCount})`, `Plans awaiting you (${pendingPlansCount})`)}
              </button>
            }
          />

          {/* Filter tiles */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat
              label={t('خطر حرج', 'Critical risk')}
              value={criticalCount}
              tone="signal"
              icon={ShieldAlert}
              hint={selectedRisk === 'CRITICAL' ? t('التصفية مفعّلة. اضغط لإلغائها.', 'Filter on. Click to clear.') : t('3 إنذارات أو معدل أقل من 1.50. اضغط للتصفية.', '3 warnings or GPA under 1.50. Click to filter.')}
              onClick={() => {
                setSelectedRisk(selectedRisk === 'CRITICAL' ? 'ALL' : 'CRITICAL');
              }}
              active={selectedRisk === 'CRITICAL'}
            />
            <Stat
              label={t('خطر مرتفع', 'High risk')}
              value={highCount}
              tone="caution"
              icon={AlertTriangle}
              hint={selectedRisk === 'HIGH' ? t('التصفية مفعّلة. اضغط لإلغائها.', 'Filter on. Click to clear.') : t('معدل أقل من 2.00. اضغط للتصفية.', 'GPA under 2.00. Click to filter.')}
              onClick={() => {
                setSelectedRisk(selectedRisk === 'HIGH' ? 'ALL' : 'HIGH');
              }}
              active={selectedRisk === 'HIGH'}
            />
            <Stat
              label={t('تحت معدل 2.00', 'Below 2.00 GPA')}
              value={below2Count}
              tone="route"
              icon={TrendingDown}
              hint={
                below2Only
                  ? t('التصفية مفعّلة. اضغط لإلغائها.', 'Filter on. Click to clear.')
                  : t('يحتاجون خطة تحسين. اضغط لعرضهم فقط.', 'Need a recovery plan. Click to show only them.')
              }
              onClick={() => setBelow2Only(v => !v)}
              active={below2Only}
            />
            <Stat
              label={t('بانتظار قرارك', 'Awaiting your decision')}
              value={pendingPlansCount}
              tone="sign"
              icon={FileCheck2}
              hint={t('اضغط لفتح قائمة اعتماد الخطط.', 'Click to open plan approvals.')}
              onClick={() => handleSelectTab('PLANS')}
            />
          </div>

          <Panel padded={false}>
            <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder={t('ابحث بالاسم أو الرقم الجامعي', 'Search by name or student code')}
                  label={t('بحث عن طالب', 'Search students')}
                  className="min-w-[220px] flex-1 sm:max-w-xs"
                />
                <Segmented
                  ariaLabel={t('حالة المراجعة', 'Review status')}
                  value={reviewStatusFilter}
                  onChange={setReviewStatusFilter}
                  options={[
                    { value: 'PENDING', label: t('بانتظار التوجيه', 'Waiting'), count: pendingPlansCount },
                    { value: 'REVIEWED', label: t('تمت مراجعتهم', 'Reviewed'), count: reviewedPlansCount },
                    { value: 'ALL', label: t('الكل', 'All'), count: students.length },
                  ]}
                />
              </div>
              <select
                value={selectedRisk}
                onChange={e => setSelectedRisk(e.target.value)}
                className="field sm:w-52"
                aria-label={t('تصفية حسب مستوى الخطر', 'Filter by risk level')}
              >
                {riskOptions}
              </select>
            </div>

            <div className="scroll-x border-t border-ink-100">
              <table className="data-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>{t('الطالب', 'Student')}</th>
                    <th>{t('المستوى والمسار', 'Level and track')}</th>
                    <th className="num">{t('المعدل', 'GPA')}</th>
                    <th className="num">{t('الإنذارات', 'Warnings')}</th>
                    <th>{t('الخطر', 'Risk')}</th>
                    <th>{t('أبرز سبب', 'Main reason')}</th>
                    <th>{t('الخطة', 'Plan')}</th>
                    <th className="num">
                      <span className="sr-only">{t('إجراء', 'Action')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {triageFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState
                          icon={CheckCircle2}
                          tone="sign"
                          title={t('لا يوجد طلاب في هذه القائمة', 'Nobody in this list')}
                          description={t(
                            'إما أنك راجعت الجميع أو أن التصفية الحالية لا تطابق أحداً. غيّر التصفية لرؤية بقية الطلاب.',
                            'Either everyone has been reviewed or the current filters match nobody. Change the filters to see others.'
                          )}
                        />
                      </td>
                    </tr>
                  ) : (
                    triageFiltered.map(student => (
                      <tr key={student.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <RiskBar level={student.riskLevel} />
                            <div className="min-w-0">
                              <p className="whitespace-nowrap font-semibold text-ink-900">{nameOf(student)}</p>
                              <p className="text-[12px] text-ink-500">
                                <span className="t-num">{student.studentCode}</span>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          <p className="text-ink-800">{t(`المستوى ${student.level}`, `Level ${student.level}`)}</p>
                          <p className="text-[12px] text-ink-500">{pick(language, trackLabel[student.track], student.track)}</p>
                        </td>
                        <td className="num">
                          <span className={cn('t-num text-[15px] font-bold', student.cumulativeGpa < 2.0 ? 'text-signal-600' : 'text-ink-900')}>
                            {student.cumulativeGpa.toFixed(2)}
                          </span>
                        </td>
                        <td className="num">{warningsCell(student)}</td>
                        <td>{riskChip(student)}</td>
                        <td className="max-w-[280px]">
                          <p className="truncate text-[12.5px] text-ink-600" title={student.riskReasons[0] || ''}>
                            {student.riskReasons[0] || t('أداء مستقر', 'Stable performance')}
                          </p>
                        </td>
                        <td>{planChip(student)}</td>
                        <td className="num">
                          <button type="button" onClick={() => setSelectedStudent(student)} className="btn btn-primary btn-sm">
                            {t('مراجعة', 'Review')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {/* ===================================================== */}
      {/* PLANS — decisions waiting                              */}
      {/* ===================================================== */}
      {activeTab === 'PLANS' && (
        <>
          <PageHeader
            icon={FileCheck2}
            tone="sign"
            title={t('اعتماد الخطط الدراسية', 'Plan approvals')}
            description={t(
              'راجع العبء المسموح لكل طالب حسب معدله ثم اعتمد خطته أو اطلب تعديلها. بعد القرار يخرج الطالب من القائمة.',
              'Check each student’s allowed load for their GPA, then approve the plan or ask for changes. Decided plans leave this list.'
            )}
            meta={
              <Chip tone={plansFiltered.length > 0 ? 'route' : 'sign'}>
                {t(`${plansFiltered.length} خطة بانتظار القرار`, `${plansFiltered.length} plans awaiting a decision`)}
              </Chip>
            }
            actions={
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder={t('ابحث بالاسم أو الرقم الجامعي', 'Search by name or student code')}
                label={t('بحث عن طالب', 'Search students')}
                className="w-full sm:w-72"
              />
            }
          />

          {plansFiltered.length === 0 ? (
            <Panel>
              <EmptyState
                icon={CheckCircle2}
                tone="sign"
                title={search ? t('لا توجد خطة تطابق البحث', 'No plan matches your search') : t('لا توجد خطط تنتظر قرارك', 'No plans are waiting for you')}
                description={
                  search
                    ? t('امسح البحث لرؤية كل الخطط المعلقة.', 'Clear the search to see all pending plans.')
                    : t('راجعت كل الخطط المعلقة. يمكنك متابعة طلابك من صفحة «طلابي».', 'Every pending plan has been decided. Follow your students from “My students”.')
                }
                action={
                  search ? (
                    <button type="button" onClick={() => setSearch('')} className="btn btn-secondary">
                      {t('مسح البحث', 'Clear search')}
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleSelectTab('STUDENTS')} className="btn btn-primary">
                      <Users aria-hidden="true" />
                      {t('اذهب إلى طلابي', 'Go to My students')}
                    </button>
                  )
                }
              />
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {plansFiltered.map(student => {
                const maxCredits = getMaxAllowedCredits(student.cumulativeGpa);
                const pct = Math.min(100, Math.round((student.completedCredits / 134) * 100));
                return (
                  <article
                    key={student.id}
                    className="panel stripe-start flex flex-col gap-4 p-5"
                    style={{ ['--stripe' as any]: toneColor[riskTone[student.riskLevel] || 'ink'] }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[15.5px] font-bold text-ink-950">{nameOf(student)}</h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="chip chip-ink">
                            <span className="t-num">{student.studentCode}</span>
                          </span>
                          <Chip tone="ink">{t(`المستوى ${student.level}`, `Level ${student.level}`)}</Chip>
                          <Chip tone={trackTone[student.track] || 'ink'}>{pick(language, trackLabel[student.track], student.track)}</Chip>
                        </div>
                      </div>
                      {riskChip(student)}
                    </div>

                    <dl className="grid grid-cols-3 gap-3 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3">
                      <div className="kv">
                        <dt>{t('المعدل', 'GPA')}</dt>
                        <dd className={student.cumulativeGpa < 2.0 ? '!text-signal-600' : ''}>
                          <span className="t-num">{student.cumulativeGpa.toFixed(2)}</span>
                        </dd>
                      </div>
                      <div className="kv">
                        <dt>{t('الحد الأقصى للعبء', 'Max load')}</dt>
                        <dd>
                          <span className="t-num">{maxCredits}</span> {t('ساعة', 'cr')}
                        </dd>
                      </div>
                      <div className="kv">
                        <dt>{t('المنجز من 134', 'Done of 134')}</dt>
                        <dd>
                          <span className="t-num">{student.completedCredits}</span>
                        </dd>
                      </div>
                    </dl>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-[12px] text-ink-500">
                        <span>{t('التقدم نحو التخرج', 'Progress to graduation')}</span>
                        <span className="t-num font-semibold text-ink-700">{pct}%</span>
                      </div>
                      <Meter value={pct} label={t('التقدم نحو التخرج', 'Progress to graduation')} />
                    </div>

                    <div className="callout callout-caution !py-2.5 text-[12.5px]">
                      <NotebookPen aria-hidden="true" />
                      <p>
                        <span className="font-bold">{t('التشخيص: ', 'Diagnosis: ')}</span>
                        {student.riskReasons[0] || t('خطة دراسية تنتظر موافقة المرشد.', 'A study plan waiting for advisor approval.')}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center gap-2 border-t border-ink-100 pt-4">
                      <button type="button" onClick={() => handleQuickPlanDecision(student, 'APPROVE')} className="btn btn-primary flex-1">
                        <Check aria-hidden="true" />
                        {t('اعتماد مباشر', 'Approve now')}
                      </button>
                      <button type="button" onClick={() => setSelectedStudent(student)} className="btn btn-secondary flex-1">
                        {t('مراجعة مع ملاحظات', 'Review with notes')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickPlanDecision(student, 'REJECT')}
                        className="btn btn-danger-soft btn-icon"
                        aria-label={t(`رفض خطة ${student.nameAr} وطلب تعديلها`, `Reject ${student.nameEn}'s plan and request changes`)}
                        title={t('رفض وطلب تعديل', 'Reject and request changes')}
                      >
                        <XCircle aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===================================================== */}
      {/* STUDENTS — directory and follow-up                     */}
      {/* ===================================================== */}
      {activeTab === 'STUDENTS' && (
        <>
          <PageHeader
            icon={Users}
            tone="lane"
            title={t('طلابي', 'My students')}
            description={t(
              'متابعة الساعات المنجزة من 134، الإنذارات، وحالة التوجيه لكل طالب، مع السجل الموثق برمز QR.',
              'Follow each student’s progress towards 134 credits, warnings and guidance status, with their verified QR transcript.'
            )}
            meta={
              <Chip tone="lane">
                {t(`يظهر ${directoryFiltered.length} من ${students.length}`, `Showing ${directoryFiltered.length} of ${students.length}`)}
              </Chip>
            }
          />

          <Panel padded={false}>
            <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder={t('ابحث بالاسم أو الرقم الجامعي', 'Search by name or student code')}
                label={t('بحث عن طالب', 'Search students')}
                className="min-w-[220px] flex-1 lg:max-w-sm"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  value={selectedLevel}
                  onChange={e => setSelectedLevel(e.target.value)}
                  className="field"
                  aria-label={t('تصفية حسب المستوى', 'Filter by level')}
                >
                  <option value="ALL">{t('كل المستويات', 'All levels')}</option>
                  <option value="1">{t('المستوى الأول', 'Level 1')}</option>
                  <option value="2">{t('المستوى الثاني', 'Level 2')}</option>
                  <option value="3">{t('المستوى الثالث', 'Level 3')}</option>
                  <option value="4">{t('المستوى الرابع', 'Level 4')}</option>
                </select>
                <select
                  value={selectedTrack}
                  onChange={e => setSelectedTrack(e.target.value)}
                  className="field"
                  aria-label={t('تصفية حسب المسار', 'Filter by track')}
                >
                  <option value="ALL">{t('كل المسارات', 'All tracks')}</option>
                  <option value="General">{pick(language, trackLabel['General'])}</option>
                  <option value="Artificial Intelligence">{pick(language, trackLabel['Artificial Intelligence'])}</option>
                  <option value="Networks & Cyber Security">{pick(language, trackLabel['Networks & Cyber Security'])}</option>
                </select>
                <select
                  value={selectedRisk}
                  onChange={e => setSelectedRisk(e.target.value)}
                  className="field"
                  aria-label={t('تصفية حسب مستوى الخطر', 'Filter by risk level')}
                >
                  {riskOptions}
                </select>
              </div>
            </div>

            <div className="scroll-x border-t border-ink-100">
              <table className="data-table min-w-[940px]">
                <thead>
                  <tr>
                    <th>{t('الطالب', 'Student')}</th>
                    <th>{t('المستوى والمسار', 'Level and track')}</th>
                    <th className="num">{t('المعدل', 'GPA')}</th>
                    <th>{t('الساعات من 134', 'Credits of 134')}</th>
                    <th className="num">{t('الإنذارات', 'Warnings')}</th>
                    <th>{t('التوجيه', 'Guidance')}</th>
                    <th className="num">
                      <span className="sr-only">{t('إجراءات', 'Actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {directoryFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={Users}
                          title={t('لا يوجد طالب يطابق التصفية', 'No student matches these filters')}
                          description={t('غيّر المستوى أو المسار أو مستوى الخطر أو امسح البحث.', 'Change the level, track or risk filter, or clear the search.')}
                          action={
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                setSearch('');
                                setSelectedLevel('ALL');
                                setSelectedTrack('ALL');
                                setSelectedRisk('ALL');
                              }}
                            >
                              {t('مسح كل التصفيات', 'Clear all filters')}
                            </button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    directoryFiltered.map(student => {
                      const pct = Math.min(100, Math.round((student.completedCredits / 134) * 100));
                      const reviewed = isStudentReviewed(student);
                      return (
                        <tr key={student.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <RiskBar level={student.riskLevel} />
                              <div className="min-w-0">
                                <p className="whitespace-nowrap font-semibold text-ink-900">{nameOf(student)}</p>
                                <p className="text-[12px] text-ink-500">
                                  <span className="t-num">{student.studentCode}</span>
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap">
                            <p className="text-ink-800">{t(`المستوى ${student.level}`, `Level ${student.level}`)}</p>
                            <p className="text-[12px] text-ink-500">{pick(language, trackLabel[student.track], student.track)}</p>
                          </td>
                          <td className="num">
                            <span className={cn('t-num text-[15px] font-bold', student.cumulativeGpa < 2.0 ? 'text-signal-600' : 'text-ink-900')}>
                              {student.cumulativeGpa.toFixed(2)}
                            </span>
                          </td>
                          <td className="min-w-[170px]">
                            <div className="mb-1 flex items-center justify-between text-[12px]">
                              <span className="t-num font-semibold text-ink-800">{student.completedCredits} / 134</span>
                              <span className="t-num text-ink-500">{pct}%</span>
                            </div>
                            <Meter value={pct} label={t('الساعات المنجزة', 'Credits completed')} />
                          </td>
                          <td className="num">{warningsCell(student)}</td>
                          <td>
                            {reviewed ? (
                              <Chip tone="sign" icon={CheckCircle2}>
                                {t('تمت المراجعة', 'Reviewed')}
                              </Chip>
                            ) : (
                              <Chip tone="route">{t('بانتظار التوجيه', 'Waiting')}</Chip>
                            )}
                          </td>
                          <td className="num">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setTranscriptStudentId(student.id)}
                                className="btn btn-secondary btn-sm"
                              >
                                <FileText aria-hidden="true" />
                                {t('السجل الموثق', 'Transcript')}
                              </button>
                              <button type="button" onClick={() => setSelectedStudent(student)} className="btn btn-primary btn-sm">
                                {t('توجيه', 'Guide')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {/* Official Verified Transcript Modal for Advisor */}
      {transcriptStudentId && (
        <TranscriptReportModal studentId={transcriptStudentId} onClose={() => setTranscriptStudentId(null)} />
      )}

      {/* Review & Decision Modal */}
      {selectedStudent && (
        <Modal
          onClose={() => setSelectedStudent(null)}
          size="lg"
          icon={UserRound}
          tone="lane"
          title={`${nameOf(selectedStudent)}`}
          subtitle={
            <>
              {t('جلسة إرشاد وقرار الخطة', 'Advising session and plan decision')}
              <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
              <span className="t-num">{selectedStudent.studentCode}</span>
            </>
          }
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setSelectedStudent(null)} className="btn btn-ghost">
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="button" disabled={processing} onClick={handleDecision} className="btn btn-primary">
                {processing ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ القرار وإبلاغ الطالب', 'Save decision and notify student')}
              </button>
            </>
          }
        >
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 sm:grid-cols-4">
              <div className="kv">
                <dt>{t('المعدل التراكمي', 'Cumulative GPA')}</dt>
                <dd className={selectedStudent.cumulativeGpa < 2.0 ? '!text-signal-600' : ''}>
                  <span className="t-num">{selectedStudent.cumulativeGpa.toFixed(2)}</span>
                </dd>
              </div>
              <div className="kv">
                <dt>{t('الساعات المنجزة', 'Credits completed')}</dt>
                <dd>
                  <span className="t-num">{selectedStudent.completedCredits} / 134</span>
                </dd>
              </div>
              <div className="kv">
                <dt>{t('الإنذارات', 'Warnings')}</dt>
                <dd className={selectedStudent.warningCount > 0 ? '!text-caution-700' : ''}>
                  <span className="t-num">{selectedStudent.warningCount}</span>
                </dd>
              </div>
              <div className="kv">
                <dt>{t('الحد الأقصى للعبء', 'Max load')}</dt>
                <dd>
                  <span className="t-num">{getMaxAllowedCredits(selectedStudent.cumulativeGpa)}</span> {t('ساعة', 'cr')}
                </dd>
              </div>
            </dl>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[13.5px] font-bold text-ink-900">{t('ما وجده فحص اللائحة', 'What the bylaw check found')}</h3>
                {riskChip(selectedStudent)}
              </div>
              {selectedStudent.riskReasons.length > 0 ? (
                <ul className="space-y-2 rounded-xl border border-signal-100 bg-signal-50/60 p-3.5">
                  {selectedStudent.riskReasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] leading-6 text-signal-800">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-signal-500" aria-hidden="true" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-500">{t('لا توجد مؤشرات خطر لهذا الطالب.', 'No risk signals for this student.')}</p>
              )}
            </section>

            <section>
              <h3 id="advisor-decision-label" className="mb-2 text-[13.5px] font-bold text-ink-900">
                {t('قرارك', 'Your decision')}
              </h3>
              <div role="radiogroup" aria-labelledby="advisor-decision-label" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {decisionOptions.map(opt => {
                  const active = decisionAction === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDecisionAction(opt.value)}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition',
                        active ? opt.activeCls : 'border-ink-200 bg-paper text-ink-700 hover:bg-ink-50'
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <label htmlFor="advisor-notes" className="field-label">
                {t('ملاحظاتك للطالب', 'Your notes to the student')}
              </label>
              <textarea
                id="advisor-notes"
                rows={4}
                value={decisionNotes}
                onChange={e => setDecisionNotes(e.target.value)}
                placeholder={t(
                  'مثال: تم الاعتماد بشرط التركيز على إعادة هياكل البيانات CS 201 وعدم تجاوز 15 ساعة.',
                  'e.g. Approved on condition that CS 201 is retaken first and the load stays within 15 credits.'
                )}
                className="field"
              />
              <p className="field-hint">{t('تصل الملاحظات للطالب مع إشعار القرار.', 'Your notes reach the student with the decision notice.')}</p>
            </section>
          </div>
        </Modal>
      )}

      {toastMessage && (
        <Toast tone="sign" onClose={() => setToastMessage(null)} closeLabel={t('إغلاق', 'Close')}>
          {toastMessage}
        </Toast>
      )}
    </div>
  );
};
