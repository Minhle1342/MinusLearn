const CHART_TYPES = new Set(['line', 'bar', 'pie', 'table']);
const DIAGRAM_LAYOUTS = new Set(['linear', 'cycle', 'branch']);
const DIAGRAM_ROLES = new Set(['input', 'process', 'output']);
const MAP_FEATURE_KINDS = new Set(['area', 'building', 'route', 'marker']);

export const MAP_CATEGORIES = [
  'water',
  'green',
  'farmland',
  'residential',
  'commercial',
  'industrial',
  'civic',
  'road',
  'rail',
  'path',
  'other',
];

const MAP_CATEGORY_SET = new Set(MAP_CATEGORIES);

function validText(value, maxLength = 120) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function validOptionalText(value, maxLength = 120) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maxLength);
}

function validCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function invalid(error) {
  return { valid: false, error };
}

function valid() {
  return { valid: true, error: '' };
}

export function inferTask1VisualKind(visuals) {
  const type = Array.isArray(visuals) ? visuals[0]?.type : null;
  if (type === 'diagram' || type === 'map') return type;
  return 'chart';
}

export function validateDiagramVisual(visual) {
  if (!visual || typeof visual !== 'object' || visual.type !== 'diagram') {
    return invalid('Visual không phải Process Diagram.');
  }
  if (!validText(visual.title, 160)) return invalid('Diagram cần có tiêu đề hợp lệ.');
  if (!DIAGRAM_LAYOUTS.has(visual.layout)) return invalid('Layout Diagram không được hỗ trợ.');
  if (!Array.isArray(visual.nodes) || visual.nodes.length < 3 || visual.nodes.length > 12) {
    return invalid('Diagram phải có từ 3 đến 12 bước.');
  }
  if (!Array.isArray(visual.edges) || visual.edges.length < 2 || visual.edges.length > 16) {
    return invalid('Diagram phải có từ 2 đến 16 kết nối.');
  }

  const nodeIds = new Set();
  const gridPositions = new Set();
  for (const node of visual.nodes) {
    if (!node || !validText(node.id, 40) || !validText(node.label, 80)) {
      return invalid('Mỗi bước Diagram cần id và nhãn hợp lệ.');
    }
    if (nodeIds.has(node.id)) return invalid(`Diagram có id bước bị trùng: ${node.id}.`);
    if (!DIAGRAM_ROLES.has(node.role)) return invalid(`Vai trò của bước ${node.id} không hợp lệ.`);
    if (!validOptionalText(node.detail, 180)) return invalid(`Mô tả của bước ${node.id} quá dài.`);

    if (visual.layout === 'branch') {
      if (!Number.isInteger(node.row) || !Number.isInteger(node.column)
        || node.row < 0 || node.row > 5 || node.column < 0 || node.column > 5) {
        return invalid(`Bước ${node.id} cần row/column nguyên trong khoảng 0-5.`);
      }
      const position = `${node.row}:${node.column}`;
      if (gridPositions.has(position)) return invalid('Hai bước Diagram không được trùng vị trí.');
      gridPositions.add(position);
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set();
  for (const edge of visual.edges) {
    if (!edge || !validText(edge.from, 40) || !validText(edge.to, 40)) {
      return invalid('Mỗi kết nối Diagram cần điểm đầu và điểm cuối.');
    }
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      return invalid(`Kết nối ${edge.from} → ${edge.to} tham chiếu bước không tồn tại.`);
    }
    if (edge.from === edge.to) return invalid('Diagram không hỗ trợ kết nối một bước với chính nó.');
    if (!validOptionalText(edge.label, 60)) return invalid('Nhãn kết nối Diagram quá dài.');
    const edgeId = `${edge.from}:${edge.to}`;
    if (edgeIds.has(edgeId)) return invalid(`Kết nối ${edge.from} → ${edge.to} bị trùng.`);
    edgeIds.add(edgeId);
  }

  return valid();
}

function validatePoints(points, minimum, featureId) {
  if (!Array.isArray(points) || points.length < minimum || points.length > 20) {
    return invalid(`Feature ${featureId} có danh sách points không hợp lệ.`);
  }
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2
      || !validCoordinate(point[0]) || !validCoordinate(point[1])) {
      return invalid(`Feature ${featureId} có tọa độ ngoài khoảng 0-100.`);
    }
  }
  return valid();
}

