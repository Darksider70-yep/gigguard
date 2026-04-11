import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

import { validateConfig } from './config';
validateConfig();

import { IPaymentDriver } from './drivers/interface';
import { DummyDriver } from './drivers/dummy/driver';
import { RazorpayDriver } from './drivers/razorpay/driver';

export const activeDriver: IPaymentDriver = process.env.PAYMENT_DRIVER === 'razorpay' 
  ? new RazorpayDriver() 
  : new DummyDriver();

import ordersRouter from './routes/orders';
import disbursementsRouter from './routes/disbursements';
import healthRouter from './routes/health';
import ledgerRouter from './routes/ledger';
import webhooksRouter from './routes/webhooks';
import { renderCheckoutUI } from './drivers/dummy/ui';

const app = express();
app.use(express.json());

app.use('/orders', ordersRouter);
app.use('/disbursements', disbursementsRouter);
app.use('/ledger', ledgerRouter);
app.use('/webhooks', webhooksRouter);
app.use('/', healthRouter);

app.get('/ui/checkout', (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).send('Not found');
  const html = renderCheckoutUI({
    order_id: req.query.order_id as string,
    amount_paise: Number(req.query.amount),
    worker_id: req.query.worker_id as string,
    callback_url: process.env.FRONTEND_URL + '/buy-policy/callback'
  });
  res.send(html);
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => console.log(`[payment-service] Listening on port \${PORT}`));
