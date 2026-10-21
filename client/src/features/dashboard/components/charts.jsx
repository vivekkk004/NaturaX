import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../../components/common/PageHeader';
import { EmptyState } from '../../../components/common/States';
import { formatNumber } from '../../../utils/format';

/**
 * Chart styling follows one fixed spec: validated categorical colours (slot 1 blue, slot 2
 * orange - colour-blind safe as a pair), thin bars with a rounded data end, a 2px surface-coloured
 * gap between stacked segments, recessive hairline grid, muted axis text. Text never uses series
 * colours; identity comes from the legend swatches.
 */
const CHART = {
  series1: '#2a78d6',
  series2: '#eb6834',
  surface: '#ffffff',
  grid: '#e1e0d9',
  axis: '#898781',
  barSize: 18,
};

function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-4 px-4 pt-3 text-xs text-slate-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Tooltip card: label + every value of the hovered bar, in text colours. */
function ChartTooltip({ active, payload, rows }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-800">{datum.name}</p>
      {rows.map((row) => (
        <p key={row.key} className="flex items-center justify-between gap-6 text-slate-600">
          <span className="flex items-center gap-1.5">
            {row.color && (
              <span className="h-2 w-2 rounded-sm" style={{ background: row.color }} aria-hidden />
            )}
            {row.label}
          </span>
          <span className="font-medium tabular-nums text-slate-900">
            {formatNumber(datum[row.key])}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Horizontal stacked bar chart with a Chart/Table toggle (the table view is the accessible
 * alternative and shows exact numbers).
 * series: [{ key, label }] in fixed order -> slot 1, slot 2 colours (never re-ordered by value).
 * tooltipRows: extra values shown on hover and as table columns.
 */
export function StackedBarCard({ title, data, series, tooltipRows, emptyMessage, onBarClick }) {
  const [view, setView] = useState('chart');
  const colors = [CHART.series1, CHART.series2];
  const legendItems = series.map((s, i) => ({ label: s.label, color: colors[i] }));
  const rows = [...series.map((s, i) => ({ ...s, color: colors[i] })), ...(tooltipRows ?? [])];
  const hasData = data.some((d) => series.some((s) => d[s.key] > 0));
  const height = Math.max(160, data.length * 36 + 40);

  const toggle = (
    <div
      className="flex rounded-lg border border-slate-200 p-0.5 text-xs"
      role="group"
      aria-label={`${title} view`}
    >
      {['chart', 'table'].map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => setView(v)}
          className={`rounded-md px-2.5 py-1 capitalize ${view === v ? 'bg-slate-100 font-medium text-slate-800' : 'text-slate-500'}`}
        >
          {v}
        </button>
      ))}
    </div>
  );

  return (
    <Card title={title} actions={toggle}>
      {!hasData ? (
        <EmptyState title="No data for these filters" message={emptyMessage} />
      ) : view === 'table' ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                {rows.map((r) => (
                  <th key={r.key} className="px-4 py-2 text-right">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d) => (
                <tr key={d.name}>
                  <td className="px-4 py-2 text-slate-700">{d.name}</td>
                  {rows.map((r) => (
                    <td key={r.key} className="px-4 py-2 text-right tabular-nums">
                      {formatNumber(d[r.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Legend items={legendItems} />
          <div style={{ height }} className="px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 24, bottom: 0, left: 8 }}
              >
                <CartesianGrid horizontal={false} stroke={CHART.grid} strokeWidth={1} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fill: '#52514e', fontSize: 12 }}
                  axisLine={{ stroke: '#c3c2b7' }}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  content={<ChartTooltip rows={rows} />}
                />
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="stack"
                    fill={colors[i]}
                    barSize={CHART.barSize}
                    stroke={CHART.surface}
                    strokeWidth={2}
                    // Only the outer end of the stack is rounded; the baseline end stays square.
                    radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
                    onClick={onBarClick ? (d) => onBarClick(d.payload ?? d) : undefined}
                    cursor={onBarClick ? 'pointer' : undefined}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
