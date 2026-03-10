/** Format a quality score (0–1) as a fixed-2 decimal string, or "—" for null. */
export function formatScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return score.toFixed(2);
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
