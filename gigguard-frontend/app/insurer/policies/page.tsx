'use client';

import AuthGuard from '@/components/AuthGuard';
import InsurerNav from '@/components/layout/InsurerNav';

export default function InsurerPoliciesPage() {
  return (
    <AuthGuard allowedRoles={['insurer']}>
      <InsurerNav title="Policies" subtitle="Active policy portfolio view." />
      <section className="surface-card p-5 text-sm text-secondary">
        Policy-level drilldown can be derived from workers and payouts views for demo presentation.
      </section>
    </AuthGuard>
  );
}

