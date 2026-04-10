'use client';

import Link from 'next/link';

interface InsurerNavProps {
  title: string;
  subtitle?: string;
}
const BACK_ARROW = '\u2190';

export default function InsurerNav({ title, subtitle }: InsurerNavProps) {
  return (
    <header className="mb-6 space-y-2">
      <Link href="/insurer" className="inline-block text-sm text-muted transition hover:text-secondary">
        {`${BACK_ARROW} Insurer Dashboard`}
      </Link>
      <h1 className="text-3xl font-semibold">{title}</h1>
      {subtitle ? <p className="text-sm text-secondary">{subtitle}</p> : null}
    </header>
  );
}

