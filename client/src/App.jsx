import { useEffect, useState } from 'react';
import { healthService } from './services/healthService';
import { getErrorMessage } from './services/api';

/**
 * Part 1 skeleton: proves the client -> Vite proxy -> Express -> MongoDB chain works end to end.
 * Replaced by the router + layout in Part 7.
 */
export default function App() {
  const [health, setHealth] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    healthService
      .check()
      .then((data) => setHealth({ loading: false, data, error: null }))
      .catch((err) => setHealth({ loading: false, data: null, error: getErrorMessage(err) }));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-semibold text-brand-700">NaturaX Order Follow-up</h1>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-medium tracking-wide text-slate-500 uppercase">
          System status
        </h2>
        {health.loading && <p className="text-slate-500">Checking API...</p>}
        {health.error && <p className="text-red-600">API unreachable: {health.error}</p>}
        {health.data && (
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">API</dt>
            <dd className="font-medium text-brand-700">{health.data.status}</dd>
            <dt className="text-slate-500">Database</dt>
            <dd className="font-medium">{health.data.database}</dd>
            <dt className="text-slate-500">Transactions</dt>
            <dd className="font-medium">{health.data.transactions ? 'enabled' : 'disabled'}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
