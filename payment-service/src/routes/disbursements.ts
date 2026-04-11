import { Router } from 'express';
import { activeDriver } from '../index';
import { serviceAuth } from '../middleware/serviceAuth';

const router = Router();

router.post('/', serviceAuth, async (req, res) => {
  try {
    const result = await activeDriver.createDisbursement(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reverse', serviceAuth, async (req, res) => {
  try {
    await activeDriver.reverseDisbursement(req.params.id, req.body.reason || 'manual reversal');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
