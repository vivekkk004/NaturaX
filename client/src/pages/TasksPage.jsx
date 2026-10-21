import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader, { Card } from '../components/common/PageHeader';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import Pagination from '../components/common/Pagination';
import { EmptyState } from '../components/common/States';
import TaskDetailModal from '../features/tasks/components/TaskDetailModal';
import { buildTaskColumns } from '../features/tasks/taskColumns';
import {
  fetchTaskDetail,
  fetchTasks,
  resetTaskFilters,
  selectTaskQuery,
  selectTasksState,
  setTaskFilters,
  setTaskLimit,
  setTaskPage,
  setTaskSort,
} from '../features/tasks/tasksSlice';
import { selectIsManager } from '../features/auth/authSlice';
import { useAssignableUsers } from '../hooks/useAssignableUsers';
import { PRIORITY_LABELS, RULE_LABELS, TASK_STATUS_LABELS, toOptions } from '../utils/constants';

export default function TasksPage() {
  const dispatch = useDispatch();
  const isManager = useSelector(selectIsManager);
  const { items, pagination, filters, sort, status, error } = useSelector(selectTasksState);
  const query = useSelector(selectTaskQuery);
  const { options: employeeOptions } = useAssignableUsers();

  // Re-fetch whenever filters, sort or page change (the memoised query object changes).
  useEffect(() => {
    dispatch(fetchTasks());
  }, [dispatch, query]);

  const fields = useMemo(
    () => [
      {
        name: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Order ID, customer or phone',
      },
      {
        name: 'status',
        type: 'select',
        label: 'Status',
        placeholder: 'All statuses',
        defaultValue: 'UNRESOLVED',
        options: [
          { value: 'UNRESOLVED', label: 'Unresolved (open + in progress)' },
          ...toOptions(TASK_STATUS_LABELS),
        ],
      },
      {
        name: 'ruleType',
        type: 'select',
        label: 'Exception type',
        options: toOptions(RULE_LABELS),
      },
      { name: 'priority', type: 'select', label: 'Priority', options: toOptions(PRIORITY_LABELS) },
      ...(isManager
        ? [
            {
              name: 'assignedTo',
              type: 'select',
              label: 'Employee',
              options: [{ value: 'unassigned', label: 'Unassigned' }, ...employeeOptions],
            },
          ]
        : []),
      { name: 'dateFrom', type: 'date', label: 'Order date from' },
      { name: 'dateTo', type: 'date', label: 'Order date to' },
      { name: 'overdue', type: 'checkbox', label: 'Overdue only' },
    ],
    [isManager, employeeOptions],
  );

  return (
    <>
      <PageHeader
        title={isManager ? 'Tasks' : 'My tasks'}
        description="Every exception the rule engine found, with what to do and by when. Click a row for details and actions."
      />
      <Card bodyClassName="">
        <div className="border-b border-slate-200 p-4">
          <FilterBar
            fields={fields}
            values={filters}
            onChange={(c) => dispatch(setTaskFilters(c))}
            onReset={() => dispatch(resetTaskFilters())}
          />
        </div>
        <DataTable
          columns={buildTaskColumns({ showAssignee: isManager })}
          rows={items}
          status={status}
          error={error}
          onRetry={() => dispatch(fetchTasks())}
          sort={sort}
          onSortChange={(s) => dispatch(setTaskSort(s))}
          onRowClick={(task) => dispatch(fetchTaskDetail(task.id))}
          rowClassName={(t) => (t.isOverdue ? 'bg-red-50/40' : '')}
          empty={
            <EmptyState
              title="No tasks match these filters"
              message="Try clearing filters, or import a new order file."
            />
          }
        />
        <Pagination
          pagination={pagination}
          onPageChange={(p) => dispatch(setTaskPage(p))}
          onLimitChange={(l) => dispatch(setTaskLimit(l))}
        />
      </Card>
      <TaskDetailModal onChanged={() => dispatch(fetchTasks())} />
    </>
  );
}
