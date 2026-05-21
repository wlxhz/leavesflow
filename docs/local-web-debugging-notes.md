# LeavesFlow Local Web Debugging Notes

Version date: 2026-05-21

This note records the local frontend white-screen issue found during V1.3 testing and the current stable local run mode.

## Current Local Run Mode

Backend:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_api_dev.ps1
```

The backend listens on:

```text
http://127.0.0.1:8000
```

Frontend for manual local testing:

```powershell
npm run build:web
npm --workspace @leavesflow/web run preview
```

The frontend preview listens on:

```text
http://localhost:5173
http://127.0.0.1:5173
```

The preview server proxies API calls:

```text
/api -> http://127.0.0.1:8000
```

Health checks:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/v1/health
Invoke-RestMethod -Uri http://127.0.0.1:5173/api/v1/health
```

Expected response:

```json
{"status":"ok"}
```

## Fixes Applied

The local web entry now uses the official React 18 named import:

```ts
import { createRoot } from 'react-dom/client'
```

This replaces the previous default import from `react-dom/client`, which caused the browser error:

```text
The requested module '/.../react-dom/client.js' does not provide an export named 'default'
```

Local development API calls now use:

```ts
http://127.0.0.1:8000/api/v1
```

This avoids `localhost` resolving to IPv6 `::1` while the backend only listens on IPv4 `127.0.0.1`.

Vite local preview is configured with:

```ts
preview: {
  host: '::',
  port: 5173,
  strictPort: true,
  proxy: {
    '/api': 'http://127.0.0.1:8000',
  },
}
```

## Known Vite Dev Issue

On the current Windows local path, Vite dev dependency optimization can fail with:

```text
TypeError: Cannot read properties of undefined (reading 'imports')
```

When dependency optimization is disabled too aggressively, the browser may receive CommonJS files such as `react-dom/client.js` directly. That produces a blank page because those files contain CommonJS exports/require calls and are not browser-ready ESM modules.

For local manual testing, use the build + preview flow above. It renders the production bundle and avoids the Vite dev optimizer failure while still talking to the local backend through the `/api` proxy.

## Current Verified State

Verified locally on 2026-05-21:

```text
http://127.0.0.1:5173/ -> 200
http://127.0.0.1:8000/api/v1/health -> {"status":"ok"}
http://127.0.0.1:5173/api/v1/health -> {"status":"ok"}
```

Browser DOM verification:

```text
rootChildren = 1
body contains login/register/profile tag content
```

This confirms that the page is no longer blank in the current preview run mode.
