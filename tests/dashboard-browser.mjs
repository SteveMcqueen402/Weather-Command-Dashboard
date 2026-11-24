import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const origin = 'http://127.0.0.1:3000';
const leaflet = 'https://unpkg.com/leaflet@1.9.4/dist/';
const metar = 'METAR KOMA 241953Z 27012KT 10SM CLR 16/07 A3012';
const forecast = {
  updated: '2026-11-24T19:53:00Z',
  periods: [{ name: 'Today', isDaytime: true, temperature: 61, temperatureUnit: 'F',
    shortForecast: 'Sunny', windDirection: 'W', windSpeed: '12 mph' }],
};
const emptyFeed = { ok: true, items: [] };
const fixtures = new Map([
  ['/api/airport-route?ids=KOMA', {
    metars: [{ icaoId: 'KOMA', rawOb: metar, fltCat: 'VFR', wspd: 12, wdir: 270 }],
    tafs: [],
  }],
  ['/api/airport-route?ids=KOMA%2C84Y', {
    metars: [{ icaoId: 'KOMA', rawOb: metar, fltCat: 'VFR' }],
    airports: [{ icaoId: 'KOMA', lat: 41.301, lon: -95.894 }, { icaoId: '84Y', lat: 42.58, lon: -97.67 }],
  }],
  ['/api/winds-aloft?station=OMA&fcst=06', {
    available: true, modelGuidance: true, source: 'NOAA/NCEP GFS via UCAR Unidata',
    rows: [{ altitude: 6000, direction: 310, speed: 19 }],
    header: ['MODEL VALID 2026-11-25T06:00:00Z'],
  }],
  ['/api/location-forecast?lat=41.301&lon=-95.894', forecast],
  ['/api/home-alerts?lat=41.301&lon=-95.894', { features: [] }],
  ['/api/aviation-hazards?station=KOMA&lat=41.301&lon=-95.894', {
    station: 'KOMA', feeds: { pireps: emptyFeed, sigmets: emptyFeed, gairmets: emptyFeed },
  }],
  ['/api/notams?airport=KOMA&page=1', { notams: [], total: 0 }],
  ['/api/radar', {
    host: 'https://radar.example.invalid',
    radar: { past: [{ path: '/fixture', time: 1795549980 }] },
  }],
]);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  const pageErrors = [];
  const unhandledApiRequests = [];
  let aircraftRequests = 0;
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === leaflet + 'leaflet.js' || url.href === leaflet + 'leaflet.css') {
      const asset = url.pathname.split('/').pop();
      return route.fulfill({ path: require.resolve('leaflet/dist/' + asset) });
    }
    if (url.origin !== origin) return route.abort(); // Map tiles and other external assets.
    if (!url.pathname.startsWith('/api/')) return route.continue(); // Real app assets.
    const endpoint = url.pathname + url.search;
    if (endpoint === '/api/aircraft?reg=SWA3475') {
      aircraftRequests++;
      return route.fulfill({ json: {
        source: 'adsb.lol',
        position: { lat: 41.32, lon: -95.90, observedAt: Date.now(), altitude: 3500, groundspeed: 115 },
      } });
    }
    if (fixtures.has(endpoint)) return route.fulfill({ json: fixtures.get(endpoint) });
    unhandledApiRequests.push(endpoint);
    return route.fulfill({ status: 404, json: { error: 'Unmocked browser test request' } });
  });

  try {
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'dashboard HTML should load');
    assert.deepEqual(pageErrors, [], 'dashboard scripts should start without crashing');
    await page.waitForFunction(() => /^\d{2}:\d{2}:\d{2}Z$/.test(document.querySelector('#utc').textContent));
    assert.equal(await page.inputValue('#home-airport'), 'KOMA');
    await page.getByText(metar, { exact: true }).waitFor({ state: 'visible' });
    await page.locator('#temp').filter({ hasText: /^61°F$/ }).waitFor({ state: 'visible' });
    await page.locator('#forecast-days').getByText('Sunny', { exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#map-caption').textContent.startsWith('Radar '));
    await page.waitForFunction(() => document.querySelector('#checked').textContent.startsWith('Updated '));

    await page.getByRole('button', { name: 'Track Aircraft', exact: true }).click();
    const tracker = page.locator('#aircraft-tracker');
    await tracker.waitFor({ state: 'visible' });
    await tracker.getByLabel('GA tail or airline flight number').fill('WN3475');
    await tracker.getByRole('button', { name: 'Track', exact: true }).click();
    await tracker.getByRole('status').filter({ hasText: /WN3475 \(SWA3475\).*115 kt GS.*Position reported/ })
      .waitFor({ state: 'visible' });
    await page.locator('#main-map .tracked-aircraft-icon').waitFor({ state: 'visible' });
    assert.equal(aircraftRequests, 1, 'the tracker should look up the operating callsign');
    await page.locator('#notam-feed-status').filter({ hasText: 'No NOTAMs returned' }).waitFor({ state: 'visible' });
    await page.getByRole('textbox', { name: 'Destination identifier' }).fill('84Y');
    await page.getByRole('button', { name: 'Plan route', exact: true }).click();
    await page.locator('#distance').filter({ hasText: /110 NM/ }).waitFor({ state: 'visible' });
    await page.locator('#route-wind-summary').filter({ hasText: /UCAR Unidata.*19 kt from 310° true/ }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Expand .*ROUTE PLANNER/ }).click();
    await page.getByRole('dialog', { name: 'Route Airport Weather' }).waitFor({state: 'visible'});
    await page.getByRole('button', { name: 'Close viewer' }).click();
    await page.getByRole('dialog', { name: 'Route Airport Weather' }).waitFor({state: 'hidden'});

    assert.deepEqual(unhandledApiRequests, [], 'all API calls should use fixtures');
    assert.deepEqual(pageErrors, [], 'there should be no uncaught browser errors');
    console.log('KOMA browser smoke test passed: weather, NOTAMs, aircraft tracker, and wind-adjusted route work.');
  } catch (error) {
    if (pageErrors.length) console.error('Uncaught browser errors:', pageErrors);
    if (unhandledApiRequests.length) console.error('Unmocked API requests:', unhandledApiRequests);
    throw error;
  }
} finally {
  await browser.close();
}
