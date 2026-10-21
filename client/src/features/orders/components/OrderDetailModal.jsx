import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Modal from '../../../components/common/Modal';
import Loader from '../../../components/common/Loader';
import { Badge, StatusBadge } from '../../../components/common/Badges';
import { ErrorState } from '../../../components/common/States';
import { closeOrderDetail, selectOrderDetail } from '../ordersSlice';
import { DEFAULT_TASK_FILTERS, setTaskFilters } from '../../tasks/tasksSlice';
import { PAYMENT_LABELS } from '../../../utils/constants';
import { formatCurrency, formatDateTime } from '../../../utils/format';

const RAW_LABELS = {
  orderId: 'Order ID',
  orderDate: 'Order Date',
  customerName: 'Customer Name',
  phone: 'Phone Number',
  orderValue: 'Order Value',
  paymentType: 'Payment Type',
  orderStatus: 'Order Status',
  dispatchDate: 'Dispatch Date',
  expectedDeliveryDate: 'Expected Delivery Date',
  assignedEmployee: 'Assigned Employee',
};

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children ?? '—'}</dd>
    </div>
  );
}

export default function OrderDetailModal() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { order, status, error } = useSelector(selectOrderDetail);
  const close = () => dispatch(closeOrderDetail());

  const viewTasks = () => {
    dispatch(setTaskFilters({ ...DEFAULT_TASK_FILTERS, status: '', search: order.orderId }));
    close();
    navigate('/tasks');
  };

  return (
    <Modal
      open={status !== 'idle'}
      onClose={close}
      title={order ? `Order ${order.orderId}` : 'Order'}
      footer={
        order && (
          <button type="button" className="btn-secondary" onClick={viewTasks}>
            View tasks for this order
          </button>
        )
      }
    >
      {status === 'loading' && <Loader />}
      {status === 'failed' && <ErrorState message={error} />}
      {order && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge kind="order" status={order.status} />
            <StatusBadge kind="data" status={order.dataStatus} />
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Customer">{order.customerName}</Field>
            <Field label="Phone">{order.phone}</Field>
            <Field label="Order value">{formatCurrency(order.orderValue)}</Field>
            <Field label="Payment">{PAYMENT_LABELS[order.paymentType]}</Field>
            <Field label="Status in file">{order.rawStatus}</Field>
            <Field label="Order date">{formatDateTime(order.orderDate)}</Field>
            <Field label="Dispatch date">{formatDateTime(order.dispatchDate)}</Field>
            <Field label="Expected delivery">{formatDateTime(order.expectedDeliveryDate)}</Field>
            <Field label="Assigned to">
              {order.assignedTo
                ? `${order.assignedTo.name} (${order.assignedTo.employeeCode})`
                : `Unassigned (file: ${order.assignedEmployeeRaw ?? '—'})`}
            </Field>
          </dl>

          {order.dataIssues?.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold text-slate-800">
                Data issues from the last import
              </h3>
              <ul className="space-y-1.5">
                {order.dataIssues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge tone={issue.severity === 'ERROR' ? 'red' : 'amber'}>
                      {issue.severity === 'ERROR' ? 'Error' : 'Warning'}
                    </Badge>
                    <span className="text-slate-700">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {order.raw && (
            <section>
              <h3 className="mb-2 font-semibold text-slate-800">Values as written in the file</h3>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
                {Object.entries(RAW_LABELS).map(([key, label]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-mono text-slate-800">{order.raw[key] || '(empty)'}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
