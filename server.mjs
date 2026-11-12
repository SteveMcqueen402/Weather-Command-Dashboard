import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const cache=new Map();
async function upstream(url,ttl=60000){
  const existing=cache.get(url); if(existing && Date.now()-existing.at<ttl)return existing.value;
  const res=await fetch(url,{headers:{'User-Agent':'WeatherCommandDashboard/0.1 (personal weather monitor)','Accept':'application/geo+json, application/json, text/plain'},signal:AbortSignal.timeout(14000)});
  if(res.status===204)return null;
  if(!res.ok)throw Error(`Upstream service returned ${res.status}`);
  const value=await res.json();cache.set(url,{value,at:Date.now()});return value;
}
// AWC publishes legacy FB winds/temperatures as fixed-width/text station rows.
// This endpoint is distinct from the JSON METAR/TAF endpoints.
const windTableCache=new Map();
function validWindTable(text){
  // Check actual forecast rows, not just a single rigid header spelling.
  return /\bFT\s+3000\s+6000\s+9000\b/i.test(text) &&
    /\bDATA BASED ON\s+\d{6}Z/i.test(text) &&
    /^\s*[A-Z]{3}\s+\d{4}/m.test(text);
}
function decodeNwsProductHtml(html){
  // NWS weather.gov product pages contain a forecast in a preformatted text block.
  const blocks=[...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)].map(x=>x[1]);
  const candidates=blocks.length?blocks:[html];
  for(const value of candidates){
    const plain=value.replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ')
      .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&')
      .replace(/\r/g,'');
    if(validWindTable(plain))return plain;
  }
  return '';
}
async function readWindTable(fcst){
  const existing=windTableCache.get(fcst);
  if(existing&&Date.now()-existing.at<900000)return existing;
  // AWC is the preferred official publisher; weather.gov offers the official
  // FD1/FD2/FD3 NWS text products as an independent fallback.
  const product={'06':'FD1','12':'FD2','24':'FD3'}[fcst];
  const sources=[
    {name:'NOAA Aviation Weather Center',url:`https://aviationweather.gov/api/data/windtemp?region=us&level=low&fcst=${fcst}`,html:false},
    {name:'NWS FD forecast text',url:`https://forecast.weather.gov/product.php?site=NWS&issuedby=US1&product=${product}&format=TXT`,html:true}
  ];
  const failures=[];
  for(const source of sources){
    try{
      const response=await fetch(source.url,{headers:{'User-Agent':'WeatherCommandDashboard/2.1 (aviation planning)','Accept':source.html?'text/html,text/plain':'text/plain'},signal:AbortSignal.timeout(14000)});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const body=await response.text();
      const text=source.html?decodeNwsProductHtml(body):body;
      if(!validWindTable(text))throw Error('response contained no recognized official FB table');
      const item={text,source:source.name,at:Date.now()};
      windTableCache.set(fcst,item);return item;
    }catch(err){failures.push(`${source.name}: ${err.message}`);}
  }
  throw Error('Official winds/temperature forecasts currently unavailable from AWC and NWS. '+failures.join('; '));
}
function decodeFB(code,altitude){
  if(!/^\d{4}(?:[+-]\d{2}|\d{2})?$/.test(code))return null;
  const d=Number(code.slice(0,2)),s=Number(code.slice(2,4));
  if(d===99)return{altitude,direction:null,speed:0,tempC:null,calm:true,raw:code};
  let direction=d*10,speed=s;
  if(d>=50){direction=(d-50)*10;speed+=100;}
  // FB table omits temperatures at 3000 ft, and below 24000 ft may use a sign.
  let tempC=null;
  if(code.length>4){const raw=code.slice(4);if(/^[+-]\d{2}$/.test(raw))tempC=Number(raw);else if(/^\d{2}$/.test(raw))tempC=altitude>=24000?-Number(raw):Number(raw);}
  return {altitude,direction,speed,tempC,calm:false,raw:code};
}
function parseWinds(raw,station){
  const lines=raw.split(/\r?\n/);
  const head=lines.find(x=>/\bFT\s+3000\b/.test(x));
  if(!head)throw Error('FB forecast levels missing');
  const levels=[...head.matchAll(/\b(3000|6000|9000|12000|18000|24000|30000|34000|39000)\b/g)].map(m=>Number(m[1]));
  const line=lines.find(x=>new RegExp('^\\s*'+station+'\\s+\\d{4}').test(x));
  if(!line)return {station,levels,rows:[],available:false};
  // NWS tables may omit 3,000 ft or 6,000 ft forecasts, especially at high terrain.
  // Use the fixed-width header column positions to retain correct altitude mapping.
  const first=lines.find(x=>/\bFT\s+3000\s+6000\b/.test(x));
  const headerSlots=[...first.matchAll(/\b(3000|6000|9000|12000|18000|24000|30000|34000|39000)\b/g)]
    .map(m=>({altitude:Number(m[1]),position:m.index}));
  const parts=[...line.matchAll(/\S+/g)].slice(1);
  let rows=[];
  for(const part of parts){
    // Header values start farther right than corresponding row values by a few columns.
    const position=part.index;
    let match=headerSlots.reduce((best,slot)=>{
      const distance=Math.abs(slot.position-position);
      return !best||distance<best.distance?{slot,distance}:best;
    },null);
    if(match && match.distance<=6){
      const decoded=decodeFB(part[0],match.slot.altitude);
      if(decoded && !rows.some(x=>x.altitude===decoded.altitude))rows.push(decoded);
    }
  }
  rows.sort((a,b)=>a.altitude-b.altitude);
  if(!rows.length){ // Fall back only when the fixed-column variant cannot be identified.
    const cols=line.trim().split(/\s+/).slice(1);
    rows=cols.map((v,i)=>decodeFB(v,levels[i])).filter(Boolean);
  }
  return {station,levels,rows,available:rows.length>0};
}


