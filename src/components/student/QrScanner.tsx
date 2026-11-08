import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { AttendanceCheckInResult } from '../../types/index.js';
import { Modal, cn, chipClass, attendanceStatusLabel, attendanceStatusTone, pick } from '../ui/index.js';
import { ScanLine, Camera, CameraOff, KeyRound, CheckCircle2, AlertCircle, ImageUp, RotateCcw } from 'lucide-react';

/** What a scanned QR code (or typed code) asks the server to check. */
export type CheckInInput = { sessionId?: string; token?: string; code?: string };

/** Read a lecture QR code: the link …/attend/<session>/<token>, or a bare 6-digit code. */
export function parseCheckIn(text: string): CheckInInput | null {
  const link = /\/attend\/([^/?#\s]+)\/([A-Za-z0-9]+)/.exec(text);
  if (link) return { sessionId: decodeURIComponent(link[1]), token: link[2] };
  const digits = /^\s*(\d{6})\s*$/.exec(text);
  if (digits) return { code: digits[1] };
  return null;
}

/** The error message the server sent, in the reader's language. */
export function checkInError(err: any, language: string, fallbackAr: string, fallbackEn: string): string {
  const data = err?.response?.data;
  return (language === 'ar' ? data?.messageAr : data?.messageEn) || (language === 'ar' ? fallbackAr : fallbackEn);
}

/** Decode a QR code from image pixels (camera frame or photo), downscaled for speed. */
function decodeFrom(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement): string | null {
  if (!width || !height) return null;
  const scale = Math.min(1, 720 / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' })?.data || null;
}

interface QrScannerModalProps {
  onClose: () => void;
  /** Called after a successful check-in (to refresh the page behind). */
  onCheckedIn?: (result: AttendanceCheckInResult) => void;
}

/**
 * Check in to a lecture: scan the QR code with the camera, take a photo of it
 * (works where the browser blocks the live camera, e.g. without https), or type
 * the six-digit code shown under it.
 */
export const QrScannerModal: React.FC<QrScannerModalProps> = ({ onClose, onCheckedIn }) => {
  const { t, language } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [camera, setCamera] = useState<'starting' | 'on' | 'blocked' | 'insecure' | 'off'>('starting');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const submit = useCallback(
    async (input: CheckInInput) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await api.checkInAttendance(input);
        setResult(res);
        stopCamera();
        setCamera('off');
        onCheckedIn?.(res);
      } catch (err: any) {
        setError(checkInError(err, language, 'تعذّر تسجيل الحضور. حاول مرة أخرى.', 'Could not check you in. Please try again.'));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [language, onCheckedIn, stopCamera]
  );

  const handleText = useCallback(
    (text: string) => {
      const input = parseCheckIn(text);
      if (input) submit(input);
      else setError(t('هذا ليس رمز حضور. امسح الرمز المعروض على شاشة المحاضرة.', 'That is not an attendance code. Scan the code shown on the lecture screen.'));
    },
    [submit, t]
  );

  // Start the camera when the window opens; scan a few frames a second.
  const startCamera = useCallback(async () => {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamera('insecure');
      return;
    }
    setCamera('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setCamera('on');
    } catch {
      setCamera('blocked');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (camera !== 'on') return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 220 || busyRef.current) return;
      last = now;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const text = decodeFrom(video, video.videoWidth, video.videoHeight, canvas);
      if (text && parseCheckIn(text)) handleText(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [camera, handleText]);

  const handlePhoto = (file?: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const text = canvasRef.current ? decodeFrom(img, img.naturalWidth, img.naturalHeight, canvasRef.current) : null;
      URL.revokeObjectURL(url);
      if (text) handleText(text);
      else setError(t('لم نجد رمز QR واضحاً في الصورة. قرّب الهاتف من الشاشة وأعد التصوير، أو اكتب الكود.', 'No clear QR code in that photo. Move closer to the screen and try again, or type the code.'));
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const status = result?.status;
  const done = !!result;

  return (
    <Modal
      onClose={onClose}
      size="md"
      icon={ScanLine}
      tone="sign"
      title={t('تسجيل الحضور', 'Check in')}
      subtitle={t('امسح رمز QR المعروض في المحاضرة أو السكشن', 'Scan the QR code shown in the lecture or section')}
      closeLabel={t('إغلاق', 'Close')}
      footer={
        <button type="button" onClick={onClose} className="btn btn-ghost">
          {done ? t('تم', 'Done') : t('إلغاء', 'Cancel')}
        </button>
      }
    >
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {done ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
          <span className={cn('grid h-16 w-16 place-items-center rounded-full', result.success ? 'bg-sign-50 text-sign-700' : 'bg-caution-50 text-caution-700')}>
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </span>
          <p className="text-[17px] font-bold text-ink-950">{language === 'ar' ? result.messageAr : result.messageEn}</p>
          {status && <span className={chipClass[attendanceStatusTone[status] || 'ink']}>{pick(language, attendanceStatusLabel[status], status)}</span>}
          {result.course && (
            <p className="text-[13px] text-ink-600">
              {t(
                `حضرت ${result.course.attended} من ${result.course.heldSessions} في ${result.course.courseCode}، والمتبقي لك من الغياب ${Math.max(0, result.course.remainingAbsences)}.`,
                `You have attended ${result.course.attended} of ${result.course.heldSessions} in ${result.course.courseCode}; ${Math.max(0, result.course.remainingAbsences)} absences left.`
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Camera */}
          <div className="relative overflow-hidden rounded-xl bg-ink-950" style={{ aspectRatio: '4 / 3' }}>
            <video ref={videoRef} className={cn('h-full w-full object-cover', camera !== 'on' && 'invisible')} muted playsInline aria-label={t('صورة الكاميرا', 'Camera view')} />
            {camera === 'on' && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
                <div className="h-[62%] w-[62%] rounded-2xl border-[3px] border-route-400 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
              </div>
            )}
            {camera !== 'on' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
                {camera === 'starting' ? (
                  <>
                    <Camera className="h-8 w-8 animate-pulse text-route-400" aria-hidden="true" />
                    <p className="text-[13px]">{t('جارٍ تشغيل الكاميرا…', 'Starting the camera…')}</p>
                  </>
                ) : (
                  <>
                    <CameraOff className="h-8 w-8 text-ink-300" aria-hidden="true" />
                    <p className="text-[13px] leading-6">
                      {camera === 'insecure'
                        ? t(
                            'المتصفح لا يسمح بالكاميرا هنا لأن الاتصال ليس آمناً (https). صوّر الرمز بالزر بالأسفل، أو امسحه بكاميرا الهاتف مباشرة، أو اكتب الكود.',
                            'The browser blocks the camera here because the connection is not secure (https). Take a photo of the code below, scan it with your phone camera, or type the code.'
                          )
                        : camera === 'blocked'
                        ? t('لم نتمكن من فتح الكاميرا. اسمح للمتصفح باستخدامها ثم أعد المحاولة، أو صوّر الرمز، أو اكتب الكود.', 'The camera could not be opened. Allow camera access and try again, take a photo of the code, or type it.')
                        : t('الكاميرا متوقفة.', 'The camera is off.')}
                    </p>
                    {camera === 'blocked' && (
                      <button type="button" onClick={startCamera} className="btn btn-sm btn-accent">
                        <RotateCcw aria-hidden="true" />
                        {t('أعد المحاولة', 'Try again')}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="btn btn-secondary cursor-pointer">
              <ImageUp aria-hidden="true" />
              {t('صوّر الرمز بدلاً من ذلك', 'Take a photo of the code')}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => handlePhoto(e.target.files?.[0])} />
            </label>
            {busy && <span className="text-[12.5px] text-ink-500">{t('جارٍ تسجيل حضورك…', 'Checking you in…')}</span>}
          </div>

          {/* Code */}
          <form
            className="rounded-xl border border-ink-200 bg-ink-50 p-4"
            onSubmit={e => {
              e.preventDefault();
              if (/^\d{6}$/.test(code)) submit({ code });
            }}
          >
            <label htmlFor="attendance-code" className="field-label flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-ink-500" aria-hidden="true" />
              {t('أو اكتب الكود المكوّن من 6 أرقام تحت الرمز', 'Or type the 6-digit code under the QR code')}
            </label>
            <div className="flex gap-2">
              <input
                id="attendance-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                dir="ltr"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="field t-num text-center text-[20px] tracking-[0.5em]"
              />
              <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary shrink-0">
                {t('سجّل', 'Check in')}
              </button>
            </div>
            <p className="field-hint">{t('الكود يتغير كل 30 ثانية مع الرمز.', 'The code changes every 30 seconds, with the QR code.')}</p>
          </form>

          {error && (
            <div className="callout callout-signal" role="alert">
              <AlertCircle aria-hidden="true" />
              <span className="font-semibold">{error}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
