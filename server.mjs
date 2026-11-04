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
  convective:['https://www.spc.noaa.gov/products/outlook/day1otlk.gif']
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

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://localhost:${port}`);
    if(u.pathname.startsWith('/api/chart/')){
      const key=u.pathname.slice('/api/chart/'.length);
      if(!Object.hasOwn(chartSources,key)){res.writeHead(404);res.end('Unknown chart');return;}
      const chart=await officialChart(key);
      if(!chart){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Official chart image unavailable');return;}
      res.writeHead(200,{'Content-Type':chart.mime,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});res.end(chart.bytes);return;
    }
    if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'ok'}));return;}
    if(u.pathname==='/api/airport-route'){
      const raw=(u.searchParams.get('ids')||'').toUpperCase().split(/[\s,;>-]+/).filter(Boolean);
      if(!raw.length||raw.length>12||raw.some(id=>!/^[A-Z0-9]{3,4}$/.test(id))){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Enter 1–12 valid 3- or 4-character airport identifiers.'}));return;}
      const ids=raw.map(id=>id.length===3?'K'+id:id);
      const unique=[...new Set(ids)];const joined=unique.join(',');
      const base='https://aviationweather.gov/api/data/';
      const results=await Promise.allSettled([
        upstream(base+'metar?ids='+joined+'&format=json',180000),
        upstream(base+'taf?ids='+joined+'&format=json',300000),
        upstream(base+'airport?ids='+joined+'&format=json',86400000)
      ]);
      const array=i=>results[i].status==='fulfilled'&&Array.isArray(results[i].value)?results[i].value:[];
      const metars=array(0),tafs=array(1),airports=array(2);
      if(results.every(r=>r.status==='rejected')){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Aviation Weather Center is temporarily unavailable.'}));return;}
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=120'});
      res.end(JSON.stringify({ids,metars,tafs,airports,partial:results.some(r=>r.status==='rejected'),checkedAt:new Date().toISOString()}));return;
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
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'});res.end(content);
  }catch(err){res.writeHead(err.code==='ENOENT'?404:502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:err.message}));}
});server.listen(port,'0.0.0.0',()=>console.log(`Weather Command Dashboard on ${port}`));