// Fallback model guidance is distinct from the published FB tables.
// Use only for locations whose station coordinates are explicitly known.
const modelWindsStations={OMA:[41.3032,-95.8941],OFK:[41.9855,-97.4351],DSM:[41.534,-93.6631]};
const modelWindsCache=new Map();
async function readModelWinds(station,fcst){
  const key=station+'/'+fcst,cached=modelWindsCache.get(key);
  if(cached&&Date.now()-cached.at<900000)return cached.value;
  const levels=[925,900,850,800,750,700,650,600,550,500,450,400];
  const fields=levels.flatMap(p=>['wind_speed_'+p+'hPa','wind_direction_'+p+'hPa','geopotential_height_'+p+'hPa']);
  const [lat,lon]=modelWindsStations[station];
  const url='https://api.open-meteo.com/v1/gfs?latitude='+lat+'&longitude='+lon+
    '&hourly='+encodeURIComponent(fields.join(','))+'&wind_speed_unit=kn&timezone=GMT&forecast_days=3';
  const response=await fetch(url,{headers:{'User-Agent':'WeatherCommandDashboard/3.0 (forecast model guidance)'},signal:AbortSignal.timeout(14000)});
  if(!response.ok)throw Error('GFS model provider HTTP '+response.status);
  const hourly=(await response.json()).hourly;
  if(!hourly?.time?.length)throw Error('No GFS forecast hours');
  const target=Date.now()+Number(fcst)*3600000;
  const idx=hourly.time.reduce((best,t,i)=>Math.abs(Date.parse(t+'Z')-target)<Math.abs(Date.parse(hourly.time[best]+'Z')-target)?i:best,0);
  const points=levels.map(p=>({altitude:Number(hourly['geopotential_height_'+p+'hPa']?.[idx])*3.28084,
    speed:Number(hourly['wind_speed_'+p+'hPa']?.[idx]),direction:Number(hourly['wind_direction_'+p+'hPa']?.[idx])}))
    .filter(v=>Number.isFinite(v.altitude)&&Number.isFinite(v.speed)&&Number.isFinite(v.direction)).sort((a,b)=>a.altitude-b.altitude);
  if(points.length<2)throw Error('GFS pressure-level wind data missing');
  const rows=[3000,6000,9000,12000,18000].filter(ft=>ft>=points[0].altitude&&ft<=points.at(-1).altitude).map(altitude=>{
    const i=points.findIndex(v=>v.altitude>=altitude);if(i<=0)return null;
    const low=points[i-1],high=points[i],t=(altitude-low.altitude)/(high.altitude-low.altitude);
    const vector=p=>({e:-p.speed*Math.sin(p.direction*Math.PI/180),n:-p.speed*Math.cos(p.direction*Math.PI/180)});
    const a=vector(low),b=vector(high),e=a.e+(b.e-a.e)*t,n=a.n+(b.n-a.n)*t,speed=Math.hypot(e,n);
    return {altitude,direction:Math.round((Math.atan2(-e,-n)*180/Math.PI+360)%360),
      speed:Math.round(speed),tempC:null,calm:speed<1,raw:null};
  }).filter(Boolean);
  if(!rows.length)throw Error('GFS returned no usable flight-level winds');
  const validAt=hourly.time[idx]+'Z';
  const value={station,fcst,rows,levels:rows.map(x=>x.altitude),available:true,
    header:['MODEL VALID '+validAt,'GFS guidance — NOT an official FB forecast'],
    source:'Open-Meteo GFS model guidance',modelGuidance:true,validAt,retrievedAt:new Date().toISOString()};
  modelWindsCache.set(key,{at:Date.now(),value});return value;
}

