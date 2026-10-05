// ────────────────────────────────────────────────────────────────────────────
// VERITAS – GenLayer fee estimation helpers
// Ported from the reference project's confirmed working pattern.
// ────────────────────────────────────────────────────────────────────────────

type FeePresetLevel = "low" | "standard" | "high";

export type FeePresetEstimate = {
  level: FeePresetLevel;
  estimate?: {
    distribution?: Record<string, unknown>;
    messageAllocations?: Record<string, unknown>[];
    feeValue?: bigint | number | string;
    fee_value?: bigint | number | string;
    observed?: Record<string, unknown>;
  };
  observed?: Record<string, unknown>;
};

const PRESET_OPTIONS: Record<FeePresetLevel, Record<string, unknown>> = {
  low: { appealRounds: 0n, rotations: [0n] },
  standard: { appealRounds: 1n, rotations: [0n, 0n] },
  high: { appealRounds: 2n, rotations: [0n, 0n, 0n] },
};

function transactionFeesFromEstimate(estimate: FeePresetEstimate["estimate"]) {
  if (!estimate?.distribution) return undefined;
  const fees: Record<string, unknown> = { distribution: estimate.distribution };
  if (estimate.messageAllocations) fees.messageAllocations = estimate.messageAllocations;
  const feeValue = estimate.feeValue ?? estimate.fee_value;
  if (feeValue !== undefined) fees.feeValue = feeValue;
  return fees;
}

export function feePresetToTransactionFees(preset?: FeePresetEstimate) {
  return transactionFeesFromEstimate(preset?.estimate);
}

export async function estimateWriteFeePreset(
  client: unknown,
  request: { address: `0x${string}`; functionName: string; args: unknown[]; value?: bigint },
  level: FeePresetLevel = "standard"
): Promise<FeePresetEstimate | undefined> {
  const c = client as Record<string, unknown>;
  if (typeof c?.estimateTransactionFees !== "function") return undefined;
  const options = PRESET_OPTIONS[level];
  const initialEstimate = await (c.estimateTransactionFees as (o: unknown) => Promise<unknown>)(options);
  let estimate = initialEstimate as FeePresetEstimate["estimate"];

  if (
    typeof c.simulateWriteContract === "function" &&
    typeof c.estimateTransactionFeesFromSimulation === "function"
  ) {
    const simulation = await (c.simulateWriteContract as (r: unknown) => Promise<unknown>)({
      ...request,
      includeReceipt: true,
      value: request.value ?? 0n,
      fees: transactionFeesFromEstimate(estimate),
    });
    estimate = (await (c.estimateTransactionFeesFromSimulation as (o: unknown) => Promise<unknown>)({
      ...options,
      simulation,
    })) as FeePresetEstimate["estimate"];
  }

  return { level, estimate, observed: (estimate as Record<string, unknown>)?.observed as Record<string, unknown> };
}
