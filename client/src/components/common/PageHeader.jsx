/** Page title row with an optional description and actions on the right. */
export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** White panel used to group a table, chart or form. */
export function Card({ title, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          {/* Text titles are headings; a custom node (e.g. tabs) is rendered as-is. */}
          {typeof title === 'string' ? (
            <h2 className="font-semibold text-slate-800">{title}</h2>
          ) : (
            title
          )}
          {actions}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
