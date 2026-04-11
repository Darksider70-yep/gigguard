export const paymentClient = {
  createOrder:        async (body: object) => post('/orders', body),
  getOrder:           async (id: string)   => get(`/orders/${id}`),
  verifyOrder:        async (id: string, body: object) => post(`/orders/${id}/verify`, body),
  createDisbursement: async (body: object) => post('/disbursements', body),
  getDisbursement:    async (id: string)   => get(`/disbursements/${id}`),
  retryDisbursement:  async (id: string)   => post(`/disbursements/${id}/retry`, {}),
};

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://payment-service:5002';
const SERVICE_KEY = process.env.PAYMENT_SERVICE_KEY!;

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${PAYMENT_SERVICE_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': SERVICE_KEY },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Payment service error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${PAYMENT_SERVICE_URL}${path}`, {
    headers: { 'X-Service-Key': SERVICE_KEY },
  });
  if (!res.ok) throw new Error(`Payment service error: ${res.status}`);
  return res.json();
}
