import { Router, Request, Response } from 'express';
import { EquivalencyService } from '../services/equivalencyService.js';
import { RegistrationError, CenterCaller } from '../services/registrationCenterService.js';

/**
 * /equivalency — transfer students (طلاب الموازنة).
 *   GET    /cases               all equivalencies (advisor: their students)
 *   GET    /cases/:id
 *   POST   /preview             grades and decisions for a list of courses, without saving
 *   POST   /cases               open one (existing student, or a new transfer student account)
 *   PUT    /cases/:id           change a draft
 *   POST   /cases/:id/approve   credit the accepted courses to the student's record
 *   DELETE /cases/:id           delete a draft
 */
export function createEquivalencyRouter(getCaller: (req: Request) => any): Router {
  const router = Router();
  const handle =
    (fn: (caller: CenterCaller | null, req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const caller = getCaller(req) as CenterCaller | null;
      if (!caller) {
        return res.status(401).json({ error: 'UNAUTHORIZED', messageAr: 'غير مصرح: يرجى تسجيل الدخول.', messageEn: 'Unauthorized: Authentication required.' });
      }
      try {
        res.json(await fn(caller, req));
      } catch (err: any) {
        if (err instanceof RegistrationError) {
          return res.status(err.status).json({ error: 'EQUIVALENCY', messageAr: err.messageAr, messageEn: err.messageEn, ...err.extra });
        }
        console.error('[Equivalency]', err?.message || err);
        const dbDown = /Can't reach database|ECONNREFUSED|P1001|P2021|does not exist/i.test(String(err?.message || ''));
        return res.status(dbDown ? 503 : 500).json({
          error: dbDown ? 'DATABASE_UNAVAILABLE' : 'EQUIVALENCY_FAILED',
          messageAr: dbDown ? 'الموازنة تحتاج قاعدة البيانات، وهي غير متاحة الآن.' : 'تعذّر تنفيذ العملية، حاول مرة أخرى.',
          messageEn: dbDown ? 'Equivalency needs the database, which is not available right now.' : 'The operation failed. Please try again.',
        });
      }
    };

  router.get('/cases', handle(caller => EquivalencyService.list(caller)));
  router.get('/cases/:id', handle((caller, req) => EquivalencyService.get(caller, req.params.id)));
  router.post('/preview', handle((caller, req) => EquivalencyService.preview(caller, req.body || {})));
  router.post('/cases', handle((caller, req) => EquivalencyService.create(caller, req.body || {})));
  router.put('/cases/:id', handle((caller, req) => EquivalencyService.update(caller, req.params.id, req.body || {})));
  router.post('/cases/:id/approve', handle((caller, req) => EquivalencyService.approve(caller, req.params.id)));
  router.delete('/cases/:id', handle((caller, req) => EquivalencyService.remove(caller, req.params.id)));
  return router;
}
