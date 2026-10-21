import { combineReducers, configureStore } from '@reduxjs/toolkit';
import authReducer, { logout, sessionExpired, tokenRefreshed } from '../features/auth/authSlice';
import dashboardReducer from '../features/dashboard/dashboardSlice';
import tasksReducer from '../features/tasks/tasksSlice';
import ordersReducer from '../features/orders/ordersSlice';
import importsReducer from '../features/imports/importsSlice';
import reportsReducer from '../features/reports/reportsSlice';
import auditReducer from '../features/audit/auditSlice';
import rulesReducer from '../features/rules/rulesSlice';
import employeesReducer from '../features/employees/employeesSlice';
import { setupInterceptors } from '../services/api';

const appReducer = combineReducers({
  auth: authReducer,
  dashboard: dashboardReducer,
  tasks: tasksReducer,
  orders: ordersReducer,
  imports: importsReducer,
  reports: reportsReducer,
  audit: auditReducer,
  rules: rulesReducer,
  employees: employeesReducer,
});

/**
 * On logout or session expiry every slice is reset, so the next person who logs in on this
 * browser never sees the previous user's data. Only `auth` keeps its (logged-out) state.
 */
export function rootReducer(state, action) {
  if (action.type === logout.fulfilled.type || action.type === sessionExpired.type) {
    return appReducer({ auth: state?.auth }, action);
  }
  return appReducer(state, action);
}

export function createStore(preloadedState) {
  const store = configureStore({ reducer: rootReducer, preloadedState });
  setupInterceptors(store, { onRefreshed: tokenRefreshed, onSessionExpired: sessionExpired });
  return store;
}

export const store = createStore();
