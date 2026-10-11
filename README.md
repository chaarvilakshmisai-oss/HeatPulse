# HeatPulse

HeatPulse is a React + Vite manager dashboard and worker experience for heat reports and shift breaks, with an AWS SAM backend.

## Connect and run

The frontend reads these Vite variables from the frontend build environment. Copy the root `.env.example` to `.env.local` for local development; never commit real environment values.

| Variable | Purpose | Where to get it |
|---|---|---|
| `VITE_API_URL` | API Gateway base URL | The SAM stack `ApiUrl` output |
| `VITE_USER_POOL_ID` | Cognito user pool ID | The pool used by the backend JWT authorizer |
| `VITE_USER_POOL_CLIENT_ID` | Cognito app client ID | The app client accepted by the backend JWT authorizer |

With no `VITE_USER_POOL_ID`, the frontend runs in demo mode with in-memory sample data and no real sign-in. Live mode requires all three variables.

Follow this order to connect a live plant:

1. Create or select a Cognito user pool and app client for manager accounts. The SAM stack accepts these IDs as `UserPoolId` and `UserPoolClientId` parameters; it does not create the user pool.
2. Deploy the backend SAM stack with those parameters and note its `ApiUrl` output. The stack provisions the API, JWT authorizer, Lambda, and DynamoDB table.
3. Create the manager account in the Cognito user pool using your plant administrator's process. There is no self-sign-up screen.
4. Set all three variables in the Amplify build environment, then trigger a new frontend build. For local use, put them in `.env.local` and restart Vite.
5. Sign in as the manager.
6. Set up and save the site, its IANA plant time zone, and its zones.
7. Open **Workers** and add workers with their zone assignments and recurring shift times; share each generated Worker ID.
8. Open **QR codes** and copy the site ID from a worker QR URL’s `site` query parameter. Workers can use this site ID as their plant code at `/worker-login`.
9. Set `API_URL` and `SITE_ID`, then run `npm run smoke` (or `bash scripts/smoke.sh`) to check the health and public-site endpoints.
10. Workers can sign in at `/worker-login` with the plant code and Worker ID to view their shift and next break. Scanning a zone QR code still lets workers use the shift/break card and submit anonymous heat taps.
11. Optionally seed sample taps with `API_URL`, `SITE_ID`, and `ZONE_ID` set, then run `npm run seed`. By default this submits five taps; set `COUNT` to a whole number from 1 to 100 to change that. If the site requires location, provide `LAT`, `LON`, and `ACCURACY`.

The helper scripts call the deployed API and are intentionally not part of the test/build commands. `npm run smoke` checks `GET /health` and `GET /public/sites/{SITE_ID}` without sending a report. `npm run seed` submits sample `POST /report` requests.

The backend implements public `GET /health`, `GET /public/sites/{siteId}`, `POST /report`, `GET /public/workers/{siteId}/{workerId}`, `GET /public/workers/{siteId}/{zoneId}/{workerId}`, and `POST /public/workers/{siteId}/{zoneId}/{workerId}/breaks`. Cognito-protected manager routes include `GET/PUT /site`, `GET /zones`, `GET /reports?limit=`, `GET/POST /workers`, `PUT/DELETE /workers/{workerId}`, and `GET /breaks`. The site ID used in worker QR URLs and as a worker plant code is the manager's Cognito subject, returned as `site.siteId` by `GET /site`.

Shift times repeat daily in the plant's configured IANA time zone. Break intervals and durations are explicitly tunable placeholders in `src/lib/breaks.js`; they are not medical or legal guidance. The SAM stack adds two DynamoDB indexes for worker break lookup and daily reports, and API Gateway throttling for the HTTP API.

For a local end-to-end check without AWS, run `npm --prefix backend run dev`. This starts the same handler on `http://localhost:3000` with data persisted to the git-ignored `backend/.local-data.json` and a synthetic local manager. Delete that file to reset local data. This local mode is not real authentication; use it only for development. Live API connectivity, Cognito sign-in, API Gateway CORS, and DynamoDB behavior still need verification against a deployed stack.

## Troubleshooting

| Symptom | Check |
|---|---|
| Blank page | Check the browser console and that the Amplify build has `VITE_API_URL`, `VITE_USER_POOL_ID`, and `VITE_USER_POOL_CLIENT_ID`, then rebuild. The app shows a configuration screen for missing live-mode values. |
| 401 after sign-in | Confirm the correct Cognito pool and app client, that the user is confirmed, and that the SAM JWT authorizer uses that pool and app client. The frontend sends the ID token, not the access token. |
| CORS error | Check `AllowedOrigin` on the SAM stack and ensure API Gateway permits the required methods and both `content-type` and `authorization` headers. |
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
