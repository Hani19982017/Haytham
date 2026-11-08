import { Router, Request, Response } from 'express';
import { AttendanceCaller, AttendanceError, AttendanceService } from '../services/attendanceService.js';

const sendXlsx = (res: Response, buffer: Buffer, filename: string) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
};

/**
 * /attendance — QR and manual attendance.
 *   Staff (instructor, TA; admin/department head read-only):
 *     GET  /sections                         sections I teach or assist in
 *     POST /sections/:offeringId/sessions    start a lecture/section (or return the open one)
 *     GET  /sections/:offeringId/report      whole-term register (+ .xlsx)
 *     GET  /sessions/:sessionId/live         QR code, code and check-ins
 *     POST /sessions/:sessionId/marks        mark a student by hand
 *     POST /sessions/:sessionId/close        end the session (+ warnings and report)
 *     GET  /sessions/:sessionId/report.xlsx  the session's register
 *   Students:
 *     GET  /me                               my courses with attendance figures
 *     POST /check-in                         { sessionId, token } from the QR, or { code }
 */
export function createAttendanceRouter(getCaller: (req: Request) => any): Router {
  const router = Router();

  const handle =
    (fn: (caller: AttendanceCaller, req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const caller = getCaller(req);
      if (!caller) {
        return res.status(401).json({ error: 'UNAUTHORIZED', messageAr: 'غير مصرح: يرجى تسجيل الدخول.', messageEn: 'Unauthorized: Authentication required.' });
      }
      try {
        const result = await fn(caller, req, res);
        if (!res.headersSent) res.json(result);
      } catch (err: any) {
        if (err instanceof AttendanceError) {
          return res.status(err.status).json({ error: 'ATTENDANCE', messageAr: err.messageAr, messageEn: err.messageEn });
        }
        console.error('[Attendance]', err?.message || err);
        const dbDown = /Can't reach database|ECONNREFUSED|does not exist|P1001|P2021|connect/i.test(String(err?.message || ''));
        return res.status(dbDown ? 503 : 500).json({
          error: dbDown ? 'DATABASE_UNAVAILABLE' : 'ATTENDANCE_FAILED',
          messageAr: dbDown ? 'الحضور يحتاج قاعدة البيانات، وهي غير متاحة الآن.' : 'تعذّر تنفيذ العملية، حاول مرة أخرى.',
          messageEn: dbDown ? 'Attendance needs the database, which is not available right now.' : 'The operation failed. Please try again.',
        });
      }
    };

  router.get('/sections', handle(caller => AttendanceService.sectionsFor(caller)));
  router.post('/sections/:offeringId/sessions', handle((caller, req) => AttendanceService.start(caller, req.params.offeringId, req.body?.kind, req)));
  router.get('/sections/:offeringId/report', handle((caller, req) => AttendanceService.courseReport(caller, req.params.offeringId)));
  router.get(
    '/sections/:offeringId/report.xlsx',
    handle(async (caller, req, res) => {
      const { buffer, filename } = await AttendanceService.courseWorkbook(caller, req.params.offeringId);
      sendXlsx(res, buffer, filename);
    })
  );
  router.get('/sessions/:sessionId/live', handle((caller, req) => AttendanceService.live(caller, req.params.sessionId, req)));
  router.post(
    '/sessions/:sessionId/marks',
    handle((caller, req) => AttendanceService.mark(caller, req.params.sessionId, String(req.body?.studentId || ''), String(req.body?.status || ''), req))
  );
  router.post('/sessions/:sessionId/close', handle((caller, req) => AttendanceService.close(caller, req.params.sessionId)));
  router.get(
    '/sessions/:sessionId/report.xlsx',
    handle(async (caller, req, res) => {
      const { buffer, filename } = await AttendanceService.sessionWorkbook(caller, req.params.sessionId);
      sendXlsx(res, buffer, filename);
    })
  );
  router.get('/me', handle(caller => AttendanceService.forStudent(caller)));
  router.post('/check-in', handle((caller, req) => AttendanceService.checkIn(caller, req.body || {})));

  return router;
}
