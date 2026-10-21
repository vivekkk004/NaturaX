import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectAuthStatus, selectCurrentUser } from '../features/auth/authSlice';
import Loader from '../components/common/Loader';

/**
 * Guards a group of routes.
 * - While the session is being restored (page reload), show a loader instead of flashing the login page.
 * - Not signed in -> /login, remembering where the user wanted to go.
 * - `roles` given and the user's role is not in it -> Forbidden message.
 * The UI guard is a convenience; the API enforces the same rules on every request.
 */
export default function ProtectedRoute({ roles }) {
  const status = useSelector(selectAuthStatus);
  const user = useSelector(selectCurrentUser);
  const location = useLocation();

  if (status === 'idle' || status === 'restoring')
    return <Loader fullPage label="Restoring your session…" />;
  if (status !== 'authenticated')
    return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">Not available for your role</h1>
        <p className="mt-2 text-sm text-slate-500">This page is for managers only.</p>
      </div>
    );
  }
  return <Outlet />;
}
