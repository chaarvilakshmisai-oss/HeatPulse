# HeatPulse for Industry

React + Vite manager dashboard and anonymous worker heat-reporting page, with an AWS SAM backend.

## Connect and run

The frontend reads these Vite variables from the frontend build environment. Copy the root `.env.example` to `.env.local` for local development; never commit real environment values.

| Variable | Purpose | Where to get it |
|---|---|---|
| `VITE_API_URL` | API Gateway base URL | The SAM stack `ApiUrl` output |
| `VITE_USER_POOL_ID` | Cognito user pool ID | The Cognito user pool configuration |
| `VITE_USER_POOL_CLIENT_ID` | Cognito app client ID | The app client for that user pool |

With no `VITE_USER_POOL_ID`, the frontend runs in demo mode with in-memory sample data and no real sign-in. Live mode requires all three variables.

Follow this order to connect a live plant:

1. Deploy the backend SAM stack and note its `ApiUrl` output.
2. Create the manager account in the Cognito user pool using your administrator-approved process. There is no self-sign-up screen.
3. Set all three variables in the Amplify build environment, then trigger a new frontend build. For local use, put them in `.env.local` and restart Vite.
4. Sign in as the manager.
5. Set up and save the site and its zones.
6. Open **QR codes** and copy the site ID from a worker QR URL’s `site` query parameter.
7. Set `API_URL` and `SITE_ID`, then run `npm run smoke` (or `bash scripts/smoke.sh`) to check the health and public-site endpoints.
8. Send one real tap from a worker’s phone using that site’s zone QR code.
9. Optionally seed sample taps with `API_URL`, `SITE_ID`, and `ZONE_ID` set, then run `npm run seed`. By default this submits five taps; set `COUNT` to a whole number from 1 to 100 to change that. If the site requires location, provide `LAT`, `LON`, and `ACCURACY`.

The helper scripts call the deployed API and are intentionally not part of the test/build commands. `npm run smoke` checks `GET /health` and `GET /public/sites/{SITE_ID}` without sending a report. `npm run seed` submits sample `POST /report` requests.

## Current checkout integration status

The frontend expects public `GET /health`, `GET /public/sites/{siteId}`, and `POST /report`, plus Cognito-protected `GET /site`, `PUT /site`, `GET /zones`, and `GET /reports?limit=`. The backend files currently present in this checkout do not yet implement that full contract: its SAM template exposes only `/health`, `/zones`, and `/report`, and it does not configure a Cognito authorizer or the `/site`, `/public/sites/{siteId}`, and `/reports` routes. Its CORS allow-headers list also omits `Authorization`. As a result, the scripts and live manager integration require a backend with the full contract before they can work end-to-end. No live API calls are made by the frontend tests or production build.

The SAM template currently exposes `ApiUrl` and `TableName`; it does not provision or output a Cognito user pool or app client. Obtain the two Cognito IDs from the separately configured user pool/app client unless the deployed stack is updated to manage them.

## Troubleshooting

| Symptom | Check |
|---|---|
| Blank page | Check the browser console and that the Amplify build has `VITE_API_URL`, `VITE_USER_POOL_ID`, and `VITE_USER_POOL_CLIENT_ID`, then rebuild. The app shows a configuration screen for missing live-mode values. |
| 401 after sign-in | Confirm the correct Cognito pool and app client, that the user is confirmed, and that the API’s JWT authorizer accepts the user pool’s ID token. The current checked-in SAM template does not configure this authorizer. |
| CORS error | Allow the deployed frontend origin, required methods, and both `content-type` and `authorization` headers in API Gateway CORS settings. The current template only allows `content-type`. |
| `/tap` shows 404 | Check the `site` and `zone` query values in the QR URL and confirm the API implements `GET /public/sites/{siteId}` and includes that zone. |
| No location prompt | Browser geolocation requires a secure context (HTTPS, or localhost), a site with location checks enabled, and permission in browser settings. |
| `outside_area` | Move closer to the saved plant coordinates, confirm the allowed radius and site coordinates, and retry with location permission enabled. Browser-reported coordinates can be inaccurate. |

## Run checks

```bash
npm test
npm run build
npm --prefix backend test
```

For local frontend development:

```bash
npm install
npm run dev
```

## Limits

Location checks use browser-reported coordinates and can be faked. Heat scoring is a placeholder; the forecast curve and seeded taps are sample data. All resulting guidance is advisory only.
