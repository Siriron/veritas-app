const CLASS_MAP: Record<string, string> = {
  FILING_OPEN:      "badge-filing-open",
  VALIDATING:       "badge-validating",
  RANKED:           "badge-ranked",
  CHALLENGE_WINDOW: "badge-challenge-window",
  FINALIZED:        "badge-finalized",
  INCONCLUSIVE:     "badge-inconclusive",
  CANCELLED:        "badge-cancelled",
  TIMED_OUT:        "badge-timed-out",
  WINNER:           "badge-winner",
  LOSER:            "badge-loser",
  REFUNDED:         "badge-refunded",
  FILED:            "badge-filed",
  EVALUATED:        "badge-evaluated",
};

interface Props { status: string; className?: string }

export function StatusBadge({ status, className = "" }: Props) {
  const cls = CLASS_MAP[status] ?? "badge-filed";
  return (
    <span className={`badge ${cls} ${className}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
