// NOAA/NCEP GFS 0.25° via UCAR Unidata's NetCDF Subset Service (grid as point).
// Model guidance, not a legacy FB bulletin or an official aviation briefing.
const dataset = 'https://tds.scigw.unidata.ucar.edu/thredds/ncss/grid/grib/NCEP/GFS/Global_0p25deg/Best';
const east = 'u-component_of_wind_isobaric';
const north = 'v-component_of_wind_isobaric';
const height = 'Geopotential_height_isobaric';
const temp = 'Temperature_isobaric';
const cruiseLevels = [3000, 6000, 9000, 12000, 18000];

export function interpolateModelWind(points, levels = cruiseLevels) {
  const sorted = points.filter(p => Number.isFinite(p.altitude) && Number.isFinite(p.east) && Number.isFinite(p.north))
    .sort((a, b) => a.altitude - b.altitude);
  if (sorted.length < 2) return [];
  return levels.flatMap(altitude => {
    if (altitude < sorted[0].altitude || altitude > sorted.at(-1).altitude) return [];
    const index = Math.max(1, sorted.findIndex(p => p.altitude >= altitude));
    const a = sorted[index - 1], b = sorted[index];
    const f = b.altitude === a.altitude ? 0 : (altitude - a.altitude) / (b.altitude - a.altitude);
    const lerp = (x, y) => x + f * (y - x);
    const u = lerp(a.east, b.east), v = lerp(a.north, b.north);
    const speed = Math.hypot(u, v), calm = speed < 1;
    return [{ altitude, direction: calm ? null : Math.round((Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360) % 360,
      speed: Math.round(speed), tempC: Number.isFinite(a.tempC) && Number.isFinite(b.tempC) ? Math.round(lerp(a.tempC,b.tempC)) : null,
      calm, raw: null }];
  });
}

export function parseGfsPointCsv(body, [latitude, longitude], target) {
  const [header, ...lines] = body.trim().split(/\r?\n/);
  const fields = header.split(',');
  const col = name => fields.indexOf(name);
  const wanted = ['time', 'latitude[unit="degrees_north"]', 'longitude[unit="degrees_east"]',
    east+'[unit="m/s"]', north+'[unit="m/s"]', height+'[unit="gpm"]', temp+'[unit="K"]'];
  const [ti, la, lo, ui, vi, hi, ki] = wanted.map(col);
  if (wanted.some(name => col(name) < 0)) throw Error('Unexpected Unidata GFS variables or units');
  const numeric = field => field?.trim() ? Number(field) : NaN;
  const points = [];
  let valid = null;
  for (const line of lines) {
    const row = line.split(',');
    if (row.length !== fields.length) continue;
    const time = Date.parse(row[ti]), lat = numeric(row[la]), lon = numeric(row[lo]);
    const u = numeric(row[ui]), v = numeric(row[vi]), m = numeric(row[hi]), kelvin = numeric(row[ki]);
    const lonDelta = Math.abs(((lon - longitude + 540) % 360) - 180);
    if (!Number.isFinite(time) || Math.abs(time-target)>90*60000 || (valid!==null && time!==valid) ||
        !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat-latitude)>.26 || lonDelta>.26 ||
        !Number.isFinite(m) || m<0 || m>9000 || !Number.isFinite(u) || Math.abs(u)>150 ||
        !Number.isFinite(v) || Math.abs(v)>150) continue;
    valid=time;
    points.push({altitude:m*3.28084,east:u*1.94384449,north:v*1.94384449,
      tempC:kelvin>170 && kelvin<340 ? kelvin-273.15 : null});
  }
  const rows=interpolateModelWind(points);
  if (!rows.length) throw Error('Unidata GFS has no timely wind levels covering selectable cruise altitudes');
  return {rows,validAt:new Date(valid).toISOString()};
}

export async function unidataGfsWinds(coords, target) {
  // GFS data here are three-hourly. Request one point and one valid time.
  const slot=3*3600000;
  const time=new Date(Math.round(target/slot)*slot).toISOString();
  const url=new URL(dataset);
  url.search=new URLSearchParams({var:[east,north,height,temp].join(','),latitude:coords[0],
    longitude:coords[1],time,accept:'csv'});
  const response=await fetch(url,{headers:{'User-Agent':'WeatherCommandDashboard/3.13 (aviation forecast model guidance)',
    Accept:'text/csv'},signal:AbortSignal.timeout(8500)});
  if (!response.ok) {
    const err=Error('Unidata GFS forecast HTTP '+response.status);
    const retry=response.headers.get('retry-after');
    if(response.status===429)err.retryMs=retry&&/^\d+$/.test(retry)?Number(retry)*1000:
      (Date.parse(retry)-Date.now())||45*60000;
    throw err;
  }
  const body=await response.text();
  if(body.length>75000)throw Error('Unidata GFS point response was unexpectedly large');
  return parseGfsPointCsv(body,coords,target);
}
