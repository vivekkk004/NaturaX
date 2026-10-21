import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';
import { login, selectAuth } from '../features/auth/authSlice';
import { ErrorBanner } from '../components/common/States';

const DEMO_LOGINS = [
  { label: 'Manager', email: 'manager@naturax.in', password: 'Manager@123' },
  { label: 'Employee', email: 'priya@naturax.in', password: 'Employee@123' },
];

export default function LoginPage() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { status, loginStatus, error } = useSelector(selectAuth);
  const [form, setForm] = useState({ email: '', password: '' });

  if (status === 'authenticated') {
    return <Navigate to={location.state?.from?.pathname ?? '/dashboard'} replace />;
  }

  const submit = (event) => {
    event.preventDefault();
    dispatch(login(form));
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">
            Natura<span className="text-brand-600">X</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">D2C order follow-up</p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          noValidate
        >
          <h1 className="text-lg font-semibold text-slate-800">Sign in</h1>
          <ErrorBanner message={error} />
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loginStatus === 'loading' || !form.email || !form.password}
          >
            {loginStatus === 'loading' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Seeded demo accounts - shown only in development builds. */}
        {import.meta.env.DEV && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-600">
            <p className="mb-2 font-medium">Demo accounts</p>
            <div className="flex gap-2">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="btn-secondary h-8 flex-1 text-xs"
                  onClick={() => setForm({ email: d.email, password: d.password })}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
