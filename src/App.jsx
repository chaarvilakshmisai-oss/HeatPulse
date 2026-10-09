import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';

function TapPlaceholder() {
  return <div style={{ padding: '20px' }}>Tap Page Placeholder</div>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tap" element={<TapPlaceholder />} />
      </Routes>
    </Router>
  );
}