function validateMapFeature(feature) {
  if (!feature || !validText(feature.id, 40)) return invalid('Map feature cần id hợp lệ.');
  if (!MAP_FEATURE_KINDS.has(feature.kind)) return invalid(`Feature ${feature.id} có loại không được hỗ trợ.`);
  if (!MAP_CATEGORY_SET.has(feature.category)) return invalid(`Feature ${feature.id} có category không hợp lệ.`);
  if (!validOptionalText(feature.label, 48)) return invalid(`Nhãn của feature ${feature.id} quá dài.`);

  if (feature.kind === 'area') return validatePoints(feature.points, 3, feature.id);
  if (feature.kind === 'route') return validatePoints(feature.points, 2, feature.id);
  if (feature.kind === 'marker') {
    if (!validCoordinate(feature.x) || !validCoordinate(feature.y)) {
      return invalid(`Marker ${feature.id} cần tọa độ x/y trong khoảng 0-100.`);
    }
    return valid();
  }

  if (!validCoordinate(feature.x) || !validCoordinate(feature.y)
    || !Number.isFinite(feature.width) || !Number.isFinite(feature.height)
    || feature.width <= 0 || feature.height <= 0
    || feature.x + feature.width > 100 || feature.y + feature.height > 100) {
    return invalid(`Building ${feature.id} có kích thước hoặc tọa độ không hợp lệ.`);
  }
  return valid();
}

export function validateMapVisual(visual) {
  if (!visual || typeof visual !== 'object' || visual.type !== 'map') {
    return invalid('Visual không phải Map.');
  }
  if (!validText(visual.title, 160)) return invalid('Map cần có tiêu đề hợp lệ.');
  if (!Array.isArray(visual.baseFeatures)) return invalid('Map cần có baseFeatures.');
  if (!Array.isArray(visual.states) || visual.states.length < 2 || visual.states.length > 3) {
    return invalid('Map phải có từ 2 đến 3 thời điểm.');
  }
  if (!Array.isArray(visual.legend) || visual.legend.length < 1 || visual.legend.length > 12) {
    return invalid('Map cần legend có từ 1 đến 12 mục.');
  }

  const baseIds = new Set();
  const usedCategories = new Set();
  for (const feature of visual.baseFeatures) {
    const result = validateMapFeature(feature);
    if (!result.valid) return result;
    if (baseIds.has(feature.id)) return invalid(`Map có feature id bị trùng: ${feature.id}.`);
    baseIds.add(feature.id);
    usedCategories.add(feature.category);
  }

  const stateIds = new Set();
  const stateLabels = new Set();
  for (const state of visual.states) {
    if (!state || !validText(state.id, 40) || !validText(state.label, 60) || !Array.isArray(state.features)) {
      return invalid('Mỗi thời điểm Map cần id, nhãn và danh sách features.');
    }
    if (stateIds.has(state.id) || stateLabels.has(state.label)) {
      return invalid('Các thời điểm Map phải có id và nhãn duy nhất.');
    }
    if (baseIds.size + state.features.length > 20) {
      return invalid(`Thời điểm ${state.label} vượt quá 20 features.`);
    }

    const featureIds = new Set(baseIds);
    for (const feature of state.features) {
      const result = validateMapFeature(feature);
      if (!result.valid) return result;
      if (featureIds.has(feature.id)) return invalid(`Thời điểm ${state.label} có feature id bị trùng: ${feature.id}.`);
      featureIds.add(feature.id);
      usedCategories.add(feature.category);
    }
    stateIds.add(state.id);
    stateLabels.add(state.label);
  }

  const legendCategories = new Set();
  for (const item of visual.legend) {
    if (!item || !MAP_CATEGORY_SET.has(item.category) || !validText(item.label, 48)) {
      return invalid('Map legend chứa category hoặc nhãn không hợp lệ.');
    }
    if (legendCategories.has(item.category)) return invalid(`Map legend bị trùng category: ${item.category}.`);
    legendCategories.add(item.category);
  }
  for (const category of usedCategories) {
    if (!legendCategories.has(category)) return invalid(`Map legend còn thiếu category: ${category}.`);
  }

  return valid();
}

