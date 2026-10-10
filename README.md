# HeatPulse for Industry

A React + Vite manager dashboard and anonymous worker heat-reporting page. The forecast and exposure scoring are prototypes; reports and site data should be treated as advisory.

## Run locally

```bash
npm install
npm run dev
npm test
npm run build
```

## Configuration

Create a root `.env.local` file:

```env
VITE_API_URL=https://your-api.example.com
VITE_USER_POOL_ID=your-cognito-user-pool-id
VITE_USER_POOL_CLIENT_ID=your-cognito-app-client-id
```

Vite exposes these values to the browser, so they must not contain secrets. The user-pool ID and app client ID are identifiers, not credentials. Manager API calls use the Cognito ID token in the `Authorization` header.

If `VITE_USER_POOL_ID` is unset, the app runs in **Demo mode**: manager sign-in is bypassed, and site, zone, and report data live only in memory and reset when the page reloads. No IDs are embedded in the frontend.

The configured API is expected to implement:

- Public `GET /public/sites/{siteId}` and `POST /report`
- Manager `GET /site`, `PUT /site`, `GET /zones`, and `GET /reports?limit=`

## Manager accounts

There is no self-sign-up or password-reset screen. A plant administrator creates manager accounts in the configured Cognito user pool. For example, using AWS CLI (replace the pool ID and set a secure password through your approved secret-handling process):

```bash
aws cognito-idp admin-create-user \
  --user-pool-id "<USER_POOL_ID>" \
  --username "manager@example.com" \
  --user-attributes Name=email,Value=manager@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id "<USER_POOL_ID>" \
  --username "manager@example.com" \
  --password "<STRONG_PASSWORD>" \
  --permanent
```

The administrator should deliver the initial credentials securely. If Cognito requires a new password during sign-in, the manager must ask their administrator to reset it; the app intentionally has no password-change flow.

## Prototype limitations

- Location verification uses coordinates reported by the browser. It is a soft check, not proof of presence; browser/device coordinates can be inaccurate or faked.
- The heat scoring formula and forecast curve are placeholders, not a standards-based assessment.
- Demo values are sample data; configured site exposures and related guidance may be estimates. All displayed risk and work guidance is advisory only, not medical or legal advice.
