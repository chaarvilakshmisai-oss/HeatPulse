export const HOURLY_CURVE = [
  0.18, 0.24, 0.32, 0.44, 0.58, 0.74, 0.88, 0.94, 0.82, 0.62, 0.44, 0.3,
];

export const MOCK_ZONES = [
  { id: 'furnace', name: 'Furnace bay', exposure: 0.95, baseTaps: 14, description: 'Process heat · indoor' },
  { id: 'forging', name: 'Forging', exposure: 0.88, baseTaps: 11, description: 'Process heat · indoor' },
  { id: 'welding', name: 'Welding', exposure: 0.8, baseTaps: 9, description: 'Radiant heat · indoor' },
  { id: 'paint', name: 'Paint booth', exposure: 0.7, baseTaps: 5, description: 'Enclosed · poor ventilation' },
  { id: 'press', name: 'Press shop', exposure: 0.55, baseTaps: 6, description: 'Metal roof · indoor' },
  { id: 'asmA', name: 'Assembly A', exposure: 0.45, baseTaps: 4, description: 'Indoor · metal roof' },
  { id: 'asmB', name: 'Assembly B', exposure: 0.4, baseTaps: 3, description: 'Indoor' },
  { id: 'pack', name: 'Packing', exposure: 0.4, baseTaps: 3, description: 'Indoor' },
  { id: 'dock', name: 'Loading dock', exposure: 0.75, baseTaps: 8, description: 'Outdoor · direct sun' },
  { id: 'wh', name: 'Warehouse', exposure: 0.5, baseTaps: 5, description: 'Metal roof · indoor' },
  { id: 'can', name: 'Canteen', exposure: 0.3, baseTaps: 1, description: 'Indoor · ventilated' },
  { id: 'off', name: 'Office', exposure: 0.2, baseTaps: 0, description: 'Air-conditioned' },
];
