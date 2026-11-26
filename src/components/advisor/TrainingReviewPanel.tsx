import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { TrainingSubmission } from '../../types/index.js';
import { Panel, EmptyState, Chip, cn, chipClass, trainingLabel, trainingTone, pick } from '../ui/index.js';
import { Briefcase, FileText, Check, XCircle, CheckCircle2, CalendarDays, Clock, Paperclip } from 'lucide-react';

const errorText = (err: any, language: string, ar: string, en: string) => {
  const data = err?.response?.data;
  return (language === 'ar' ? data?.messageAr : data?.messageEn) || (language === 'ar' ? ar : en);
};

const day = (iso: string | undefined, language: string) =>
  iso ? new Date(iso).toLocaleDateString(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Summer training proofs from the advisor's students: open the certificate, accept or reject it. */
export const TrainingReviewPanel: React.FC<{
  items: TrainingSubmission[];
  onChanged: () => void;
  onToast: (text: string, ok: boolean) => void;
}> = ({ items, onChanged, onToast }) => {
  const { t, language } = useLanguage();
  const pending = items.filter(i => i.status === 'Pending');
  const decided = items.filter(i => i.status !== 'Pending');

  return (
    <div className="space-y-5">
      {pending.length === 0 ? (
        <Panel>
          <EmptyState
            icon={CheckCircle2}
            tone="sign"
            title={t('لا توجد إثباتات تدريب تنتظر قرارك', 'No training proofs are waiting for you')}
            description={t('عندما يرفع طالب شهادة تدريبه من صفحة «التدريب الصيفي» تظهر هنا، ويصلك إشعار.', 'When a student uploads a training certificate it shows here, and you are notified.')}
          />
        </Panel>
      ) : (
        pending.map(item => <ProofCard key={item.id} item={item} onChanged={onChanged} onToast={onToast} />)
      )}

      {decided.length > 0 && (
        <Panel padded={false}>
          <div className="px-5 pb-2 pt-4">
            <h3 className="text-[14px] font-bold text-ink-900">{t('قرارات سابقة', 'Earlier decisions')}</h3>
          </div>
          <ul className="divide-y divide-ink-100">
            {decided.map(i => (
              <li key={i.id} className="flex flex-col gap-1.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{language === 'ar' ? i.studentNameAr : i.studentNameEn}</span>
                    <span className="t-num text-[12px] text-ink-500">{i.studentCode}</span>
                    <span className={chipClass[trainingTone[i.status] || 'ink']}>{pick(language, trainingLabel[i.status], i.status)}</span>
                  </p>
                  <p className="text-[12.5px] text-ink-600">
                    {i.company} · <span className="t-num">{i.hours}</span> {t('ساعة', 'hours')}
                    {i.reviewNotes && <span className="text-ink-500"> — {i.reviewNotes}</span>}
                  </p>
                </div>
                {i.proofFileName && (
                  <button type="button" onClick={() => api.openTrainingProof(i.id, i.proofFileName).catch(err => onToast(errorText(err, language, 'تعذّر فتح الملف.', 'The file could not be opened.'), false))} className="btn btn-ghost btn-sm">
                    <Paperclip aria-hidden="true" />
                    {t('الإثبات', 'Proof')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
};

const ProofCard: React.FC<{ item: TrainingSubmission; onChanged: () => void; onToast: (text: string, ok: boolean) => void }> = ({ item, onChanged, onToast }) => {
  const { t, language } = useLanguage();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'ACCEPT' | 'REJECT' | 'OPEN' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'ACCEPT' | 'REJECT') => {
    if (decision === 'REJECT' && notes.trim().length < 3) {
      setError(t('اكتب للطالب سبب رفض الإثبات.', 'Tell the student why the proof is rejected.'));
      return;
    }
    try {
      setBusy(decision);
      setError(null);
      await api.reviewTraining(item.id, decision, notes.trim());
      onToast(
        decision === 'ACCEPT'
          ? t(`قُبل تدريب ${item.studentNameAr} (${item.hours} ساعة) وأُبلغ الطالب.`, `${item.studentNameEn}'s training (${item.hours} hours) was accepted; the student was notified.`)
          : t(`رُفض إثبات ${item.studentNameAr} وأُبلغ بالسبب.`, `${item.studentNameEn}'s proof was rejected; the student was told why.`),
        true
      );
      onChanged();
    } catch (err) {
      setError(errorText(err, language, 'تعذّر حفظ القرار.', 'The decision could not be saved.'));
    } finally {
      setBusy(null);
    }
  };

  const open = async () => {
    try {
      setBusy('OPEN');
      await api.openTrainingProof(item.id, item.proofFileName);
    } catch (err) {
      setError(errorText(err, language, 'تعذّر فتح الملف.', 'The file could not be opened.'));
    } finally {
      setBusy(null);
    }
  };

  const size = item.proofSize ? `${Math.max(1, Math.round(item.proofSize / 1024))} KB` : '';

  return (
    <Panel>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="flex flex-wrap items-center gap-2">
            <Briefcase className="h-4 w-4 text-caution-600" aria-hidden="true" />
            <span className="text-[15px] font-bold text-ink-900">{language === 'ar' ? item.studentNameAr : item.studentNameEn}</span>
            <span className="t-num text-[12px] text-ink-500">{item.studentCode}</span>
            <Chip tone="route">{t('بانتظار قرارك', 'Waiting for you')}</Chip>
          </p>
          <p className="text-[13.5px] text-ink-800">
            {t('جهة التدريب:', 'Trained at:')} <span className="font-semibold">{item.company}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-600">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="t-num">{item.hours}</span> {t('ساعة', 'hours')} · <span className="t-num">{item.periodWeeks}</span> {t('أسابيع', 'weeks')}
            </span>
            {(item.startDate || item.endDate) && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {day(item.startDate, language)} — {day(item.endDate, language)}
              </span>
            )}
            <span>{t('أُرسل', 'Sent')} {day(item.createdAt, language)}</span>
          </p>
          {item.studentNotes && <p className="rounded-lg bg-ink-50 px-3 py-2 text-[12.5px] text-ink-700">{item.studentNotes}</p>}
        </div>
        <button type="button" onClick={open} disabled={!!busy} className="btn btn-secondary shrink-0">
          <FileText aria-hidden="true" />
          {busy === 'OPEN' ? t('جارٍ الفتح…', 'Opening…') : t('عرض الإثبات', 'Open the proof')}
          {item.proofFileName && <span className="max-w-[160px] truncate text-[11.5px] font-medium text-ink-500">({item.proofFileName}{size ? ` · ${size}` : ''})</span>}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-ink-100 pt-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <label htmlFor={`training-notes-${item.id}`} className="field-label">
            {t('ملاحظتك للطالب (مطلوبة عند الرفض)', 'Your note to the student (required to reject)')}
          </label>
          <input id={`training-notes-${item.id}`} className="field" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('مثال: الشهادة غير مختومة من جهة التدريب', 'e.g. The certificate is not stamped by the company')} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => decide('REJECT')} disabled={!!busy} className="btn btn-danger">
            <XCircle aria-hidden="true" />
            {busy === 'REJECT' ? t('جارٍ الحفظ…', 'Saving…') : t('رفض', 'Reject')}
          </button>
          <button type="button" onClick={() => decide('ACCEPT')} disabled={!!busy} className="btn btn-primary">
            <Check aria-hidden="true" />
            {busy === 'ACCEPT' ? t('جارٍ الحفظ…', 'Saving…') : t('قبول واحتساب الساعات', 'Accept and count the hours')}
          </button>
        </div>
      </div>
      {error && <p className={cn('mt-2 text-[12.5px] font-semibold text-signal-700')}>{error}</p>}
    </Panel>
  );
};
