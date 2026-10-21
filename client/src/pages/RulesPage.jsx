import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import PageHeader from '../components/common/PageHeader';
import Loader from '../components/common/Loader';
import { ErrorBanner, ErrorState } from '../components/common/States';
import RuleCard from '../features/rules/components/RuleCard';
import { fetchRules, runRulesNow, selectRules, updateRule } from '../features/rules/rulesSlice';
import { RULE_LABELS } from '../utils/constants';
import { formatNumber } from '../utils/format';

export default function RulesPage() {
  const dispatch = useDispatch();
  const { items, status, error, saving, evaluation } = useSelector(selectRules);

  useEffect(() => {
    dispatch(fetchRules());
  }, [dispatch]);

  const save = async (ruleType, changes) => {
    const result = await dispatch(updateRule({ ruleType, changes }));
    if (updateRule.fulfilled.match(result)) {
      toast.success('Rule saved. Click "Run rules now" to apply it to existing orders.');
    }
  };

  const runNow = async () => {
    const result = await dispatch(runRulesNow());
    if (runRulesNow.fulfilled.match(result))
      toast.success(`Rules evaluated: ${result.payload.created} new tasks`);
  };

  const summary = evaluation.summary;

  return (
    <>
      <PageHeader
        title="Rule settings"
        description="Thresholds, priorities, deadlines and actions are stored in the database. Changes apply on the next evaluation (next import, the 15-minute schedule, or Run rules now) and are recorded in the audit trail."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={runNow}
            disabled={evaluation.status === 'loading'}
          >
            {evaluation.status === 'loading' ? 'Running…' : 'Run rules now'}
          </button>
        }
      />

      <ErrorBanner message={evaluation.error} />
      {summary && (
        <div
          className="mb-5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-slate-700"
          role="status"
        >
          Checked {formatNumber(summary.evaluatedOrders)} orders:{' '}
          <strong>{formatNumber(summary.created)} new tasks</strong>,{' '}
          {formatNumber(summary.reopened)} reopened, {formatNumber(summary.autoResolved)}{' '}
          auto-resolved, {formatNumber(summary.unchanged)} unchanged.
          {Object.keys(summary.createdByRule).length > 0 && (
            <span className="block text-slate-600">
              {Object.entries(summary.createdByRule)
                .map(([rule, n]) => `${RULE_LABELS[rule] ?? rule}: ${n}`)
                .join(' · ')}
            </span>
          )}
        </div>
      )}

      {status === 'loading' && items.length === 0 && <Loader />}
      {status === 'failed' && <ErrorState message={error} onRetry={() => dispatch(fetchRules())} />}
      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((rule) => (
          <RuleCard
            // Re-mount with fresh form values whenever the saved rule changes.
            key={`${rule.ruleType}-${rule.updatedAt}`}
            rule={rule}
            saving={saving.ruleType === rule.ruleType && !saving.error}
            error={saving.ruleType === rule.ruleType ? saving.error : null}
            onSave={(changes) => save(rule.ruleType, changes)}
          />
        ))}
      </div>
    </>
  );
}
