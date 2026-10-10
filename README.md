# HeatPulse for Industry

A hackathon prototype that turns worker heat reports and a sample hourly forecast into advisory, zone-by-zone heat guidance for a factory.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The supervisor dashboard is `/`; the worker tap page is `/tap?zone=press`.

Run the scoring tests with `npm test` and create a production build with `npm run build`.

## Optional API

Set `VITE_API_URL` in a root `.env.local` file to connect a backend:

```env
VITE_API_URL=https://your-api.example.com
```

The frontend expects `GET {VITE_API_URL}/zones` to return an array of `{ id, name, exposure, baseTaps, description }` objects. Worker taps are sent with `POST {VITE_API_URL}/report` and a JSON body of `{ "zoneId": "press", "level": 1 }`, where `level` is `1` for Fine, `2` for Warm, and `3` for Too hot. If the URL is unset or a request fails, the app falls back to its sample data and keeps working.

## Prototype guidance

The scoring formula in `src/lib/scoring.js` is a placeholder intended to be replaced with a standards-based model without changing the UI. The zones, report counts, and hourly forecast are sample data. This prototype provides advisory guidance only; it is not medical or legal advice.
