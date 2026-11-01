import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import QRCode from 'qrcode';
import { Student } from '../../src/types/index.js';
import { StudentRepository } from '../repositories/studentRepository.js';
import { INSTITUTION } from '../config/institution.js';

export interface TranscriptCourse {
  code: string;
  nameAr: string;
  nameEn: string;
  credits: number;
  grade: string;
  semester: string;
}

export interface VerifiedTranscriptReport {
  verificationToken: string;
  /** Public page that shows this document; it is what the QR code opens. */
  verificationUrl: string;
  /** Same as verificationUrl (kept for older clients). */
  qrCodePayloadUrl: string;
  /** QR code for verificationUrl, as an SVG document. */
  qrSvg: string;
  /**
   * False when the link can only be opened on this computer (localhost), so a
   * phone cannot reach it. Set PUBLIC_APP_URL to the address phones can use.
   */
  verificationReachable: boolean;
  studentCode: string;
  studentNameAr: string;
  studentNameEn: string;
  degreeProgramAr: string;
  degreeProgramEn: string;
  issuedAt: string;
  cumulativeGpa: number;
  completedCredits: number;
  totalRequiredCredits: number;
  academicStandingAr: string;
  academicStandingEn: string;
  courses: TranscriptCourse[];
}

/** Result of checking a verification code (what the QR page shows). */
export interface TranscriptVerification {
  valid: boolean;
  token: string;
  reason?: 'MALFORMED' | 'BAD_SIGNATURE' | 'STUDENT_NOT_FOUND';
  issuedAt?: string;
  /** Figures printed on the document when it was issued. */
  issued?: { cumulativeGpa: number; completedCredits: number };
  student?: {
    code: string;
    nameAr: string;
    nameEn: string;
    track: string;
    level: number;
    cumulativeGpa: number;
    completedCredits: number;
  };
  courses?: TranscriptCourse[];
  totalRequiredCredits: number;
  degreeProgramAr: string;
  degreeProgramEn: string;
}

const DEGREE_PROGRAM_AR = 'بكالوريوس علوم الحاسب (برنامج الساعات المعتمدة)';
const DEGREE_PROGRAM_EN = 'B.Sc. in Computer Science (Credit-Hour System)';

// Verification codes are signed, so they cannot be forged and stay valid after
// the server restarts (nothing has to be stored).
const SIGNING_SECRET =
  process.env.TRANSCRIPT_SECRET || process.env.JWT_SECRET || 'university-secure-academic-secret-key-2026';

const sign = (parts: string[]) =>
  crypto.createHmac('sha256', SIGNING_SECRET).update(['transcript-v1', ...parts].join('|')).digest('hex').slice(0, 16).toUpperCase();

/** Student codes are digits; anything else is hex-encoded behind "~" so the code stays URL-safe. */
const encodeCode = (code: string) => (/^[A-Za-z0-9]{1,32}$/.test(code) ? code : `~${Buffer.from(code, 'utf8').toString('hex')}`);
const decodeCode = (part: string) => (part.startsWith('~') ? Buffer.from(part.slice(1), 'hex').toString('utf8') : part);

const plainName = (raw?: string) => (raw || '').split('(')[0].trim() || raw || '';

const standing = (gpa: number) =>
  gpa >= 2.0
    ? { ar: 'وضع أكاديمي سليم', en: 'Good Academic Standing' }
    : { ar: 'تحت الإنذار الأكاديمي', en: 'Academic Warning' };

const passedCourses = (student: Student): TranscriptCourse[] =>
  student.records
    .filter(r => r.status === 'PASSED')
    .map(r => ({
      code: r.courseCode,
      nameAr: r.courseNameAr,
      nameEn: r.courseNameEn,
      credits: r.credits,
      grade: r.grade || 'P',
      semester: r.semesterName,
    }));

const LOOPBACK_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0)$/i;