export function validateWritingVisuals(visuals, expectedKind = 'chart') {
  if (!Array.isArray(visuals) || visuals.length === 0) {
    return invalid('Đề Task 1 chưa có dữ liệu visual.');
  }

  if (expectedKind === 'chart') {
    return visuals.every(visual => visual && CHART_TYPES.has(visual.type))
      ? valid()
      : invalid('Visual không khớp dạng Biểu đồ & bảng đã chọn.');
  }

  if (visuals.length !== 1) return invalid('Diagram/Map chỉ được chứa một visual gốc.');
  if (expectedKind === 'diagram') return validateDiagramVisual(visuals[0]);
  if (expectedKind === 'map') return validateMapVisual(visuals[0]);
  return invalid('Dạng visual Task 1 không được hỗ trợ.');
}

function zoneForPoint(x, y) {
  const horizontal = x < 33.34 ? 'W' : x > 66.66 ? 'E' : '';
  const vertical = y < 33.34 ? 'N' : y > 66.66 ? 'S' : '';
  return `${vertical}${horizontal}` || 'C';
}

function featurePoint(feature) {
  if (feature.kind === 'building') {
    return [feature.x + feature.width / 2, feature.y + feature.height / 2];
  }
  if (feature.kind === 'marker') return [feature.x, feature.y];
  const points = Array.isArray(feature.points) ? feature.points : [];
  if (points.length === 0) return [50, 50];
  const totals = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [totals[0] / points.length, totals[1] / points.length];
}

function compactMapFeature(feature) {
  const [x, y] = featurePoint(feature);
  const summary = [feature.id, feature.label || '', feature.kind, feature.category, zoneForPoint(x, y)];
  if (feature.kind === 'route' && feature.points.length > 1) {
    const start = feature.points[0];
    const end = feature.points[feature.points.length - 1];
    summary[4] = `${zoneForPoint(start[0], start[1])}>${zoneForPoint(end[0], end[1])}`;
  }
  return summary;
}

export function serializeWritingVisualsForAI(visuals) {
  if (!Array.isArray(visuals) || visuals.length === 0) return '';
  const visual = visuals[0];

  if (visual?.type === 'diagram') {
    return JSON.stringify({
      type: 'diagram',
      title: visual.title,
      layout: visual.layout,
      nodes: visual.nodes.map(node => [node.id, node.label, node.detail || '', node.role]),
      edges: visual.edges.map(edge => [edge.from, edge.to, edge.label || '']),
    });
  }

  if (visual?.type === 'map') {
    return JSON.stringify({
      type: 'map',
      title: visual.title,
      common: visual.baseFeatures.map(compactMapFeature),
      states: visual.states.map(state => ({
        label: state.label,
        features: state.features.map(compactMapFeature),
      })),
    });
  }

  return JSON.stringify(visuals);
}

function rectBoundaryPoint(from, toward) {
  const dx = toward.cx - from.cx;
  const dy = toward.cy - from.cy;
  if (dx === 0 && dy === 0) return { x: from.cx, y: from.cy };
  const scale = 1 / Math.max(Math.abs(dx) / (from.width / 2), Math.abs(dy) / (from.height / 2));
  return {
    x: from.cx + dx * scale,
    y: from.cy + dy * scale,
  };
}

