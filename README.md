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

Without `VITE_USER_POOL_ID`, the frontend uses demo data and does not call the configured API. Start the frontend and local backend in separate terminals:

```powershell
npm run dev
npm --prefix backend run dev
```

The local API listens on `http://localhost:3000`. It uses a synthetic `local-manager` identity and does not validate Cognito tokens; for authenticated browser use, configure a real Cognito pool/client. Local API data is stored in ignored `backend/.dev-data.json` and survives restarts. Remove that file to reset it.

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
