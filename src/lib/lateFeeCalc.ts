export interface LateFeeConfig {
  penalty_pct: number;        // % multa fixa (ex: 10)
  interest_monthly_pct: number; // % juros mensal (ex: 1)
  max_interest_days: number;  // limite dias para juros (ex: 365)
  grace_days: number;         // dias tolerância (ex: 0)
}

export interface LateFeeResult {
  daysLate: number;
  penalty: number;
  interest: number;
  charges: number;
  total: number;
}

export const DEFAULT_LATE_FEE_CONFIG: LateFeeConfig = {
  penalty_pct: 10,
  interest_monthly_pct: 1,
  max_interest_days: 365,
  grace_days: 0,
};

export function calculateLateFees(
  amount: number,
  daysLate: number,
  config: LateFeeConfig = DEFAULT_LATE_FEE_CONFIG
): LateFeeResult {
  const effectiveDays = Math.max(0, daysLate - config.grace_days);
  const cappedDays = Math.min(effectiveDays, config.max_interest_days);

  if (cappedDays <= 0) {
    return { daysLate: 0, penalty: 0, interest: 0, charges: 0, total: amount };
  }

  const penalty = Math.round(amount * (config.penalty_pct / 100) * 100) / 100;
  const interest = Math.round(amount * (config.interest_monthly_pct / 100) * (cappedDays / 30) * 100) / 100;
  const charges = penalty + interest;

  return {
    daysLate: cappedDays,
    penalty,
    interest,
    charges,
    total: Math.round((amount + charges) * 100) / 100,
  };
}
