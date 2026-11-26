import React from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import type { Course, CourseOffering, RegistrationRequest, Student } from '../../types/index.js';
import { PageHeader, Panel, PanelHeader, CodeBadge, Chip, EmptyState, personName, registeredByLabel } from '../ui/index.js';
import { CalendarCheck, Sparkles, CalendarDays, Clock, MapPin, UserRound, AlertTriangle, Info } from 'lucide-react';

const DAYS_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const DAYS_EN: Record<string, string> = { السبت: 'Saturday', الأحد: 'Sunday', الإثنين: 'Monday', الثلاثاء: 'Tuesday', الأربعاء: 'Wednesday', الخميس: 'Thursday' };

/**
 * A first-term student's registration page: the bylaw's first-term courses are
 * registered for them automatically, so this shows what was registered, when
 * and where — there is nothing to choose or send.
 */
export const FirstTermRegistration: React.FC<{
  student: Student;
  offerings: CourseOffering[];
  courses: Course[];
  request: RegistrationRequest | null;
}> = ({ student, offerings, courses, request }) => {
  const { t, language } = useLanguage();
  const current = student.records.filter(r => r.status === 'IN_PROGRESS' || r.status === 'ENROLLED');
  const rows = current.map(r => ({ r, o: offerings.find(o => o.id === r.offeringId), c: courses.find(c => c.code === r.courseCode) }));
  const credits = current.reduce((sum, r) => sum + (r.credits || 3), 0);
  const advisor = personName(student.advisorName, language);
  const when = request?.decidedAt
    ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'long', timeStyle: 'short' }).format(new Date(request.decidedAt))
    : '';
  const byDay = DAYS_AR.map(day => ({
    day,
    items: rows.filter(x => x.o?.days?.includes(day)).sort((a, b) => String(a.o?.startTime).localeCompare(String(b.o?.startTime))),
  })).filter(d => d.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarCheck}
        title={t('مقررات فصلك الأول', 'Your first-term courses')}
        description={t(
          'حسب اللائحة، مقررات الفصل الأول بالمستوى الأول تُسجَّل للطالب المستجد تلقائياً؛ لا تحتاج إلى اختيارها أو إرسالها لمرشدك. هنا مقرراتك ومواعيدها.',
          'Per the bylaw, the first-term courses of level 1 are registered for new students automatically; you do not choose them or send them to your advisor. Here are your courses and their times.'
        )}
        meta={
          <>
            <Chip tone="lane" icon={Sparkles}>
              {t('طالب مستجد: تسجيل تلقائي', 'New student: automatic registration')}
            </Chip>
            <Chip tone="sign">
              {t(`${current.length} مقررات · ${credits} ساعة`, `${current.length} courses · ${credits} credit hours`)}
            </Chip>
          </>
        }
      />

      {current.length > 0 ? (
        <div className="callout callout-sign" role="status">
          <Sparkles aria-hidden="true" />
          <div>
            <p className="font-bold">{t('سُجّلت مقرراتك تلقائياً', 'Your courses were registered automatically')}</p>
            <p>
              {when ? t(`بتاريخ ${when}. `, `On ${when}. `) : ''}
              {t(`لأي تعديل (مثل تغيير شعبة) تواصل مع مرشدك ${advisor}.`, `For any change (such as another section), contact your advisor, ${advisor}.`)}
            </p>
          </div>
        </div>
      ) : (
        <div className="callout callout-caution" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <p className="font-bold">{t('لم تُسجَّل مقرراتك بعد', 'Your courses are not registered yet')}</p>
            <p>{t(`لا توجد شعب متاحة لبعض مقررات الفصل الأول الآن؛ مرشدك ${advisor} سيكمل تسجيلك.`, `Some first-term courses have no open section right now; your advisor, ${advisor}, will complete your registration.`)}</p>
          </div>
        </div>
      )}

      <Panel padded={false}>
        <div className="px-5 pt-5 sm:px-6">
          <PanelHeader icon={CalendarCheck} title={t('المقررات المسجلة', 'Registered courses')} description={t('الشعبة والأستاذ والموعد والقاعة لكل مقرر.', 'Section, instructor, time and room for each course.')} />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Info} title={t('لا توجد مقررات مسجلة', 'No registered courses')} />
        ) : (
          <div className="scroll-x border-t border-ink-100">
            <table className="data-table min-w-[860px]">
              <thead>
                <tr>
                  <th>{t('المقرر', 'Course')}</th>
                  <th className="num">{t('الساعات', 'Credits')}</th>
                  <th>{t('الشعبة والأستاذ', 'Section and instructor')}</th>
                  <th>{t('الموعد', 'Time')}</th>
                  <th>{t('القاعة', 'Room')}</th>
                  <th>{t('سُجّل بواسطة', 'Registered by')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, o, c }) => (
                  <tr key={`${r.courseCode}_${r.attempt}`}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <CodeBadge code={r.courseCode} variant="solid" />
                        <span className="font-semibold text-ink-900">{language === 'ar' ? r.courseNameAr : r.courseNameEn}</span>
                      </div>
                    </td>
                    <td className="num t-num">{c?.credits ?? r.credits}</td>
                    <td>
                      <p className="text-ink-800">{o ? personName(o.sectionCode, language) || o.sectionCode : '—'}</p>
                      <p className="text-[12px] text-ink-500">{o ? personName(o.instructorName, language) : ''}</p>
                    </td>
                    <td className="text-[12.5px] text-ink-700">{o ? (language === 'ar' ? o.lectureDayTimeAr : o.lectureDayTimeEn) : '—'}</td>
                    <td className="text-[12.5px] text-ink-600">{o?.hall || '—'}</td>
                    <td className="text-[12px]">
                      <Chip tone="lane">{registeredByLabel(r.registeredByName, language)}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {byDay.length > 0 && (
        <Panel>
          <PanelHeader icon={CalendarDays} title={t('أسبوعك', 'Your week')} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {byDay.map(d => (
              <div key={d.day} className="rounded-xl border border-ink-100 p-3">
                <p className="mb-2 text-[13px] font-bold text-ink-900">{language === 'ar' ? d.day : DAYS_EN[d.day]}</p>
                <ul className="space-y-2">
                  {d.items.map(({ r, o }) => (
                    <li key={r.courseCode} className="flex items-start gap-2 text-[12.5px]">
                      <CodeBadge code={r.courseCode} variant="soft" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-semibold text-ink-800">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          <span className="t-num">
                            {o?.startTime} – {o?.endTime}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-ink-500">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {o?.hall}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="flex items-center gap-2 text-[12.5px] text-ink-500">
        <UserRound className="h-4 w-4" aria-hidden="true" />
        {t(`مرشدك الأكاديمي: ${advisor}`, `Your academic advisor: ${advisor}`)}
      </p>
    </div>
  );
};
