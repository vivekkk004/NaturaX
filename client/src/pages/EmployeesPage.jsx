import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import PageHeader, { Card } from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import Pagination from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import FilterBar from '../components/common/FilterBar';
import { Badge } from '../components/common/Badges';
import { ErrorBanner } from '../components/common/States';
import {
  createEmployee,
  fetchEmployees,
  resetEmployeeMutation,
  selectEmployeeList,
  selectEmployeeMutation,
  setEmployeePage,
  setEmployeeSearch,
  updateEmployee,
} from '../features/employees/employeesSlice';
import { selectCurrentUser } from '../features/auth/authSlice';
import { formatDateTime } from '../utils/format';

const EMPTY_FORM = { name: '', email: '', employeeCode: '', password: '', role: 'EMPLOYEE' };

function EmployeeFormModal({ open, onClose }) {
  const dispatch = useDispatch();
  const mutation = useSelector(selectEmployeeMutation);
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const result = await dispatch(createEmployee(form));
    if (createEmployee.fulfilled.match(result)) {
      toast.success(`${result.payload.name} added`);
      setForm(EMPTY_FORM);
      dispatch(fetchEmployees());
      onClose();
    }
  };

  const details = Array.isArray(mutation.error?.details) ? mutation.error.details : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Add employee"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="employee-form"
            className="btn-primary"
            disabled={mutation.status === 'loading'}
          >
            {mutation.status === 'loading' ? 'Saving…' : 'Add employee'}
          </button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="space-y-3">
        <ErrorBanner message={mutation.error?.message}>
          {details.map((d) => (
            <p key={d.field}>{`${d.field}: ${d.message}`}</p>
          ))}
        </ErrorBanner>
        {[
          ['name', 'Full name', 'text'],
          ['email', 'Email', 'email'],
          ['employeeCode', 'Employee code (used in order files, e.g. EMP006)', 'text'],
          ['password', 'Initial password (8+ chars, a letter and a number)', 'password'],
        ].map(([key, label, type]) => (
          <div key={key}>
            <label htmlFor={`emp-${key}`} className="label">
              {label}
            </label>
            <input
              id={`emp-${key}`}
              type={type}
              required
              className="input"
              value={form[key]}
              onChange={set(key)}
              autoComplete="off"
            />
          </div>
        ))}
        <div>
          <label htmlFor="emp-role" className="label">
            Role
          </label>
          <select id="emp-role" className="input" value={form.role} onChange={set('role')}>
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}

export default function EmployeesPage() {
  const dispatch = useDispatch();
  const me = useSelector(selectCurrentUser);
  const list = useSelector(selectEmployeeList);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    dispatch(fetchEmployees());
  }, [dispatch, list.page, list.search]);

  const toggleActive = async (user) => {
    const result = await dispatch(
      updateEmployee({ id: user.id, changes: { isActive: !user.isActive } }),
    );
    if (updateEmployee.fulfilled.match(result)) {
      toast.success(
        `${user.name} ${user.isActive ? 'deactivated - their sessions were ended' : 'reactivated'}`,
      );
    } else {
      toast.error(result.payload?.message ?? 'Not saved');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => <span className="font-medium text-slate-900">{u.name}</span>,
    },
    { key: 'employeeCode', header: 'Code' },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Badge tone={u.role === 'MANAGER' ? 'violet' : 'blue'}>
          {u.role === 'MANAGER' ? 'Manager' : 'Employee'}
        </Badge>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (u) => (
        <Badge tone={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    { key: 'lastLoginAt', header: 'Last login', render: (u) => formatDateTime(u.lastLoginAt) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (u) =>
        u.id === me.id ? (
          <span className="text-xs text-slate-400">You</span>
        ) : (
          <button
            type="button"
            className={u.isActive ? 'btn-ghost text-red-700' : 'btn-ghost'}
            onClick={() => toggleActive(u)}
          >
            {u.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        description="People who can be assigned follow-up tasks. The employee code is what the order file's Assigned Employee column refers to."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              dispatch(resetEmployeeMutation());
              setAdding(true);
            }}
          >
            Add employee
          </button>
        }
      />
      <Card>
        <div className="border-b border-slate-200 p-4">
          <FilterBar
            fields={[
              {
                name: 'search',
                type: 'search',
                label: 'Search',
                placeholder: 'Name, email or code',
              },
            ]}
            values={{ search: list.search }}
            onChange={({ search }) => dispatch(setEmployeeSearch(search ?? ''))}
          />
        </div>
        <DataTable
          columns={columns}
          rows={list.items}
          status={list.status}
          error={list.error}
          onRetry={() => dispatch(fetchEmployees())}
        />
        <Pagination
          pagination={list.pagination}
          onPageChange={(p) => dispatch(setEmployeePage(p))}
        />
      </Card>
      <EmployeeFormModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
