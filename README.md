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

## v1.3 — selectable home airport, basemap picker and flexible arrangement
- Set home airport by airport identifier (requires airport coordinates available from Aviation Weather Center). Saved per browser. Changes main METAR/TAF, local NWS forecast, local point alerts, main map center and route departure default.
- Choose FAA VFR Sectional, Street Map or Satellite from the dashboard. Choice propagates to the route map and enlarged maps. FAA's sectional tile service can have limited chart/zoom coverage and may lag the latest chart edition; always verify effective chart date and NOTAMs.
- Arrange panels in 12-column increments from 2 to 12 columns; reorder with drag handle, position menu or arrows; set minimum panel height 160–850 px. Persisted locally. Existing v1.2 layout preference is imported when present.
- Controls do not sync between devices. Official weather and charts remain essential for flight planning; no operational routing or complete briefing capability.


## v1.6 — In-dashboard NOTAM listing
- Current active airport NOTAMs render as individual notices in the dashboard with raw text, plain-English interpretation (when supplied), validity dates, categories, filtering, pagination, and enlarged view.
- Requires a NOTAC provider API token, provisioned as `NOTAC_API_KEY` in Render -> Environment. Do **not** commit tokens to GitHub, put them in browser code, or send them in ChatGPT. Provider credentials are not included.
- Request a NOTAC API key from the provider: https://notac.aero/api/authentication/ . Another future option is approval for FAA NMS API access: https://www.faa.gov/about/initiatives/notam .
- If missing credentials, unauthorized access, rate limiting, or an upstream outage occurs, the panel clearly displays that notices are unavailable—never a fictitious zero-notices or live list.
- The service caches the provider's response for 2 minutes and fetches up to 20 records/page.
- NOTAC is an FAA-derived **third-party** service; for complete, current preflight notices and related NOTAMs/TFRs always cross-check with an official briefing.


## v1.7 — streamlined weather center
- Removed the duplicate Route Weather Map panel. Route plotting remains in WEATHER MAP CENTER > Route map.
- Removed the standalone convective weather card and its map tab, and removed the forecast models card.
- Added a movable/resizable **dew point** tile based on the selected airport METAR (°C).
- NOTAMs: fixed double fetching and ensured explicit timeout/provider errors. **Live listings still REQUIRE authorized NOTAC_API_KEY on Render.** Without a working provider token, the app displays unavailable, not an invented count.
- Radar: optional sharp/smoothed rendering, 512-pixel tiles, delayed removal of old tiles to reduce flashing, and slower animation updates to reduce unnecessary requests. The underlying RainViewer dataset remains limited to max zoom 7 and ~10-minute frames; 512px tiles do not create new meteorological detail.
- Existing personal arrangements will reset once to account for removed/added panels.
- Use as a planning aid only; check official aviation weather, charts, NOTAMs and briefings.


## FAA NMS API integration (v1.8)

The previous NOTAC API is replaced by **FAA NMS**. In Render > Environment set:

- `NMS_API_CLIENT_ID`: NMS registration **Key**
- `NMS_API_CLIENT_SECRET`: NMS registration **Secret**
- `NMS_API_ENV`: `test` for now. Test data is not operational; do not use it for flight decisions.

The provider's supplied SoapUI file identifies:

- Test token URL: `https://api-staging.cgifederal-aim.com/v1/auth/token`
- Test API root: `https://api-staging.cgifederal-aim.com/nmsapi`
- GET `/v1/notams?location=<airport>` with `nmsResponseFormat: GEOJSON` and Bearer token

OAuth client credentials are exchanged **server-side**. No secrets are sent to the browser. The client uses the source airport selection and shows the provider's notices directly on the dashboard. Token caching reduces authentication traffic.

**Limitations:** The provided SoapUI definition documents request filters and GeoJSON output, but it contains no example successful NOTAM response body or complete feature-property schema. Therefore the normalized display uses conservative property detection and preserves raw source values. If the provider uses a different envelope it will show an error instead of inventing notices; provide a *redacted* sample response to finish precise field mapping. The default test environment is never represented as live operational NOTAMs. The list is capped at 250 records until pagination semantics are confirmed. Use official flight briefings and current operational NOTAMs for flight decisions.

For production use, request the provider-confirmed production token and API base URLs. Set `NMS_API_ENV=production` and add `NMS_AUTH_URL` and `NMS_API_BASE_URL`. Do not simply point test credentials at production. Remove obsolete `NOTAC_API_KEY` from Render once FAA NMS is working.

**Security:** Credentials belong in Render Environment only. Do not commit keys, secrets, API response files containing tokens, or SoapUI profiles with active credentials. Rotate any exposed tokens.


## v1.9 — FAA NMS GeoJSON response decoding

Fixes the `NMS returned a response format not yet recognized` message by parsing the documented FAA NMS response envelope: `status: Success`, `data.geojson[]`, `Feature.properties.coreNOTAMData.notam`, and `notamTranslation[]`. Reports an NMS application-level failure rather than misrepresenting it as zero NOTAMs; shows a clear error if NMS returns a signed file URL. Both client credentials remain server-side in Render. Staging records remain labeled **TEST DATA — NOT FOR FLIGHT USE**.

No new Render environment variables are needed. Do not place private NMS credentials in the source repository. Test with the existing staging credentials in Render and verify several airport identifiers.


## v2.0 — NOTAMs in Airport Lookup
- The airport lookup weather popup now fetches and shows FAA NMS notices for the **looked-up airport**, independent of the selected home airport.
- Includes count, category, effective dates, complete notice text, refresh button and clear test-environment warning.
- Preserves the main NOTAM panel and existing METAR, TAF, forecast and route functions.
- Uses the current `/api/notams?airport=...` backend and existing Render NMS credentials; no new environment variables are needed.
- **Staging/test data is not operational NOTAM data and must not be used for flight.**


## v2.1 — Winds aloft recovery

- Retrieves official AWC text FB winds first, with official weather.gov FD1/FD2/FD3 product fallback (6/12/24 hours respectively).
- Validates issue time and the forecast table; never fabricates wind data.
- Reports actual source of the displayed data and upstream errors.
- Maintains 15-minute server cache to avoid hammering NOAA.
- The FAA NMS setup remains unchanged.


## v2.2 — UTC / Zulu time indicator

- Adds a compact, persistent **UTC / ZULU** digital clock to the dashboard header.
- Displays 24-hour HH:MM:SSZ and updates every second using the browser clock.
- Uses standard UTC regardless of the user's device time zone.
- No API key or server changes required; earlier functionality is unchanged.
