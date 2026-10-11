# HeatPulse

HeatPulse is a heat-safety dashboard for plant managers and workers. Managers configure plant zones and shifts, review worker check-ins, and create QR codes. Scores and break schedules are advisory guidance, not medical advice.

## Prerequisites

- Node.js 20 or newer and npm
- AWS SAM CLI only for deploying the backend
- AWS Cognito user-pool and app-client values for live sign-in

## Local setup

```powershell
Copy-Item .env.example .env
npm ci
```

Set the placeholders in `.env` for live use:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Deployed API Gateway base URL |
| `VITE_USER_POOL_ID` | Cognito user-pool ID |
| `VITE_USER_POOL_CLIENT_ID` | Cognito app-client ID |
| `ALERT_EMAIL_PROVIDER` | Backend email provider: `console` (default), `smtp`, or `ses` |
| `ALERT_SMS_PROVIDER` | Backend SMS provider: `console` (default) or `sns` |
| `ALERT_FROM` | Sender address for SMTP/SES |
| `ALERT_ACK_SECRET` | Long random backend-only secret for signed, expiring acknowledgement links |
| `ALERT_DASHBOARD_URL` | Frontend base URL used in alert emails |
| `ALERT_API_BASE_URL` | Backend base URL used by signed acknowledgement links |
| `ALERT_INTERVAL_MS` | Local alert scan interval in milliseconds (default `60000`) |
| `ALERT_OUTBOX_DIR` | Optional override for local console email files (default `backend/.dev-outbox/`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Optional SMTP connection settings; keep credentials only in the backend environment |

Without `VITE_USER_POOL_ID`, the frontend uses demo data and does not call the configured API. Start the frontend and local backend in separate terminals:

```powershell
npm run dev
npm --prefix backend run dev
```

The local API listens on `http://localhost:3000`. It uses a synthetic `local-manager` identity and does not validate Cognito tokens; for authenticated browser use, configure a real Cognito pool/client. Local API data is stored in ignored `backend/.dev-data.json` and survives restarts. Remove that file to reset it.

## Automatic heat alerts

Alert thresholds default to 40 (watch), 60 (high), and 80 (critical); these are placeholders to be set by an occupational health professional. Manager alert settings and history are plant-scoped and stored alongside plant data. Local alert records persist in `backend/.dev-data.json`; console email/SMS providers never send real messages, and console email writes a readable message file to `backend/.dev-outbox/`. The local scheduler runs once per minute by default; set `ALERT_INTERVAL_MS` to change it or use `POST http://localhost:3000/dev/run-alerts` to run a scan on demand.

The local backend reads alert configuration from its process environment (the values in `.env.example` are placeholders; set backend variables in the terminal before starting it). The default email provider is `console`. SMTP uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `ALERT_FROM`; this supports providers such as Gmail with an app password and Microsoft 365. SES uses `ALERT_FROM` as its verified sender identity. New SES accounts commonly start in the SES sandbox: recipients must also be verified there, and sending is limited until SES production access is granted. Worker SMS defaults to `console`; use `sns` only after configuring AWS credentials/region and SNS SMS permissions. SMS is attempted only when both worker alerts and SMS are enabled and the worker explicitly opted in. Keep `ALERT_ACK_SECRET` private and never expose it through frontend `VITE_*` variables.

For SAM deployment, configure `AlertEmailProvider`, `AlertSmsProvider`, `AlertFromAddress`, `AlertAckSecret`, `AlertDashboardUrl`, and SMTP parameters as needed. The stack adds a ten-minute EventBridge schedule for the alert Lambda, DynamoDB read/write access to the existing table, SES send permission scoped to the sender identity, and region-restricted SNS publish permission. Configure sender verification and provider access in AWS separately.

Manual browser flow: open **Alerts** for a plant, add a recipient, enable and save alerts, then send a test alert and confirm its subject/content in `backend/.dev-outbox/`. Raise a zone score above the high threshold and call `POST /dev/run-alerts`; confirm one alert/outbox message, call it again immediately and confirm cooldown prevents a duplicate, then open that zone's worker shift page and confirm its warning. Acknowledge the alert and confirm escalation stops, lower the score and confirm an “All clear” message, then restart the backend and verify history persists.

## Tests and build

```powershell
npm test
npm --prefix backend test
npm run build
```

Other root scripts: `npm run dev`, `npm run preview`, `npm run verify:production`, `npm run smoke`, and `npm run seed`. The smoke and seed scripts require `API_URL`, `SITE_ID`, and (for seeding) `ZONE_ID`; smoke uses `curl`.

## Project structure

- `src/` — React pages, components, API client, validation, and styles
- `backend/src/` — Node.js Lambda handler and domain logic
- `backend/template.yaml` — AWS SAM HTTP API, JWT authorizer, Lambda, and DynamoDB resources
- `backend/tests/` — Node test-runner backend and dev-server tests
- `scripts/` — production check, API smoke check, and sample tap seeder

## Deploy

Deploy the backend with SAM using an existing Cognito user pool and app client; set `UserPoolId`, `UserPoolClientId`, and the deployed frontend `AllowedOrigin` parameters. The stack outputs `ApiUrl`. Configure the three `VITE_*` values in the Amplify build environment and deploy using the repository's `amplify.yml` (`npm ci`, `npm run build`, artifacts from `dist`). API Gateway throttling is configured at 50 requests/second with a burst of 100; the local dev server separately rate-limits public submissions to 60 per IP per minute.

Local development mode is not production authentication or storage. Production data is stored in DynamoDB. Browser-reported location can be inaccurate or faked.
