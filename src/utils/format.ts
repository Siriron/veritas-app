export function shortAddr(addr: string | null | undefined, len = 4): string {
  if (!addr) return "";
  if (addr.length <= len * 2 + 2) return addr;
  return `${addr.slice(0, len + 2)}…${addr.slice(-len)}`;
}

export function formatGen(wei: string | bigint, decimals = 4): string {
  const value = typeof wei === "string" ? BigInt(wei || "0") : wei;
  const whole = value / 10n ** 18n;
  const frac = (value % 10n ** 18n).toString().padStart(18, "0").slice(0, decimals);
  return `${whole}.${frac}`;
}

export function formatTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatCountdown(targetTs: number, nowTs = Date.now() / 1000): string {
  const diff = Math.floor(targetTs - nowTs);
  if (diff <= 0) return "closed";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
