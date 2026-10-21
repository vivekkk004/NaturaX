import { useState } from 'react';
import { ErrorBanner } from '../../../components/common/States';
import { PRIORITY_LABELS } from '../../../utils/constants';
import { formatDateTime } from '../../../utils/format';

/**
 * Editor for one rule's live configuration. Local form state; "Save" sends only what changed.
 * This is where "change the dispatch deadline from 24 h to 12 h" happens in the UI.
 */
export default function RuleCard({ rule, saving, error, onSave }) {
  const [form, setForm] = useState({
    enabled: rule.enabled,
    params: { ...rule.params },
    priority: rule.priority,
    deadlineHours: rule.deadlineHours,
    action: rule.action,
  });

  const changes = {};
  if (form.enabled !== rule.enabled) changes.enabled = form.enabled;
  if (form.priority !== rule.priority) changes.priority = form.priority;
  if (Number(form.deadlineHours) !== rule.deadlineHours)
    changes.deadlineHours = Number(form.deadlineHours);
  if (form.action.trim() !== rule.action) changes.action = form.action.trim();
  const changedParams = Object.fromEntries(
    Object.entries(form.params)
      .filter(([key, value]) => Number(value) !== rule.params[key])
      .map(([key, value]) => [key, Number(value)]),
  );
  if (Object.keys(changedParams).length) changes.params = changedParams;
  const dirty = Object.keys(changes).length > 0;

  const setParam = (key, value) => setForm({ ...form, params: { ...form.params, [key]: value } });
  const fieldId = (name) => `${rule.ruleType}-${name}`;

  return (
    <section
      className={`rounded-xl border bg-white p-4 shadow-sm ${form.enabled ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-80'}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(changes);
        }}
        className="space-y-4"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">{rule.label}</h2>
            <p className="text-sm text-slate-500">{rule.description}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-400">{rule.ruleType}</p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          {rule.paramFields.map((p) => (
            <div key={p.key}>
              <label htmlFor={fieldId(p.key)} className="label">
                {p.label} <span className="font-normal text-slate-400">({p.unit})</span>
              </label>
              <input
                id={fieldId(p.key)}
                type="number"
                min="0"
                step="any"
                required
                className="input"
                value={form.params[p.key]}
                onChange={(e) => setParam(p.key, e.target.value)}
              />
            </div>
          ))}
          <div>
            <label htmlFor={fieldId('priority')} className="label">
              Priority
            </label>
            <select
              id={fieldId('priority')}
              className="input"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={fieldId('deadline')} className="label">
              Task deadline <span className="font-normal text-slate-400">(hours)</span>
            </label>
            <input
              id={fieldId('deadline')}
              type="number"
              min="0.25"
              max="720"
              step="any"
              required
              className="input"
              value={form.deadlineHours}
              onChange={(e) => setForm({ ...form, deadlineHours: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label htmlFor={fieldId('action')} className="label">
            Recommended action
          </label>
          <textarea
            id={fieldId('action')}
            rows={2}
            minLength={5}
            maxLength={500}
            required
            className="input"
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
          />
        </div>

        <ErrorBanner message={error?.message}>
          {Array.isArray(error?.details) &&
            error.details.map((d) => <p key={d.field}>{`${d.field}: ${d.message}`}</p>)}
        </ErrorBanner>

        <footer className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {rule.updatedBy
              ? `Last changed by ${rule.updatedBy.name} on ${formatDateTime(rule.updatedAt)}`
              : 'Default configuration'}
          </p>
          <button type="submit" className="btn-primary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </form>
    </section>
  );
}
