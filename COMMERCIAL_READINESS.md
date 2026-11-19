# Weather Command — Commercial API Readiness Audit
**Reviewed:** 2026-11-19  
**Status:** DEVELOPMENT / NOT CLEARED FOR PAID SUBSCRIPTIONS

This document audits the API providers **actually referenced** in `server.mjs` and `app.js`. Links are original provider terms or documentation as of review. This is a technical/product audit, not a legal opinion.

## Provider matrix

| Feature / service | Active usage found in source | Commercial launch status | What we need to do |
| --- | --- | --- | --- |
| NWS forecasts, points and severe alerts (`api.weather.gov`) | Server endpoints `/api/forecast`, `/api/forecast-location`, `/api/alerts-location`; points and alerts | **Generally usable with conditions** | Follow NWS attribution and presentation restrictions; no implied endorsement; honor rate limits; cache by update frequency; request failures must fail gracefully |
| AviationWeather.gov METAR/TAF, airports, PIREPs, G-AIRMETs and winds | Proxied via server | **Likely permissible government feeds, verify operating rules** | Check AWC API access and application load before commercial launch; use server proxy (no CORS); comply with API usage guidance; avoid claims that this product is an official briefing |
| FAA NMS NOTAMs | Production/test endpoints with credentials via environment | **Conditional** | Verify commercial use and customer access conditions in FAA NMS agreement; test production calls and update schedule; keep access tokens strictly server-side |
| Open-Meteo GFS guidance | `server.mjs` wind model interpolation | **BLOCKED without commercial subscription** | Obtain Open-Meteo paid plan and enter `OPEN_METEO_API_KEY` in Render. Server now uses `customer-api.open-meteo.com` automatically when the key is present. If `WCD_COMMERCIAL_MODE=true`, no unpaid fallback is allowed. Confirm contracted capacity and test real calls |
| RainViewer radar (`api.rainviewer.com` and raster tiles in browser) | Radar metadata and client-side tile overlays | **BLOCKED** | Negotiate commercial terms with RainViewer or replace radar with an appropriately licensed provider; do not assume that the free endpoint can be used with paying customers |
| OpenStreetMap standard tiles (`tile.openstreetmap.org`) | Default Leaflet street-map basemap | **NOT production-ready at scale** | Use a commercial tile hosting provider or self-host; satisfy OSM attribution; implement usage and caching limits |
| Esri World Imagery (`server.arcgisonline.com`) | Satellite basemap | **Commercial license/attribution review required** | Confirm specific Esri/ArcGIS service entitlement, usage volume and downstream-customer license protections; do not remove source credit |
| ArcGIS FAA sectional tiles (`tiles.arcgis.com`) | VFR sectional map basemap | **Rights and chart currency review required** | Verify individual item owner, FAA aeronautical chart rights, map hosting terms, chart update obligations and required attributions; label as reference map, not an official chart |
| NOAA/WPC/SPC chart services | Surface/convective chart routes and outbound links | **Generally public government content; verify individual layers** | Keep product dates and attribution intact; do not imply NOAA/NWS endorsement; confirm any map layer containing third-party data |
| OurAirports (`raw.githubusercontent.com/davidmegginson/ourairports-data`) | Airport/runway/radio CSV metadata | **Public domain dataset** | Continue showing informational/staleness disclaimer; don't present as current FAA Chart Supplement |
| External aviation sites | External links and an AviationWeather.gov GFA iframe | **Embed limitations / branding review** | Verify embedding is allowed, not blocked by CSP/X-Frame-Options. Provide an external link fallback; avoid presenting third-party experience as QDS functionality |

## Implemented in this branch

1. **Paid Open-Meteo adapter**. When `OPEN_METEO_API_KEY` is present, GFS model forecast requests go to `https://customer-api.open-meteo.com/v1/gfs` with the key encoded as a parameter. Server-side only. Without a key, development mode retains the existing free API.
2. **Commercial fail-closed mode for Open-Meteo GFS**. When `WCD_COMMERCIAL_MODE=true` and `OPEN_METEO_API_KEY` is absent, the GFS provider returns an unavailable error rather than silently using the noncommercial API.
3. **`/api/provider-status` endpoint**: displays provider readiness flags without exposing credentials; `commercialReady:false` is intentionally fixed until all requirements are actually met.
4. **QDS marketing/advertising site** hosted alongside the app at `/qds`, `/product`, `/landing`, with direct access to the existing dashboard at `/`. It includes a live product embed and configurable ad copy via URL parameters.

## Required decisions and supplier contacts

### Commercial radar (highest priority)
- RainViewer commercial inquiry: https://www.rainviewer.com/api.html
- Quote needed: number of concurrent viewers, map tiles/request rate, maximum zoom, geographical coverage, radar retention/playback, commercial resale and uptime.
- Compare an alternate commercial radar platform or NOAA-hosted radar solution before committing.

### Map tiles
- OSM policy: https://operations.osmfoundation.org/policies/tiles/
- Choose licensed tile hosting, get key/billing, then replace client `L.tileLayer('https://tile.openstreetmap.org/...')` URL in `app.js`; verify terms for aviation sectional and Esri satellite toggles independently.

### Open-Meteo
- Pricing / commercial subscription: https://open-meteo.com/en/pricing
- After purchasing, set `OPEN_METEO_API_KEY` as a secret in the Render environment. Test the customer host; verify hourly calls and concurrent use. **Do not paste production API keys into the repository or a public site.**

### AWC / NWS
- AWC API: https://aviationweather.gov/data/api/
- NWS API: https://www.weather.gov/documentation/services-web-api
- NWS reuse conditions: https://www.weather.gov/disclaimer
- Confirm request rate, cache strategy, emergency error behavior and clear source attribution.

### FAA / maps
- Confirm FAA NMS API rights for redistribution/public display and record what is authorized in the FAA agreement.
- Validate NOAA/FAA/Esri/ArcGIS chart and basemap copyrights, attribution, live chart currency and reuse terms before accepting money.

## Release gates — all mandatory for a paid launch

- [ ] Commercial rights documented for radar, OSM replacement, satellite and sectional mapping
- [ ] Open-Meteo paid subscription **or** its noncommercial functionality fully removed/disabled
- [ ] FAA NOTAM production terms confirmed for customer-facing distribution
- [ ] API secrets remain server-side; public endpoints rate-limited and cache behavior tested
- [ ] 24–72-hour wall-display soak test including auto-refresh, reload, and provider outage handling
- [ ] Mobile, desktop and TV browser regression testing
- [ ] Customer authentication, access control and subscription billing implemented
- [ ] Privacy policy, terms of service, aviation disclaimers and cancellation/refund policy reviewed
- [ ] Pricing finalized against per-viewer data, hardware, hosting and support costs
- [ ] Lead capture / contact destination connected; marketing landing page currently points to live product preview and does not take orders
- [ ] Explicit go/no-go after commercial-provider access is verified

## Sources
- https://www.weather.gov/disclaimer
- https://www.weather.gov/documentation/services-web-api
- https://aviationweather.gov/data/api/
- https://open-meteo.com/en/pricing
- https://open-meteo.com/en/docs/gfs-api
- https://www.rainviewer.com/api.html
- https://www.rainviewer.com/api/transition-faq.html
- https://operations.osmfoundation.org/policies/tiles/
- https://www.esri.com/en-us/legal/terms/web-site-service
- https://ourairports.com/data/
