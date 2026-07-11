import React from 'react';

const CATEGORY_STYLES = {
  water: { fill: '#BFDBFE', stroke: '#2563EB' },
  green: { fill: '#BBF7D0', stroke: '#15803D' },
  farmland: { fill: '#FEF3C7', stroke: '#A16207' },
  residential: { fill: '#FDE2E2', stroke: '#BE123C' },
  commercial: { fill: '#DDD6FE', stroke: '#7C3AED' },
  industrial: { fill: '#FED7AA', stroke: '#C2410C' },
  civic: { fill: '#CFFAFE', stroke: '#0E7490' },
  road: { fill: 'none', stroke: '#64748B' },
  rail: { fill: 'none', stroke: '#334155' },
  path: { fill: 'none', stroke: '#A16207' },
  other: { fill: '#E2E8F0', stroke: '#475569' },
};

function featureAnchor(feature) {
  if (feature.kind === 'building') {
    return [feature.x + feature.width / 2, feature.y + feature.height / 2];
  }
  if (feature.kind === 'marker') return [feature.x, feature.y];
  if (!Array.isArray(feature.points) || feature.points.length === 0) return [50, 50];
  const totals = feature.points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [totals[0] / feature.points.length, totals[1] / feature.points.length];
}

function FeatureShape({ feature }) {
  const style = CATEGORY_STYLES[feature.category] || CATEGORY_STYLES.other;
  const points = Array.isArray(feature.points)
    ? feature.points.map(point => point.join(',')).join(' ')
    : '';

  let shape = null;
  if (feature.kind === 'area') {
    shape = <polygon points={points} fill={style.fill} stroke={style.stroke} strokeWidth="0.8" />;
  } else if (feature.kind === 'building') {
    shape = (
      <rect
        x={feature.x}
        y={feature.y}
        width={feature.width}
        height={feature.height}
        rx="1"
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth="0.8"
      />
    );
  } else if (feature.kind === 'route') {
    const strokeWidth = feature.category === 'water' ? 4 : feature.category === 'road' ? 3 : 1.8;
    shape = (
      <polyline
        points={points}
        fill="none"
        stroke={style.stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={feature.category === 'rail' ? '2 1.5' : feature.category === 'path' ? '1.5 1.5' : undefined}
        vectorEffect="non-scaling-stroke"
      />
    );
  } else if (feature.kind === 'marker') {
    shape = <circle cx={feature.x} cy={feature.y} r="2.8" fill={style.fill} stroke={style.stroke} strokeWidth="0.8" />;
  }

  return shape;
}

function FeatureLabel({ feature }) {
  if (!feature.label) return null;
  const [labelX, labelY] = featureAnchor(feature);
  return (
    <text
      x={labelX}
      y={labelY}
      textAnchor="middle"
      dominantBaseline="middle"
      className="fill-ink stroke-surface"
      strokeWidth="1.5"
      paintOrder="stroke"
      fontSize="3.5"
      fontWeight="600"
    >
      {feature.label}
    </text>
  );
}

function MapState({ state, baseFeatures }) {
  const features = [...baseFeatures, ...state.features];
  const layer = { area: 0, route: 1, building: 2, marker: 3 };
  const orderedFeatures = [...features].sort((a, b) => layer[a.kind] - layer[b.kind]);

  return (
    <section className="min-w-0">
      <h4 className="mb-xs text-center text-body-sm font-button text-ink">{state.label}</h4>
      <svg
        viewBox="0 0 100 100"
        className="block w-full aspect-square rounded-lg border border-hairline bg-surface"
        role="img"
        aria-label={`${state.label} - schematic map`}
      >
        <rect x="0" y="0" width="100" height="100" className="fill-surface" />
        {orderedFeatures.map(feature => <FeatureShape key={feature.id} feature={feature} />)}
        {features.map(feature => <FeatureLabel key={`label-${feature.id}`} feature={feature} />)}

        <g aria-label="North">
          <text x="92" y="8" textAnchor="middle" className="fill-ink" fontSize="4.5" fontWeight="700">N</text>
          <path d="M 92 10 L 92 20 M 92 10 L 89.5 14 M 92 10 L 94.5 14" className="stroke-ink" fill="none" strokeWidth="0.9" />
        </g>
        <rect x="0.5" y="0.5" width="99" height="99" fill="none" className="stroke-outline" strokeWidth="0.7" />
      </svg>
    </section>
  );
}

export function WritingMap({ visual, expanded = false }) {
  return (
    <div className="w-full">
      <div className={`grid gap-md ${expanded ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {visual.states.map(state => (
          <MapState key={state.id} state={state} baseFeatures={visual.baseFeatures} />
        ))}
      </div>

      <div className="mt-md flex flex-wrap justify-center gap-x-sm gap-y-xs" aria-label="Map legend">
        {visual.legend.map(item => {
          const style = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.other;
          return (
            <span key={item.category} className="inline-flex items-center gap-xxs text-caption text-ink-secondary">
              <span
                className="h-3 w-3 shrink-0 rounded-[2px] border"
                style={{
                  backgroundColor: style.fill === 'none' ? style.stroke : style.fill,
                  borderColor: style.stroke,
                }}
              />
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
