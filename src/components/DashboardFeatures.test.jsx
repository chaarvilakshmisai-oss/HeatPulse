import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import Header from './Header.jsx';
import ShiftPlan from './ShiftPlan.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import { MOCK_ZONES } from '../data/mock.js';

describe('HeatPulse screens', () => {
  it('shows the correct shift for the selected hour', () => {
    const morning = renderToString(
      <Header hourIndex={6} isPlaying={false} onTogglePlay={() => {}} isUsingSampleData />
    );
    const afternoon = renderToString(
      <Header hourIndex={7} isPlaying={false} onTogglePlay={() => {}} isUsingSampleData />
    );
    expect(morning).toContain('1 PM');
    expect(morning).toContain('Shift <!-- -->A');
    expect(afternoon).toContain('2 PM');
    expect(afternoon).toContain('Shift <!-- -->B');
  });

  it('renders the dashboard summary, zones, and shift plan', () => {
    const html = renderToString(<Dashboard />);
    expect(html).toContain('HeatPulse');
    expect(html).toContain('7 / 12');
    expect(html).toContain('Furnace bay');
    expect(html).toContain('Act first');
    expect(html).toContain('Safe for heavy work');
    expect(html).toContain('Worker reports');
  });

  it('shows merged work guidance ranges', () => {
    const html = renderToString(<ShiftPlan zones={MOCK_ZONES} />);
    expect(html).toContain('7 AM – 11 AM, 4 PM – 6 PM');
    expect(html).toContain('12 PM – 3 PM');
    expect(html).toContain('1 PM – 3 PM');
  });
});
