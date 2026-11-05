# Weather Command v2.4 — FAA NMS Production Connection + Usage Guardrails

Complete six-file update, based on v2.3 (includes UTC clock, winds-aloft fallback, movable dashboard, compact alerts, aviation weather and FAA NOTAM airport lookups).

## FAA NMS production configuration

Render → service → Environment:

- `NMS_API_CLIENT_ID` = **new production Key** (private)
- `NMS_API_CLIENT_SECRET` = **new production Secret** (private)
- `NMS_API_ENV` = `production`

Official FAA-confirmed production endpoints are embedded as defaults:

- Auth: `https://api-nms.aim.faa.gov/v1/auth/token`
- NOTAMs: `https://api-nms.aim.faa.gov/nmsapi/v1/notams`

Optional overrides (`NMS_AUTH_URL`, `NMS_API_BASE_URL`) remain supported, but **delete any old staging URL overrides in Render** before enabling production, or explicitly replace them with the production URLs. Do not place credentials in source files or GitHub.

## Important provider usage rules

The FAA onboarding states one incremental data pull every 3 minutes (more frequent calls require approval and may receive rate-limit errors), and **at most one bulk initial-load request per 24 hours**. This dashboard DOES NOT perform bulk /IL requests.

This release implements a conservative server-wide rate guard: one upstream filtered airport NOTAM request per 180 seconds in a single Node process, regardless of how many users, tabs or airports are open. Same-airport requests reuse cached data for three minutes; requests for other airports during the interval return HTTP 429 with `Retry-After`. The UI shows the message instead of making false claims about current notices. This is an in-memory guard, so multiple Render instances or process restarts would need a shared durable limiter to ensure an account-wide guarantee. Use one Render instance for now.

**Operational limitation:** The FAA's 3-minute incremental feed plus 24-hour bulk allowance suggests a long-lived database with daily initial load and incremental updates is preferable for a scalable, fast, many-airport dashboard. The current per-airport fetch approach is deliberately conservative and may require a wait before first loading a second airport. It does not imply a complete NOTAM briefing; check official FAA resources before flying.

## Install

Unzip and replace all six repository files. Commit and push through GitHub Desktop. Keep credentials in Render. Refresh the deployed dashboard and confirm the production status, then check an airport and its lookup popup.

## Validation

Static build and syntax checks can run without API credentials. Live authenticated production tests must be performed in your Render deployment. The app does not assert operational status until the configured FAA production endpoint responds successfully.
