# Weather Command Dashboard v2.9 — Route Winds Aloft & Wind-Corrected ETA

Based on v2.8. Install all six files through GitHub Desktop and push to Render.

## New flight-planning features

- Route planner now asks for **true airspeed (TAS)**, cruise altitude MSL, an official three-letter **FB winds-aloft forecast station** and 6-, 12- or 24-hour forecast period.
- Uses the existing NOAA Aviation Weather Center / NWS fallback `/api/winds-aloft` data; no new API key is required.
- Wind speed/direction at cruise altitude are interpolated **as vector components** between published forecast levels, when available.
- Every direct leg gets a true course, wind-correction angle and wind-adjusted groundspeed; ETA and fuel use the sum of estimated leg durations.
- Forecast station is manually selectable: choose a forecast station representative of the route (e.g. OMA or OFK), not automatically assumed to be the departure airport. A single station is an approximation, especially on longer routes.
- If the upstream winds table is missing or the station has no forecast, the estimate is explicitly labeled **STILL-AIR ONLY**; no wind estimate is fabricated. A crosswind too strong to hold a desired track is flagged.
- The route-wind forecast is refreshed with the dashboard auto-refresh and with a dedicated button; upstream response caching remains in place.

## Limitations and flight safety

Wind-corrected ETA is an **estimate**, not a dispatch-approved navigational flight plan. Current implementation assumes cruise for the whole route and uses a **single selected FB station**. It does not include climb/descent, time/fuel for taxi, winds varying along the route, changing winds over time, magnetic variation, altitude-specific aircraft performance, terrain, controlled airspace, or arrival procedures. Use current official forecasts and the aircraft POH; allow appropriate fuel reserves. The listed FB forecasts are not current observed winds. No FAA NMS NOTAM connection settings were changed.

# Weather Command Dashboard v2.5 — Mobile + Airport Briefing + Wall Display

Install the six files via GitHub Desktop; commit and push, then allow Render to deploy. Preserve `NMS_API_CLIENT_ID`, `NMS_API_CLIENT_SECRET`, `NMS_API_ENV` settings.

## Changes
- Editable 3-letter winds/temperatures forecast station input and Go button; unavailable station is explicitly reported.
- Radar animation now works on Route Map tab as well as Radar tab. RainViewer tiles updated to native 256-pixel requests; mobile map gets a responsive layout and resize recovery.
- Airport lookup popup adds information from AWC and an optional OurAirports open dataset runway/frequency lookup, with a clear indication that operational details must be confirmed with official FAA Chart Supplement/airport. FBO/fuel/phones shown only when actually supplied by the source; otherwise provided official reference links.
- Auto 3 min checkbox (enabled by default), wall fullscreen button and UTC/Zulu clock. All feeds are refreshed, but each source retains caching. FAA NMS limits remain on the server: at most one upstream request per 180 seconds across all airport queries *per process*.

## Important limitations
- Production FAA NMS NOTAM requests across different airports compete for the single three-minute limit; an uncached lookup can return 429. Wall refresh does not bypass the FAA limit.
- AWC FB winds stations are not every airport: the input requires an official 3-letter FB reporting station.
- Runways/frequencies are from community data and not authoritative. FBO, fuel, phone, airspace are not guessed if unreported. Confirm operational details with FAA sources and directly with the airport.
- Live third-party provider responses, network responsiveness, and radar rendering on particular phones require testing after deploy.


## v2.6 — enlarged radar map correction
- Fixed conflicting modal image CSS that resized Leaflet's 256px radar tiles.
- Enlarged map now starts at the exact current main-map center and zoom (route mode still fits the plotted route).
- ResizeObserver and animation frame recalculate the map canvas after modal open, resize, or phone orientation change.
- Route map enlargement receives the same viewport recovery.
- Radar frames, existing FAA NOTAM integration and all other dashboards remain unchanged.

## v2.7 — Airport lookup data accuracy
- Fixes the airport-lookup field elevation: does not interpret ambiguous AWC `elev` values as feet. Uses explicitly labelled `elevation_ft` from OurAirports when available, with a community-data caveat.
- KOMA Eppley Airfield has verified FAA fields: surveyed elevation 984.5 feet MSL, Class C airspace, and a continuously staffed tower (FAA From the Flight Deck / published airport record). These are reference values, not a replacement for checking the current Chart Supplement or sectional.
- Displays `Not verified — refer to current FAA sectional` for unsupported airspace fields instead of silently omitting them or inventing classifications.
- Adds source labels to elevation/airspace/tower data. Other airport frequencies and runway data remain explicitly community sourced.
- No change to FAA NMS configuration, NOTAM refresh limits or radar.


## v2.8 — Local FAA airport identifiers in Flight Planner
- Preserves FAA identifiers such as 84Y, 2V2, and 0B5 instead of incorrectly adding a K prefix. Three-letter alphabetic US identifiers such as OMA continue to normalize to KOMA.
- Route endpoint obtains airport coordinates from AWC airport records where available and from the OurAirports open dataset when not; includes a published fallback for 84Y, Bloomfield Municipal Airport, Nebraska (42.5797244, -97.6736753).
- Allows route-distance / estimated time / fuel calculations for airports without METAR and TAF observations. Marks unavailable observations explicitly.
- KOMA → 84Y is the intended regression test. Flight planning calculations remain straight-line estimates, not obstacle, airspace, or weather-clearance validation.
- Existing NOTAM throttling, data sources, and environment variables are unchanged.

- Home Airport and Airport Lookup accept FAA local identifiers such as 84Y; do not add a K to identifiers containing digits. Winds Aloft requires an actual 3-letter FB forecast station, not an airport identifier. The UI now explains that distinction rather than inventing winds for 84Y.
