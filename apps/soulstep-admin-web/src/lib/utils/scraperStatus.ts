export function statusVariant(s: string | null) {
  if (!s) return "neutral" as const;
  if (s === "completed") return "success" as const;
  if (s === "failed") return "danger" as const;
  if (s === "running") return "info" as const;
  if (s === "cancelled") return "warning" as const;
  return "neutral" as const;
}
