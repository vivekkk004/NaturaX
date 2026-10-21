import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader, { Card } from '../components/common/PageHeader';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import Pagination from '../components/common/Pagination';
import { StatusBadge } from '../components/common/Badges';
import { EmptyState } from '../components/common/States';
import OrderDetailModal from '../features/orders/components/OrderDetailModal';
import {
  fetchOrderDetail,
  fetchOrders,
  resetOrderFilters,
  selectOrderQuery,
  selectOrdersState,
  setOrderFilters,
  setOrderLimit,
  setOrderPage,
  setOrderSort,
} from '../features/orders/ordersSlice';
import { selectIsManager } from '../features/auth/authSlice';
import { useAssignableUsers } from '../hooks/useAssignableUsers';
import {
  DATA_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  toOptions,
} from '../utils/constants';
import { formatCurrency, formatDateTime } from '../utils/format';

const COLUMNS = [
  {
    key: 'orderId',
    header: 'Order ID',
    sortKey: 'orderId',
    render: (o) => <span className="font-medium text-slate-900">{o.orderId}</span>,
  },
  {
    key: 'orderDate',
    header: 'Order date',
    sortKey: 'orderDate',
    render: (o) => <span className="whitespace-nowrap">{formatDateTime(o.orderDate)}</span>,
  },
  { key: 'customerName', header: 'Customer', render: (o) => o.customerName ?? '—' },
  {
    key: 'orderValue',
    header: 'Value',
    sortKey: 'orderValue',
    className: 'text-right',
    render: (o) => formatCurrency(o.orderValue),
  },
  { key: 'paymentType', header: 'Payment', render: (o) => PAYMENT_LABELS[o.paymentType] ?? '—' },
  {
    key: 'status',
    header: 'Status',
    render: (o) =>
      o.status ? (
        <StatusBadge kind="order" status={o.status} />
      ) : (
        <span className="text-slate-400">{o.rawStatus ?? '—'}</span>
      ),
  },
  {
    key: 'dataStatus',
    header: 'Data',
    render: (o) => <StatusBadge kind="data" status={o.dataStatus} />,
  },
  {
    key: 'assignedTo',
    header: 'Assigned to',
    render: (o) => o.assignedTo?.name ?? <span className="text-amber-700">Unassigned</span>,
  },
];

export default function OrdersPage() {
  const dispatch = useDispatch();
  const isManager = useSelector(selectIsManager);
  const { items, pagination, filters, sort, status, error } = useSelector(selectOrdersState);
  const query = useSelector(selectOrderQuery);
  const { options: employeeOptions } = useAssignableUsers();

  useEffect(() => {
    dispatch(fetchOrders());
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
        name: 'dataStatus',
        type: 'select',
        label: 'Data quality',
        options: toOptions(DATA_STATUS_LABELS),
      },
      {
        name: 'status',
        type: 'select',
        label: 'Order status',
        options: toOptions(ORDER_STATUS_LABELS),
      },
      { name: 'paymentType', type: 'select', label: 'Payment', options: toOptions(PAYMENT_LABELS) },
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
    ],
    [isManager, employeeOptions],
  );

  return (
    <>
      <PageHeader
        title={isManager ? 'Orders' : 'My orders'}
        description='All imported orders. Filter "Data quality: Needs correction" for the data-correction bucket - those orders are not checked by the rules until fixed.'
      />
      <Card>
        <div className="border-b border-slate-200 p-4">
          <FilterBar
            fields={fields}
            values={filters}
            onChange={(c) => dispatch(setOrderFilters(c))}
            onReset={() => dispatch(resetOrderFilters())}
          />
        </div>
        <DataTable
          columns={COLUMNS}
          rows={items}
          status={status}
          error={error}
          onRetry={() => dispatch(fetchOrders())}
          sort={sort}
          onSortChange={(s) => dispatch(setOrderSort(s))}
          onRowClick={(o) => dispatch(fetchOrderDetail(o.id))}
          empty={
            <EmptyState
              title="No orders found"
              message={
                isManager
                  ? 'Import an order file to get started.'
                  : 'No orders are assigned to you.'
              }
            />
          }
        />
        <Pagination
          pagination={pagination}
          onPageChange={(p) => dispatch(setOrderPage(p))}
          onLimitChange={(l) => dispatch(setOrderLimit(l))}
        />
      </Card>
      <OrderDetailModal />
    </>
  );
}
