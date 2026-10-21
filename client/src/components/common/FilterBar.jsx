import { useEffect, useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';

/** Text search that only reports a value once typing pauses (one request, not one per key). */
function SearchField({ field, value, onChange }) {
  const [text, setText] = useState(value ?? '');
  const [syncedValue, setSyncedValue] = useState(value);
  const debounced = useDebounce(text);

  // When the value changes from outside (e.g. "Clear filters"), reset the box. Adjusting state
  // during render is React's recommended pattern for this (no extra effect + re-render).
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value ?? '');
  }

  useEffect(() => {
    if (debounced !== (value ?? '')) onChange({ [field.name]: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to the debounced text
  }, [debounced]);

  return (
    <input
      type="search"
      className="input"
      placeholder={field.placeholder ?? 'Search…'}
      value={text}
      onChange={(e) => setText(e.target.value)}
      aria-label={field.label}
    />
  );
}

/**
 * One row of filters above a list or chart.
 * fields: [{ name, label, type: 'select' | 'search' | 'date' | 'checkbox', options?, placeholder? }]
 * onChange receives only the changed key(s), e.g. { priority: 'HIGH' }.
 */
export default function FilterBar({ fields, values, onChange, onReset }) {
  const active = fields.some((f) => values[f.name] && values[f.name] !== f.defaultValue);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {fields.map((field) => (
        <label
          key={field.name}
          className={`flex flex-col gap-1 text-xs font-medium text-slate-500 ${field.type === 'search' ? 'min-w-48 flex-1' : ''}`}
        >
          {field.type !== 'checkbox' && field.label}
          {field.type === 'search' && (
            <SearchField field={field} value={values[field.name]} onChange={onChange} />
          )}
          {field.type === 'select' && (
            <select
              className="input"
              value={values[field.name] ?? ''}
              onChange={(e) => onChange({ [field.name]: e.target.value })}
            >
              <option value="">{field.placeholder ?? 'All'}</option>
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {field.type === 'date' && (
            <input
              type="date"
              className="input"
              value={values[field.name] ?? ''}
              onChange={(e) => onChange({ [field.name]: e.target.value })}
            />
          )}
          {field.type === 'checkbox' && (
            <span className="flex h-9.5 items-center gap-2 text-sm font-normal text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                checked={Boolean(values[field.name])}
                onChange={(e) => onChange({ [field.name]: e.target.checked })}
              />
              {field.label}
            </span>
          )}
        </label>
      ))}
      {onReset && active && (
        <button type="button" className="btn-ghost" onClick={onReset}>
          Clear filters
        </button>
      )}
    </div>
  );
}
