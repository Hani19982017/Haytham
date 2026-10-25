import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import {
  GraduationCap,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Building,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  BookOpen,
  Award,
  Layers,
  Languages,
} from 'lucide-react';

const loginSchema = z.object({
  identifier: z
    .string()
    .min(3, { message: 'يرجى إدخال البريد الإلكتروني أو الرقم الجامعي بشكل صحيح' }),
  password: z
    .string()
    .min(6, { message: 'كلمة المرور يجب أن تتكون من 6 أحرف على الأقل' }),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginViewProps {
  onSuccess?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const { login } = useAuth();
  const { t, language, toggleLanguage } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
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
      setErrorMessage(result.error || t('بيانات الدخول غير صحيحة', 'Invalid credentials'));
    }
  };

  const fillQuickAccount = (email: string) => {
    setValue('identifier', email);
    setValue('password', 'password123');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-950 text-slate-100">
      {/* 1. Left Section: Branded Academic Graphic / Presentation Card */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-12 flex-col justify-between overflow-hidden border-l border-slate-800">
        {/* Background glow graphics */}
        <div className="absolute top-1/4 -right-20 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-10 left-10 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none"></div>

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
              <GraduationCap className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-wide">
                {t('كلية الحاسبات والمعلومات والذكاء الاصطناعي', 'Faculty of Computers & Artificial Intelligence')}
              </h2>
              <span className="text-[11px] text-indigo-300 font-medium">
                {t('برنامج علوم الحاسب بنظام الساعات المعتمدة', 'Computer Science Credit-Hour Degree Program')}
              </span>
            </div>
          </div>

          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700/60 bg-slate-800/40 text-xs text-slate-300 hover:text-white transition cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>

        {/* Center Presentation Graphic & Feature Cards */}
        <div className="relative z-10 my-auto py-10 space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/20 text-indigo-300 text-xs font-bold mb-4">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('محرك اللائحة الذكي v2.5 متوافق مع نظام ابن الهيثم', 'Smart Bylaws Engine v2.5 - Ibn Al-Haitham Compatible')}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white leading-tight">
              {t(
                'منظومة الإرشاد والتوجيه الأكاديمي الرقمية المتكاملة',
                'Next-Gen Digital Academic Advising & Rules Enforcement Platform'
              )}
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl leading-relaxed">
              {t(
                'تطبيق رسمي متكامل لإدارة تسجيل المقررات، التنبؤ بمخاطر التعثر الأكاديمي، فحص شجرة المتطلبات السابقة، وحساب المعدلات التراكمية في قاعدة بيانات PostgreSQL موثوقة.',
                'Enterprise full-stack academic guidance platform enforcing real-time GPA rules, prerequisite chains, risk classification, and graduation trajectory.'
              )}
            </p>
          </div>

          {/* Highlights Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-2">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white mb-1">
                {t('قواعد اللائحة الرسمية 100%', 'Bylaws Compliance')}
              </h4>
              <p className="text-[11px] text-slate-400 leading-normal">
                {t('حدود الساعات الفصليّة (12-21 ساعة) وسقف الإعادة الآلي.', 'Automated credit bounds & retake grade capping.')}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center mb-2">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white mb-1">
                {t('أمان مؤسسي JWT + Bcrypt', 'Enterprise Security')}
              </h4>
              <p className="text-[11px] text-slate-400 leading-normal">
                {t('صلاحيات وصول دقيقة (RBAC) وسجل تدقيق غير قابل للتعديل.', 'Strict RBAC policies with immutable audit trail.')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>{t('مشروع التخرج: المستشار الأكاديمي الذكي', 'Graduation Project 2026')}</span>
          <span>PostgreSQL + Prisma + Express + Render</span>
        </div>
      </div>

      {/* 2. Right Section: Enterprise Login Form (RTL by default) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 md:p-16 relative">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Top Brand (only visible on small screens) */}
          <div className="lg:hidden flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <GraduationCap className="w-5 h-5 text-amber-300" />
              </div>
              <span className="font-bold text-white text-sm">
                {t('المستشار الأكاديمي الذكي', 'Smart Academic Advisor')}
              </span>
            </div>
            <button
              onClick={toggleLanguage}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300"
            >
              {language === 'ar' ? 'English' : 'عربي'}
            </button>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {t('تسجيل الدخول إلى النظام الأكاديمي', 'Sign In to Your Account')}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t(
                'أدخل بريدك الجامعي أو كود الطالب مع كلمة المرور المشفرة للمتابعة.',
                'Enter your university email or student code and password.'
              )}
            </p>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                {t('البريد الإلكتروني أو كود الطالب', 'Email or Student Code')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 rtl:right-3.5 rtl:left-auto ltr:left-3.5 ltr:right-auto" />
                <input
                  type="text"
                  autoComplete="username"
                  {...register('identifier')}
                  placeholder={t('name@university.edu أو 2021001', 'name@university.edu or 2021001')}
                  className={`w-full pr-10 pl-3 py-2.5 rounded-xl border text-xs font-mono bg-slate-900/90 text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition ${
                    errors.identifier ? 'border-rose-500' : 'border-slate-800'
                  }`}
                />
              </div>
              {errors.identifier && (
                <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                  {errors.identifier.message}
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  {t('كلمة المرور المشفرة', 'Password')}
                </label>
                <span className="text-[10px] text-indigo-400 font-medium">
                  {t('كلمة المرور الافتراضية: password123', 'Default: password123')}
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 rtl:right-3.5 rtl:left-auto ltr:left-3.5 ltr:right-auto" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password')}
                  placeholder="••••••••"
                  className={`w-full pr-10 pl-10 py-2.5 rounded-xl border text-xs font-mono bg-slate-900/90 text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition ${
                    errors.password ? 'border-rose-500' : 'border-slate-800'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-3 rtl:left-3.5 rtl:right-auto ltr:right-3.5 ltr:left-auto text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                  {errors.password.message}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                  <span>{t('جارٍ التحقق من الحساب وإصدار الجلسة...', 'Authenticating & Issuing Token...')}</span>
                </>
              ) : (
                <>
                  <span>{t('دخول النظام الأكاديمي', 'Sign In to Dashboard')}</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Personas Selector (for Evaluators & Convenience) */}
          <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold flex items-center gap-1.5 text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                {t('حسابات التقييم المعتمدة (اضغط للتعبئة الفورية):', 'Quick Demo Accounts (Click to Fill):')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => fillQuickAccount('student@example.com')}
                className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 hover:border-indigo-500/50 text-right transition cursor-pointer"
              >
                <div className="font-bold text-slate-200 text-[11px]">طالب: عمر فاروق</div>
                <div className="text-[10px] text-slate-500 font-mono">student@example.com</div>
              </button>

              <button
                type="button"
                onClick={() => fillQuickAccount('admin@example.com')}
                className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 hover:border-rose-500/50 text-right transition cursor-pointer"
              >
                <div className="font-bold text-rose-300 text-[11px]">الآدمن: عميد الكلية</div>
                <div className="text-[10px] text-slate-500 font-mono">admin@example.com</div>
              </button>

              <button
                type="button"
                onClick={() => fillQuickAccount('advisor@example.com')}
                className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 hover:border-amber-500/50 text-right transition cursor-pointer"
              >
                <div className="font-bold text-amber-300 text-[11px]">المرشد: د. محمود صقر</div>
                <div className="text-[10px] text-slate-500 font-mono">advisor@example.com</div>
              </button>

              <button
                type="button"
                onClick={() => fillQuickAccount('instructor@example.com')}
                className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 hover:border-indigo-500/50 text-right transition cursor-pointer"
              >
                <div className="font-bold text-indigo-300 text-[11px]">أستاذ: أ.د. عادل منصور</div>
                <div className="text-[10px] text-slate-500 font-mono">instructor@example.com</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
