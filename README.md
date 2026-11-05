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
