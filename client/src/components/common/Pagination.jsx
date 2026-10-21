import { PAGE_SIZE_OPTIONS } from '../../utils/constants';
import { formatNumber } from '../../utils/format';

/** Server-side pagination controls: "Showing 21–40 of 132" + page size + prev/next. */
export default function Pagination({ pagination, onPageChange, onLimitChange }) {
  const { page, limit, total, totalPages } = pagination;
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row"
    >
      <p>
        Showing <span className="font-medium">{formatNumber(from)}</span>–
        <span className="font-medium">{formatNumber(to)}</span> of{' '}
        <span className="font-medium">{formatNumber(total)}</span>
      </p>
      <div className="flex items-center gap-2">
        {onLimitChange && (
          <label className="flex items-center gap-1">
            <span className="sr-only sm:not-sr-only">Rows</span>
            <select
              className="input py-1"
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="btn-secondary px-3 py-1"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span aria-current="page">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="btn-secondary px-3 py-1"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
