import Loader from './Loader';
import { EmptyState, ErrorState } from './States';

/**
 * Generic table used by every list page.
 *
 * columns: [{ key, header, render?(row), sortKey?, className? }]
 * sort:    current server sort ("deadline" / "-deadline"); clicking a sortable header toggles it.
 * Handles the loading, error and empty states so pages don't repeat that logic.
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  status,
  error,
  onRetry,
  sort,
  onSortChange,
  onRowClick,
  empty,
  rowClassName,
}) {
  const loading = status === 'loading' || status === 'idle';
  const sortField = sort?.replace(/^-/, '');
  const descending = sort?.startsWith('-');

  const toggleSort = (key) => {
    if (!onSortChange) return;
    onSortChange(sortField === key && !descending ? `-${key}` : key);
  };

  if (status === 'failed') return <ErrorState message={error} onRetry={onRetry} />;
  if (!loading && rows.length === 0) return empty ?? <EmptyState />;

  return (
    <div className="relative overflow-x-auto">
      {loading && rows.length > 0 && (
        <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/60 pt-10">
          <Loader size="sm" />
        </div>
      )}
      {loading && rows.length === 0 ? (
        <div className="py-12">
          <Loader />
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => {
                const sortable = Boolean(col.sortKey && onSortChange);
                const active = sortable && sortField === col.sortKey;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}
                    className={`whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${col.className ?? ''}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.sortKey)}
                        className="inline-flex items-center gap-1 uppercase hover:text-slate-800"
                      >
                        {col.header}
                        <span aria-hidden className={active ? 'text-slate-800' : 'text-slate-300'}>
                          {active && descending ? '↓' : '↑'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`${onRowClick ? 'cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none' : ''} ${rowClassName?.(row) ?? ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 align-top text-slate-700 ${col.className ?? ''}`}
                  >
                    {col.render ? col.render(row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
