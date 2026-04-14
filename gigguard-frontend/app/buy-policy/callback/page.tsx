'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function PaymentCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Processing your payment...');
  const [error, setError] = useState('');
  const { isLoading, token } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    const processPayment = async () => {
      const errorMsg = searchParams.get('error');
      if (errorMsg) {
        setError(`Payment failed or was abandoned: ${errorMsg}`);
        return;
      }

      const payment_order_id = searchParams.get('payment_order_id');
      const driver_payment_id = searchParams.get('razorpay_payment_id');
      const driver_order_id = searchParams.get('razorpay_order_id');
      const driver_signature = searchParams.get('razorpay_signature');

      if (!payment_order_id || !driver_payment_id || !driver_order_id || !driver_signature) {
        setError('Missing payment verification details.');
        return;
      }

      try {
        const quoteRaw = sessionStorage.getItem('buy_policy_quote');
        const workerRaw = sessionStorage.getItem('buy_policy_worker');
        if (!quoteRaw) throw new Error('Session metadata lost. Please try purchasing again.');

        const quote = JSON.parse(quoteRaw);
        const worker = JSON.parse(workerRaw || '{}');
        const tierRaw = sessionStorage.getItem('buy_policy_tier');
        const selectedTier = tierRaw ? JSON.parse(tierRaw) : null;

        const purchase = await api.purchasePolicy({
          payment_order_id,
          razorpay_payment_id: driver_payment_id,
          razorpay_order_id: driver_order_id,
          razorpay_signature: driver_signature,
          premium_paid: selectedTier ? selectedTier.premium : Math.round(quote.premium),
          coverage_amount: selectedTier ? selectedTier.coverage : 440,
          recommended_arm: quote.recommended_arm,
          selected_arm: selectedTier ? selectedTier.arm : quote.recommended_arm,
          context_key: quote.context_key,
          arm_accepted: selectedTier ? selectedTier.arm === quote.recommended_arm : true,
        });

        sessionStorage.setItem(
          'buy_policy_purchase',
          JSON.stringify({
            ...purchase,
            zone: worker.zone || quote.worker?.zone,
            city: worker.city,
          })
        );
        router.push('/buy-policy/confirmed');
      } catch (err: any) {
        // If it's a 401, it might be that the token didn't make it to api.token yet even though isLoading is false
        // but AuthContext calls api.setToken before setting isLoading to false.
        setError(err.message || 'Payment verification failed at backend.');
      }
    };

    void processPayment();

  }, [searchParams, router, isLoading, token]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      {error ? (
        <>
          <h2 className="text-xl font-semibold text-rose-400">Payment Unsuccessful</h2>
          <p className="text-secondary text-sm">{error}</p>
          <button onClick={() => router.push('/buy-policy')} className="btn-saffron mt-4 px-6 py-2">
            Try Again
          </button>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <h2 className="text-lg font-semibold text-amber-300">{status}</h2>
        </>
      )}
    </div>
  );
}
