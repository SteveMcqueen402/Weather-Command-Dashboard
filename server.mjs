import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const cache=new Map();
async function upstream(url,ttl=60000){
  const existing=cache.get(url); if(existing && Date.now()-existing.at<ttl)return existing.value;
  const res=await fetch(url,{headers:{'User-Agent':'WeatherCommandDashboard/0.1 (personal weather monitor)','Accept':'application/geo+json, application/json, text/plain'}});
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
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://localhost:${port}`);
    if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'ok'}));return;}
    if(u.pathname.startsWith('/api/')){
      const key=u.pathname.slice(5);if(!apis[key]){res.writeHead(404);res.end('Not found');return;}
      const [url,ttl]=apis[key]();const data=await upstream(url,ttl);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=60'});res.end(JSON.stringify(data));return;
    }
    if(u.pathname==='/api/forecast'){res.writeHead(404);res.end('Not found');return;}
    const file=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const filename=path.resolve(root,file);
    if(!filename.startsWith(root+path.sep)&&filename!==path.join(root,'index.html')){res.writeHead(403);res.end('Forbidden');return;}
    const content=await fs.readFile(filename);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'});res.end(content);
  }catch(err){res.writeHead(err.code==='ENOENT'?404:502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:err.message}));}
});server.listen(port,'0.0.0.0',()=>console.log(`Weather Command Dashboard on ${port}`));
