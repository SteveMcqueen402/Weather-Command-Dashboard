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
