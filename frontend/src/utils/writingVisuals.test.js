import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDiagramGeometry,
  inferTask1VisualKind,
  serializeWritingVisualsForAI,
  validateDiagramVisual,
  validateMapVisual,
  validateWritingVisuals,
} from './writingVisuals.js';

function makeDiagram(layout = 'linear') {
  const nodes = [
    { id: 'raw', label: 'Raw material', role: 'input' },
    { id: 'prepare', label: 'Preparation', detail: 'Material is cleaned', role: 'process' },
    { id: 'finish', label: 'Finished product', role: 'output' },
  ];
  if (layout === 'branch') {
    nodes[0].row = 0; nodes[0].column = 0;
    nodes[1].row = 1; nodes[1].column = 0;
    nodes[2].row = 1; nodes[2].column = 1;
  }
  return {
    id: `diagram-${layout}`,
    type: 'diagram',
    title: 'A production process',
    layout,
    nodes,
    edges: [
      { from: 'raw', to: 'prepare' },
      { from: 'prepare', to: 'finish', label: 'Finally' },
    ],
  };
}

function makeMap() {
  return {
    id: 'map-1',
    type: 'map',
    title: 'Changes to a riverside village',
    baseFeatures: [
      { id: 'river', kind: 'route', category: 'water', label: 'River', points: [[0, 18], [100, 18]] },
      { id: 'park', kind: 'area', category: 'green', label: 'Park', points: [[4, 58], [32, 58], [32, 92], [4, 92]] },
    ],
    states: [
      {
        id: 'past',
        label: '1990',
        features: [
          { id: 'school-old', kind: 'building', category: 'civic', label: 'School', x: 58, y: 54, width: 20, height: 14 },
          { id: 'well', kind: 'marker', category: 'other', label: 'Well', x: 44, y: 72 },
        ],
      },
      {
        id: 'present',
        label: '2020',
        features: [
          { id: 'school-new', kind: 'building', category: 'civic', label: 'School', x: 62, y: 48, width: 24, height: 18 },
          { id: 'road', kind: 'route', category: 'road', label: 'Road', points: [[0, 46], [48, 46], [82, 70]] },
        ],
      },
    ],
    legend: [
      { category: 'water', label: 'Water' },
      { category: 'green', label: 'Green area' },
      { category: 'civic', label: 'Public building' },
      { category: 'road', label: 'Road' },
      { category: 'other', label: 'Other' },
    ],
  };
}

test('accepts linear, cycle and branch diagrams and produces finite geometry', () => {
  for (const layout of ['linear', 'cycle', 'branch']) {
    const diagram = makeDiagram(layout);
    assert.equal(validateDiagramVisual(diagram).valid, true);
    const geometry = createDiagramGeometry(diagram, { expanded: true });
    assert.ok(Number.isFinite(geometry.width));
    assert.ok(Number.isFinite(geometry.height));
    assert.equal(geometry.nodes.length, 3);
    for (const node of geometry.nodes) {
      assert.ok(Number.isFinite(node.cx));
      assert.ok(Number.isFinite(node.cy));
    }
  }
});

test('rejects duplicate nodes, dangling edges and missing branch coordinates', () => {
  const duplicate = makeDiagram();
  duplicate.nodes[1].id = 'raw';
  assert.match(validateDiagramVisual(duplicate).error, /trùng/);

  const dangling = makeDiagram();
  dangling.edges[0].to = 'missing';
  assert.match(validateDiagramVisual(dangling).error, /không tồn tại/);

  const missingPosition = makeDiagram('branch');
  delete missingPosition.nodes[1].row;
  assert.match(validateDiagramVisual(missingPosition).error, /row\/column/);
});

test('accepts a two-state map containing every supported feature shape', () => {
  assert.equal(validateMapVisual(makeMap()).valid, true);
  assert.equal(validateWritingVisuals([makeMap()], 'map').valid, true);
});

test('rejects invalid map coordinates and unsupported feature kinds', () => {
  const missingCoordinate = makeMap();
  delete missingCoordinate.states[0].features[1].x;
  assert.match(validateMapVisual(missingCoordinate).error, /x\/y/);

  const outOfRange = makeMap();
  outOfRange.states[1].features[0].x = 95;
  assert.match(validateMapVisual(outOfRange).error, /không hợp lệ/);

  const unsupported = makeMap();
  unsupported.states[0].features[0].kind = 'image';
  assert.match(validateMapVisual(unsupported).error, /không được hỗ trợ/);
});

test('serializes spatial visuals without raw map geometry', () => {
  const serializedMap = serializeWritingVisualsForAI([makeMap()]);
  assert.doesNotMatch(serializedMap, /points|width|height/);
  assert.match(serializedMap, /NW|NE|SW|SE|C/);

  const serializedDiagram = serializeWritingVisualsForAI([makeDiagram()]);
  assert.match(serializedDiagram, /Raw material/);
  assert.match(serializedDiagram, /prepare/);
});

test('infers spatial kinds while keeping legacy charts on the chart path', () => {
  assert.equal(inferTask1VisualKind([makeDiagram()]), 'diagram');
  assert.equal(inferTask1VisualKind([makeMap()]), 'map');
  assert.equal(inferTask1VisualKind([{ type: 'bar' }]), 'chart');
  assert.equal(inferTask1VisualKind([]), 'chart');
});
