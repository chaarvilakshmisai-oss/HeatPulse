import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function DashboardPlaceholder() {
  return <div style={{ padding: '20px' }}>Dashboard Phase 1 Ready</div>;
}

function TapPlaceholder() {
  return <div style={{ padding: '20px' }}>Tap Page Phase 1 Ready</div>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DashboardPlaceholder />} />
        <Route path="/tap" element={<TapPlaceholder />} />
      </Routes>
    </Router>
  );
}
