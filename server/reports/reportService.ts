import crypto from 'crypto';
import { Student } from '../../src/types/index.js';

export interface VerifiedTranscriptReport {
  verificationToken: string;
  qrCodePayloadUrl: string;
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
  courses: {
    code: string;
    nameAr: string;
    nameEn: string;
    credits: number;
    grade: string;
    semester: string;
  }[];
}

export class UniversityReportService {
  private static tokensDb = new Map<string, VerifiedTranscriptReport>();

  /**
   * Generate an official tamper-proof transcript record with a verifiable token
   */
  public static generateOfficialTranscript(student: Student, hostUrl: string = 'http://localhost:3000'): VerifiedTranscriptReport {
    // Cryptographically secure token
    const token = `VT-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;

    const report: VerifiedTranscriptReport = {
      verificationToken: token,
      qrCodePayloadUrl: `${hostUrl}/api/reports/verify/${token}`,
      studentCode: student.studentCode,
      studentNameAr: student.nameAr,
      studentNameEn: student.nameEn,
      degreeProgramAr: 'بكالوريوس علوم الحاسب (برنامج الساعات المعتمدة)',
      degreeProgramEn: 'B.Sc. in Computer Science (Credit-Hour System)',
      issuedAt: new Date().toISOString(),
      cumulativeGpa: student.cumulativeGpa,
      completedCredits: student.completedCredits,
      totalRequiredCredits: 134,
      academicStandingAr: student.cumulativeGpa >= 2.0 ? 'وضع أكاديمي سليم' : 'تحت الإنذار الأكاديمي',
      academicStandingEn: student.cumulativeGpa >= 2.0 ? 'Good Academic Standing' : 'Academic Warning',
      courses: student.records.filter(r => r.status === 'PASSED').map(r => ({
        code: r.courseCode,
        nameAr: r.courseNameAr,
        nameEn: r.courseNameEn,
        credits: r.credits,
        grade: r.grade || 'P',
        semester: r.semesterName,
      })),
    };

    this.tokensDb.set(token, report);
    return report;
  }

  /**
   * Public verification check used when scanning the transcript QR code
   */
  public static verifyTranscriptToken(token: string): { verified: boolean; data?: Partial<VerifiedTranscriptReport>; error?: string } {
    const report = this.tokensDb.get(token);
    if (!report) {
      return { verified: false, error: 'رمز التحقق غير موجود أو غير صالح' };
    }

    // Return safe verification info without private contact details
    return {
      verified: true,
      data: {
        verificationToken: report.verificationToken,
        studentCode: report.studentCode,
        studentNameAr: report.studentNameAr,
        studentNameEn: report.studentNameEn,
        degreeProgramAr: report.degreeProgramAr,
        degreeProgramEn: report.degreeProgramEn,
        issuedAt: report.issuedAt,
        cumulativeGpa: report.cumulativeGpa,
        completedCredits: report.completedCredits,
        academicStandingAr: report.academicStandingAr,
        academicStandingEn: report.academicStandingEn,
      },
    };
  }
}
