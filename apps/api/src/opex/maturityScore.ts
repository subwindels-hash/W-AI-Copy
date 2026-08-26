/**
 * Operational maturity score — a composite over MEASURED opex signals.
 *
 * `continuous.maturityScore` was a structural zero. It is now a deterministic
 * 0-100 composite of signals this deployment actually measures. Each component
 * only contributes when it has real data (`present`), and its weight is dropped
 * from the denominator otherwise — so the score is a weighted average over the
 * signals that exist, never a number invented over absent ones. When NO
 * component has data the function returns `{ score: 0, measured: false }`, and
 * the caller reports a structural zero rather than a fabricated maturity.
 */

export interface MaturitySignal {
  /** 0-100 contribution when present. */
  value: number;
  /** Whether this signal has real recorded data. */
  present: boolean;
  /** Relative weight in the composite. */
  weight: number;
}

export interface MaturityInputs {
  /** AI reliability / success rate (%). */
  reliabilityPct: number;
  reliabilityPresent: boolean;
  /** Safety finding closure rate (%). */
  safetyPassRatePct: number;
  safetyPresent: boolean;
  /** Human-approval completion rate (%). */
  humanApprovalPct: number;
  humanApprovalPresent: boolean;
  /** Governance coverage: any approval gate configured. */
  governanceGatesCount: number;
  /** Regulatory coverage: any regulation tracked. */
  regulationsTracked: number;
  /** Playbook readiness: average compliance (%) and whether any exist. */
  playbookAvgCompliancePct: number;
  playbooksTotal: number;
  /** Explainability confidence (%) and whether any explanation exists. */
  explanationAvgConfidencePct: number;
  explanationsAvailable: number;
  /** Safety-benchmark pass ratio (%) and whether any category was evaluated. */
  safetyBenchmarkPassPct: number;
  safetyBenchmarkCategories: number;
}

/**
 * Compute the composite. `score` is a rounded weighted average over present
 * signals; `measured` is false only when nothing has been measured.
 */
export function computeMaturityScore(inputs: MaturityInputs): { score: number; measured: boolean; componentsUsed: number } {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const signals: MaturitySignal[] = [
    { value: clamp(inputs.reliabilityPct), present: inputs.reliabilityPresent, weight: 3 },
    { value: clamp(inputs.safetyPassRatePct), present: inputs.safetyPresent, weight: 3 },
    { value: clamp(inputs.humanApprovalPct), present: inputs.humanApprovalPresent, weight: 2 },
    // Coverage signals are binary readiness: having any is 100, none is absent.
    { value: 100, present: inputs.governanceGatesCount > 0, weight: 1 },
    { value: 100, present: inputs.regulationsTracked > 0, weight: 1 },
    { value: clamp(inputs.playbookAvgCompliancePct), present: inputs.playbooksTotal > 0, weight: 1 },
    { value: clamp(inputs.explanationAvgConfidencePct), present: inputs.explanationsAvailable > 0, weight: 1 },
    { value: clamp(inputs.safetyBenchmarkPassPct), present: inputs.safetyBenchmarkCategories > 0, weight: 2 },
  ];

  const present = signals.filter((s) => s.present);
  if (present.length === 0) return { score: 0, measured: false, componentsUsed: 0 };

  const totalWeight = present.reduce((sum, s) => sum + s.weight, 0);
  const weighted = present.reduce((sum, s) => sum + s.value * s.weight, 0);
  return { score: Math.round(weighted / totalWeight), measured: true, componentsUsed: present.length };
}
