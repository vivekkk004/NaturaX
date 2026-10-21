/** Text helpers for exception reasons. */

/** 0.5 -> "30 min", 5.2 -> "5h 12m", 50 -> "2d 2h" */
export function formatDuration(hours) {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const days = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (days > 0) return `${days}d ${h}h`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** 7499 -> "₹7,499" (Indian digit grouping: 1,00,000) */
export function formatRupees(amount) {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
