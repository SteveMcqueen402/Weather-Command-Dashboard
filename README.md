# Weather Command Dashboard — Flight Planner v0.7.2

A dark, one-page graphical aviation weather dashboard for Omaha / KOMA, with expandable maps, interactive radar, NOAA meteorological charts, airport lookup, route-stop weather, and multi-day forecasts.

## Live features

- KOMA METAR / TAF (Aviation Weather Center), flight category, winds, visibility and observation time.
- General NWS Omaha forecast and Nebraska active alerts.
- RainViewer historical precipitation radar with timestamp, animation, zoom, and an expandable map.
- Official WPC surface analysis and SPC Day 1 convective outlook image previews; click either to enlarge, or open the original source.
- Airport ICAO / U.S. identifier lookup, current METAR, and published TAF where available.
- Route stops: enter From / To and optional comma-separated intermediate airport identifiers. Retrieve published METAR and TAF for those airports. Show an interactive route weather map inside the Route Weather panel with a departure-to-destination line, via-airport markers, flight-category colors, optional current radar overlay, popup METAR/TAF reports, and an enlarge button.
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

## 0.7.1 chart repair
- Routes official WPC/SPC chart imagery through an allowlisted Render backend endpoint to avoid browser hotlink restrictions.
- If NOAA blocks Render too, a dark graphical placeholder replaces the broken image, with a working official-source link.
- Keeps existing dark theme, layout, radar and planning panels.
- Chart availability cannot be guaranteed: official source remains authoritative.

## v0.7.2 — Route Map panel
- Replaced the route-airport list-only panel with an interactive route weather map.
- Color-coded VFR/MVFR/IFR/LIFR/unknown airport pins, popups, connecting line, radar checkbox and enlarged map.
- The latest v0.7.1 official-chart proxy fixes are retained.
- Weather observations are airport-only and not weather forecasts between the airports. The depicted line is not a validated aviation route.


## Version 0.8 — graphical flight planner
- Restyled the existing one-page dashboard to closely follow the approved visual mockup while retaining the functional route, airport, radar, and chart components.
- Compact four-condition tiles, prominent main radar/chart map, aviation and winds left rail, flight-planning and forecast right rail, bottom quick-link tiles.
- Added real official NOAA AWC FB winds/temps via `/api/winds-aloft?station=OMA&fcst=06` (also 12, 24 hr); selector and enlarged wind profile.
- Forecast station/cycle availability is not guaranteed. If AWC is unavailable, the app does **not** manufacture weather values; it shows an error and the official source link.
- Winds-aloft data is for a nearby *forecast station*, not point forecasts for every airport.
- Forecast model cards remain clearly labeled links to official HRRR and GFS products; no invented model images or winds.
- Route lines and estimates are simplified; not approved navigation or a substitute for briefing.

### Local validation
Run `WCD_WIND_TEST=1 node server.mjs` to validate the wind table decoder fixture. Run `npm start` to serve the dashboard.

## v0.9 mockup-match layout
- Full-width top navigation, four compact metric tiles, wide center radar, aviation and winds aloft left stack, and route/weather/forecast/model right stack.
- Route editor collapses to keep primary route summary visible like approved reference; all existing route fields remain available through Edit route.
- Removed duplicate bottom chart thumbnails on desktop; surface and convective views remain reachable through center map tabs and shortcuts. On narrow screens chart tiles remain available.
- No sample/mock weather values are ever populated as live data.

## v1.0 — Color update for approved mockup
The dark navy base remains, with much darker black header and background, stronger cyan/blue highlights, brighter text and borders, high-contrast panel tabs, and improved VFR/MVFR/IFR/LIFR status colors. No demo weather readings have been substituted for live data. Functionality is otherwise retained from v0.9.

## v1.1 True Black / High Visibility

- True #000000 page background and nearly black navigation.
- Lighter charcoal instrument tiles and cards, with vivid cyan headings, bright white readouts, strong blue selected tabs, and high-contrast flight category colors.
- No functional JavaScript, backend, route, forecast, or aviation logic has been changed by this release.
- Cache-busted CSS and JS version URLs for updated styling to appear after Render deploy.


## v1.2 — high contrast multicolor + dashboard arrangement
- Black background, charcoal panels; blue, green, orange, pink, and red functional accent colors.
- **Arrange Panels** turns the weather panels into an adjustable 12-column dashboard. Drag by the handle (desktop), or use the left/right reorder controls (mobile and keyboard).
- Panel width options: small, medium, wide, extra wide, full width.
- **Done Arranging** saves order and widths in the current browser's localStorage.
- **Reset Layout** restores the original dashboard and clears that browser's saved layout.
- Layout preferences do not sync between devices; each browser keeps its own.
- Existing weather feeds, charts, route planning logic, and radar are retained. No new weather API integrations were added in this style/layout release.
