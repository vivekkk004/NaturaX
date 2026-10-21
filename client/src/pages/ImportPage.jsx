import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import PageHeader, { Card } from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import Pagination from '../components/common/Pagination';
import Loader from '../components/common/Loader';
import { Badge } from '../components/common/Badges';
import { EmptyState, ErrorBanner, ErrorState } from '../components/common/States';
import ImportReport from '../features/imports/components/ImportReport';
import {
  clearImportReport,
  fetchImportReport,
  fetchImports,
  selectImportHistory,
  selectImportReport,
  selectImportUpload,
  setImportPage,
  uploadOrders,
} from '../features/imports/importsSlice';
import { MAX_UPLOAD_MB } from '../utils/constants';
import { formatDateTime, formatNumber } from '../utils/format';

const ALLOWED = ['.csv', '.xlsx'];

/** Client-side checks give instant feedback; the server repeats them (never trust the client). */
function validateFile(file) {
  if (!file) return 'Choose a file first';
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED.includes(ext)) return 'Only .csv and .xlsx files are allowed';
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `File is larger than ${MAX_UPLOAD_MB} MB`;
  return null;
}

const HISTORY_COLUMNS = [
  {
    key: 'createdAt',
    header: 'Uploaded',
    render: (b) => <span className="whitespace-nowrap">{formatDateTime(b.createdAt)}</span>,
  },
  { key: 'originalName', header: 'File' },
  { key: 'uploadedBy', header: 'By', render: (b) => b.uploadedBy?.name ?? '—' },
  {
    key: 'status',
    header: 'Status',
    render: (b) => (
      <Badge tone={b.status === 'COMPLETED' ? 'green' : b.status === 'FAILED' ? 'red' : 'amber'}>
        {b.status}
      </Badge>
    ),
  },
  {
    key: 'rows',
    header: 'Rows',
    className: 'text-right',
    render: (b) => formatNumber(b.summary?.totalRows),
  },
  {
    key: 'issues',
    header: 'Needs fix / rejected',
    className: 'text-right',
    render: (b) =>
      `${formatNumber(b.summary?.needsCorrection)} / ${formatNumber(b.summary?.rejected)}`,
  },
  {
    key: 'tasks',
    header: 'New tasks',
    className: 'text-right',
    render: (b) => formatNumber(b.taskSummary?.created ?? 0),
  },
];

export default function ImportPage() {
  const dispatch = useDispatch();
  const upload = useSelector(selectImportUpload);
  const report = useSelector(selectImportReport);
  const history = useSelector(selectImportHistory);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [asOf, setAsOf] = useState('');
  const [clientError, setClientError] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    dispatch(fetchImports());
  }, [dispatch, history.page]);

  useEffect(() => () => dispatch(clearImportReport()), [dispatch]);

  const pick = (selected) => {
    setFile(selected ?? null);
    setClientError(selected ? validateFile(selected) : null);
  };

  const submit = async (event) => {
    event.preventDefault();
    const problem = validateFile(file);
    if (problem) return setClientError(problem);
    const result = await dispatch(uploadOrders({ file, asOf: asOf || undefined }));
    dispatch(fetchImports());
    if (uploadOrders.fulfilled.match(result)) {
      toast.success(`Imported ${result.payload.originalName}`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    }
    return undefined;
  };

  const serverError = upload.error;

  return (
    <>
      <PageHeader
        title="Import orders"
        description="Upload the daily order sheet (.csv or .xlsx). Each row is validated, orders are stored, and the rules run automatically."
      />

      <Card className="mb-5" bodyClassName="p-4">
        <form onSubmit={submit} className="space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400'}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <span className="text-sm font-medium text-slate-700">
              {file ? file.name : 'Drop a file here or click to choose'}
            </span>
            <span className="text-xs text-slate-500">
              {file
                ? `${(file.size / 1024).toFixed(1)} KB`
                : `CSV or Excel (.xlsx), up to ${MAX_UPLOAD_MB} MB. Required columns: Order ID, Order Date, Customer Name, Phone Number, Order Value, Payment Type, Order Status, Dispatch Date, Expected Delivery Date, Assigned Employee.`}
            </span>
          </label>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600">
              Advanced: evaluate as of a specific time
            </summary>
            <div className="mt-2 max-w-xs">
              <label htmlFor="asOf" className="label">
                Evaluate as of (IST)
              </label>
              <input
                id="asOf"
                type="datetime-local"
                className="input"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave empty to use the current time. Useful to replay sample data deterministically.
              </p>
            </div>
          </details>

          <ErrorBanner message={clientError} />
          <ErrorBanner message={serverError?.message}>
            {serverError?.details?.missingColumns?.length > 0 && (
              <p className="mt-1">Missing: {serverError.details.missingColumns.join(', ')}</p>
            )}
            {serverError?.details?.foundColumns && (
              <p className="mt-1 text-xs">
                Columns found: {serverError.details.foundColumns.join(', ')}
              </p>
            )}
          </ErrorBanner>

          <button
            type="submit"
            className="btn-primary"
            disabled={!file || Boolean(clientError) || upload.status === 'loading'}
          >
            {upload.status === 'loading' ? 'Importing…' : 'Upload and process'}
          </button>
        </form>
      </Card>

      {report.status === 'loading' && <Loader label="Loading report…" />}
      {report.status === 'failed' && <ErrorState message={report.error} />}
      {report.data && (
        <div className="mb-5">
          <ImportReport report={report.data} />
        </div>
      )}

      <Card title="Import history">
        <DataTable
          columns={HISTORY_COLUMNS}
          rows={history.items}
          status={history.status}
          error={history.error}
          onRetry={() => dispatch(fetchImports())}
          onRowClick={(b) => dispatch(fetchImportReport(b.id))}
          empty={
            <EmptyState title="No imports yet" message="Upload your first order file above." />
          }
        />
        <Pagination
          pagination={history.pagination}
          onPageChange={(p) => dispatch(setImportPage(p))}
        />
      </Card>
    </>
  );
}
