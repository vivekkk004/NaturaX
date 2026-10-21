import { formatNumber } from '../../utils/format';

const ACCENTS = {
  neutral: 'border-l-slate-300',
  brand: 'border-l-brand-600',
  warning: 'border-l-amber-500',
  danger: 'border-l-red-600',
};

/**
 * One headline number. Clickable cards (onClick) drill down into the matching list -
 * e.g. "Overdue tasks" opens the task list filtered to overdue.
 */
export default function StatCard({ label, value, hint, accent = 'neutral', onClick, loading }) {
  const content = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">
        {loading ? '…' : formatNumber(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const classes = `rounded-xl border border-l-4 border-slate-200 ${ACCENTS[accent]} bg-white p-4 text-left shadow-sm`;

  if (!onClick) return <div className={classes}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${classes} transition hover:border-slate-300 hover:shadow focus-visible:ring-2 focus-visible:ring-brand-500`}
    >
      {content}
    </button>
  );
}
