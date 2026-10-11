# HeatPulse – Backend

AWS SAM backend: API Gateway HTTP API → Lambda (Node.js 20) → DynamoDB. It implements the manager and worker API used by the React frontend.

## Local development

No AWS account or Docker is needed for local tests and the local API:

```bash
npm test
npm run dev
```

The dev server listens on `http://localhost:3000`, uses the synthetic manager subject `local-manager`, and persists its local DynamoDB substitute to the git-ignored `backend/.dev-data.json`. Data survives server restarts; remove that file to reset local data. Existing `backend/.local-data.json` data is loaded once for compatibility when the new file is absent. This local mode is for development only and does not validate Cognito tokens.

## API contract

| Method and path | Access | Purpose |
|---|---|---|
| `GET /health` | Public | Returns `{ "ok": true }` |
| `GET /public/sites/{siteId}` | Public | Returns the site name, location requirement, and public zone IDs/names |
| `POST /report` | Public | Records a worker level (1–3); location is checked when required |
| `GET /site` | Cognito ID token | Gets the manager's site, or `404 { "error": "No site yet" }` |
| `PUT /site` | Cognito ID token | Validates and saves site settings and zones |
| `GET /zones` | Cognito ID token | Returns saved zones and derived tap counts |
| `GET /reports?limit=N` | Cognito ID token | Returns the most recent reports (limit 1–100; default 50) |
| `GET /workers` | Cognito ID token | Lists workers assigned to the manager's plant |
| `POST /workers` | Cognito ID token | Creates a worker and generates its plant-unique ID |
| `PUT /workers/{workerId}` | Cognito ID token | Updates a worker |
| `DELETE /workers/{workerId}` | Cognito ID token | Deactivates a worker |
| `GET /breaks` | Cognito ID token | Returns today's taken/required break counts by worker and zone |
| `GET /public/workers/{siteId}/{zoneId}/{workerId}` | Public, throttled | Returns only that worker's shift and next-break status |
| `GET /public/workers/{siteId}/{workerId}` | Public, throttled | Looks up an active worker by plant code and returns shift/break status |
| `POST /public/workers/{siteId}/{zoneId}/{workerId}/breaks` | Public, throttled | Records a valid break start/end sequence |

Manager identity and site ID come from the Cognito JWT `sub` claim. The frontend sends the ID token in `Authorization`. Plant shifts use the saved IANA time zone; worker shift fields are recurring 24-hour `HH:mm` times. Break records store `withinRadius` only, not raw coordinates or accuracy. DynamoDB report items expire after seven days.

## Configure and deploy

The SAM stack requires an existing Cognito user pool and app client. Supply their IDs as `UserPoolId` and `UserPoolClientId`, and set `AllowedOrigin` to the deployed frontend origin. The stack creates the API, JWT authorizer, Lambda, and DynamoDB table; it outputs `ApiUrl`, but does not provision Cognito.

After deployment, use the `ApiUrl` output as frontend `VITE_API_URL`, and the same pool/client IDs as `VITE_USER_POOL_ID` and `VITE_USER_POOL_CLIENT_ID`. See the root README for the frontend connection steps and worker smoke script.

## Data and operational notes

- Sites, workers, reports, and break events share the DynamoDB table, keyed by `zoneId` and `ts`. `WorkerBreaksIndex` supports worker history and `BreaksByPlantDayIndex` supports plant-day reporting.
- API Gateway CORS allows `content-type` and `authorization`. Restrict the configured `AllowedOrigin` to the real frontend origin for production.
- Location is a soft check based on browser-reported coordinates, which can be faked. Exposure scoring is a placeholder and all guidance is advisory.
- Break interval/duration rules are placeholder values, not medical or legal guidance. Tune them in `backend/src/breaks.js` and `src/lib/breaks.js` together.
- API Gateway stage throttling applies a 50 requests/second rate and 100-request burst limit; local public worker endpoints use a per-IP 60 requests/minute limit.
