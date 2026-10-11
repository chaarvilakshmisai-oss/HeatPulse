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
| `GET /plants` | Cognito ID token | Lists plants owned by the signed-in manager; migrates an existing legacy site when needed |
| `POST /plants` | Cognito ID token | Creates a plant with a generated `plantId` and unique short `plantCode` |
| `GET /plants/{plantId}` | Cognito ID token | Gets an owned plant; returns 404 for another manager's plant |
| `PUT /plants/{plantId}` | Cognito ID token | Updates an owned plant and its zones |
| `DELETE /plants/{plantId}` | Cognito ID token | Deletes an owned plant and its workers |
| `GET /plants/{plantId}/zones` | Cognito ID token | Returns zones and derived tap counts for an owned plant |
| `GET /plants/{plantId}/reports?limit=N` | Cognito ID token | Returns reports scoped to an owned plant |
| `GET /plants/{plantId}/breaks` | Cognito ID token | Returns break counts scoped to an owned plant |
| `GET /plants/{plantId}/workers` | Cognito ID token | Lists workers assigned to an owned plant |
| `POST /plants/{plantId}/workers` | Cognito ID token | Creates a worker with a plant-unique ID |
| `PUT /plants/{plantId}/workers/{workerId}` | Cognito ID token | Updates a worker in an owned plant |
| `DELETE /plants/{plantId}/workers/{workerId}` | Cognito ID token | Deactivates a worker in an owned plant |
| `GET /plants/{plantId}/alert-settings` | Cognito ID token | Reads alert settings for an owned plant |
| `PUT /plants/{plantId}/alert-settings` | Cognito ID token | Saves alert settings for an owned plant |
| `GET /plants/{plantId}/alerts` | Cognito ID token | Reads alert history for an owned plant |
| `POST /plants/{plantId}/alerts/test` | Cognito ID token | Sends a test alert for an owned plant |
| `POST /plants/{plantId}/alerts/{alertId}/ack` | Cognito ID token | Acknowledges an alert for an owned plant |
| `GET /alerts/ack?token=...` | Signed expiring link | Acknowledges an alert without manager login |
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

Manager ownership comes from the Cognito JWT `sub` claim; the frontend sends the ID token in `Authorization`. New public plant and worker records use generated plant IDs and never use that subject as a worker-facing plant code. Plant shifts use the saved IANA time zone; worker shift fields are recurring 24-hour `HH:mm` times. Break records store `withinRadius` only, not raw coordinates or accuracy. DynamoDB report items expire after seven days.

## Configure and deploy

The SAM stack requires an existing Cognito user pool and app client. Supply their IDs as `UserPoolId` and `UserPoolClientId`, and set `AllowedOrigin` to the deployed frontend origin. The stack creates the API, JWT authorizer, Lambda, and DynamoDB table; it outputs `ApiUrl`, but does not provision Cognito.

After deployment, use the `ApiUrl` output as frontend `VITE_API_URL`, and the same pool/client IDs as `VITE_USER_POOL_ID` and `VITE_USER_POOL_CLIENT_ID`. See the root README for the frontend connection steps and worker smoke script.

## Data and operational notes

- Plants, owner references, plant-code reservations, workers, reports, and break events share the DynamoDB table, keyed by `zoneId` and `ts`. Manager plant records are owner-checked; worker/report/break partitions use `plantId`. `WorkerBreaksIndex` supports worker history and `BreaksByPlantDayIndex` supports plant-day reporting.
- API Gateway CORS allows `content-type` and `authorization`. Restrict the configured `AllowedOrigin` to the real frontend origin for production.
- Location is a soft check based on browser-reported coordinates, which can be faked. Exposure scoring is a placeholder and all guidance is advisory.
- Break interval/duration rules are placeholder values, not medical or legal guidance. Tune them in `backend/src/breaks.js` and `src/lib/breaks.js` together.
- API Gateway stage throttling applies a 50 requests/second rate and 100-request burst limit; local public worker endpoints use a per-IP 60 requests/minute limit.
- Alert settings and history share the plant DynamoDB table; local equivalents are persisted in ignored `backend/.dev-data.json`. Local scanning runs every minute by default (`ALERT_INTERVAL_MS`) and can be triggered with `POST /dev/run-alerts`.
- Email provider selection is `ALERT_EMAIL_PROVIDER=console|smtp|ses` (default `console`); SMS selection is `ALERT_SMS_PROVIDER=console|sns` (default `console`). Console email writes to `backend/.dev-outbox/` (or `ALERT_OUTBOX_DIR`) and never sends externally. SMTP reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `ALERT_FROM`; SES requires `ALERT_FROM` to be verified and its sandbox restricts recipients to verified addresses until production access is granted.
- Configure `ALERT_ACK_SECRET`, `ALERT_DASHBOARD_URL`, and `ALERT_API_BASE_URL` in the backend environment. SAM accepts corresponding stack parameters. Never place secrets in frontend variables. SMS delivery requires SNS configuration and is limited to workers with explicit `smsConsent`; phone numbers are not stored without consent.
