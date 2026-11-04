# Weather Command Dashboard — Flight Planner v0.7

A dark, one-page graphical aviation weather dashboard for Omaha / KOMA, with expandable maps, interactive radar, NOAA meteorological charts, airport lookup, route-stop weather, and multi-day forecasts.

## Live features

- KOMA METAR / TAF (Aviation Weather Center), flight category, winds, visibility and observation time.
- General NWS Omaha forecast and Nebraska active alerts.
- RainViewer historical precipitation radar with timestamp, animation, zoom, and an expandable map.
- Official WPC surface analysis and SPC Day 1 convective outlook image previews; click either to enlarge, or open the original source.
- Airport ICAO / U.S. identifier lookup, current METAR, and published TAF where available.
- Route stops: enter From / To and optional comma-separated intermediate airport identifiers. Retrieve published METAR and TAF for those airports. Show a straight-line map with linked stop markers.
- Approximate great-circle straight-line mileage by consecutive airport coordinates, estimated time based on user-entered **groundspeed**, and estimated cruise fuel consumption based on user-entered **gallons/hour**. These are planning arithmetic only, **not flight performance forecasts**.
- Up to five daytime NWS forecast periods near the chosen route airport (contiguous U.S. locations). Weather outlooks are NOT forecasts of VFR/IFR flight categories.
- Winds-aloft and HRRR/GFS cards link to source products until verified native model integrations are added.
- Responsive layout for desktop, tablet, mobile, with expandable panel details.

## Important limitations

This is a **weather display and early flight-planning prototype**, not an official FAA flight-planning/briefing system. It does not validate terrain clearance, airspace, airport restrictions, NOTAMs, route legality, aircraft performance, or weather between listed airports; does not file flight plans or provide in-flight hazard analysis. Displayed route segments are straight lines, not recommended flight paths. Estimated time/fuel excludes wind, climb, reserve, taxi and approach. Always obtain a current official preflight briefing and use validated performance data.

Official charts may restrict cross-origin embedding. The app offers direct links if images fail. Public APIs may be temporarily unavailable or throttled. No paid API key required for initial features.

## GitHub Desktop / Render install

1. Unzip this package. In GitHub Desktop choose your Weather-Command-Dashboard repository and **Repository → Show in Explorer**.
2. Copy the **six files inside this folder**, not the folder itself, into the repository root. Replace existing `index.html`, `style.css`, `app.js`, `server.mjs`, `package.json`, and `README.md`.
3. In GitHub Desktop, review changes, **Commit to main**, then **Push origin**.
4. Render should deploy automatically (Auto-Deploy: On Commit). Verify latest commit and test dashboard.

### Render settings

- Service: Web Service / Node
- Branch: main; Root directory: blank
- Build: `npm install && npm run build`
- Start: `npm start`
- Health check: `/health`
- Node.js 20+

### Local run

`npm start` then open `http://localhost:3000/`. The server uses `PORT` if supplied by Render.

## Sources

- NOAA NWS: https://www.weather.gov/documentation/services-web-api
- Aviation Weather Center API: https://aviationweather.gov/data/api/
- RainViewer: https://www.rainviewer.com/api.html
- Surface: https://www.wpc.ncep.noaa.gov/html/sfc2.shtml
- Convective: https://www.spc.noaa.gov/products/outlook/
- HRRR: https://www.nco.ncep.noaa.gov/pmb/products/hrrr/
- GFS: https://www.nco.ncep.noaa.gov/pmb/products/gfs/
- OpenStreetMap tiles / Leaflet.
