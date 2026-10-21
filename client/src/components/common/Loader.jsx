/** Spinner with an accessible label. `fullPage` centres it in the viewport (app start-up). */
export default function Loader({ label = 'Loading…', fullPage = false, size = 'md' }) {
  const dimension = size === 'sm' ? 'h-4 w-4 border-2' : 'h-8 w-8 border-[3px]';
  const spinner = (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 text-slate-500"
    >
      <span
        className={`${dimension} animate-spin rounded-full border-slate-200 border-t-brand-600`}
      />
      {size !== 'sm' && <span className="text-sm">{label}</span>}
      {size === 'sm' && <span className="sr-only">{label}</span>}
    </div>
  );
  if (!fullPage) return spinner;
  return <div className="flex min-h-screen items-center justify-center">{spinner}</div>;
}
