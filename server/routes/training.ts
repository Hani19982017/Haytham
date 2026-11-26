import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { TrainingService, MAX_PROOF_BYTES } from '../services/trainingService.js';
import { RegistrationError, CenterCaller } from '../services/registrationCenterService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PROOF_BYTES, files: 1 } });

/** Accept one file in the `proof` field; a file over the limit gets a clear message. */
export const proofUpload = (req: Request, res: Response, next: NextFunction) =>
  upload.single('proof')(req, res, (err: any) => {
    if (!err) return next();
    const tooBig = err?.code === 'LIMIT_FILE_SIZE';
    return res.status(400).json({
      error: 'INVALID_FILE',
      messageAr: tooBig ? 'حجم الملف أكبر من 5 ميجابايت.' : 'تعذّر قراءة الملف المرفوع.',
      messageEn: tooBig ? 'The file is larger than 5 MB.' : 'The uploaded file could not be read.',
    });
  });

/**
 * /training — summer training with proof.
 *   GET  /students/:id                 my submissions (student) / a student's (advisor, staff)
 *   POST /students/:id                 submit a period with its proof (multipart: proof + fields)
 *   GET  /review?status=PENDING        submissions to review (advisor: their students)
 *   GET  /:id/proof                    open the uploaded certificate
 *   POST /:id/review                   { decision: ACCEPT | REJECT, notes }
 */
export function createTrainingRouter(getCaller: (req: Request) => any): Router {
  const router = Router();
  const handle =
    (fn: (caller: CenterCaller | null, req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const caller = getCaller(req) as CenterCaller | null;
      if (!caller) {
        return res.status(401).json({ error: 'UNAUTHORIZED', messageAr: 'غير مصرح: يرجى تسجيل الدخول.', messageEn: 'Unauthorized: Authentication required.' });
      }
      try {
        const out = await fn(caller, req, res);
        if (!res.headersSent) res.json(out);
      } catch (err: any) {
        if (err instanceof RegistrationError) {
          return res.status(err.status).json({ error: 'TRAINING', messageAr: err.messageAr, messageEn: err.messageEn, ...err.extra });
        }
        console.error('[Training]', err?.message || err);
        return res.status(500).json({ error: 'TRAINING_FAILED', messageAr: 'تعذّر تنفيذ العملية، حاول مرة أخرى.', messageEn: 'The operation failed. Please try again.' });
      }
    };

  router.get('/review', handle((caller, req) => TrainingService.listForReview(caller, String(req.query.status || ''))));
  router.get('/students/:id', handle((caller, req) => TrainingService.listForStudent(caller, req.params.id)));
  router.post('/students/:id', proofUpload, handle((caller, req) => TrainingService.submit(caller, req.params.id, req.body || {}, (req as any).file)));
  router.get(
    '/:id/proof',
    handle(async (caller, req, res) => {
      const { buffer, mime, filename } = await TrainingService.proof(caller, req.params.id);
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    })
  );
  router.post('/:id/review', handle((caller, req) => TrainingService.review(caller, req.params.id, String(req.body?.decision || ''), String(req.body?.notes || ''))));
  return router;
}