// Community airport communications/runway data. Cache whole source datasets for a day;
// never present them as current FAA Chart Supplement or verified FBO/fuel data.
const airportCsvCache=new Map();
function parseCsv(data){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<data.length;i++){const c=data[i];if(c==='"'){if(quoted&&data[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&data[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field=''}else field+=c;}if(field||row.length){row.push(field);rows.push(row)}const head=rows.shift()||[];return rows.map(r=>Object.fromEntries(head.map((k,i)=>[k,r[i]||''])))}
async function communityCsv(name){const c=airportCsvCache.get(name);if(c&&Date.now()-c.at<86400000)return c.rows;const url='https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/'+name+'.csv';const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'WeatherCommandDashboard/2.5 (airport-info; contact site administrator)'}});if(!response.ok)throw Error('Community airport data HTTP '+response.status);const raw=await response.text();if(raw.length>18000000)throw Error('Airport data file too large');const rows=parseCsv(raw);airportCsvCache.set(name,{at:Date.now(),rows});return rows;}

const apis={
  points:()=>['https://api.weather.gov/points/41.2565,-95.9345',3600000],
  alerts:()=>['https://api.weather.gov/alerts/active?area=NE',60000],
  metar:()=>['https://aviationweather.gov/api/data/metar?ids=KOMA,KCBF,KLNK,KMLE&format=json',300000],
  taf:()=>['https://aviationweather.gov/api/data/taf?ids=KOMA&format=json',600000],
  radar:()=>['https://api.rainviewer.com/public/weather-maps.json',600000]
};

// Render-hosted, allowlisted image relay. Some official chart servers block browser hotlinking.
// If the official source denies server access too, return 503 so the UI shows an explicit fallback.
const chartSources={
  surface:['https://www.wpc.ncep.noaa.gov/sfc/usfntsfc.gif',
           'https://www.wpc.ncep.noaa.gov/sfc/namussfcwbg.gif'],
  convective:['https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/export?bbox=-125,24,-66,50&bboxSR=4326&imageSR=4326&size=1200,560&format=png32&transparent=false&f=image&layers=show:1','https://www.spc.noaa.gov/products/outlook/day1otlk.gif'],
  'convective-2':['https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/export?bbox=-125,24,-66,50&bboxSR=4326&imageSR=4326&size=1200,560&format=png32&transparent=false&f=image&layers=show:9','https://www.spc.noaa.gov/products/outlook/day2otlk.gif'],
  'convective-3':['https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/export?bbox=-125,24,-66,50&bboxSR=4326&imageSR=4326&size=1200,560&format=png32&transparent=false&f=image&layers=show:17','https://www.spc.noaa.gov/products/outlook/day3otlk.gif']
};
const chartCache=new Map();
async function officialChart(key){
  const old=chartCache.get(key);
  if(old && Date.now()-old.at<10*60*1000)return old;
  for(const url of chartSources[key]){
    try{
      const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 WeatherCommandDashboard/0.7.1','Accept':'image/avif,image/webp,image/png,image/gif,image/jpeg,image/*','Referer':new URL(url).origin+'/'},signal:AbortSignal.timeout(10000)});
      if(!response.ok)continue;
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length<200 || bytes.length>10_000_000)continue;
      const mime=bytes.subarray(0,6).toString('ascii').startsWith('GIF8')?'image/gif':
        bytes.subarray(0,4).toString('hex')==='89504e47'?'image/png':
        bytes.subarray(0,3).toString('hex')==='ffd8ff'?'image/jpeg':null;
      if(!mime)continue;
      const item={bytes,mime,at:Date.now()};chartCache.set(key,item);return item;
    }catch{ /* try next allowlisted official chart endpoint */ }
  }
  return null;
}

// FAA NMS OAuth2 credentials remain server-side. Never send them to browsers.
const nmsTokenCache=new Map();
// FAA NMS production onboarding: no more than one API data pull per three minutes.
// This is a conservative, deployment-wide limiter for this single Render process.
// Repeated requests for the same airport return a server-side cached result.
// A different airport during the interval gets an explicit retry response; it NEVER
// silently receives notices belonging to another airport.
const NMS_MIN_PULL_INTERVAL_MS=180000;
const nmsAirportCache=new Map();
let nmsLastPullStart=0;
let nmsPullInFlight=null;

