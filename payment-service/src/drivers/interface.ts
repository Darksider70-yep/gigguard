export interface CreateOrderParams {
  worker_id:       string;
  amount_paise:    number;   // ₹44 = 4400 paise
  coverage_tier:   number;
  coverage_amount: number;
  idempotency_key: string;   // worker_id + ":" + week_start
  metadata?:       Record<string, any>;
}

export interface CreateOrderResult {
  order_id:       string;    // payment_orders.id
  driver_order_id: string;   // Razorpay order_id or dummy reference
  amount_paise:   number;
  status:         'created';
  checkout_data:  Record<string, any>;
}

export interface VerifyOrderParams {
  order_id:          string;
  driver_payment_id: string;
  driver_order_id:   string;
  driver_signature:  string;
}

export interface VerifyOrderResult {
  success:    boolean;
  order_id:   string;
  amount_paise: number;
  error?:     string;
}

export interface CreateDisbursementParams {
  claim_id:      string;
  worker_id:     string;
  amount_paise:  number;
  upi_address?:  string;
  metadata?:     Record<string, any>;
}

export interface CreateDisbursementResult {
  disbursement_id:    string;
  driver_transfer_id: string | null;  // null if async (Razorpay processes async)
  status:             'pending' | 'processing' | 'paid';
}

export interface IPaymentDriver {
  readonly name: 'dummy' | 'razorpay';

  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  verifyOrder(params: VerifyOrderParams): Promise<VerifyOrderResult>;

  createDisbursement(params: CreateDisbursementParams): Promise<CreateDisbursementResult>;
  reverseDisbursement(disbursement_id: string, reason: string): Promise<void>;

  getDisbursementStatus?(driver_transfer_id: string): Promise<string>;
}
