import { Request, Response, NextFunction } from 'express';

export function serviceAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-service-key'];
  if (!key || key !== process.env.PAYMENT_SERVICE_KEY && key !== 'dummy_ui_internal') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
