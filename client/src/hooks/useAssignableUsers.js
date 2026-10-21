import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsManager } from '../features/auth/authSlice';
import { fetchAssignableUsers, selectAssignableUsers } from '../features/employees/employeesSlice';

/**
 * Active users for "assign to" dropdowns and employee filters. Loaded once and shared through
 * Redux; only managers can list users, so employees get an empty list (they never need it).
 */
export function useAssignableUsers() {
  const dispatch = useDispatch();
  const isManager = useSelector(selectIsManager);
  const { items, status } = useSelector(selectAssignableUsers);

  useEffect(() => {
    if (isManager && status === 'idle') dispatch(fetchAssignableUsers());
  }, [dispatch, isManager, status]);

  return {
    users: items,
    options: items.map((u) => ({ value: u.id, label: `${u.name} (${u.employeeCode})` })),
  };
}
