/**
 * GigGuard Unified Design System Tokens
 * Used for consistent styling across Worker and Insurer portals.
 */

export const DESIGN_TOKENS = {
  colors: {
    bg: {
      base: '#0A0A0B',
      surface: '#121214',
      elevated: '#1C1C1F',
    },
    accent: {
      saffron: '#F59E0B',
      saffronDim: 'rgba(245, 158, 11, 0.15)',
      green: '#10B981',
      red: '#EF4444',
      blue: '#3B82F6',
      purple: '#8B5CF6',
    },
    text: {
      primary: '#F9FAFB',
      secondary: '#D1D5DB',
      muted: '#6B7280',
    },
    border: {
      default: '#27272A',
      bright: '#3F3F46',
    }
  },
  shadows: {
    saffronGlow: '0 0 24px rgba(245, 158, 11, 0.32)',
  },
  typography: {
    display: 'Sora, sans-serif',
    mono: 'JetBrains Mono, monospace',
  }
} as const;

export const STATUS_STYLES = {
  claim: {
    approved: { label: 'Approved', color: 'accent.green', icon: 'check-circle' },
    denied: { label: 'Denied', color: 'accent.red', icon: 'x-circle' },
    under_review: { label: 'Reviewing', color: 'accent.saffron', icon: 'clock' },
    paid: { label: 'Paid Out', color: 'accent.green', icon: 'zap' },
  },
  policy: {
    active: { label: 'Active', bg: 'bg.elevated', border: 'accent.green' },
    expired: { label: 'Expired', bg: 'bg.elevated', border: 'border.default' },
  }
} as const;

export const LAYOUT = {
  worker: {
    padding: 'px-4 py-6',
    card: 'rounded-2xl bg-surface border border-zinc-800 p-5',
  },
  insurer: {
    padding: 'px-8 py-8',
    card: 'rounded-xl bg-surface border border-zinc-800 p-6',
  }
} as const;
