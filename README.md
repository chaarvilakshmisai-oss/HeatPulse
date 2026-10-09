# HeatPulse 🔥

A hackathon prototype for a room-level heat map for hostels and factories, built from resident taps combined with a weather forecast.

> **Note on Prototype Logic & Data**:
> The heat scoring formula implemented in `src/lib/scoring.js` is a placeholder demo formula designed for rapid client-side interactivity and simulation. All room configurations and hourly temperature curves are sample data. The scoring logic is strictly isolated in `lib/scoring.js` so it can easily be replaced with standards-based thermal comfort models (e.g., PMV/SET) without altering UI components.

---

## 🚀 Features

- **Manager Dashboard (`/`)**:
  - Interactive hourly playback control (7 AM to 6 PM) with 800ms auto-advance loop & slider.
  - Floor 3 hostel room grid (6 columns top row, corridor strip, 6 columns bottom row).
  - 12-hour peak heat bar chart with instant scrubbing.
  - Summary metrics tracking hot rooms (score ≥ 65).
  - What-If mitigation toggles (*Shade west windows*, *Open corridor vents*, *Run fans early*).
  - Selected room card with real-time resident tap simulation.
  - Priority "Fix first" room queue.
- **Resident Tap Page (`/tap`)**:
  - Mobile-first tap page for residents (e.g., `/tap?room=304`).
  - 3 large heat assessment options: *Fine*, *Warm*, *Too hot*.
  - Instant submission with confirmation view and reset capability.
- **Resilient API Layer**:
  - Reads `import.meta.env.VITE_API_URL` for backend endpoint integration.
  - Automatic fallback to client-side sample data if no API URL is set or network fails.

---

## 🛠️ Tech Stack

- **Framework**: React 18 + Vite (JavaScript)
- **Routing**: `react-router-dom` v6
- **Styling**: Plain CSS with custom CSS variables (Design System: Manrope typography, custom heat gradient linear RGB stops, dark/light contrast adaptation)
- **Testing**: Vitest unit testing suite for scoring & heat color calculations

---

## 🚦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Locally in Development Mode
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

### 3. Run Unit Tests
```bash
npm test
```

### 4. Build Production Bundle
```bash
npm run build
```

---

## ⚙️ Environment Variables (`VITE_API_URL`)

To connect HeatPulse to a live backend service:

1. Create a `.env.local` file in the project root:
   ```env
   VITE_API_URL=https://your-backend-api.example.com
   ```
2. Expected endpoints:
   - `GET {VITE_API_URL}/zones` -> Returns JSON array of rooms:
     ```json
     [
       { "id": 301, "exposure": 0.95, "baseTaps": 14, "description": "West-facing · top floor" }
     ]
     ```
   - `POST {VITE_API_URL}/report` -> Accepts payload `{ "zoneId": 304, "level": 3 }`.

*If `VITE_API_URL` is omitted or un-reachable, HeatPulse automatically displays a sample data notice banner and operates seamlessly using built-in mock data.*
