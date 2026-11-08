import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { AttendanceCheckInResult } from '../../types/index.js';
import { Panel, Loader, CodeBadge, cn, chipClass, attendanceStatusLabel, attendanceStatusTone, pick } from '../ui/index.js';
import { CheckCircle2, AlertCircle, QrCode, ScanLine, Home } from 'lucide-react';
import { checkInError } from './QrScanner.js';
import { roleHome } from '../common/navigation.js';

/**
 * Opened when a student scans a lecture's QR code with the phone camera
 * (…/a/<token>, or …/attend/<session>/<token> from older codes). Signs them in
 * first if needed, then checks them in straight away and shows the result.
 */
export const AttendCheckInView: React.FC = () => {
  const { sessionId, token = '' } = useParams();
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const started = useRef(false);
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);
  const [error, setError] = useState<{ text: string; expired: boolean } | null>(null);

  const isStudent = currentUser?.role === 'STUDENT';

  useEffect(() => {
    if (!isStudent || started.current) return;
    started.current = true;
    api
      .checkInAttendance(sessionId ? { sessionId, token } : { token: token.toUpperCase() })
      .then(setResult)
      .catch(err => {
        setError({
          text: checkInError(err, language, 'تعذّر تسجيل الحضور.', 'Could not check you in.'),
          expired: err?.response?.status === 410,
        });
      });
  }, [isStudent, sessionId, token, language]);

  if (!isStudent) {
    return (
      <Panel className="mx-auto max-w-lg text-center">
        <div className="flex flex-col items-center gap-3 py-6">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-lane-50 text-lane-600">
            <QrCode className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="text-[18px] font-bold text-ink-950">{t('هذا الرابط لتسجيل حضور الطلاب', 'This link is for students to check in')}</h1>
          <p className="text-[13px] leading-6 text-ink-600">
            {t('سجّل الدخول بحساب طالب مسجل في المقرر ثم امسح الرمز مرة أخرى.', 'Sign in with the account of a student in this course, then scan the code again.')}
          </p>
          <button type="button" onClick={() => navigate(roleHome(currentUser?.role))} className="btn btn-secondary">
            <Home aria-hidden="true" />
            {t('الصفحة الرئيسية', 'Home')}
          </button>
        </div>
      </Panel>
    );
  }

  if (!result && !error) return <Loader label={t('جارٍ تسجيل حضورك…', 'Checking you in…')} />;

  const course = result?.course;
  return (
    <Panel className="mx-auto max-w-lg">
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <span className={cn('grid h-16 w-16 place-items-center rounded-full', result ? 'bg-sign-50 text-sign-700' : 'bg-signal-50 text-signal-600')}>
          {result ? <CheckCircle2 className="h-9 w-9" aria-hidden="true" /> : <AlertCircle className="h-9 w-9" aria-hidden="true" />}
        </span>
        <h1 className="text-[19px] font-bold text-ink-950">{result ? (language === 'ar' ? result.messageAr : result.messageEn) : error?.text}</h1>
        {result?.status && <span className={chipClass[attendanceStatusTone[result.status] || 'ink']}>{pick(language, attendanceStatusLabel[result.status], result.status)}</span>}

        {course && (
          <div className="mt-2 w-full rounded-xl border border-ink-100 bg-ink-50 p-4 text-start">
            <div className="flex items-center gap-2">
              <CodeBadge code={course.courseCode} variant="solid" />
              <span className="font-semibold text-ink-900">{language === 'ar' ? course.courseNameAr : course.courseNameEn}</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="kv items-center">
                <dt>{t('حضرت', 'Attended')}</dt>
                <dd className="t-num text-sign-700">{course.attended}</dd>
              </div>
              <div className="kv items-center">
                <dt>{t('غبت', 'Missed')}</dt>
                <dd className={cn('t-num', course.absent > 0 ? 'text-signal-600' : '')}>{course.absent}</dd>
              </div>
              <div className="kv items-center">
                <dt>{t('متبقي لك', 'Left')}</dt>
                <dd className="t-num">{Math.max(0, course.remainingAbsences)}</dd>
              </div>
            </dl>
          </div>
        )}

        {error?.expired && (
          <p className="text-[13px] leading-6 text-ink-600">
            {t('الرمز يتجدد كل 30 ثانية. افتح الماسح وامسح الرمز المعروض الآن على الشاشة.', 'The code changes every 30 seconds. Open the scanner and scan the code on the screen now.')}
          </p>
        )}

        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {error && (
            <button type="button" onClick={() => navigate('/student/attendance?scan=1')} className="btn btn-primary">
              <ScanLine aria-hidden="true" />
              {t('افتح الماسح', 'Open the scanner')}
            </button>
          )}
          <button type="button" onClick={() => navigate('/student/attendance')} className={cn('btn', error ? 'btn-secondary' : 'btn-primary')}>
            {t('صفحة الحضور', 'My attendance')}
          </button>
        </div>
      </div>
    </Panel>
  );
};
