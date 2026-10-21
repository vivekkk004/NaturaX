import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectCurrentUser, selectIsManager } from '../../features/auth/authSlice';
import ErrorBoundary from '../common/ErrorBoundary';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/tasks', label: 'Tasks', employeeLabel: 'My tasks' },
  { to: '/orders', label: 'Orders', employeeLabel: 'My orders' },
  { to: '/imports', label: 'Import orders', managerOnly: true },
  { to: '/reports', label: 'Daily report', managerOnly: true },
  { to: '/audit', label: 'Audit trail' },
  { to: '/rules', label: 'Rule settings', managerOnly: true },
  { to: '/employees', label: 'Employees', managerOnly: true },
];

function NavItems({ isManager, onNavigate }) {
  return NAV.filter((item) => isManager || !item.managerOnly).map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
      }
    >
      {!isManager && item.employeeLabel ? item.employeeLabel : item.label}
    </NavLink>
  ));
}

/** Shell for every signed-in page: sidebar (drawer on mobile), top bar, page content. */
export default function AppLayout() {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const isManager = useSelector(selectIsManager);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const brand = (
    <div className="flex items-center gap-2 px-3 py-4">
      <span className="text-xl font-semibold tracking-tight text-slate-900">
        Natura<span className="text-brand-600">X</span>
      </span>
      <span className="text-xs text-slate-500">Order follow-up</span>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col px-3">
          {brand}
          <nav aria-label="Main" className="flex flex-col gap-1">
            <NavItems isManager={isManager} />
          </nav>
        </div>
      </aside>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <nav
            aria-label="Main"
            className="h-full w-64 bg-white px-3"
            onClick={(e) => e.stopPropagation()}
          >
            {brand}
            <div className="flex flex-col gap-1">
              <NavItems isManager={isManager} onNavigate={() => setMenuOpen(false)} />
            </div>
          </nav>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur">
          <button
            type="button"
            className="btn-ghost lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">
                {user?.employeeCode} · {isManager ? 'Manager' : 'Employee'}
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => dispatch(logout())}>
              Log out
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {/* Keyed by path: an error on one page doesn't stick when navigating to another. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
