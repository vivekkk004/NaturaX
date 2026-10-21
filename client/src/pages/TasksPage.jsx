import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Columns3, List } from 'lucide-react';
import PageHeader, { Card } from '../components/common/PageHeader';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import Pagination from '../components/common/Pagination';
import { EmptyState } from '../components/common/States';
import TaskDetailModal from '../features/tasks/components/TaskDetailModal';
import TaskBoard from '../features/tasks/components/TaskBoard';
import { buildTaskColumns } from '../features/tasks/taskColumns';
import {
  fetchBoard,
  fetchTaskDetail,
  fetchTasks,
  resetTaskFilters,
  saveTaskView,
  selectTaskFilters,
  selectTaskQuery,
  selectTasksState,
  selectTaskView,
  setTaskFilters,
  setTaskLimit,
  setTaskPage,
  setTaskSort,
  setTaskView,
} from '../features/tasks/tasksSlice';
import { selectIsManager } from '../features/auth/authSlice';
import { useAssignableUsers } from '../hooks/useAssignableUsers';
import { PRIORITY_LABELS, RULE_LABELS, TASK_STATUS_LABELS, toOptions } from '../utils/constants';

const VIEWS = [
  { value: 'list', label: 'List', icon: List },
  { value: 'board', label: 'Board', icon: Columns3 },
];

function ViewToggle({ view, onChange }) {
  return (
    <div
      className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      role="group"
      aria-label="Task view"
    >
      {VIEWS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            view === value
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const dispatch = useDispatch();
  const isManager = useSelector(selectIsManager);
  const view = useSelector(selectTaskView);
  const { items, pagination, filters, sort, status, error } = useSelector(selectTasksState);
  const query = useSelector(selectTaskQuery);
  const boardFilters = useSelector(selectTaskFilters);
  const { options: employeeOptions } = useAssignableUsers();

  // List: re-fetch whenever filters, sort or page change (the memoised query object changes).
  useEffect(() => {
    if (view === 'list') dispatch(fetchTasks());
  }, [dispatch, view, query]);

  // Board: re-load all columns when the filters change (sort/page don't apply to the board).
  useEffect(() => {
    if (view === 'board') dispatch(fetchBoard());
  }, [dispatch, view, boardFilters]);

  const changeView = (next) => {
    dispatch(setTaskView(next));
    saveTaskView(next);
  };

  const fields = useMemo(
    () => [
      {
        name: 'search',
        type: 'search',
        label: 'Search',
        placeholder: 'Order ID, customer or phone',
      },
      // On the board the columns *are* the statuses, so the status filter only applies to the list.
      ...(view === 'list'
        ? [
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
          ]
        : []),
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
    [isManager, employeeOptions, view],
  );

  const refresh = () => dispatch(view === 'board' ? fetchBoard() : fetchTasks());

  return (
    <>
      <PageHeader
        title={isManager ? 'Tasks' : 'My tasks'}
        description={
          view === 'board'
            ? 'Drag a card to another column to change its status. Click a card for details and actions.'
            : 'Every exception the rule engine found, with what to do and by when. Click a row for details and actions.'
        }
        actions={<ViewToggle view={view} onChange={changeView} />}
      />

      <Card className="mb-5" bodyClassName="p-4">
        <FilterBar
          fields={fields}
          values={filters}
          onChange={(c) => dispatch(setTaskFilters(c))}
          onReset={() => dispatch(resetTaskFilters())}
        />
      </Card>

      {view === 'board' ? (
        <TaskBoard />
      ) : (
        <Card>
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
      )}
      <TaskDetailModal onChanged={refresh} />
    </>
  );
}
