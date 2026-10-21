import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  ClipboardCheck,
  FileBarChart,
  FileUp,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { logout, selectCurrentUser, selectIsManager } from '../../features/auth/authSlice';
import { fetchNavCounts, selectNavCounts } from '../../features/dashboard/dashboardSlice';
import ErrorBoundary from '../common/ErrorBoundary';

const NAV_REFRESH_MS = 2 * 60 * 1000;

/** Grouped navigation. `badge` names a live count shown next to the item. */
const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Follow-up',
    items: [
      {
        to: '/tasks',
        label: 'Tasks',
        employeeLabel: 'My tasks',
        icon: ClipboardCheck,
        badge: true,
      },
      { to: '/orders', label: 'Orders', employeeLabel: 'My orders', icon: Package },
      { to: '/audit', label: 'Audit trail', icon: History },
    ],
  },
  {
    title: 'Management',
    managerOnly: true,
    items: [
      { to: '/imports', label: 'Import orders', icon: FileUp },
      { to: '/reports', label: 'Daily report', icon: FileBarChart },
      { to: '/rules', label: 'Rule settings', icon: SlidersHorizontal },
      { to: '/employees', label: 'Employees', icon: Users },
    ],
  },
];

const initials = (name = '') =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Open-task count, with a red overdue count when something is late. */
function TaskBadges({ counts, active }) {
  if (!counts) return null;
  return (
    <span className="ml-auto flex items-center gap-1">
      {counts.overdueTasks > 0 && (
        <span
          className="rounded-full bg-red-500 px-1.5 text-[11px] leading-5 font-semibold text-white"
          title={`${counts.overdueTasks} overdue`}
        >
          {counts.overdueTasks}
        </span>
      )}
      <span
        className={`rounded-full px-1.5 text-[11px] leading-5 font-semibold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}
        title={`${counts.unresolvedTasks} open`}
      >
        {counts.unresolvedTasks}
      </span>
    </span>
  );
}

function SidebarNav({ isManager, counts, onNavigate }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
      {NAV_GROUPS.filter((g) => isManager || !g.managerOnly).map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ to, label, employeeLabel, icon: Icon, badge }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-600/25'
                        : 'text-slate-600 hover:translate-x-0.5 hover:bg-brand-50 hover:text-brand-700'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        aria-hidden
                        className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-600'}`}
                        strokeWidth={2}
                      />
                      <span>{!isManager && employeeLabel ? employeeLabel : label}</span>
                      {badge && <TaskBadges counts={counts} active={isActive} />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-md shadow-brand-600/30">
        X
      </span>
      <div className="leading-tight">
        <p className="text-lg font-semibold tracking-tight text-slate-900">
          Natura<span className="text-brand-600">X</span>
        </p>
        <p className="text-[11px] text-slate-500">Order follow-up</p>
      </div>
    </div>
  );
}

function UserCard({ user, isManager, onLogout }) {
  return (
    <div className="m-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
        {initials(user?.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{user?.name}</p>
        <p className="truncate text-xs text-slate-500">
          {user?.employeeCode} · {isManager ? 'Manager' : 'Employee'}
        </p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        aria-label="Log out"
        title="Log out"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Shell for every signed-in page: sidebar (drawer on mobile), page content. */
export default function AppLayout() {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const isManager = useSelector(selectIsManager);
  const counts = useSelector(selectNavCounts);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Keep the sidebar badges live: refresh on navigation and every two minutes.
  useEffect(() => {
    dispatch(fetchNavCounts());
  }, [dispatch, location.pathname]);
  useEffect(() => {
    const timer = setInterval(() => dispatch(fetchNavCounts()), NAV_REFRESH_MS);
    return () => clearInterval(timer);
  }, [dispatch]);

  const signOut = () => dispatch(logout());
  const sidebarContent = (onNavigate) => (
    <>
      <Brand />
      <SidebarNav isManager={isManager} counts={counts} onNavigate={onNavigate} />
      <UserCard user={user} isManager={isManager} onLogout={signOut} />
    </>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col">{sidebarContent()}</div>
      </aside>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="relative flex h-full w-72 flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute top-5 right-3 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {sidebarContent(() => setMenuOpen(false))}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar only on small screens; on desktop the sidebar holds brand and user. */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <span className="text-base font-semibold text-slate-900">
            Natura<span className="text-brand-600">X</span>
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials(user?.name)}
          </span>
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
