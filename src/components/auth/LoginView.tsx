import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { BrandMark } from '../ui/BrandMark.js';
import { cn, toneColor, toneText, type Tone } from '../ui/tones.js';
import { Lock, Mail, AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';

const loginSchema = z.object({
  identifier: z.string().min(3, { message: 'identifier' }),
  password: z.string().min(6, { message: 'password' }),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginViewProps {
  onSuccess?: () => void;
}

interface DemoAccount {
  email: string;
  roleAr: string;
  roleEn: string;
  nameAr: string;
  nameEn: string;
  noteAr: string;
  noteEn: string;
  tone: Tone;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'student@example.com',
    roleAr: 'طالب',
    roleEn: 'Student',
    nameAr: 'عمر فاروق',
    nameEn: 'Omar Farouk',
    noteAr: 'تحت الإنذار، معدل 1.78',
    noteEn: 'On warning, GPA 1.78',
    tone: 'sign',
  },
  {
    email: 'student2@example.com',
    roleAr: 'طالبة',
    roleEn: 'Student',
    nameAr: 'سارة الكردي',
    nameEn: 'Sara Ahmed',
    noteAr: 'متفوقة، معدل 3.84',
    noteEn: 'Honours, GPA 3.84',
    tone: 'sign',
  },
  {
    email: 'advisor@example.com',
    roleAr: 'مرشد أكاديمي',
    roleEn: 'Advisor',
    nameAr: 'د. محمود صقر',
    nameEn: 'Dr. Mahmoud Saqr',
    noteAr: 'يعتمد الخطط ويتابع المتعثرين',
    noteEn: 'Approves plans, follows at-risk students',
    tone: 'lane',
  },
  {
    email: 'instructor@example.com',
    roleAr: 'عضو هيئة التدريس',
    roleEn: 'Instructor',
    nameAr: 'أ.د. عادل منصور',
    nameEn: 'Prof. Adel Mansour',
    noteAr: 'يرصد الدرجات والحضور',
    noteEn: 'Records grades and attendance',
    tone: 'plum',
  },
  {
    email: 'head@example.com',
    roleAr: 'رئيس القسم',
    roleEn: 'Department head',
    nameAr: 'أ.د. طارق السعدني',
    nameEn: 'Prof. Tariq El-Saadani',
    noteAr: 'مؤشرات القسم وضغط المقاعد',
    noteEn: 'Department indicators and seat demand',
    tone: 'caution',
  },
  {
    email: 'admin@example.com',
    roleAr: 'مدير النظام',
    roleEn: 'Administrator',
    nameAr: 'عميد الكلية',
    nameEn: 'Faculty dean',
    noteAr: 'المقررات واللائحة والمستخدمون',
    noteEn: 'Courses, bylaws and users',
    tone: 'signal',
  },
  {
    email: 'process@example.com',
    roleAr: 'شؤون الطلاب',
    roleEn: 'Student affairs',
    nameAr: 'أ. سامي الديب',
    nameEn: 'Sami El-Deeb',
    noteAr: 'اطلاع على السجلات فقط',
    noteEn: 'Read-only records',
    tone: 'ink',
  },
];

/** The degree drawn as a transit map: levels → three tracks → graduation. */
const DegreeRouteMap: React.FC<{ dir: 'rtl' | 'ltr'; t: (ar: string, en: string) => string }> = ({ dir, t }) => {
  const W = 560;
  const X = (x: number) => (dir === 'rtl' ? W - x : x);
  const path = (pts: Array<[number, number]>) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${X(x)} ${y}`).join(' ');
  // Absolute length lets the draw-in animation use plain dash offsets (works in every browser).
  const lengthOf = (pts: Array<[number, number]>) =>
    Math.ceil(pts.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - pts[i][0], y - pts[i][1]), 0)) + 2;
  const drawStyle = (pts: Array<[number, number]>, delayMs = 0): React.CSSProperties =>
    ({ ['--len' as any]: lengthOf(pts), animationDelay: `${delayMs}ms` }) as React.CSSProperties;
  const AI: Array<[number, number]> = [[200, 160], [240, 100], [400, 100], [430, 160]];
  const NET: Array<[number, number]> = [[200, 160], [240, 220], [400, 220], [430, 160]];
  const CORE: Array<[number, number]> = [[40, 160], [528, 160]];

  const station = (x: number, y: number, r = 8) => (
    <circle cx={X(x)} cy={y} r={r} fill="#ffffff" stroke="#0b6439" strokeWidth={4} />
  );

  return (
    <svg viewBox={`0 0 ${W} 320`} className="h-auto w-full" role="img" aria-label={t('خريطة مسار الدرجة العلمية', 'Degree route map')}>
      {/* AI track */}
      <path
        d={path(AI)}
        className="login-line"
        style={drawStyle(AI, 450)}
        fill="none"
        stroke="#af84d1"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Networks & cyber security track */}
      <path
        d={path(NET)}
        className="login-line"
        style={drawStyle(NET, 600)}
        fill="none"
        stroke="#6fa6dd"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Core line */}
      <path
        d={path(CORE)}
        className="login-line"
        style={drawStyle(CORE)}
        fill="none"
        stroke="#ffc72c"
        strokeWidth={10}
        strokeLinecap="round"
      />

      {station(40, 160)}
      {station(130, 160)}
      {station(320, 100)}
      {station(320, 160)}
      {station(320, 220)}
      <circle cx={X(462)} cy={160} r={13} fill="#ffffff" stroke="#0b6439" strokeWidth={5} />
      <circle cx={X(528)} cy={160} r={15} fill="#ffc72c" stroke="#ffffff" strokeWidth={5} />

      <g fill="#ffffff" fontFamily="'Alexandria Variable', Alexandria, sans-serif" fontSize={13} fontWeight={600}>
        <text x={X(40)} y={198} textAnchor="middle">{t('المستوى 1', 'Level 1')}</text>
        <text x={X(130)} y={198} textAnchor="middle">{t('المستوى 2', 'Level 2')}</text>
        <text x={X(320)} y={82} textAnchor="middle" fill="#e6d7f1">{t('الذكاء الاصطناعي', 'Artificial Intelligence')}</text>
        <text x={X(320)} y={146} textAnchor="middle">{t('المسار العام', 'General')}</text>
        <text x={X(320)} y={252} textAnchor="middle" fill="#d0e2f5">{t('الشبكات والأمن', 'Networks & Security')}</text>
        <text x={X(462)} y={198} textAnchor="middle">{t('مشروع التخرج', 'Graduation project')}</text>
        <text x={X(528)} y={114} textAnchor="middle" fontWeight={800} fontSize={14} fill="#ffc72c">
          {t('التخرج', 'Graduation')}
        </text>
      </g>
      <g fill="#ffffff" fillOpacity={0.6} fontFamily="'Alexandria Variable', Alexandria, sans-serif" fontSize={11}>
        <text x={X(462)} y={215} textAnchor="middle">{t('بعد 94 ساعة', 'after 94 credits')}</text>
        <text x={X(528)} y={133} textAnchor="middle">
          {t('134 ساعة', '134 credits')}
        </text>
      </g>
    </svg>
  );
};

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const { login } = useAuth();
  const { t, language, dir, toggleLanguage } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null);
    const result = await login(data.identifier, data.password);
    if (result.success) {
      if (onSuccess) onSuccess();
    } else {
      setErrorMessage(result.error || t('البريد أو كلمة المرور غير صحيحة.', 'The email or password is incorrect.'));
    }
  };

  const fillQuickAccount = (email: string) => {
    setValue('identifier', email, { shouldValidate: true });
    setValue('password', 'password123', { shouldValidate: true });
    setErrorMessage(null);
    setSelectedDemo(email);
    setFocus('password');
  };

  const identifierError = errors.identifier
    ? t('اكتب بريدك الجامعي أو رقمك الجامعي (3 أحرف على الأقل).', 'Enter your university email or student code (at least 3 characters).')
    : null;
  const passwordError = errors.password
    ? t('كلمة المرور 6 أحرف على الأقل.', 'The password has at least 6 characters.')
    : null;

  const steps = [
    t('يقترح النظام المقررات ويشرح سبب كل اقتراح', 'The system suggests courses and explains each one'),
    t('تتحقق اللائحة من الساعات والمتطلبات قبل أي تسجيل', 'Bylaw rules check credits and prerequisites first'),
    t('يراجع المرشد الأكاديمي الخطة ويعتمدها', 'Your academic advisor reviews and approves the plan'),
    t('يسجّل الطالب جدوله بلا تعارضات', 'You register a conflict-free timetable'),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper lg:flex-row">
      {/* Route-map slab */}
      <aside className="sign-slab relative hidden overflow-hidden text-white lg:flex lg:w-[52%] lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <div className="flex items-center gap-3">
          <BrandMark size={44} variant="onDark" />
          <div>
            <p className="text-[17px] font-extrabold leading-6">{t('المستشار الأكاديمي الذكي', 'Smart Academic Advisor')}</p>
            <p className="text-[12.5px] text-white/70">{t('كلية الحاسبات والمعلومات والذكاء الاصطناعي', 'Faculty of Computers & Artificial Intelligence')}</p>
          </div>
        </div>

        <div className="py-10">
          <h1 className="t-display display-tight max-w-[16ch] text-[34px] !text-white xl:text-[40px]">
            {t('دليلك من أول مقرر حتى يوم التخرج', 'Your guide from first course to graduation day')}
          </h1>
          <div className="mt-8 max-w-[560px]">
            <DegreeRouteMap dir={dir} t={t} />
          </div>
        </div>

        <ol className="grid max-w-[620px] gap-3 sm:grid-cols-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-route-400 text-[12.5px] font-extrabold text-ink-950">
                {i + 1}
              </span>
              <span className="text-[13px] leading-6 text-white/85">{step}</span>
            </li>
          ))}
        </ol>
      </aside>

      {/* Sign-in form */}
      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between px-6 pt-6 sm:px-10">
          <div className="flex items-center gap-2.5 lg:invisible">
            <BrandMark size={34} />
            <span className="text-[14px] font-extrabold text-ink-900">{t('المستشار الأكاديمي الذكي', 'Smart Academic Advisor')}</span>
          </div>
          <button type="button" onClick={toggleLanguage} className="btn btn-secondary btn-sm">
            {language === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[460px]">
            <h2 className="t-display display-tight text-[30px]">{t('تسجيل الدخول', 'Sign in')}</h2>
            <p className="mt-1 text-[14px] text-ink-500">
              {t('ادخل ببريدك الجامعي أو رقمك الجامعي.', 'Use your university email or student code.')}
            </p>

            {errorMessage && (
              <div className="callout callout-signal mt-6" role="alert">
                <AlertCircle aria-hidden="true" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5" noValidate>
              <div>
                <label htmlFor="login-identifier" className="field-label">
                  {t('البريد الجامعي أو الرقم الجامعي', 'University email or student code')}
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                  <input
                    id="login-identifier"
                    type="text"
                    autoComplete="username"
                    {...register('identifier')}
                    placeholder="name@university.edu"
                    aria-invalid={!!identifierError}
                    className="field h-12 ps-10 text-[14px]"
                  />
                </div>
                {identifierError && <p className="field-hint !text-signal-600">{identifierError}</p>}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="field-label !mb-0">
                    {t('كلمة المرور', 'Password')}
                  </label>
                  <span className="text-[12px] text-ink-500">
                    {t('كلمة مرور حسابات التجربة:', 'Demo password:')}{' '}
                    <span className="font-bold text-ink-800" dir="ltr">
                      password123
                    </span>
                  </span>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    {...register('password')}
                    placeholder="••••••••"
                    aria-invalid={!!passwordError}
                    className="field h-12 ps-10 pe-11 text-[14px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute end-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
                    aria-label={showPassword ? t('إخفاء كلمة المرور', 'Hide password') : t('إظهار كلمة المرور', 'Show password')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && <p className="field-hint !text-signal-600">{passwordError}</p>}
              </div>

              <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-lg btn-block">
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                    {t('جارٍ الدخول…', 'Signing in…')}
                  </>
                ) : (
                  <>
                    <LogIn aria-hidden="true" className="rtl:-scale-x-100" />
                    {t('دخول', 'Sign in')}
                  </>
                )}
              </button>
            </form>

            {/* Demo accounts */}
            <section className="mt-10" aria-labelledby="demo-accounts-title">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 id="demo-accounts-title" className="text-[14px] font-bold text-ink-900">
                  {t('حسابات التجربة', 'Demo accounts')}
                </h3>
                <span className="text-[12px] text-ink-500">{t('اختر حساباً لتعبئة البيانات', 'Pick one to fill the form')}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map(acc => {
                  const active = selectedDemo === acc.email;
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillQuickAccount(acc.email)}
                      aria-pressed={active}
                      className={cn(
                        'panel stripe-start p-3 text-start transition hover:border-ink-300 hover:bg-ink-50',
                        active && 'border-ink-900 bg-ink-50 ring-2 ring-ink-900/10'
                      )}
                      style={{ ['--stripe' as any]: toneColor[acc.tone] }}
                    >
                      <span className={cn('block text-[11.5px] font-bold', toneText[acc.tone])}>
                        {language === 'ar' ? acc.roleAr : acc.roleEn}
                      </span>
                      <span className="block text-[13.5px] font-bold text-ink-900">{language === 'ar' ? acc.nameAr : acc.nameEn}</span>
                      <span className="block text-[12px] text-ink-500">{language === 'ar' ? acc.noteAr : acc.noteEn}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
