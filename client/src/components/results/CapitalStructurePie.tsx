import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { WACCResult } from '@shared/types';
import { fmtPercent } from '../../utils/format';

interface Props {
  result: WACCResult;
}

export function CapitalStructurePie({ result }: Props) {
  const eq = result.rows.find((r) => r.component === 'Share of Equity');
  const dt = result.rows.find((r) => r.component === 'Share of Debt');
  const equity = eq?.min ?? 0.74;
  const debt = dt?.min ?? 0.26;
  const de = equity > 0 ? (1 - equity) / equity : 0;

  const data = [
    { name: 'Equity', value: equity * 100, color: '#1C3A2F' }, // forest
    { name: 'Debt', value: debt * 100, color: '#C9A84C' }, // gold
  ];

  return (
    <div className="flex flex-col rounded-card border border-forest/10 bg-white p-3">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sage">
        Capital structure
      </h4>
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: string) => {
                const item = data.find((d) => d.name === value);
                return `${value}: ${fmtPercent((item?.value ?? 0) / 100)}`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-stonePale">
              D/E
            </div>
            <div className="font-mono text-[14px] font-medium text-gold">{fmtPercent(de)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
