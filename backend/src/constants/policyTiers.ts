export interface PolicyTier {
  arm: 0 | 1 | 2 | 3;
  premium: number;
  coverage: number;
}

export const POLICY_TIERS: PolicyTier[] = [
  { arm: 0, premium: 29, coverage: 290 },
  { arm: 1, premium: 44, coverage: 440 },
  { arm: 2, premium: 65, coverage: 640 },
  { arm: 3, premium: 89, coverage: 890 },
];

export function getTierByArm(arm: number): PolicyTier {
  const tier = POLICY_TIERS.find((item) => item.arm === arm);
  if (!tier) {
    throw new Error(`Invalid arm: ${arm}`);
  }
  return tier;
}

