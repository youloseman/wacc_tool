import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WACCResult } from '@shared/types';
import { fmtPercent } from '../../utils/format';

const MIN_COLOR = '#2D6A4F'; // sage
const MAX_COLOR = '#C9A84C'; // gold
const TOTAL_COLOR = '#1C3A2F'; // forest

interface Props {
  result: WACCResult;
}

function pct(v: number | null | undefined): number {
  return v == null ? 0 : v * 100;
}

export function CostOfEquityWaterfall({ result }: Props) {
  const find = (name: string) => result.rows.find((r) => r.component === name);
  const rf = find('Risk-free rate');
  const erp = find('Equity risk premium');
  const beta = find('Beta (relevered)');
  const size = find('Small size risk premium');
  const crp = find('Country risk premium');
  const cur = find('Currency risk premium');
  const spec = find('Specific risk premium');
  const coe = find('Cost of Equity');

  const betaErpMin = (beta?.min ?? 0) * (erp?.min ?? 0);
  const betaErpMax = (beta?.max ?? 0) * (erp?.max ?? 0);

  const data = [
    { name: 'Risk-free rate', min: pct(rf?.min), max: pct(rf?.max) },
    { name: 'β × ERP', min: pct(betaErpMin), max: pct(betaErpMax) },
    { name: 'Size premium', min: pct(size?.min), max: pct(size?.max) },
    { name: 'Country RP', min: pct(crp?.min), max: pct(crp?.max) },
    { name: 'Currency RP', min: pct(cur?.min), max: pct(cur?.max) },
    { name: 'Specific RP', min: pct(spec?.min), max: pct(spec?.max) },
    { name: 'Total CoE', min: pct(coe?.min), max: pct(coe?.max), total: true },
  ];

  return (
    <div className="rounded-card border border-forest/10 bg-white p-3">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sage">
        Cost of Equity decomposition
      </h4>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 50, left: 10, bottom: 10 }}
          barGap={4}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            stroke="#6B6459"
            fontSize={11}
          />
          <YAxis dataKey="name" type="category" stroke="#6B6459" fontSize={11} width={110} />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(2)}%`}
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="min" name="MIN" fill={MIN_COLOR}>
            {data.map((d, i) => (
              <Cell key={`min-${i}`} fill={d.total ? TOTAL_COLOR : MIN_COLOR} />
            ))}
            <LabelList
              dataKey="min"
              position="right"
              fontSize={10}
              formatter={(v: number) => (v ? `${v.toFixed(2)}%` : '')}
            />
          </Bar>
          <Bar dataKey="max" name="MAX" fill={MAX_COLOR}>
            {data.map((d, i) => (
              <Cell key={`max-${i}`} fill={d.total ? TOTAL_COLOR : MAX_COLOR} />
            ))}
            <LabelList
              dataKey="max"
              position="right"
              fontSize={10}
              formatter={(v: number) => (v ? `${v.toFixed(2)}%` : '')}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 font-mono text-[11px] text-stone">
        CoE: <span className="text-sage">{fmtPercent(coe?.min ?? 0)}</span> (MIN) /{' '}
        <span className="text-goldDark">{fmtPercent(coe?.max ?? 0)}</span> (MAX)
      </p>
    </div>
  );
}
