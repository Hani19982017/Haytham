import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Course, CourseOffering } from '../../types/index.js';
import {
  PageHeader,
  Panel,
  Segmented,
  Toast,
  Loader,
  EmptyState,
  Chip,
  CodeBadge,
  Meter,
  cn,
  chipClass,
  gradeTone,
} from '../ui/index.js';
import { BookOpen, Save, Users, UserCheck, CalendarClock, MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface InstructorDashboardProps {
  currentTab?: string;
  onNavigateTab?: (tab: string) => void;
}

type Notice = { tone: 'sign' | 'signal'; text: string } | null;

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
  const [listLoading, setListLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

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
    // Ignore a slow response for a course the instructor already switched away from.
    let ignore = false;
    async function loadStudents() {
      if (!selectedCourseCode) return;
      try {
        setListLoading(true);
        const list = await api.getCourseEnrolledStudents(selectedCourseCode);
        if (!ignore) setEnrolledStudents(list);
      } catch (err) {
        console.error('Failed to load enrolled students:', err);
      } finally {
        if (!ignore) setListLoading(false);
      }
    }
    loadStudents();
    return () => {
      ignore = true;
    };
  }, [selectedCourseCode]);

  // Confirmations fade out on their own; errors stay until dismissed.
  useEffect(() => {
    if (!notice || notice.tone !== 'sign') return;
    const timer = setTimeout(() => setNotice(current => (current === notice ? null : current)), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleUpdateGrade = async (studentId: string, cw: number, fin: number) => {
    try {
      setSavingId(studentId);
      const res = await api.saveGrades(selectedCourseCode, studentId, cw, fin);
      if (res.success) {
        // The API returns gradeAssigned; older builds returned record.grade.
        const finalGrade: string = res.gradeAssigned?.finalGrade ?? res.record?.grade ?? '—';
        const rawGrade: string | undefined = res.gradeAssigned?.rawGrade;
        const capped: boolean = !!res.gradeAssigned?.capped;
        setNotice({
          tone: 'sign',
          text: t(
            `تم حفظ الدرجة. التقدير: ${finalGrade}${capped && rawGrade ? ` (خُفّض من ${rawGrade} بسبب سقف الإعادة)` : ''}. المعدل التراكمي للطالب الآن ${res.newCumulativeGpa}.`,
            `Marks saved. Grade: ${finalGrade}${capped && rawGrade ? ` (capped from ${rawGrade} for a retake)` : ''}. The student's cumulative GPA is now ${res.newCumulativeGpa}.`
          ),
        });
        // Refresh list
        const updatedList = await api.getCourseEnrolledStudents(selectedCourseCode);
        setEnrolledStudents(updatedList);
      }
    } catch (err) {
      console.error('Failed to save grades:', err);
      setNotice({
        tone: 'signal',
        text: t('لم تُحفظ الدرجة. تأكد من اتصال الخادم ثم أعد المحاولة.', 'The marks were not saved. Check the server connection and try again.'),
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdateAttendance = async (studentId: string, att: number) => {
    try {
      setSavingId(studentId);
      const res = await api.saveAttendance(selectedCourseCode, studentId, att);
      if (res.success) {
        const below = res.attendancePercentage < 75;
        setNotice({
          tone: 'sign',
          text: t(
            `تم تحديث نسبة الحضور إلى ${res.attendancePercentage}%.${below ? ' وصل الطالب إنذار غياب.' : ''}`,
            `Attendance updated to ${res.attendancePercentage}%.${below ? ' The student received an absence warning.' : ''}`
          ),
        });
        const updatedList = await api.getCourseEnrolledStudents(selectedCourseCode);
        setEnrolledStudents(updatedList);
      }
    } catch (err) {
      console.error('Attendance update error:', err);
      setNotice({
        tone: 'signal',
        text: t('لم تُحفظ نسبة الحضور. تأكد من اتصال الخادم ثم أعد المحاولة.', 'Attendance was not saved. Check the server connection and try again.'),
      });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <Loader label={t('جارٍ تحميل مقرراتك…', 'Loading your courses…')} />;
  }

  const activeCourse = courses.find(c => c.code === selectedCourseCode);
  const courseSections = offerings.filter(o => o.courseCode === selectedCourseCode);
  const warningAttendanceCount = enrolledStudents.filter(item => (item.record?.attendancePercentage ?? 100) < 75).length;
  const gradedCount = enrolledStudents.filter(item => !!item.record?.grade).length;
  const failingCount = enrolledStudents.filter(item => item.record?.grade === 'F').length;
  const courseName = activeCourse ? (language === 'ar' ? activeCourse.nameAr : activeCourse.nameEn) : '';

  const coursePicker =
    courses.length === 0 ? null : courses.length <= 4 ? (
      <Segmented
        ariaLabel={t('اختر المقرر', 'Choose a course')}
        value={selectedCourseCode}
        onChange={setSelectedCourseCode}
        options={courses.map(c => ({ value: c.code, label: <span dir="ltr">{c.code}</span> }))}
      />
    ) : (
      <div className="flex items-center gap-2">
        <label htmlFor="instructor-course" className="text-[12.5px] font-semibold text-ink-600">
          {t('المقرر', 'Course')}
        </label>
        <select
          id="instructor-course"
          value={selectedCourseCode}
          onChange={e => setSelectedCourseCode(e.target.value)}
          className="field min-w-[240px]"
        >
          {courses.map(c => (
            <option key={c.code} value={c.code}>
              {c.code} — {language === 'ar' ? c.nameAr : c.nameEn}
            </option>
          ))}
        </select>
      </div>
    );

  const isGrades = activeTab === 'GRADES';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={isGrades ? BookOpen : UserCheck}
        tone={isGrades ? 'plum' : 'caution'}
        title={isGrades ? t('رصد الدرجات', 'Grades') : t('الحضور', 'Attendance')}
        description={
          isGrades
            ? t(
                'اكتب أعمال السنة (من 50) والامتحان النهائي (من 50). يُحسب التقدير تلقائياً مع سقف الإعادة، ويتحدث معدل الطالب فور الحفظ.',
                'Enter coursework (out of 50) and the final exam (out of 50). The grade is calculated with the retake cap, and the student’s GPA updates as soon as you save.'
              )
            : t(
                'عدّل نسبة حضور كل طالب؛ تُحفظ عند الخروج من الخانة أو الضغط على Enter. تحت 75% يصل الطالب إنذار غياب تلقائياً.',
                'Edit each student’s attendance; it saves when you leave the box or press Enter. Below 75% the student gets an automatic absence warning.'
              )
        }
        meta={
          isGrades ? (
            warningAttendanceCount > 0 ? (
              <button type="button" onClick={() => handleSelectTab('ATTENDANCE')} className={cn(chipClass.signal, 'hover:bg-signal-100')}>
                <AlertTriangle aria-hidden="true" />
                {t(`${warningAttendanceCount} طالب تحت 75% حضور`, `${warningAttendanceCount} under 75% attendance`)}
              </button>
            ) : undefined
          ) : (
            <button type="button" onClick={() => handleSelectTab('GRADES')} className={cn(chipClass.plum, 'hover:bg-plum-100')}>
              <BookOpen aria-hidden="true" />
              {t(`رُصدت درجات ${gradedCount} من ${enrolledStudents.length}`, `${gradedCount} of ${enrolledStudents.length} graded`)}
            </button>
          )
        }
        actions={coursePicker}
      />

      {courses.length === 0 ? (
        <Panel>
          <EmptyState
            icon={BookOpen}
            title={t('لا توجد مقررات مسندة إليك', 'No courses are assigned to you')}
            description={t('عندما تُسند إليك شعبة ستظهر هنا مع طلابها.', 'When a section is assigned to you it will show here with its students.')}
          />
        </Panel>
      ) : (
        <>
          {/* Course board */}
          <Panel padded={false}>
            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <CodeBadge code={selectedCourseCode} variant="solid" />
                  <h2 className="text-[17px] font-bold text-ink-950">{courseName || selectedCourseCode}</h2>
                  {activeCourse && (
                    <Chip tone="ink">
                      {t(`${activeCourse.credits} ساعات`, `${activeCourse.credits} credits`)}
                    </Chip>
                  )}
                  {activeCourse && <Chip tone="ink">{t(`المستوى ${activeCourse.level}`, `Level ${activeCourse.level}`)}</Chip>}
                </div>
                <dl className="grid grid-cols-3 gap-3">
                  <div className="kv">
                    <dt>{t('الطلاب المسجلون', 'Enrolled')}</dt>
                    <dd>
                      <span className="t-num text-[22px] font-extrabold">{enrolledStudents.length}</span>
                    </dd>
                  </div>
                  <div className="kv">
                    <dt>{t('رُصدت درجاتهم', 'Graded')}</dt>
                    <dd>
                      <span className="t-num text-[22px] font-extrabold">{gradedCount}</span>
                      {failingCount > 0 && (
                        <span className="ms-2 text-[12px] font-semibold text-signal-600">
                          {t(`${failingCount} راسب`, `${failingCount} failing`)}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="kv">
                    <dt>{t('تحت 75% حضور', 'Under 75% attendance')}</dt>
                    <dd className={warningAttendanceCount > 0 ? '!text-signal-600' : ''}>
                      <span className="t-num text-[22px] font-extrabold">{warningAttendanceCount}</span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-ink-100 bg-ink-50/60 p-5 sm:p-6 lg:border-s lg:border-t-0">
                <h3 className="mb-2.5 text-[13px] font-bold text-ink-800">{t('شعبك في هذا المقرر', 'Your sections of this course')}</h3>
                {courseSections.length === 0 ? (
                  <p className="text-[12.5px] text-ink-500">{t('لا توجد شعب مسجلة لهذا المقرر.', 'No sections are listed for this course.')}</p>
                ) : (
                  <ul className="space-y-2">
                    {courseSections.map(sec => (
                      <li key={sec.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-700">
                        <span className="chip chip-plum">{sec.sectionCode || t('شعبة', 'Section')}</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
                          {language === 'ar' ? sec.lectureDayTimeAr : sec.lectureDayTimeEn}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
                          {sec.hall}
                        </span>
                        <span className="inline-flex items-center gap-1 text-ink-500">
                          <Users className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
                          <span className="t-num">
                            {sec.enrolledCount}/{sec.capacity}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Panel>

          {/* Gradebook / attendance sheet */}
          <Panel padded={false}>
            <div className="flex flex-col gap-1 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="text-[16px] font-bold text-ink-950">
                  {isGrades ? t('كشف الدرجات', 'Gradebook') : t('كشف الحضور', 'Attendance sheet')}
                </h2>
                <p className="text-[12.5px] text-ink-500">
                  {isGrades
                    ? t('المجموع يتحدث وأنت تكتب؛ التقدير يظهر بعد الحفظ.', 'The total updates as you type; the grade appears after you save.')
                    : t('الخط الداكن على الشريط يمثل حد 75%.', 'The dark tick on each bar marks the 75% limit.')}
                </p>
              </div>
              {listLoading && <span className="text-[12px] text-ink-500">{t('جارٍ التحديث…', 'Updating…')}</span>}
            </div>

            {listLoading && enrolledStudents.length === 0 ? (
              <Loader compact label={t('جارٍ تحميل الطلاب…', 'Loading students…')} />
            ) : enrolledStudents.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t('لا يوجد طلاب مسجلون في هذا المقرر', 'No students are enrolled in this course')}
                description={t('اختر مقرراً آخر من الأعلى.', 'Pick another course above.')}
              />
            ) : (
              <div className="scroll-x border-t border-ink-100">
                {isGrades ? (
                  <table className="data-table min-w-[860px]">
                    <thead>
                      <tr>
                        <th>{t('الطالب', 'Student')}</th>
                        <th className="num">{t('المعدل', 'GPA')}</th>
                        <th className="num">{t('أعمال السنة (50)', 'Coursework (50)')}</th>
                        <th className="num">{t('النهائي (50)', 'Final (50)')}</th>
                        <th className="num">{t('المجموع', 'Total')}</th>
                        <th className="num">{t('التقدير', 'Grade')}</th>
                        <th className="num">
                          <span className="sr-only">{t('حفظ', 'Save')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolledStudents.map(item => (
                        <GradebookRow
                          key={`${selectedCourseCode}_${item.studentId}`}
                          item={item}
                          rec={item.record}
                          onSaveGrade={handleUpdateGrade}
                          saving={savingId === item.studentId}
                          t={t}
                          language={language}
                        />
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="data-table min-w-[760px]">
                    <thead>
                      <tr>
                        <th>{t('الطالب', 'Student')}</th>
                        <th className="num">{t('المعدل', 'GPA')}</th>
                        <th className="num">{t('نسبة الحضور', 'Attendance')}</th>
                        <th>{t('المؤشر', 'Gauge')}</th>
                        <th>{t('الحالة', 'Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolledStudents.map(item => (
                        <AttendanceRow
                          key={`${selectedCourseCode}_${item.studentId}`}
                          item={item}
                          rec={item.record}
                          onSaveAttendance={handleUpdateAttendance}
                          saving={savingId === item.studentId}
                          t={t}
                          language={language}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Panel>
        </>
      )}

      {notice && (
        <Toast tone={notice.tone} onClose={() => setNotice(null)} closeLabel={t('إغلاق', 'Close')}>
          {notice.text}
        </Toast>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------------------
 * Row components keep their own form state for each student.
 * ------------------------------------------------------------------------- */

const StudentCell: React.FC<{ item: any; rec: any; t: (ar: string, en: string) => string; language: string }> = ({ item, rec, t, language }) => (
  <td>
    <p className="whitespace-nowrap font-semibold text-ink-900">{language === 'ar' ? item.nameAr : item.nameEn}</p>
    <p className="flex items-center gap-2 text-[12px] text-ink-500">
      <span className="t-num">{item.studentCode}</span>
      {rec?.attempt > 1 && <span className="chip chip-caution !h-5">{t(`محاولة ${rec.attempt}`, `Attempt ${rec.attempt}`)}</span>}
    </p>
  </td>
);

const GpaCell: React.FC<{ gpa: number }> = ({ gpa }) => (
  <td className="num">
    <span className={cn('t-num font-bold', gpa < 2.0 ? 'text-signal-600' : 'text-ink-800')}>{gpa.toFixed(2)}</span>
  </td>
);

const GradebookRow: React.FC<{
  item: any;
  rec: any;
  onSaveGrade: (studentId: string, cw: number, fin: number) => void;
  saving: boolean;
  t: (ar: string, en: string) => string;
  language: string;
}> = ({ item, rec, onSaveGrade, saving, t, language }) => {
  const [cw, setCw] = useState<number>(rec.courseworkMark ?? 0);
  const [fin, setFin] = useState<number>(rec.finalMark ?? 0);

  const total = cw + fin;
  const cwInvalid = cw < 0 || cw > 50;
  const finInvalid = fin < 0 || fin > 50;
  const name = language === 'ar' ? item.nameAr : item.nameEn;

  return (
    <tr>
      <StudentCell item={item} rec={rec} t={t} language={language} />
      <GpaCell gpa={item.cumulativeGpa} />

      <td className="num">
        <input
          type="number"
          min="0"
          max="50"
          value={cw}
          onChange={e => setCw(Number(e.target.value))}
          aria-label={t(`أعمال السنة للطالب ${name}`, `Coursework for ${name}`)}
          aria-invalid={cwInvalid}
          className="field field-sm w-20 text-center font-bold"
        />
      </td>

      <td className="num">
        <input
          type="number"
          min="0"
          max="50"
          value={fin}
          onChange={e => setFin(Number(e.target.value))}
          aria-label={t(`درجة النهائي للطالب ${name}`, `Final exam for ${name}`)}
          aria-invalid={finInvalid}
          className="field field-sm w-20 text-center font-bold"
        />
      </td>

      <td className="num">
        <span className="t-num text-[14px] font-extrabold text-ink-900">{total}</span>
        <span className="text-[12px] text-ink-400"> / 100</span>
      </td>

      <td className="num">
        {rec.grade ? (
          <span className={cn(chipClass[gradeTone(rec.grade)], 't-num !px-2.5 font-extrabold')}>
            {rec.grade}
            {rec.gradePoints !== undefined && rec.gradePoints !== null && (
              <span className="font-semibold opacity-75">({Number(rec.gradePoints).toFixed(1)})</span>
            )}
          </span>
        ) : (
          <span className="text-[12px] text-ink-400">{t('لم يُرصد', 'Not entered')}</span>
        )}
      </td>

      <td className="num">
        <button type="button" disabled={saving} onClick={() => onSaveGrade(item.studentId, cw, fin)} className="btn btn-primary btn-sm">
          <Save aria-hidden="true" />
          {saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </button>
      </td>
    </tr>
  );
};

const AttendanceRow: React.FC<{
  item: any;
  rec: any;
  onSaveAttendance: (studentId: string, att: number) => void;
  saving: boolean;
  t: (ar: string, en: string) => string;
  language: string;
}> = ({ item, rec, onSaveAttendance, saving, t, language }) => {
  const saved = rec.attendancePercentage ?? 100;
  const [att, setAtt] = useState<number>(saved);
  const below = att < 75;
  const name = language === 'ar' ? item.nameAr : item.nameEn;

  // Save only when the value actually changed — each save may notify the student.
  const commit = () => {
    if (att !== saved) onSaveAttendance(item.studentId, att);
  };

  return (
    <tr>
      <StudentCell item={item} rec={rec} t={t} language={language} />
      <GpaCell gpa={item.cumulativeGpa} />

      <td className="num">
        <div className="inline-flex items-center gap-1.5">
          <input
            type="number"
            min="0"
            max="100"
            value={att}
            onChange={e => setAtt(Number(e.target.value))}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            disabled={saving}
            aria-label={t(`نسبة حضور الطالب ${name}`, `Attendance for ${name}`)}
            aria-invalid={att < 0 || att > 100}
            className={cn('field field-sm w-20 text-center font-bold', below && '!border-signal-300 !text-signal-700')}
          />
          <span className="text-[12px] text-ink-400">%</span>
        </div>
      </td>

      <td className="min-w-[200px]">
        <div className="relative">
          <Meter value={att} tone={below ? 'signal' : 'sign'} label={t('نسبة الحضور', 'Attendance rate')} />
          <span className="absolute -top-1 h-[14px] w-[2px] rounded bg-ink-700" style={{ insetInlineStart: '75%' }} aria-hidden="true" />
        </div>
      </td>

      <td>
        {saving ? (
          <span className="text-[12px] text-ink-500">{t('جارٍ الحفظ…', 'Saving…')}</span>
        ) : below ? (
          <Chip tone="signal" icon={AlertTriangle}>
            {t('خطر حرمان', 'Exclusion risk')}
          </Chip>
        ) : (
          <Chip tone="sign" icon={CheckCircle2}>
            {t('منتظم', 'On track')}
          </Chip>
        )}
      </td>
    </tr>
  );
};