function isSecureNmsEndpoint(raw){try{return new URL(raw).protocol==='https:';}catch{return false;}}
async function nmsAccessToken(auth,id,secret){
  const key=auth+'|'+id;
  const cached=nmsTokenCache.get(key);
  if(cached&&cached.until>Date.now()+30000)return cached.token;
  const authHeader=Buffer.from(id+':'+secret).toString('base64');
  const response=await fetch(auth,{method:'POST',headers:{Authorization:'Basic '+authHeader,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error(response.status===401||response.status===403?'FAA NMS authentication rejected the client Key/Secret.':`FAA NMS authentication returned HTTP ${response.status}.`);
  const result=await response.json();
  const token=result.access_token||result.accessToken;
  if(typeof token!=='string'||!token)throw Error('FAA NMS authentication returned no access token.');
  const seconds=Math.max(60,Math.min(86400,Number(result.expires_in)||1800));
  nmsTokenCache.set(key,{token,until:Date.now()+seconds*1000});return token;
}
function extractNmsNotams(payload,airport){
  // FAA NMS-API OpenAPI schema: {status:"Success",data:{geojson:[Feature,...]}}.
  // Do not confuse an application error (HTTP 200/status Failure) with an empty result.
  if(!payload||typeof payload!=='object')throw Error('FAA NMS returned an invalid JSON response.');
  if(typeof payload.status==='string'&&payload.status.toLowerCase()!=='success'){
    const errors=Array.isArray(payload.errors)?payload.errors.map(x=>x?.message).filter(Boolean).slice(0,3).join('; '):'';
    throw Error('FAA NMS reported '+payload.status+(errors?': '+errors:''));
  }
  if(payload.data?.url){throw Error('FAA NMS returned a temporary download URL rather than direct airport NOTAM data.');}
  const input=Array.isArray(payload?.data?.geojson)?payload.data.geojson:
    Array.isArray(payload?.geojson)?payload.geojson:
    Array.isArray(payload)?payload:
    payload?.type==='FeatureCollection'&&Array.isArray(payload.features)?payload.features:
    Array.isArray(payload?.features)?payload.features:
    Array.isArray(payload?.notams)?payload.notams:
    Array.isArray(payload?.results)?payload.results:null;
  if(input===null)return null;
  const clean=(v)=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
  const first=(...v)=>v.map(clean).find(Boolean)||'';
  return input.slice(0,250).map((entry,index)=>{
    const props=entry?.properties&&typeof entry.properties==='object'?entry.properties:entry;
    const core=props?.coreNOTAMData||entry?.coreNOTAMData||{};
    const notam=core?.notam||{};
    const translation=Array.isArray(core.notamTranslation)?core.notamTranslation:[];
    const local=translation.find(t=>t?.type==='LOCAL_FORMAT');
    const icao=translation.find(t=>t?.type==='ICAO');
    const original=first(local?.simpleText,icao?.formattedText,...translation.map(t=>t?.simpleText||t?.formattedText));
    const message=first(notam.text,props?.traditionalMessage,props?.traditionalText,props?.notamText,props?.text,props?.message,props?.description);
    const serial=first(notam.number,props?.notamNumber,props?.number,props?.notamId,entry?.id,notam.id)||('NOTAM '+(index+1));
    const location=first(notam.icaoLocation,notam.location,props?.icaoLocation,props?.location,props?.locationId,props?.airport)||airport;
    const category=first(notam.classification,props?.classification,props?.feature,props?.category,props?.type)||'NOTAM';
    const safeOriginal=original||message||JSON.stringify(props).slice(0,4000);
    return {number:serial.slice(0,160),category:category.slice(0,100),categoryCode:'OTHER',text:safeOriginal.slice(0,12000),reading:(message||original||'Review original FAA NOTAM details.').slice(0,4000),start:first(notam.effectiveStart,props?.effectiveStartDate,props?.effectiveStart,props?.startDate,props?.validFrom)||null,end:first(notam.effectiveEnd,props?.effectiveEndDate,props?.effectiveEnd,props?.endDate,props?.validTo)||null,isTfr:false,location,status:'unverified',rawProperties:props};
  });
}

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://localhost:${port}`);
    if(u.pathname.startsWith('/api/chart/')){
      let key=u.pathname.slice('/api/chart/'.length);
      if(key==='convective'){const day=u.searchParams.get('day')||'1';if(!['1','2','3'].includes(day)){res.writeHead(400);res.end('Invalid forecast day');return;}if(day!=='1')key='convective-'+day;}
      if(!Object.hasOwn(chartSources,key)){res.writeHead(404);res.end('Unknown chart');return;}
      const chart=await officialChart(key);
      if(!chart){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Official chart image unavailable');return;}
      res.writeHead(200,{'Content-Type':chart.mime,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});res.end(chart.bytes);return;
    }
    if(u.pathname==='/api/notams'){
      const airport=(u.searchParams.get('airport')||'').trim().toUpperCase();
      if(!/^[A-Z0-9]{3,4}$/.test(airport)){
        res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Enter a 3- or 4-character airport identifier.'}));return;
      }
      const clientId=process.env.NMS_API_CLIENT_ID;
      const clientSecret=process.env.NMS_API_CLIENT_SECRET;
      const env=(process.env.NMS_API_ENV||'test').toLowerCase();
      if(!['test','production'].includes(env)){
        res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'NMS_API_ENV must be test or production.'}));return;
      }
      if(!clientId||!clientSecret){
        res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({configured:false,error:'FAA NMS access is not configured. Set NMS_API_CLIENT_ID and NMS_API_CLIENT_SECRET in Render.'}));return;
      }
      // Production URLs were provided explicitly by FAA NMS onboarding.
      const base=process.env.NMS_API_BASE_URL||(env==='test'?'https://api-staging.cgifederal-aim.com/nmsapi':'https://api-nms.aim.faa.gov/nmsapi');
      const auth=process.env.NMS_AUTH_URL||(env==='test'?'https://api-staging.cgifederal-aim.com/v1/auth/token':'https://api-nms.aim.faa.gov/v1/auth/token');
      const key=env+'|'+airport;
      const cached=nmsAirportCache.get(key);
      if(cached&&Date.now()-cached.at<NMS_MIN_PULL_INTERVAL_MS){
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(JSON.stringify({...cached.value,cached:true,cacheAgeSeconds:Math.floor((Date.now()-cached.at)/1000),nextRefreshAt:new Date(cached.at+NMS_MIN_PULL_INTERVAL_MS).toISOString()}));return;
      }
      // Only one upstream NOTAM data fetch may be underway on this process.
      // This gate protects FAA rate limits even when several tabs refresh at once.
      if(nmsPullInFlight||Date.now()-nmsLastPullStart<NMS_MIN_PULL_INTERVAL_MS){
        const retryMs=Math.max(1000,NMS_MIN_PULL_INTERVAL_MS-(Date.now()-nmsLastPullStart));
        res.writeHead(429,{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(Math.ceil(retryMs/1000))});
        res.end(JSON.stringify({configured:true,environment:env,airport,rateLimited:true,retryAfterSeconds:Math.ceil(retryMs/1000),error:'FAA NMS permits one NOTAM data pull every three minutes. Please retry this airport after the indicated interval. Existing cached airport results remain available.'}));return;
      }
      // Reserve the entire three-minute slot synchronously before first await.
      nmsLastPullStart=Date.now();
      nmsPullInFlight={airport,at:nmsLastPullStart};
      try{
        if(!isSecureNmsEndpoint(base)||!isSecureNmsEndpoint(auth))throw Error('Invalid NMS endpoint configuration (HTTPS required).');
        // Never label staging responses production, including when Render has old URL overrides.
        if(env==='production'&&(new URL(base).hostname!=='api-nms.aim.faa.gov'||new URL(auth).hostname!=='api-nms.aim.faa.gov'))throw Error('NMS_API_ENV is production but the endpoint URL is not the FAA production host. Remove old staging NMS_API_BASE_URL and NMS_AUTH_URL overrides from Render.');
        if(env==='test'&&(new URL(base).hostname!=='api-staging.cgifederal-aim.com'||new URL(auth).hostname!=='api-staging.cgifederal-aim.com'))throw Error('NMS_API_ENV is test but an endpoint URL is not the FAA pre-production host.');
        const accessToken=await nmsAccessToken(auth,clientId,clientSecret);
        // Preserve the API's base path if supplied as the documented /nmsapi root.
        const prefix=base.replace(/\/$/,'');
        const endpoint=new URL(prefix+'/v1/notams');endpoint.searchParams.set('location',airport);
        const resp=await fetch(endpoint,{headers:{Authorization:'Bearer '+accessToken,nmsResponseFormat:'GEOJSON',Accept:'application/json'},signal:AbortSignal.timeout(12000)});
        if(!resp.ok){
          const message=resp.status===401||resp.status===403?'FAA NMS rejected the access token. Confirm the key/secret and environment.':`FAA NMS returned HTTP ${resp.status}.`;
          res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({configured:true,error:message}));return;
        }
        const data=await resp.json();
        const records=extractNmsNotams(data,airport);
        if(records===null)throw Error('NMS response format remains unrecognized. Please provide the sanitized response shape (field names only) from Render logs; no NOTAMs have been assumed.');
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        const value={configured:true,airport,notams:records,total:records.length,hasMore:false,page:1,limited:data?.data?.geojson?.length>250,source:env==='test'?'FAA NMS PRE-PRODUCTION (TEST ONLY)':'FAA NMS PRODUCTION',environment:env,checkedAt:new Date().toISOString()};
        nmsAirportCache.set(key,{value,at:Date.now()});
        res.end(JSON.stringify({...value,cached:false,nextRefreshAt:new Date(nmsLastPullStart+NMS_MIN_PULL_INTERVAL_MS).toISOString()}));return;
      }catch(e){
        const message=e.name==='TimeoutError'?'NMS request timed out.':e.message;
        res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({configured:true,error:message}));return;
      }finally{
        nmsPullInFlight=null;
      }
    }
    if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'ok'}));return;}
    if(u.pathname==='/api/aviation-hazards'){
      const station=(u.searchParams.get('station')||'KOMA').trim().toUpperCase();
      if(!/^[A-Z0-9]{3,4}$/.test(station)){
        res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid airport identifier'}));return;
      }
      const icao=station.length===3&&/^[A-Z]{3}$/.test(station)?'K'+station:station;
      const sources={
        pireps:'https://aviationweather.gov/api/data/pirep?ids='+encodeURIComponent(icao)+'&distance=200&age=3&format=json',
        sigmets:'https://aviationweather.gov/api/data/airsigmet?format=json',
        gairmets:'https://aviationweather.gov/api/data/gairmet?format=json'
      };
      const keys=Object.keys(sources);
      const calls=await Promise.allSettled(keys.map(key=>upstream(sources[key],180000)));
      const feeds=Object.fromEntries(keys.map((key,index)=>{
        const call=calls[index];
        if(call.status==='rejected')return [key,{ok:false,error:String(call.reason?.message||'AWC feed unavailable'),items:[]}];
        if(call.value!==null&&!Array.isArray(call.value))
          return [key,{ok:false,error:'Unexpected AWC response format',items:[]}];
        return [key,{ok:true,items:(call.value||[]).slice(0,400)}];
      }));
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=120'});
      res.end(JSON.stringify({station:icao,scope:{pireps:'Reports within 200 NM, past 3 hours',sigmets:'US/wide-area bulletin feed — not airport-filtered',gairmets:'CONUS graphical advisories — not airport-filtered'},feeds,checkedAt:new Date().toISOString()}));return;
    }
    if(u.pathname==='/api/winds-aloft'){
      const fcst=u.searchParams.get('fcst')||'06';
      const station=(u.searchParams.get('station')||'OMA').toUpperCase();
      if(!['06','12','24'].includes(fcst)||!/^[A-Z]{3}$/.test(station)){
        res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid forecast hour or station'}));return;
      }
      let output;
      try{
        const report=await readWindTable(fcst);
        const raw=report.text,parsed=parseWinds(raw,station);
        if(!parsed.available||!parsed.rows.length)throw Error('Station '+station+' unavailable in legacy FB table');
        const header=raw.split(/\r?\n/).slice(0,12).filter(x=>/DATA BASED|VALID|FOR USE|TEMPS NEG/i.test(x)).map(x=>x.trim());
        output={...parsed,fcst,header,source:report.source+' · official FB winds/temperatures',retrievedAt:new Date().toISOString(),modelGuidance:false};
      }catch(err){
        if(!modelWindsStations[station])throw Error('Official winds unavailable for '+station+': '+err.message);
        output=await readModelWinds(station,fcst);
      }
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=300'});
      res.end(JSON.stringify(output));return;
    }

    if(u.pathname==='/api/airport-info'){
      const id=(u.searchParams.get('id')||'').trim().toUpperCase();
      if(!/^[A-Z0-9]{3,4}$/.test(id)){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid airport identifier'}));return;}
      const icao=id.length===3&&/^[A-Z]{3}$/.test(id)?'K'+id:id;
      let airport=null,frequencies=[],runways=[],sourceError='';
      // AWC airport `elev` is not used as an FAA-confirmed feet value. Keep
      // elevation units explicit and prefer elevation_ft from the airport dataset.
      const publishedAirportOverrides={
        KOMA:{name:'Eppley Airfield',city:'Omaha',state:'Nebraska',
          fieldElevationFt:984.5,fieldElevationSource:'FAA airport record (surveyed)',
          airspaceClass:'C',airspaceSource:'FAA From the Flight Deck — OMA',
          controlTower:'Yes — continuous',controlTowerSource:'FAA From the Flight Deck — OMA'}
      };
      const results=await Promise.allSettled([
        upstream('https://aviationweather.gov/api/data/airport?ids='+encodeURIComponent(icao)+'&format=json',86400000),
        communityCsv('airports'),communityCsv('airport-frequencies'),communityCsv('runways')
      ]);
      if(results[0].status==='fulfilled'&&Array.isArray(results[0].value))airport=results[0].value[0]||null;
      if(results.slice(1).every(x=>x.status==='fulfilled')){
        const list=results[1].value;
        const a=list.find(x=>[x.ident,x.gps_code,x.icao_code,x.local_code].some(code=>code&&[icao,id,icao.slice(1)].includes(code.toUpperCase())));
        if(a){
          if(!airport)airport={name:a.name,city:a.municipality,state:a.iso_region,type:a.type};
          // OurAirports elevation_ft has documented units of feet MSL.
          const communityElevation=Number(a.elevation_ft);
          if(a.elevation_ft!==''&&Number.isFinite(communityElevation)&&communityElevation>=-1500&&communityElevation<=15000){
            airport.fieldElevationFt=communityElevation;
            airport.fieldElevationSource='OurAirports community dataset (verify with FAA)';
          }
          frequencies=results[2].value.filter(f=>f.airport_ref===a.id).map(f=>({type:f.type,mhz:f.frequency_mhz,description:f.description}));
          runways=results[3].value.filter(r=>r.airport_ref===a.id).map(r=>({le_ident:r.le_ident,he_ident:r.he_ident,length_ft:r.length_ft,width_ft:r.width_ft,surface:r.surface}));
        }
      }else sourceError='Community runway/frequency data temporarily unavailable';
      if(publishedAirportOverrides[icao]){
        airport={...(airport||{}),...publishedAirportOverrides[icao]};
      }
      // Do not infer controlled-airspace class from the existence of a tower,
      // coordinates, airport size or METAR. Class must be independently sourced.
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=3600'});res.end(JSON.stringify({id:icao,airport,frequencies,runways,sourceError,checkedAt:new Date().toISOString()}));return;
    }
    if(u.pathname==='/api/airport-route'){
      const raw=(u.searchParams.get('ids')||'').toUpperCase().split(/[\s,;>-]+/).filter(Boolean);
      if(!raw.length||raw.length>12||raw.some(id=>!/^[A-Z0-9]{3,4}$/.test(id))){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Enter 1–12 valid 3- or 4-character airport identifiers.'}));return;}
      const ids=raw.map(id=>id.length===3&&/^[A-Z]{3}$/.test(id)?'K'+id:id);
      const unique=[...new Set(ids)];
      // Local FAA identifiers such as 84Y are valid airports, but not ICAO
      // stations. Do not manufacture K84Y or require on-field METARs/TAFs.
      const aviationIds=unique.filter(id=>/^K[A-Z]{3}$/.test(id)||/^[A-Z]{4}$/.test(id));
      const joined=aviationIds.join(',');
      const base='https://aviationweather.gov/api/data/';
      const results=await Promise.allSettled([
        joined?upstream(base+'metar?ids='+encodeURIComponent(joined)+'&format=json',180000):Promise.resolve([]),
        joined?upstream(base+'taf?ids='+encodeURIComponent(joined)+'&format=json',300000):Promise.resolve([]),
        joined?upstream(base+'airport?ids='+encodeURIComponent(joined)+'&format=json',86400000):Promise.resolve([]),
        communityCsv('airports')
      ]);
      const array=i=>results[i].status==='fulfilled'&&Array.isArray(results[i].value)?results[i].value:[];
      const metars=array(0),tafs=array(1),airports=array(2);
      const community=array(3);
      const matching=(row,id)=>[row.ident,row.gps_code,row.icao_code,row.local_code].some(code=>String(code||'').toUpperCase()===id);
      for(const id of unique){
        if(airports.some(row=>[row.icaoId,row.icao,row.ident,row.id].some(code=>String(code||'').toUpperCase()===id)))continue;
        const row=community.find(row=>matching(row,id));
        if(row){
          const lat=Number(row.latitude_deg),lon=Number(row.longitude_deg);
          if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
            airports.push({icaoId:id,ident:id,name:row.name,lat,lon,
              latitude:lat,longitude:lon,locationSource:'OurAirports open dataset; verify current FAA records',
              elevation_ft:row.elevation_ft||null});
          }
        }
      }
      // A published-location fallback for 84Y; only used if the general
      // open airport database cannot be fetched or lacks the station.
      if(unique.includes('84Y')&&!airports.some(row=>String(row.icaoId||row.ident).toUpperCase()==='84Y')){
        airports.push({icaoId:'84Y',ident:'84Y',name:'Bloomfield Municipal Airport',
          lat:42.5797244,lon:-97.6736753,
          locationSource:'Published FAA airport coordinates; verify current FAA records'});
      }
      if(results.slice(0,3).every(r=>r.status==='rejected')&&!airports.length){
        res.writeHead(502,{'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'Airport location data is temporarily unavailable.'}));return;
      }
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=120'});
      res.end(JSON.stringify({ids,metars,tafs,airports,partial:results.some(r=>r.status==='rejected'),checkedAt:new Date().toISOString()}));return;
    }
    if(u.pathname==='/api/home-alerts'){
      const lat=Number(u.searchParams.get('lat')),lon=Number(u.searchParams.get('lon'));
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid home airport coordinates'}));return;}
      const data=await upstream('https://api.weather.gov/alerts/active?point='+lat.toFixed(4)+','+lon.toFixed(4),60000);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=60'});res.end(JSON.stringify(data));return;
    }
    if(u.pathname==='/api/location-forecast'){
      const lat=Number(u.searchParams.get('lat'));const lon=Number(u.searchParams.get('lon'));
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<24||lat>50||lon< -125||lon> -66){
        res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Multi-day NWS forecast requires coordinates in the contiguous United States.'}));return;
      }
      const points=await upstream(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,3600000);
      if(!points?.properties?.forecast)throw Error('NWS forecast unavailable for this location');
      const forecast=await upstream(points.properties.forecast,300000);
      const periods=(forecast?.properties?.periods||[]).slice(0,14).map(p=>({name:p.name,startTime:p.startTime,isDaytime:p.isDaytime,temperature:p.temperature,temperatureUnit:p.temperatureUnit,shortForecast:p.shortForecast,windSpeed:p.windSpeed,windDirection:p.windDirection,probabilityOfPrecipitation:p.probabilityOfPrecipitation?.value??null}));
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=180'});
      res.end(JSON.stringify({location:points?.properties?.relativeLocation?.properties||null,periods,updated:new Date().toISOString(),source:'NWS'}));return;
    }
    if(u.pathname.startsWith('/api/')){
      const key=u.pathname.slice(5);if(key!=='forecast'&&!apis[key]){res.writeHead(404);res.end('Not found');return;}
      let data;
      if(key==='forecast'){
        const point=await upstream('https://api.weather.gov/points/41.2565,-95.9345',3600000);
        if(!point?.properties?.forecast)throw Error('NWS forecast endpoint unavailable');
        data=await upstream(point.properties.forecast,300000);
      }else{
        const [url,ttl]=apis[key]();data=await upstream(url,ttl);
      }
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=60'});res.end(JSON.stringify(data));return;
    }
    const file=u.pathname==='/'?'index.html':u.pathname.slice(1);
    if(!new Set(['index.html','app.js','style.css']).has(file)){res.writeHead(404);res.end('Not found');return;}
    const filename=path.join(root,file);
    const content=await fs.readFile(filename);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store, max-age=0, must-revalidate','Pragma':'no-cache','Expires':'0'});res.end(content);
  }catch(err){res.writeHead(err.code==='ENOENT'?404:502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:err.message}));}
});if(process.env.WCD_WIND_TEST==='1'){const sample='DATA BASED ON 061800Z\n VALID 070000Z FOR USE 2000-0300Z\n FT 3000 6000 9000 12000 18000 24000 30000 34000 39000\n OMA 2313 2512+02 2811-02 3116-09 3336-22 3546-33 355949 355659 312855';const result=parseWinds(sample,'OMA');if(result.rows.length!==9||result.rows[1].tempC!==2||result.rows[7].tempC!==-59)throw Error('Wind parser fixture failed');console.log('Wind parser fixture passed');}else server.listen(port,'0.0.0.0',()=>console.log(`Weather Command Dashboard on ${port}`));
