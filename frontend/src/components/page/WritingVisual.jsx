import React from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { AlertCircle } from 'lucide-react';

const COLORS = [
  '#3B82F6', // primary blue
  '#10B981', // green
  '#F59E0B', // orange
  '#EF4444', // red
  '#8B5CF6', // purple
  '#14B8A6', // teal
  '#EC4899', // pink
  '#64748B', // slate
];

export function WritingVisual({ visuals }) {
  if (!visuals || !Array.isArray(visuals) || visuals.length === 0) {
    return (
      <div className="bg-error/5 border border-error/20 rounded-lg p-md flex items-start gap-sm">
        <AlertCircle size={20} className="text-error mt-0.5 shrink-0" />
        <div>
          <p className="text-body-md font-button text-error">Đề Task 1 chưa có dữ liệu biểu đồ/bảng.</p>
          <p className="text-body-sm text-error/80 mt-xxs">
            Vui lòng sử dụng tính năng "Tạo đề ngẫu nhiên" để AI sinh dữ liệu biểu đồ hợp lệ cho bài làm.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-xl w-full">
      {visuals.map((visual, index) => (
        <div key={visual.id || index} className="bg-surface border border-hairline rounded-lg p-lg shadow-sm">
          {visual.title && (
            <h3 className="text-heading-3 font-heading-3 text-ink mb-md text-center">
              {visual.title}
            </h3>
          )}
          
          {visual.type === 'line' && (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visual.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey={visual.xKey} tick={{ fontSize: 12, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ fontWeight: 'bold', color: '#0F172A', marginBottom: '4px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                  {(visual.series || []).map((s, i) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {visual.type === 'bar' && (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visual.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey={visual.xKey} tick={{ fontSize: 12, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ fontWeight: 'bold', color: '#0F172A', marginBottom: '4px' }}
                    cursor={{ fill: '#F8FAFC' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                  {(visual.series || []).map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.name}
                      fill={COLORS[i % COLORS.length]}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {visual.type === 'pie' && (
            <div className="h-[300px] w-full flex justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#0F172A' }}
                    formatter={(value) => [`${value}${visual.unit || ''}`, 'Value']}
                  />
                  <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                  <Pie
                    data={visual.data}
                    dataKey={visual.valueKey}
                    nameKey={visual.nameKey}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={40}
                    fill="#3B82F6"
                    labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                      const RADIAN = Math.PI / 180;
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      if (percent < 0.05) return null;
                      return (
                        <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={12} fontWeight="bold">
                          {`${(percent * 100).toFixed(0)}%`}
                        </text>
                      );
                    }}
                  >
                    {(visual.data || []).map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {visual.type === 'table' && (
            <div className="w-full overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full text-left border-collapse">
                <thead className="bg-canvas-soft">
                  <tr>
                    {(visual.columns || []).map((col, i) => (
                      <th key={i} className="py-sm px-md text-body-sm font-button text-ink-secondary border-b border-hairline whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(visual.rows || []).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-hairline last:border-0 hover:bg-canvas-soft/50 transition-colors">
                      {(row || []).map((cell, cellIndex) => (
                        <td key={cellIndex} className="py-sm px-md text-body-md text-ink">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {visual.unit && visual.type !== 'pie' && (
            <p className="text-body-sm text-ink-muted text-center mt-sm italic">
              Đơn vị: {visual.unit}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
