/** Shown when a request succeeded but there is nothing to display. */
export function EmptyState({ title = 'Nothing here yet', message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"
        aria-hidden
      >
        ∅
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {message && <p className="max-w-md text-sm text-slate-500">{message}</p>}
      {action}
    </div>
  );
}

/** Shown when a request failed; offers a retry instead of a dead end. */
export function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center"
    >
      <p className="font-medium text-red-700">Could not load data</p>
      <p className="max-w-md text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary">
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline error banner for forms and actions. */
export function ErrorBanner({ message, children }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <p>{message}</p>
      {children}
    </div>
  );
}
