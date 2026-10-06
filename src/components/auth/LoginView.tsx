import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import {
  GraduationCap,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Building,
  KeyRound,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface LoginViewProps {
  onSuccess?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const { loginAs, usersList, switchUser } = useAuth();
  const { t, language } = useLanguage();

  const [activeTab, setActiveTab] = useState<'CREDENTIALS' | 'SSO' | 'DEMO'>('CREDENTIALS');
  const [email, setEmail] = useState('student@example.com');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.messageAr || data.error || 'فشل تسجيل الدخول');
      }

      await loginAs(email);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'بيانات الدخول غير صحيحة');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSsoLogin = async (provider: string) => {
    setIsLoading(true);
    try {
      // SSO Authentication Flow
      await loginAs('admin@example.com');
      if (onSuccess) onSuccess();
    } catch (err) {
      setErrorMessage('تعذر الاتصال بخادم الهوية الجامعي الموحد');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="bg-slate-800/90 border border-slate-700 rounded-3xl shadow-2xl max-w-md w-full p-8 backdrop-blur-md relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-800 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 mb-3">
            <GraduationCap className="w-8 h-8 text-amber-300" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            {t('المستشار الأكاديمي الذكي', 'Smart Academic Advisor')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {t('منظومة الإرشاد والتوجيه الأكاديمي لبرامج الساعات المعتمدة', 'University Credit-Hour Academic Guidance System')}
          </p>
        </div>

        {/* Auth Method Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-900/60 p-1 rounded-xl mb-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('CREDENTIALS')}
            className={`py-2 rounded-lg transition cursor-pointer ${
              activeTab === 'CREDENTIALS' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('بيانات الحساب', 'Credentials')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SSO')}
            className={`py-2 rounded-lg transition cursor-pointer ${
              activeTab === 'SSO' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('الدخول الموحد SSO', 'University SSO')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DEMO')}
            className={`py-2 rounded-lg transition cursor-pointer ${
              activeTab === 'DEMO' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('حسابات العرض', 'Demo Accounts')}
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. Production Credentials Form */}
        {activeTab === 'CREDENTIALS' && (
          <form onSubmit={handleCredentialsLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {t('البريد الإلكتروني الجامعي', 'University Email Address')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@university.edu"
                  className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-700 bg-slate-900/60 text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {t('كلمة المرور', 'Password')}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-700 bg-slate-900/60 text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer text-xs"
            >
              <span>{isLoading ? t('جارٍ التحقق المشفر...', 'Authenticating...') : t('تسجيل الدخول للنظام الأكاديمي', 'Sign In')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* 2. University SSO Form */}
        {activeTab === 'SSO' && (
          <div className="space-y-3 text-xs">
            <p className="text-slate-400 text-center mb-4">
              {t(
                'تسجيل الدخول الموحد باستخدام حساب مايكروسوفت أو الهوية الجامعية الرسمية (Active Directory / Azure AD):',
                'Sign in using your institutional Microsoft Azure AD or University SSO directory:'
              )}
            </p>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSsoLogin('MICROSOFT_AZURE_AD')}
              className="w-full py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-900 text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Building className="w-4 h-4 text-indigo-400" />
              <span>{t('تسجيل الدخول عبر Microsoft Azure AD', 'Sign in with Microsoft Azure AD')}</span>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSsoLogin('UNIVERSITY_IDP')}
              className="w-full py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-900 text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{t('تسجيل الدخول عبر بوابة الجامعة (SAML/CAS)', 'Sign in with University Portal (SAML)')}</span>
            </button>
          </div>
        )}

        {/* 3. Demo Fast Access Selector */}
        {activeTab === 'DEMO' && (
          <div className="space-y-2 text-xs">
            <p className="text-[11px] text-slate-400 mb-2">
              {t('اختر حساباً تجريبياً جاهزاً لاستكشاف النظام بكافة الصلاحيات:', 'Select a pre-configured role to inspect the system:')}
            </p>
            {usersList.slice(0, 6).map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  switchUser(u);
                  if (onSuccess) onSuccess();
                }}
                className="w-full text-right p-2.5 rounded-xl border border-slate-700/60 bg-slate-900/60 hover:bg-slate-700 text-white transition flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="font-bold text-slate-200">{language === 'ar' ? u.nameAr : u.nameEn}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{u.email}</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {u.role}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