export function createDiagramGeometry(visual, { expanded = false } = {}) {
  const sourceNodes = Array.isArray(visual?.nodes) ? visual.nodes : [];
  let width;
  let height;
  let nodeWidth;
  let nodeHeight;
  let positionedNodes;

  if (visual?.layout === 'cycle') {
    width = expanded ? Math.max(760, sourceNodes.length * 82) : Math.max(520, sourceNodes.length * 64);
    height = expanded ? Math.max(560, sourceNodes.length * 56) : Math.max(430, sourceNodes.length * 48);
    nodeWidth = expanded ? 160 : 128;
    nodeHeight = expanded ? 84 : 72;
    const radiusX = (width - nodeWidth) / 2 - 26;
    const radiusY = (height - nodeHeight) / 2 - 26;
    positionedNodes = sourceNodes.map((node, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(sourceNodes.length, 1);
      const cx = width / 2 + radiusX * Math.cos(angle);
      const cy = height / 2 + radiusY * Math.sin(angle);
      return { ...node, cx, cy, width: nodeWidth, height: nodeHeight };
    });
  } else if (visual?.layout === 'branch') {
    nodeWidth = expanded ? 170 : 146;
    nodeHeight = expanded ? 88 : 78;
    const columnGap = expanded ? 76 : 54;
    const rowGap = expanded ? 72 : 56;
    const margin = 28;
    const maxColumn = Math.max(0, ...sourceNodes.map(node => Number.isInteger(node.column) ? node.column : 0));
    const maxRow = Math.max(0, ...sourceNodes.map(node => Number.isInteger(node.row) ? node.row : 0));
    width = margin * 2 + (maxColumn + 1) * nodeWidth + maxColumn * columnGap;
    height = margin * 2 + (maxRow + 1) * nodeHeight + maxRow * rowGap;
    positionedNodes = sourceNodes.map(node => ({
      ...node,
      cx: margin + nodeWidth / 2 + (Number.isInteger(node.column) ? node.column : 0) * (nodeWidth + columnGap),
      cy: margin + nodeHeight / 2 + (Number.isInteger(node.row) ? node.row : 0) * (nodeHeight + rowGap),
      width: nodeWidth,
      height: nodeHeight,
    }));
  } else if (expanded) {
    const columns = Math.min(4, Math.max(1, sourceNodes.length));
    const rows = Math.ceil(sourceNodes.length / columns);
    nodeWidth = 170;
    nodeHeight = 86;
    const columnGap = 72;
    const rowGap = 72;
    const margin = 30;
    width = margin * 2 + columns * nodeWidth + (columns - 1) * columnGap;
    height = margin * 2 + rows * nodeHeight + (rows - 1) * rowGap;
    positionedNodes = sourceNodes.map((node, index) => {
      const row = Math.floor(index / columns);
      const offset = index % columns;
      const column = row % 2 === 0 ? offset : columns - 1 - offset;
      return {
        ...node,
        cx: margin + nodeWidth / 2 + column * (nodeWidth + columnGap),
        cy: margin + nodeHeight / 2 + row * (nodeHeight + rowGap),
        width: nodeWidth,
        height: nodeHeight,
      };
    });
  } else {
    nodeWidth = 248;
    nodeHeight = 82;
    const gap = 42;
    const margin = 20;
    width = nodeWidth + margin * 2;
    height = margin * 2 + sourceNodes.length * nodeHeight + Math.max(0, sourceNodes.length - 1) * gap;
    positionedNodes = sourceNodes.map((node, index) => ({
      ...node,
      cx: width / 2,
      cy: margin + nodeHeight / 2 + index * (nodeHeight + gap),
      width: nodeWidth,
      height: nodeHeight,
    }));
  }

  const byId = new Map(positionedNodes.map(node => [node.id, node]));
  const edges = (Array.isArray(visual?.edges) ? visual.edges : []).flatMap(edge => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    const start = rectBoundaryPoint(from, to);
    const end = rectBoundaryPoint(to, from);
    return [{
      ...edge,
      start,
      end,
      labelX: (start.x + end.x) / 2,
      labelY: (start.y + end.y) / 2 - 7,
    }];
  });

  return { width, height, nodes: positionedNodes, edges };
}
