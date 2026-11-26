import { Router, Request, Response } from 'express';
import { RegistrationCenterService, RegistrationError, CenterCaller } from '../services/registrationCenterService.js';
import { sendXlsx } from '../services/excel.js';

/**
 * /registration — following this term's registration and registering for students.
 *   GET  /overview                         every student I follow and where they are (advisor: mine; staff: all)
 *   GET  /overview.xlsx?stage=&level=&q=   the same list as an Excel sheet (e.g. stage=NOT_STARTED)
 *   GET  /sections                         sections with the real number of students in each
 *   GET  /sections/:offeringId/students    the students registered in a section, by name (+ .xlsx)
 *   GET  /courses/:code/students.xlsx      every section of a course in one workbook
 *   POST /students/:id/check               bylaw check of sections for a student
 *   POST /students/:id/enroll              register them (advisor; administrator also as an exception)
 *   POST /students/:id/drop                remove a course registered this term (before marks)
 *   POST /freshmen/auto-register           register every first-term student automatically (administrator)
 */
export function createRegistrationRouter(getCaller: (req: Request) => any): Router {
  const router = Router();

  const handle =
    (fn: (caller: CenterCaller | null, req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const caller = getCaller(req) as CenterCaller | null;
      if (!caller) {
        return res.status(401).json({ error: 'UNAUTHORIZED', messageAr: 'غير مصرح: يرجى تسجيل الدخول.', messageEn: 'Unauthorized: Authentication required.' });
      }
      try {
        const result = await fn(caller, req, res);
        if (!res.headersSent) res.json(result);
      } catch (err: any) {
        if (err instanceof RegistrationError) {
          return res.status(err.status).json({ error: 'REGISTRATION', messageAr: err.messageAr, messageEn: err.messageEn, ...err.extra });
        }
        console.error('[Registration]', err?.message || err);
        return res.status(500).json({ error: 'REGISTRATION_FAILED', messageAr: 'تعذّر تنفيذ العملية، حاول مرة أخرى.', messageEn: 'The operation failed. Please try again.' });
      }
    };

  const offeringIdsOf = (req: Request): string[] => (Array.isArray(req.body?.offeringIds) ? req.body.offeringIds.map(String) : []);

  router.get('/overview', handle(caller => RegistrationCenterService.overview(caller)));
  router.get(
    '/overview.xlsx',
    handle(async (caller, req, res) => {
      const q = req.query as Record<string, string | undefined>;
      const { buffer, filename } = await RegistrationCenterService.overviewWorkbook(caller, {
        stage: q.stage,
        level: q.level,
        q: q.q,
        advisorId: q.advisorId,
      });
      sendXlsx(res, buffer, filename);
    })
  );
  router.get('/sections', handle(caller => RegistrationCenterService.sections(caller)));
  router.get('/sections/:offeringId/students', handle((caller, req) => RegistrationCenterService.sectionRoster(caller, req.params.offeringId)));
  router.get(
    '/sections/:offeringId/students.xlsx',
    handle(async (caller, req, res) => {
      const { buffer, filename } = await RegistrationCenterService.sectionWorkbook(caller, req.params.offeringId);
      sendXlsx(res, buffer, filename);
    })
  );
  router.get('/courses/:code/students', handle((caller, req) => RegistrationCenterService.courseRoster(caller, req.params.code)));
  router.get(
    '/courses/:code/students.xlsx',
    handle(async (caller, req, res) => {
      const { buffer, filename } = await RegistrationCenterService.courseWorkbook(caller, req.params.code);
      sendXlsx(res, buffer, filename);
    })
  );
  router.post(
    '/students/:id/check',
    handle(async (caller, req) => RegistrationCenterService.publicCheck(await RegistrationCenterService.check(caller, req.params.id, offeringIdsOf(req))))
  );
  router.post(
    '/students/:id/enroll',
    handle((caller, req) =>
      RegistrationCenterService.enroll(caller, req.params.id, offeringIdsOf(req), {
        override: req.body?.override === true,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
        note: typeof req.body?.note === 'string' ? req.body.note : '',
      })
    )
  );
  router.post(
    '/students/:id/drop',
    handle((caller, req) =>
      RegistrationCenterService.drop(caller, req.params.id, String(req.body?.offeringId || req.body?.courseCode || ''), typeof req.body?.reason === 'string' ? req.body.reason : '')
    )
  );
  router.post(
    '/freshmen/auto-register',
    handle(async caller => {
      if (caller?.role !== 'ADMIN') {
        throw new RegistrationError(403, 'التسجيل التلقائي للمستجدين يشغّله مدير النظام.', 'Only the administrator runs the automatic first-term registration.');
      }
      return RegistrationCenterService.autoRegisterAllFreshmen();
    })
  );

  return router;
}
