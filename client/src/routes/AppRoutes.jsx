import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AppLayout from '../components/layout/AppLayout';
import Loader from '../components/common/Loader';
import LoginPage from '../pages/LoginPage';
import { ROLES } from '../utils/constants';

// Pages are code-split: each is downloaded the first time it is opened, so the login screen
// doesn't pay for the charting library used only by the dashboard.
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const TasksPage = lazy(() => import('../pages/TasksPage'));
const OrdersPage = lazy(() => import('../pages/OrdersPage'));
const ImportPage = lazy(() => import('../pages/ImportPage'));
const ReportsPage = lazy(() => import('../pages/ReportsPage'));
const AuditPage = lazy(() => import('../pages/AuditPage'));
const RulesPage = lazy(() => import('../pages/RulesPage'));
const EmployeesPage = lazy(() => import('../pages/EmployeesPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

const page = (Component) => (
  <Suspense fallback={<Loader />}>
    <Component />
  </Suspense>
);

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={page(DashboardPage)} />
          <Route path="tasks" element={page(TasksPage)} />
          <Route path="orders" element={page(OrdersPage)} />
          <Route path="audit" element={page(AuditPage)} />

          <Route element={<ProtectedRoute roles={[ROLES.MANAGER]} />}>
            <Route path="imports" element={page(ImportPage)} />
            <Route path="reports" element={page(ReportsPage)} />
            <Route path="rules" element={page(RulesPage)} />
            <Route path="employees" element={page(EmployeesPage)} />
          </Route>

          <Route path="*" element={page(NotFoundPage)} />
        </Route>
      </Route>
    </Routes>
  );
}
