import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { restoreSession } from './features/auth/authSlice';
import AppRoutes from './routes/AppRoutes';

/** On start-up, try to restore the session from the refresh cookie (survives page reloads). */
export default function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  return <AppRoutes />;
}
