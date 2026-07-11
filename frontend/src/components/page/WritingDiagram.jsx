import React, { useId } from 'react';
import { createDiagramGeometry } from '../../utils/writingVisuals';

const ROLE_STYLES = {
  input: 'fill-canvas-soft stroke-primary',
  process: 'fill-surface-container-low stroke-outline',
  output: 'fill-surface-container-lowest stroke-accent-green',
};

export function WritingDiagram({ visual, expanded = false }) {
  const geometry = createDiagramGeometry(visual, { expanded });
  const markerId = `writing-arrow-${useId().replace(/:/g, '')}`;
  const preserveFullWidth = visual.layout === 'branch' && !expanded;

  return (
    <div className="w-full overflow-auto rounded-lg bg-canvas-soft/60">
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        width={geometry.width}
        height={geometry.height}
        className="block h-auto max-w-none"
        style={{ width: preserveFullWidth ? `${Math.max(geometry.width, 320)}px` : '100%' }}
        role="img"
        aria-label={visual.title}
      >
        <title>{visual.title}</title>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
          </marker>
        </defs>

        {geometry.edges.map((edge, index) => (
          <g key={`${edge.from}-${edge.to}-${index}`}>
            <path
              d={`M ${edge.start.x} ${edge.start.y} L ${edge.end.x} ${edge.end.y}`}
              fill="none"
              className="stroke-primary"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              markerEnd={`url(#${markerId})`}
            />
            {edge.label && (
              <text
                x={edge.labelX}
                y={edge.labelY}
                textAnchor="middle"
                className="fill-ink-muted stroke-surface"
                strokeWidth="4"
                paintOrder="stroke"
                fontSize={expanded ? 12 : 10}
              >
                {edge.label}
              </text>
            )}
          </g>
        ))}

        {geometry.nodes.map((node, index) => (
          <g key={node.id}>
            <rect
              x={node.cx - node.width / 2}
              y={node.cy - node.height / 2}
              width={node.width}
              height={node.height}
              rx="8"
              className={ROLE_STYLES[node.role] || ROLE_STYLES.process}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={node.cx - node.width / 2 + 17}
              cy={node.cy - node.height / 2 + 17}
              r="11"
              className="fill-primary"
            />
            <text
              x={node.cx - node.width / 2 + 17}
              y={node.cy - node.height / 2 + 21}
              textAnchor="middle"
              className="fill-on-primary"
              fontSize="11"
              fontWeight="700"
            >
              {index + 1}
            </text>
            <foreignObject
              x={node.cx - node.width / 2 + 34}
              y={node.cy - node.height / 2 + 8}
              width={node.width - 42}
              height={node.height - 16}
            >
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                className="h-full w-full overflow-hidden flex flex-col justify-center pr-xxs text-ink"
              >
                <p className="font-button leading-tight break-words" style={{ fontSize: expanded ? 13 : 11 }}>
                  {node.label}
                </p>
                {node.detail && (
                  <p className="text-ink-muted leading-tight break-words mt-xxs" style={{ fontSize: expanded ? 11 : 9 }}>
                    {node.detail}
                  </p>
                )}
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
    </div>
  );
}
