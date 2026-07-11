import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { WritingVisual } from './components/page/WritingVisual';

const diagram = {
  id: 'fixture-diagram',
  type: 'diagram',
  title: 'The recycling process for glass bottles',
  layout: 'cycle',
  nodes: [
    { id: 'collect', label: 'Bottle collection', detail: 'Used glass is gathered', role: 'input' },
    { id: 'sort', label: 'Colour sorting', detail: 'Bottles are separated', role: 'process' },
    { id: 'crush', label: 'Crushing', detail: 'Glass becomes small pieces', role: 'process' },
    { id: 'melt', label: 'Melting', detail: 'Glass is heated', role: 'process' },
    { id: 'mould', label: 'Bottle moulding', detail: 'New containers are formed', role: 'process' },
    { id: 'deliver', label: 'Delivery to shops', detail: 'Products return to use', role: 'output' },
  ],
  edges: [
    { from: 'collect', to: 'sort' },
    { from: 'sort', to: 'crush' },
    { from: 'crush', to: 'melt' },
    { from: 'melt', to: 'mould' },
    { from: 'mould', to: 'deliver' },
    { from: 'deliver', to: 'collect', label: 'After use' },
  ],
};

const map = {
  id: 'fixture-map',
  type: 'map',
  title: 'Changes to Westford village between 1990 and 2020',
  baseFeatures: [
    { id: 'river', kind: 'route', category: 'water', label: 'River', points: [[0, 18], [100, 18]] },
    { id: 'main-road', kind: 'route', category: 'road', label: 'Main road', points: [[8, 0], [35, 50], [92, 100]] },
    { id: 'park', kind: 'area', category: 'green', label: 'Park', points: [[4, 58], [30, 58], [30, 92], [4, 92]] },
  ],
  states: [
    {
      id: 'past',
      label: '1990',
      features: [
        { id: 'farm', kind: 'area', category: 'farmland', label: 'Farmland', points: [[48, 28], [92, 28], [92, 58], [48, 58]] },
        { id: 'school-old', kind: 'building', category: 'civic', label: 'School', x: 56, y: 68, width: 18, height: 12 },
        { id: 'well', kind: 'marker', category: 'other', label: 'Well', x: 42, y: 76 },
      ],
    },
    {
      id: 'present',
      label: '2020',
      features: [
        { id: 'homes', kind: 'area', category: 'residential', label: 'Housing', points: [[48, 28], [92, 28], [92, 58], [48, 58]] },
        { id: 'school-new', kind: 'building', category: 'civic', label: 'Larger school', x: 55, y: 65, width: 27, height: 17 },
        { id: 'shops', kind: 'building', category: 'commercial', label: 'Shops', x: 32, y: 52, width: 14, height: 11 },
      ],
    },
  ],
  legend: [
    { category: 'water', label: 'Water' },
    { category: 'road', label: 'Road' },
    { category: 'green', label: 'Green area' },
    { category: 'farmland', label: 'Farmland' },
    { category: 'civic', label: 'Public building' },
    { category: 'other', label: 'Landmark' },
    { category: 'residential', label: 'Housing' },
    { category: 'commercial', label: 'Commercial' },
  ],
};

function Fixture() {
  return (
    <main className="min-h-screen bg-canvas-soft p-lg text-ink">
      <h1 className="mb-lg text-heading-2 font-heading-2">Writing visuals</h1>
      <div className="grid items-start gap-xl xl:grid-cols-2">
        <section className="w-full" style={{ maxWidth: 380 }}>
          <WritingVisual visuals={[diagram]} />
        </section>
        <section className="w-full" style={{ maxWidth: 380 }}>
          <WritingVisual visuals={[map]} />
        </section>
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Fixture />);
