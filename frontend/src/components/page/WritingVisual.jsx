import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { AlertCircle, Maximize2, X } from 'lucide-react';
import { WritingDiagram } from './WritingDiagram';
import { WritingMap } from './WritingMap';
import { validateWritingVisuals } from '../../utils/writingVisuals';

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

function SpatialVisual({ visual, expanded = false }) {
  const validation = validateWritingVisuals([visual], visual.type);
  if (!validation.valid) {
    return (
      <div className="bg-error/5 border border-error/20 rounded-lg p-md flex items-start gap-sm">
        <AlertCircle size={18} className="text-error mt-0.5 shrink-0" />
        <p className="text-body-sm text-error">{validation.error}</p>
      </div>
    );
  }
  if (visual.type === 'diagram') return <WritingDiagram visual={visual} expanded={expanded} />;
  return <WritingMap visual={visual} expanded={expanded} />;
}

export function WritingVisual({ visuals }) {
  const [expandedVisual, setExpandedVisual] = useState(null);

  useEffect(() => {
    if (!expandedVisual) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setExpandedVisual(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedVisual]);

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
    <>
      <div className="space-y-xl w-full">
        {visuals.map((visual, index) => (
        <div key={visual.id || index} className="relative bg-surface border border-hairline rounded-lg p-lg shadow-sm">
          {(visual.type === 'diagram' || visual.type === 'map') && (
            <button
              type="button"
              onClick={() => setExpandedVisual(visual)}
              className="absolute right-sm top-sm z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-hairline bg-surface text-ink-muted hover:text-primary transition-colors"
              aria-label="Mở rộng visual"
              title="Mở rộng visual"
            >
              <Maximize2 size={16} />
            </button>
          )}
          {visual.title && (
            <h3 className={`text-heading-3 font-heading-3 text-ink mb-md text-center ${(visual.type === 'diagram' || visual.type === 'map') ? 'px-xl' : ''}`}>
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

          {(visual.type === 'diagram' || visual.type === 'map') && (
            <SpatialVisual visual={visual} />
          )}

          {visual.unit && !['pie', 'diagram', 'map'].includes(visual.type) && (
            <p className="text-body-sm text-ink-muted text-center mt-sm italic">
              Đơn vị: {visual.unit}
            </p>
          )}
        </div>
        ))}
      </div>

      {expandedVisual && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-md"
          role="dialog"
          aria-modal="true"
          aria-label={expandedVisual.title || 'Task 1 visual'}
          onMouseDown={event => {
            if (event.target === event.currentTarget) setExpandedVisual(null);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-hairline bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-md border-b border-hairline px-lg py-sm">
              <h2 className="min-w-0 text-title font-title text-ink break-words">
                {expandedVisual.title || 'Task 1 visual'}
              </h2>
              <button
                type="button"
                onClick={() => setExpandedVisual(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas-soft hover:text-ink transition-colors"
                aria-label="Đóng visual"
                title="Đóng"
                autoFocus
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-lg">
              <SpatialVisual visual={expandedVisual} expanded />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