/** This computer's address on the local network (Wi-Fi / Ethernet), so phones on the same network can open links. */
function lanAddress(): string | null {
  const candidates: { address: string; score: number }[] = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const a of addresses || []) {
      if ((a.family as unknown) !== 'IPv4' && (a.family as unknown) !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      let score = 0;
      if (/wi-?fi|wlan|wireless|^wl|^en\d|^eth\d|ethernet/i.test(name)) score += 3;
      if (/vethernet|virtualbox|vbox|vmware|docker|^br-|^veth|wsl|hyper-v|tailscale|zerotier|hamachi|vpn|^tun|^tap|^utun/i.test(name)) score -= 6;
      if (a.address.startsWith('192.168.')) score += /^192\.168\.(56|99)\./.test(a.address) ? -2 : 2;
      else if (a.address.startsWith('10.')) score += 1;
      candidates.push({ address: a.address, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0]?.address ?? null;
}

interface RequestLike {
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
  get(name: string): string | undefined;
}

/**
 * The address to put in the QR code. In order: PUBLIC_APP_URL, APP_URL (AI
 * Studio / Cloud Run), Render's public URL, the address the app was opened
 * with, and — when that is localhost — this computer's network address, which
 * phones on the same Wi-Fi can open.
 */
export function publicBaseUrl(req: RequestLike): { url: string; reachable: boolean } {
  const configured = [process.env.PUBLIC_APP_URL, process.env.APP_URL, process.env.RENDER_EXTERNAL_URL]
    .map(v => (v || '').trim())
    .find(v => /^https?:\/\/[^\s/]+/i.test(v));
  if (configured) return { url: configured.replace(/\/+$/, ''), reachable: true };

  const first = (value: string | string[] | undefined) => String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();
  const proto = first(req.headers['x-forwarded-proto']) || req.protocol || 'http';
  const host = first(req.headers['x-forwarded-host']) || req.get('host') || 'localhost:3000';
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(host);
  const hostname = match?.[1] ?? host;
  const port = match?.[2];

  if (!LOOPBACK_HOST.test(hostname)) return { url: `${proto}://${host}`, reachable: true };

  // Inside a container the network address is the container's own, which phones cannot reach.
  const inContainer = fs.existsSync('/.dockerenv');
  const lan = inContainer ? null : lanAddress();
  if (lan) return { url: `${proto}://${lan}${port ? `:${port}` : ''}`, reachable: true };
  return { url: `${proto}://${host}`, reachable: false };
}

export class UniversityReportService {
  /** Signed verification code: VT-<student code>-<GPA×100>-<credits>-<issued, base 36>-<signature>. */
  public static createToken(student: Student, issuedAt: Date): string {
    const code = encodeCode(student.studentCode);
    const gpa = String(Math.round((Number(student.cumulativeGpa) || 0) * 100));
    const credits = String(Math.max(0, Math.round(Number(student.completedCredits) || 0)));
    const issued = Math.floor(issuedAt.getTime() / 1000).toString(36).toUpperCase();
    return ['VT', code, gpa, credits, issued, sign([code, gpa, credits, issued])].join('-');
  }

  /** Check a verification code's signature and read what it certifies. */
  public static readToken(
    token: string
  ): { ok: true; studentCode: string; cumulativeGpa: number; completedCredits: number; issuedAt: Date } | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' } {
    const match = /^VT-(~?[A-Za-z0-9]{1,64})-(\d{1,3})-(\d{1,4})-([0-9A-Za-z]{1,10})-([0-9A-Fa-f]{16})$/.exec((token || '').trim());
    if (!match) return { ok: false, reason: 'MALFORMED' };
    const [, code, gpa, credits, issuedRaw, signature] = match;
    const issued = issuedRaw.toUpperCase();
    const expected = Buffer.from(sign([code, gpa, credits, issued]));
    const given = Buffer.from(signature.toUpperCase());
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, reason: 'BAD_SIGNATURE' };
    const seconds = parseInt(issued, 36);
    if (!Number.isFinite(seconds)) return { ok: false, reason: 'MALFORMED' };
    return {
      ok: true,
      studentCode: decodeCode(code),
      cumulativeGpa: Number(gpa) / 100,
      completedCredits: Number(credits),
      issuedAt: new Date(seconds * 1000),
    };
  }

  /** Issue an official transcript with a verification code and a scannable QR code. */
  public static async generateOfficialTranscript(student: Student, req: RequestLike): Promise<VerifiedTranscriptReport> {
    const issuedAt = new Date();
    // The token keeps whole seconds, so the issue time shown everywhere matches it.
    issuedAt.setMilliseconds(0);
    const token = this.createToken(student, issuedAt);
    const base = publicBaseUrl(req);
    const verificationUrl = `${base.url}/verify/${token}`;
    const qrSvg = await QRCode.toString(verificationUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#0f1311', light: '#ffffff' },
    });
    const state = standing(student.cumulativeGpa);

    return {
      verificationToken: token,
      verificationUrl,
      qrCodePayloadUrl: verificationUrl,
      qrSvg,
      verificationReachable: base.reachable,
      studentCode: student.studentCode,
      studentNameAr: student.nameAr,
      studentNameEn: student.nameEn,
      degreeProgramAr: DEGREE_PROGRAM_AR,
      degreeProgramEn: DEGREE_PROGRAM_EN,
      issuedAt: issuedAt.toISOString(),
      cumulativeGpa: student.cumulativeGpa,
      completedCredits: student.completedCredits,
      totalRequiredCredits: INSTITUTION.totalCredits,
      academicStandingAr: state.ar,
      academicStandingEn: state.en,
      courses: passedCourses(student),
    };
  }

  /** Check a verification code and load the record it belongs to (used by the QR page and the API). */
  public static async verifyTranscript(token: string): Promise<TranscriptVerification> {
    const base = {
      token,
      totalRequiredCredits: INSTITUTION.totalCredits,
      degreeProgramAr: DEGREE_PROGRAM_AR,
      degreeProgramEn: DEGREE_PROGRAM_EN,
    };
    const claims = this.readToken(token);
    if (!claims.ok) return { ...base, valid: false, reason: claims.reason };

    const student = await StudentRepository.findByCode(claims.studentCode);
    // findByCode falls back to another student when the code is unknown, so compare.
    if (!student || student.studentCode !== claims.studentCode) {
      return { ...base, valid: false, reason: 'STUDENT_NOT_FOUND', issuedAt: claims.issuedAt.toISOString() };
    }

    return {
      ...base,
      valid: true,
      issuedAt: claims.issuedAt.toISOString(),
      issued: { cumulativeGpa: claims.cumulativeGpa, completedCredits: claims.completedCredits },
      student: {
        code: student.studentCode,
        nameAr: plainName(student.nameAr),
        nameEn: plainName(student.nameEn),
        track: student.track,
        level: student.level,
        cumulativeGpa: student.cumulativeGpa,
        completedCredits: student.completedCredits,
      },
      courses: passedCourses(student),
    };
  }
}
