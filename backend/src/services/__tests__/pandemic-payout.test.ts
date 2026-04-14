import { premiumService } from '../premiumService';

describe('Pandemic Payout Calculation', () => {
  test('calculates pandemic payout at exactly 80% of daily income for 8-hour disruption', () => {
    const avgDailyEarning = 1000;
    const triggerType = 'pandemic_containment';
    
    // Formula: (avgDailyEarning / 8) * 8 hours * 0.8
    // (1000 / 8) * 8 * 0.8 = 1000 * 0.8 = 800
    const payout = premiumService.calculateCoverageAmount(avgDailyEarning, triggerType);
    
    expect(payout).toBe(800);
  });

  test('respects daily cap of 800 even if 80% calculation is higher', () => {
    const avgDailyEarning = 1200;
    const triggerType = 'pandemic_containment';
    
    // Formula: (1200 / 8) * 8 * 0.8 = 150 * 8 * 0.8 = 1200 * 0.8 = 960
    // Should be capped at 800
    const payout = premiumService.calculateCoverageAmount(avgDailyEarning, triggerType);
    
    expect(payout).toBe(800);
  });

  test('calculates correctly for lower earnings', () => {
    const avgDailyEarning = 500;
    const triggerType = 'pandemic_containment';
    
    // Formula: (500 / 8) * 8 * 0.8 = 500 * 0.8 = 400
    const payout = premiumService.calculateCoverageAmount(avgDailyEarning, triggerType);
    
    expect(payout).toBe(400);
  });
});
