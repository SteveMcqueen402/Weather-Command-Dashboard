# Weather Command Dashboard

Responsive personal weather dashboard with **Omaha, Nebraska / KOMA** as home base.

## Working in this starter
- Local NWS forecast temperature and narrative
- NWS Nebraska active alert counts and summaries
- Aviation Weather Center KOMA / nearby METARs and KOMA TAF
- Interactive historical precipitation radar overlay (RainViewer) with source timestamps
- Responsive desktop/tablet/phone navigation

## External links in this starter (not yet integrated map layers)
- WPC surface analysis / forecast charts
- SPC convective outlooks, watches and mesoscale discussions
- HRRR and GFS / NOMADS forecast model products
- Aviation wind/temperature aloft and GFA / PIREPs

These linked sections are a starting point, **not yet custom interactive model visualizers**. The dashboard is an informational aid, not an official aviation weather briefing or sole hazard warning system.

## Render settings
- Service type: **Web Service**
- Runtime: **Node**
- Branch: `main`
- Root directory: blank
- Build: `npm install && npm run build`
- Start: `npm start`
- Health check path: `/health` (optional)
- Node version: 20+
- No API keys or env vars required initially; Render supplies `PORT`.

## GitHub upload
1. Unzip the project.
2. In your new (empty) repo select **Add file → Upload files**.
3. Upload `package.json`, `server.mjs`, `README.md` and the entire `public/` folder **preserving folder paths**. If GitHub's browser upload does not preserve folders, create them using the repository web UI or push via Git.
4. Commit to `main`.
5. In Render, connect this repository and deploy.

## Local development
`npm start` then visit `http://localhost:3000`.

## Data sources
- NOAA NWS: https://www.weather.gov/documentation/services-web-api
- Aviation Weather Center: https://aviationweather.gov/data/api/
- RainViewer: https://www.rainviewer.com/api.html (personal/educational, attribution required, data availability limits)
- OpenStreetMap / CARTO tiles via Leaflet

## Limitations
Weather feeds can be temporarily unavailable or rate-limited. Radar uses RainViewer's historical tiles, not future precipitation predictions. NWS severe alerts are state-scoped to Nebraska. Client-side NOAA NWS forecast requests are subject to upstream availability. No saved settings, push notifications, radar animation, full GRIB model rendering, or flight risk scoring yet.
