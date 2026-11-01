import { Router, Request, Response } from 'express';
import { INSTITUTION } from '../config/institution.js';
import { TranscriptVerification, UniversityReportService } from './reportService.js';

/**
 * Public page opened by the QR code on a verified transcript: /verify/<code>.
 * No sign-in needed. Shows whether the document is genuine and the record it
 * certifies. Arabic by default, English with ?lang=en.
 */
export const verificationRouter = Router();

type Lang = 'ar' | 'en';
type PageState = TranscriptVerification | { valid: false; token: string; reason: 'ERROR' };

const TRACKS: Record<string, { ar: string; en: string }> = {
  General: { ar: 'المسار العام', en: 'General track' },
  'Artificial Intelligence': { ar: 'الذكاء الاصطناعي', en: 'Artificial Intelligence' },
  'Networks & Cyber Security': { ar: 'الشبكات والأمن السيبراني', en: 'Networks & Cyber Security' },
};

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function renderVerificationPage(state: PageState, lang: Lang, now = new Date()): string {
  const ar = lang === 'ar';
  const t = (a: string, e: string) => (ar ? a : e);
  const date = (iso?: string | Date) =>
    iso
      ? new Intl.DateTimeFormat(ar ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(
          new Date(iso)
        )
      : '';
  const gpa = (n: number) => (Number(n) || 0).toFixed(2);
  const row = (label: string, value: string) => `<div class="kv"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;

  let body = '';
  if (state.valid) {
    const v = state as TranscriptVerification & { valid: true };
    const s = v.student!;
    const issued = v.issued!;
    const goodStanding = issued.cumulativeGpa >= 2;
    const changed =
      Math.round(s.cumulativeGpa * 100) !== Math.round(issued.cumulativeGpa * 100) || s.completedCredits !== issued.completedCredits;
    const track = TRACKS[s.track] || { ar: s.track, en: s.track };
    const courses = v.courses || [];

    body = `
      <section class="status ok" role="status">
        <span class="mark" aria-hidden="true">✓</span>
        <div>
          <h1>${t('مستند صحيح وموثّق', 'Genuine document')}</h1>
          <p>${escapeHtml(
            t(
              `صدر هذا السجل الأكاديمي من ${INSTITUTION.facultyAr} بتاريخ ${date(v.issuedAt)}، ورمز التحقق مطابق.`,
              `This academic transcript was issued by the ${INSTITUTION.facultyEn} on ${date(v.issuedAt)}, and its verification code matches.`
            )
          )}</p>
        </div>
      </section>

      <section class="card">
        <h2>${t('بيانات الطالب', 'Student')}</h2>
        <dl class="grid">
          ${row(t('الاسم', 'Name'), `<strong>${escapeHtml(ar ? s.nameAr : s.nameEn)}</strong>`)}
          ${row(t('الرقم الجامعي', 'Student code'), `<bdi>${escapeHtml(s.code)}</bdi>`)}
          ${row(t('البرنامج', 'Programme'), escapeHtml(ar ? v.degreeProgramAr : v.degreeProgramEn))}
          ${row(t('المسار', 'Track'), escapeHtml(ar ? track.ar : track.en))}
          ${row(t('المستوى', 'Level'), escapeHtml(s.level))}
        </dl>
      </section>

      <section class="card">
        <h2>${t('بيانات المستند وقت الإصدار', 'As stated on the document')}</h2>
        <dl class="grid">
          ${row(t('المعدل التراكمي', 'Cumulative GPA'), `<span class="num">${gpa(issued.cumulativeGpa)}</span> / 4.00`)}
          ${row(t('الساعات المكتسبة', 'Credits earned'), `<span class="num">${issued.completedCredits}</span> / ${v.totalRequiredCredits}`)}
          ${row(
            t('الوضع الأكاديمي', 'Academic standing'),
            `<span class="${goodStanding ? 'good' : 'bad'}">${goodStanding ? t('وضع أكاديمي سليم', 'Good academic standing') : t('تحت الإنذار الأكاديمي', 'Academic warning')}</span>`
          )}
          ${row(t('تاريخ الإصدار', 'Issued on'), escapeHtml(date(v.issuedAt)))}
        </dl>
        ${
          changed
            ? `<p class="note">${escapeHtml(
                t(
                  `تم تحديث سجل الطالب بعد إصدار هذا المستند: المعدل التراكمي الآن ${gpa(s.cumulativeGpa)} والساعات المكتسبة ${s.completedCredits}.`,
                  `The student's record has changed since this document was issued: the cumulative GPA is now ${gpa(s.cumulativeGpa)} with ${s.completedCredits} credits earned.`
                )
              )}</p>`
            : ''
        }
      </section>

      <section class="card">
        <h2>${t('المقررات المجتازة', 'Courses passed')} <span class="count">${courses.length}</span></h2>
        ${
          courses.length
            ? `<div class="table"><table>
                <thead><tr><th>${t('المقرر', 'Course')}</th><th class="n">${t('الساعات', 'Credits')}</th><th class="n">${t('التقدير', 'Grade')}</th><th>${t('الفصل', 'Term')}</th></tr></thead>
                <tbody>${courses
                  .map(
                    c => `<tr>
                      <td><span class="code" dir="ltr">${escapeHtml(c.code)}</span> ${escapeHtml(ar ? c.nameAr : c.nameEn)}</td>
                      <td class="n">${escapeHtml(c.credits)}</td>
                      <td class="n"><strong dir="ltr">${escapeHtml(c.grade)}</strong></td>
                      <td class="term">${escapeHtml(c.semester)}</td>
                    </tr>`
                  )
                  .join('')}</tbody>
              </table></div>`
            : `<p class="muted">${t('لا توجد مقررات مجتازة بعد.', 'No courses passed yet.')}</p>`
        }
      </section>`;
  } else {
    const reason = state.reason;
    const message =
      reason === 'STUDENT_NOT_FOUND'
        ? t('الرمز صادر من النظام، لكن سجل هذا الطالب لم يعد موجوداً فيه.', 'The code was issued by the system, but this student’s record is no longer in it.')
        : reason === 'ERROR'
          ? t('تعذّر التحقق الآن بسبب خطأ في الخادم. حاول مرة أخرى بعد قليل.', 'The document could not be checked right now because of a server error. Please try again shortly.')
          : t('هذا الرمز لم يصدر من النظام أو تم تعديله، فلا يُعتمد على المستند.', 'This code was not issued by the system or has been altered, so the document cannot be relied on.');
    body = `
      <section class="status ${reason === 'ERROR' ? 'warn' : 'bad'}" role="status">
        <span class="mark" aria-hidden="true">${reason === 'ERROR' ? '!' : '✕'}</span>
        <div>
          <h1>${reason === 'ERROR' ? t('تعذّر التحقق', 'Could not verify') : t('رمز التحقق غير صالح', 'Invalid verification code')}</h1>
          <p>${escapeHtml(message)}</p>
        </div>
      </section>`;
  }

  const otherLang = ar ? `<a href="?lang=en" lang="en">English</a>` : `<a href="?lang=ar" lang="ar">العربية</a>`;

  return `<!doctype html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0b6439">
<title>${escapeHtml(t(`التحقق من سجل أكاديمي — ${INSTITUTION.universityAr}`, `Transcript verification — ${INSTITUTION.universityEn}`))}</title>
<style>
  :root { --sign:#0b6439; --sign-dark:#064226; --sign-soft:#e8f3ec; --route:#ffc72c; --ink:#191e1b; --muted:#6f7771; --line:#dadfd8; --bg:#f5f6f4;
          --bad:#b53022; --bad-soft:#fdedeb; --warn:#c26505; --warn-soft:#fff3e3; }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 15px/1.75 "Segoe UI", Tahoma, "Noto Sans Arabic", "Noto Naskh Arabic", "Geeza Pro", system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 16px; }
  header { background: var(--sign); color: #fff; border-bottom: 4px solid var(--route); }
  header .wrap { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 16px; padding-bottom: 18px; }
  header .uni { margin: 0; font-size: 18px; font-weight: 800; line-height: 1.4; }
  header .fac { margin: 2px 0 0; font-size: 13px; opacity: .85; }
  header a { color: #fff; font-size: 13px; font-weight: 700; text-decoration: none; border: 1px solid rgb(255 255 255 / .35); border-radius: 8px; padding: 4px 10px; white-space: nowrap; }
  main { padding: 20px 0 32px; }
  .status { display: flex; gap: 14px; align-items: flex-start; border-radius: 14px; padding: 16px; margin-bottom: 16px; border: 1px solid; }
  .status h1 { margin: 0; font-size: 20px; line-height: 1.4; }
  .status p { margin: 4px 0 0; font-size: 14px; }
  .status .mark { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: #fff; font-size: 22px; font-weight: 800; }
  .status.ok { background: var(--sign-soft); border-color: #a3cfb5; color: var(--sign-dark); }
  .status.ok .mark { background: var(--sign); }
  .status.bad { background: var(--bad-soft); border-color: #f2b8b0; color: #7d1d13; }
  .status.bad .mark { background: var(--bad); }
  .status.warn { background: var(--warn-soft); border-color: #f6cf9b; color: #7a3f03; }
  .status.warn .mark { background: var(--warn); }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .card h2 { margin: 0 0 10px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .count { font-size: 12px; font-weight: 700; color: var(--muted); background: var(--bg); border-radius: 999px; padding: 0 8px; }
  dl.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 20px; margin: 0; }
  .kv dt { font-size: 12.5px; color: var(--muted); }
  .kv dd { margin: 0; font-weight: 600; }
  .num { font-variant-numeric: tabular-nums; font-weight: 800; font-size: 17px; }
  .good { color: var(--sign); font-weight: 800; }
  .bad { color: var(--bad); font-weight: 800; }
  .note { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--warn-soft); color: #7a3f03; font-size: 13.5px; }
  .muted { color: var(--muted); margin: 0; }
  .table { overflow-x: auto; margin: 0 -4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: start; font-size: 12px; color: var(--muted); font-weight: 700; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  td { padding: 8px; border-bottom: 1px solid #edf0ec; vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  .n { text-align: center; white-space: nowrap; }
  .term { color: var(--muted); white-space: nowrap; }
  .code { display: inline-block; font-size: 12px; font-weight: 800; background: var(--sign-soft); color: var(--sign-dark); border-radius: 6px; padding: 0 6px; margin-inline-end: 4px; }
  footer { color: var(--muted); font-size: 12.5px; padding-bottom: 28px; }
  footer p { margin: 2px 0; }
  .token { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; color: var(--ink); }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <div>
      <p class="uni">${escapeHtml(ar ? INSTITUTION.universityAr : INSTITUTION.universityEn)}</p>
      <p class="fac">${escapeHtml(ar ? `${INSTITUTION.facultyAr} · ${INSTITUTION.officeAr}` : `${INSTITUTION.facultyEn} · ${INSTITUTION.officeEn}`)}</p>
    </div>
    ${otherLang}
  </div>
</header>
<main class="wrap">
  ${body}
</main>
<footer class="wrap">
  <p>${t('رمز التحقق', 'Verification code')}: <span class="token" dir="ltr">${escapeHtml(state.token)}</span></p>
  <p>${t('وقت التحقق', 'Checked at')}: ${escapeHtml(date(now))}</p>
  <p>${t('صفحة عامة للتحقق من المستندات الصادرة من نظام المستشار الأكاديمي الذكي، ولا تحتاج تسجيل دخول.', 'Public page for checking documents issued by the Smart Academic Advisor. No sign-in needed.')}</p>
</footer>
</body>
</html>`;
}

verificationRouter.get('/:token', async (req: Request, res: Response) => {
  const lang: Lang = req.query.lang === 'en' ? 'en' : 'ar';
  const token = String(req.params.token || '');
  res.set('Cache-Control', 'no-store');
  try {
    const result = await UniversityReportService.verifyTranscript(token);
    return res.status(result.valid ? 200 : 404).type('html').send(renderVerificationPage(result, lang));
  } catch (err) {
    console.error('[Verification] Could not verify transcript:', err);
    return res.status(500).type('html').send(renderVerificationPage({ valid: false, token, reason: 'ERROR' }, lang));
  }
});
