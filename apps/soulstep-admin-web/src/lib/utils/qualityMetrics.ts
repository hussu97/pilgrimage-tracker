/**
 * The single quality gate threshold shared by all three gates
 * (image download, enrichment, sync). Must match place_quality.py constants.
 */
export const GATE_THRESHOLD = 0.75;

/** Format a quality score (0–1) as a fixed-2 decimal string, or "—" for null. */
export function formatScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return score.toFixed(2);
}

/** Tailwind bg class for a raw factor score bar (0–1). */
export function scoreBarColor(rawScore: number): string {
  if (rawScore >= GATE_THRESHOLD) return "bg-green-500";
  if (rawScore >= 0.5) return "bg-yellow-400";
  return "bg-red-400";
}

/** Tailwind text class for a raw factor score or total quality score (0–1). */
export function scoreTextColor(rawScore: number): string {
  if (rawScore >= GATE_THRESHOLD) return "text-green-600 dark:text-green-400";
  if (rawScore >= 0.5) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
}

/** Hex fill color for a quality gate label. */
export function gateColor(gate: string): string {
  switch (gate) {
    case "below_image_gate":
      return "#ef4444";
    case "below_enrichment_gate":
      return "#f59e0b";
    case "below_sync_gate":
      return "#f97316";
    case "passed":
      return "#10b981";
    default:
      return "#6b7280";
  }
}

/** Human-readable label for a quality gate. */
export function formatGateLabel(gate: string): string {
  switch (gate) {
    case "below_image_gate":
      return "Below Image Gate";
    case "below_enrichment_gate":
      return "Below Enrichment Gate";
    case "below_sync_gate":
      return "Below Sync Gate";
    case "passed":
      return "Passed";
    default:
      return gate;
  }
}
