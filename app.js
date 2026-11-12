'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const text=(s,v)=>{const el=$(s);if(el)el.textContent=String(v??'—')};
const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const current={metar:null,taf:null,radar:null,alerts:[],forecast:null,route:[],selected:'KOMA',map:null,mapLayer:null,routeLayer:null,radarFrame:0,radarPlaying:false,radarTimer:null,modalMap:null,routeWeatherMap:null,routeWeatherLayer:null,routeRadarLayer:null,routeRadarOn:true,modalRouteLayer:null,modalRouteRadarLayer:null};
const KOMA=[41.301,-95.894];
const readPref=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch{return fallback}};
const writePref=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
current.homeId=readPref('wc-home-airport-v13','KOMA');
current.homeCoords=(()=>{try{const v=JSON.parse(readPref('wc-home-coords-v13','null'));return Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)?v:KOMA}catch{return KOMA}})();
current.mapStyle=readPref('wc-map-style-v13','sectional');
const homeCoords=()=>current.homeCoords||KOMA;
const mapsRegistry=new Set();
function createBaseLayer(kind){
 if(kind==='sectional')return L.tileLayer('https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}',{attribution:'VFR chart © FAA Aeronautical Information Services',minNativeZoom:8,maxNativeZoom:12,maxZoom:17});
 if(kind==='satellite')return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagery © Esri and providers',maxZoom:18});
 return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19});
}
function changeBaseLayers(){
 for(const m of [...mapsRegistry]){if(!m._container){mapsRegistry.delete(m);continue}try{if(m.wcBaseLayer)m.removeLayer(m.wcBaseLayer);m.wcBaseLayer=createBaseLayer(current.mapStyle).addTo(m);m.wcBaseLayer.bringToBack();m.invalidateSize()}catch(e){console.warn('Map layer unavailable',e)}}
 text('#map-style-note',current.mapStyle==='sectional'?'FAA sectional • verify current edition; best at zoom 8–12':current.mapStyle==='satellite'?'Satellite imagery © Esri':'Street map © OpenStreetMap');
}

const charts={surface:{name:'WPC Surface Analysis',image:'/api/chart/surface',source:'https://www.wpc.ncep.noaa.gov/html/sfc2.shtml'},convective:{name:'SPC Day 1 Convective Outlook',image:'/api/chart/convective',source:'https://www.spc.noaa.gov/products/outlook/'}};
function dateTime(value){if(!value)return 'Time unavailable';const d=typeof value==='number'?new Date(value*1000):new Date(value);return Number.isNaN(+d)?'Time unavailable':d.toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}
function status(message){text('#notice',message)}
async function fetchJSON(path){const r=await fetch(path);const data=await r.json().catch(()=>({error:'Invalid response'}));if(!r.ok)throw Error(data?.error||`${r.status} from ${path}`);return data}
function setTab(group,selected){$$(`[data-${group}]`).forEach(el=>el.classList.toggle('active',el.dataset[group]===selected))}
function showModal(title,content,source){text('#modal-title',title);const container=$('#modal-content');container.replaceChildren();if(typeof content==='string')container.innerHTML=content;else if(content)container.append(content);const l=$('#modal-link');l.href=source||'#';l.classList.toggle('hidden',!source);$('#modal').classList.remove('hidden');$('#modal-close').focus()}
function closeModal(){if(current.modalMapResizeObserver){current.modalMapResizeObserver.disconnect();current.modalMapResizeObserver=null}if(current.modalMap){current.modalMap.remove();current.modalMap=null;current.modalRouteLayer=null;current.modalRouteRadarLayer=null}$('#modal').classList.add('hidden');$('#modal-content').replaceChildren()}
$('#modal-close').addEventListener('click',closeModal);$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
function openChart(key){const c=charts[key];if(!c)return;const wrap=document.createElement('div');const img=document.createElement('img');img.src=c.image+(c.image.includes('?')?'&':'?')+'v='+Math.floor(Date.now()/900000);img.alt=c.name;img.onerror=()=>{img.style.display='none';const p=document.createElement('p');p.className='source-note';p.textContent='Official chart temporarily unavailable. Open the WPC/SPC source using the link above.';wrap.append(p)};wrap.append(img);showModal(c.name,wrap,c.source)}
$$('[data-open-chart]').forEach(el=>el.addEventListener('click',()=>openChart(el.dataset.openChart)));
function scrollToPanel(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'center'})}
$$('[data-detail]').forEach(el=>el.addEventListener('click',()=>scrollToPanel(el.dataset.detail)));
$$('[data-target]').forEach(el=>el.addEventListener('click',()=>{scrollToPanel(el.dataset.target);$$('[data-target]').forEach(b=>b.classList.toggle('active',b===el))}));
function makeMap(node,zoom=6){if(!window.L)throw Error('Interactive map library unavailable');const m=L.map(node,{zoomControl:true}).setView(homeCoords(),current.mapStyle==='sectional'?Math.max(8,zoom):zoom);m.wcBaseLayer=createBaseLayer(current.mapStyle).addTo(m);mapsRegistry.add(m);m.on('unload',()=>mapsRegistry.delete(m));return m}
function latestRadarFrame(){const a=current.radar?.radar?.past||[];return a.length?a[Math.max(0,Math.min(current.radarFrame,a.length-1))]:null}
function addRadarLayer(map){const frame=latestRadarFrame();if(!frame||!map)return null;const sharp=$('#radar-quality')?.value!=='smooth';const url=`${current.radar.host}${frame.path}/256/{z}/{x}/{y}/2/${sharp?'0_1':'1_1'}.png`;const layer=L.tileLayer(url,{tileSize:256,maxNativeZoom:7,maxZoom:18,opacity:.78,updateWhenIdle:false,keepBuffer:3,crossOrigin:true,attribution:'Radar © RainViewer'});layer.addTo(map);text('#map-caption','Radar '+dateTime(frame.time)+' · '+(sharp?'sharp':'smoothed')+' rendering (source max zoom 7)');return layer}
function transitionRadar(map,slot){if(!map)return;const prior=current[slot];const next=addRadarLayer(map);if(!next)return;current[slot]=next;let retired=false;const retire=()=>{if(retired)return;retired=true;if(prior&&prior!==next&&map.hasLayer(prior))map.removeLayer(prior)};next.once('load',retire);setTimeout(retire,1400)}
function removeMainLayers(){if(current.mapLayer){current.map.removeLayer(current.mapLayer);current.mapLayer=null}if(current.routeLayer){current.map.removeLayer(current.routeLayer);current.routeLayer=null}}
function drawRouteOn(map){const pts=current.route.filter(p=>p.coords);const group=L.layerGroup().addTo(map);if(pts.length){const coords=pts.map(x=>x.coords);pts.forEach(p=>{const name=htmlEscape(p.id), report=htmlEscape(p.metar?.rawOb||'METAR unavailable');L.marker(p.coords).addTo(group).bindPopup(`<strong>${name}</strong><p>${report}</p>`)});if(coords.length>1)L.polyline(coords,{color:'#55d9ff',weight:4,dashArray:'8 6'}).addTo(group);if(coords.length>1)map.fitBounds(L.latLngBounds(coords).pad(.18));else map.setView(coords[0],8)}else{L.marker(homeCoords()).bindPopup(current.homeId).addTo(group);map.setView(homeCoords(),current.mapStyle==='sectional'?8:6)}return group}
function mapMode(mode){setTab('map',mode);$('#play-radar').classList.toggle('hidden',mode!=='radar'&&mode!=='route');$('#map-chart').classList.add('hidden');$('#main-map').classList.remove('hidden');$('#chart-unavailable').classList.add('hidden');removeMainLayers();if(mode==='radar'){current.map.setView(homeCoords(),current.mapStyle==='sectional'?8:6);current.mapLayer=addRadarLayer(current.map);$('#map-source').href='https://radar.weather.gov/';text('#map-source','NOAA radar ↗')}else if(mode==='route'){current.routeLayer=drawRouteOn(current.map);if(current.routeRadarOn)current.mapLayer=addRadarLayer(current.map);text('#map-caption','Straight-line planning display; not an approved flight route');$('#map-source').href='https://aviationweather.gov/';text('#map-source','Aviation Weather Center ↗');}else{const c=charts[mode];if(!c)return;$('#main-map').classList.add('hidden');$('#map-chart').classList.remove('hidden');const image=$('#map-chart-image');image.style.display='block';image.src=c.image+(c.image.includes('?')?'&':'?')+'v='+Math.floor(Date.now()/900000);image.alt=c.name;image.onerror=()=>{image.style.display='none';$('#chart-unavailable').classList.remove('hidden')};$('#map-source').href=c.source;text('#map-source','Official source ↗');text('#map-caption',c.name+' · verify analysis/valid time on chart')}if(mode==='radar'||mode==='route'){setTimeout(()=>{current.map.invalidateSize({pan:false});current.mapLayer?.redraw()},220);setTimeout(()=>current.map.invalidateSize({pan:false}),1000)}}
$$('[data-map]').forEach(btn=>btn.addEventListener('click',()=>mapMode(btn.dataset.map)));
function watchModalMapSize(node,map){
 // Opening a modal and changing device orientation both alter Leaflet's viewport.
 const resize=()=>{if(current.modalMap===map&&map._container?.isConnected)map.invalidateSize({pan:false,debounceMoveend:true})};
 requestAnimationFrame(()=>requestAnimationFrame(resize));
 setTimeout(resize,200);
 if(typeof ResizeObserver!=='undefined'){
  current.modalMapResizeObserver?.disconnect();
  current.modalMapResizeObserver=new ResizeObserver(resize);
  current.modalMapResizeObserver.observe(node);
 }
}
function modalMap(){
 const active=$('.tab.active')?.dataset.map;
 const node=document.createElement('div');node.className='modal-map';
 const mainMap=current.map;
 const center=mainMap?.getCenter()||L.latLng(homeCoords());
 const zoom=mainMap?.getZoom()||7;
 showModal('Regional Radar / Route Map',node,'https://radar.weather.gov/');
 current.modalMap=makeMap(node,zoom);
 current.modalMap.setView(center,zoom,{animate:false});
 if(active==='route'){
  current.modalRouteLayer=drawRouteOn(current.modalMap);
  if(current.routeRadarOn)current.modalAnimatedRadar=addRadarLayer(current.modalMap);
 }else current.modalAnimatedRadar=addRadarLayer(current.modalMap);
 watchModalMapSize(node,current.modalMap);
}
$('#expand-map').onclick=()=>{const active=$('.tab.active')?.dataset.map;if(charts[active])openChart(active);else modalMap()};$('#map-full').onclick=$('#expand-map').onclick;
function pauseRadar(){current.radarPlaying=false;clearInterval(current.radarTimer);text('#play-radar','▶')}
$('#play-radar').onclick=()=>{if(current.radarPlaying){pauseRadar();return}if((current.radar?.radar?.past||[]).length<2)return;current.radarPlaying=true;text('#play-radar','Ⅱ');current.radarTimer=setInterval(()=>{const frames=current.radar.radar.past;current.radarFrame=(current.radarFrame+1)%frames.length;if(['radar','route'].includes($('.tab.active')?.dataset.map))transitionRadar(current.map,'mapLayer');if(current.modalMap&&current.modalMap._container){if(current.modalAnimatedRadar&&current.modalMap.hasLayer(current.modalAnimatedRadar))current.modalMap.removeLayer(current.modalAnimatedRadar);current.modalAnimatedRadar=addRadarLayer(current.modalMap)}},1500)};
async function loadRadar(){try{const r=await fetchJSON('/api/radar');current.radar=r;const frames=r?.radar?.past||[];current.radarFrame=frames.length-1;if(['radar','route'].includes($('.tab.active')?.dataset.map)){transitionRadar(current.map,'mapLayer')}drawSmallRouteMap();if(!frames.length)text('#map-caption','No recent radar frames available')}catch(err){text('#map-caption','Radar unavailable · '+err.message);drawSmallRouteMap()}}
function decodeMETAR(m){if(!m)return '<p>Observation unavailable.</p>';const rows=[['Station',m.icaoId],['Wind',m.wdir==null?'Unavailable':`${m.wdir}° at ${m.wspd??'—'} kt${m.wgst?' gust '+m.wgst+' kt':''}`],['Visibility',m.visib==null?'Unavailable':m.visib+' SM'],['Flight category',m.fltCat||'Unavailable'],['Temperature',m.temp==null?'Unavailable':m.temp+'°C'],['Dew point',m.dewp==null?'Unavailable':m.dewp+'°C'],['Altimeter',m.altim==null?'Unavailable':m.altim+' hPa (source field)']];return rows.map(([a,b])=>`<div><strong>${htmlEscape(a)}</strong><br>${htmlEscape(b)}</div>`).join('')}
function aviationTab(tab){setTab('aviation',tab);$('#aviation-raw').classList.toggle('hidden',tab==='decoded');$('#aviation-decoded').classList.toggle('hidden',tab!=='decoded');if(tab==='metar')text('#aviation-raw',current.metar?.rawOb||current.homeId+' METAR unavailable');if(tab==='taf')text('#aviation-raw',current.taf?.rawTAF||current.homeId+' TAF unavailable');if(tab==='decoded')$('#aviation-decoded').innerHTML=decodeMETAR(current.metar)}
$$('[data-aviation]').forEach(b=>b.onclick=()=>aviationTab(b.dataset.aviation));
async function loadAviation(){try{const d=await fetchJSON('/api/airport-route?ids='+encodeURIComponent(current.homeId));const m=d.metars?.find(x=>codeOf(x)===current.homeId)||null;const t=d.tafs?.find(x=>codeOf(x)===current.homeId)||null;current.metar=m;current.taf=t;text('#dewpoint',m?.dewp!=null?Number(m.dewp).toFixed(0)+'°C':'—');text('#dewpoint-detail',m?.temp!=null&&m?.dewp!=null?'Temp '+Number(m.temp).toFixed(0)+'°C · Dew '+Number(m.dewp).toFixed(0)+'°C':'Dew point observation unavailable');text('#wind',m?.wspd!=null?m.wspd+' kt':'—');text('#windinfo',m?.wdir!=null?`${m.wdir}°${m.wgst?` · gust ${m.wgst} kt`:''}`:'Wind direction unavailable');text('#flightcat',m?.fltCat||'—');text('#flightdetail',m?.visib!=null?`Visibility ${m.visib} SM`:'Category/visibility unavailable');$('#flightcat').style.color=({VFR:'#57e69e',MVFR:'#7ebdff',IFR:'#ff6873',LIFR:'#e88eff'})[m?.fltCat]||'';text('#aviation-time','Observed '+dateTime(m?.obsTime));aviationTab($('.pill.active')?.dataset.aviation||'metar');if(!m)status(current.homeId+' METAR unavailable; not every airport publishes observations.')}catch(err){text('#dewpoint','—');text('#dewpoint-detail','Observation unavailable');status('Aviation observations unavailable: '+err.message)}}
async function loadForecastSummary(){try{const c=homeCoords();const r=await fetchJSON('/api/location-forecast?lat='+c[0]+'&lon='+c[1]);current.forecast=r;const p=r?.periods?.[0];text('#temp',p?.temperature!=null?`${p.temperature}°${p.temperatureUnit||'F'}`:'—');text('#conditions',p?.shortForecast||'NWS forecast unavailable')}catch(err){text('#conditions','NWS forecast unavailable')}}
async function loadAlerts(){
 const chip=$('#alerts-chip'),label=$('#alerts-chip-label');
 chip.classList.remove('alerts-chip-clear','alerts-chip-active','alerts-chip-error');
 chip.classList.add('alerts-chip-loading');label.textContent='Checking alerts…';
 try{
   const c=homeCoords();const d=await fetchJSON('/api/home-alerts?lat='+c[0]+'&lon='+c[1]);
   const items=Array.isArray(d?.features)?d.features:[];
   current.alerts=items;current.alertsError='';
   chip.classList.remove('alerts-chip-loading');
   if(!items.length){chip.classList.add('alerts-chip-clear');label.textContent='No active alerts';chip.title='No active NWS alerts for '+current.homeId+' · click for details';}
   else{chip.classList.add('alerts-chip-active');label.textContent=items.length+' active NWS alert'+(items.length===1?'':'s');chip.title='View '+items.length+' NWS alert'+(items.length===1?'':'s')+' near '+current.homeId;}
 }catch(err){
   current.alerts=[];current.alertsError=err.message;
   chip.classList.remove('alerts-chip-loading');chip.classList.add('alerts-chip-error');
   label.textContent='Alerts unavailable';chip.title='NWS alerts could not be checked · click for details';
 }
}
function normalize(code){const c=String(code||'').trim().toUpperCase();if(!/^[A-Z0-9]{3,4}$/.test(c))throw Error('Enter a 3- or 4-character airport identifier');return c.length===3&&/^[A-Z]{3}$/.test(c)?'K'+c:c}
function coordsOf(x){const lat=Number(x?.lat??x?.latitude??x?.latitude_deg??x?.latDecimal),lon=Number(x?.lon??x?.longitude??x?.longitude_deg??x?.lonDecimal);return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null}
function codeOf(x){return String(x?.icaoId??x?.icao??x?.id??x?.ident??x?.stationId??'').toUpperCase()}
async function lookupAirports(ids){
 const resp=await fetchJSON('/api/airport-route?ids='+encodeURIComponent(ids.join(',')));
 const sameAirport=(x,id)=>[x?.icaoId,x?.icao,x?.id,x?.ident,x?.stationId,x?.gps_code,x?.icao_code,x?.local_code].filter(Boolean).some(code=>String(code).toUpperCase()===id);
 return ids.map(id=>{
   const metar=resp.metars?.find(x=>sameAirport(x,id))||null;
   const taf=resp.tafs?.find(x=>sameAirport(x,id))||null;
   const airport=resp.airports?.find(x=>sameAirport(x,id))||null;
   const coords=coordsOf(airport)||coordsOf(metar)||(id===current.homeId?homeCoords():null);
   return {id,metar,taf,airport,coords};
 });
}
function distanceNM(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);const h=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(h)))}
// Winds-aloft route planning. Forecast direction is the direction wind comes FROM.
// Each leg uses the same explicitly selected FB station; this is a forecast estimate,
// not an along-route gridded wind forecast or an aircraft performance calculation.
const routeWindState={report:null,key:'',error:'',request:0};
const windStation=()=>String($('#route-wind-station')?.value||'').trim().toUpperCase();
const windRequestKey=()=>`${windStation()}/${$('#route-wind-cycle').value}`;
function routeBearing(a,b){
 const toRad=v=>v*Math.PI/180,fromRad=v=>v*180/Math.PI;
 const y=Math.sin(toRad(b[1]-a[1]))*Math.cos(toRad(b[0]));
 const x=Math.cos(toRad(a[0]))*Math.sin(toRad(b[0]))-Math.sin(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.cos(toRad(b[1]-a[1]));
 return (fromRad(Math.atan2(y,x))+360)%360;
}
function windAtAltitude(rows,alt){
 const usable=(rows||[]).filter(r=>Number.isFinite(Number(r.altitude))&&Number.isFinite(Number(r.speed))&&(r.calm||Number.isFinite(Number(r.direction)))).sort((a,b)=>a.altitude-b.altitude);
 if(!usable.length)return null;
 const vector=r=>{const theta=(Number(r.direction||0)*Math.PI/180);return {east:-Number(r.speed)*Math.sin(theta),north:-Number(r.speed)*Math.cos(theta)}};
 const pair=usable.reduce((a,r)=>{if(r.altitude<=alt)a.low=r;if(r.altitude>=alt&&!a.high)a.high=r;return a},{low:null,high:null});
 const low=pair.low||pair.high,high=pair.high||pair.low;
 const v1=vector(low),v2=vector(high),frac=low.altitude===high.altitude?0:(alt-low.altitude)/(high.altitude-low.altitude);
 return {east:v1.east+(v2.east-v1.east)*frac,north:v1.north+(v2.north-v1.north)*frac,sourceAltitudes:low.altitude===high.altitude?[low.altitude]:[low.altitude,high.altitude],extrapolated:alt<usable[0].altitude||alt>usable.at(-1).altitude};
}
function routeLegSpeed(tas,bearing,w){
 const t=bearing*Math.PI/180;
 const along=w.north*Math.cos(t)+w.east*Math.sin(t);
 const cross=w.east*Math.cos(t)-w.north*Math.sin(t);
 if(Math.abs(cross)>=tas)return null; // aircraft cannot hold this track
 const gs=Math.sqrt(tas*tas-cross*cross)+along;
 return gs>1?{gs,along,cross,wca:Math.asin(-cross/tas)*180/Math.PI}:null;
}
function calculateRoute(){
 const root=$('#route-leg-breakdown');root?.replaceChildren();
 let sum=0,complete=current.route.length>1;
 for(let i=1;i<current.route.length;i++){
  const a=current.route[i-1].coords,b=current.route[i].coords;
  if(a&&b)sum+=distanceNM(a,b);else complete=false;
 }
 const tas=Number($('#groundspeed').value),gph=Number($('#fuelburn').value),alt=Number($('#route-altitude').value);
 const valid=complete&&tas>0&&gph>0;
 const windOk=valid&&routeWindState.key===windRequestKey()&&!routeWindState.error&&routeWindState.report?.available&&alt>=3000&&alt<=18000;
 const wind=windOk?windAtAltitude(routeWindState.report.rows,alt):null;
 let hours=0,impossible=false,gsWeighted=0;
 if(valid){for(let i=1;i<current.route.length;i++){
  const prev=current.route[i-1],next=current.route[i],nm=distanceNM(prev.coords,next.coords),heading=routeBearing(prev.coords,next.coords);
  const correction=wind?routeLegSpeed(tas,heading,wind):{gs:tas,along:0,cross:0,wca:0};
  if(!correction){impossible=true;break}
  const legHours=nm/correction.gs;hours+=legHours;gsWeighted+=nm;
  if(root){const line=document.createElement('div');line.className='route-leg-line';line.textContent=`${prev.id} → ${next.id} · ${nm.toFixed(1)} NM · ${Math.round(heading).toString().padStart(3,'0')}° true · ${correction.gs.toFixed(0)} kt GS · ${Math.round(legHours*60)} min${wind?' · '+(correction.along>=0?'tailwind ':'headwind ')+Math.abs(correction.along).toFixed(0)+' kt':''}`;root.append(line)}
 }}
 text('#distance',valid?sum.toFixed(0)+' NM':'—');text('#ete',valid&&!impossible?(hours*60).toFixed(0)+' min':'—');text('#fuel',valid&&!impossible?(hours*gph).toFixed(1)+' gal':'—');
 const msg=$('#route-wind-summary');if(msg){
  msg.classList.toggle('has-winds',Boolean(wind));
  if(!valid)msg.textContent='Enter a valid route, TAS and fuel burn to calculate travel time.';
  else if(impossible)msg.textContent='Selected wind exceeds the aircraft’s ability to maintain the course at this TAS. Adjust altitude, TAS, or forecast.';
  else if(wind){const speed=Math.hypot(wind.east,wind.north);const toward=(Math.atan2(wind.east,wind.north)*180/Math.PI+360)%360;const from=(toward+180)%360;msg.textContent=`${routeWindState.report.modelGuidance?'MODEL WIND-ADJUSTED (GFS; not an official FB forecast)':'WIND-ADJUSTED (official FB)'} · ${windStation()} · ${$('#route-wind-cycle').value}h · ${alt.toLocaleString()} ft MSL · ${speed.toFixed(0)} kt from ${Math.round(from).toString().padStart(3,'0')}° true · Avg ${(sum/hours).toFixed(0)} kt GS${wind.extrapolated?' · Nearest available altitude (extrapolation not used)':''}. Forecast ${routeWindState.report.header?.find(h=>/VALID/i.test(h))||'valid time: verify source'}.`}
  else msg.textContent=`STILL-AIR ONLY · ${routeWindState.error||'No applicable winds-aloft forecast loaded'} · ${tas.toFixed(0)} kt TAS assumed as groundspeed. Wind correction not included.`;
 }
 return valid&&!impossible;
}
async function loadRouteWinds(){
 const station=windStation(),cycle=$('#route-wind-cycle').value,key=windRequestKey();
 const request=++routeWindState.request;routeWindState.report=null;routeWindState.key=key;routeWindState.error='';
 if(!/^[A-Z]{3}$/.test(station)){routeWindState.error='Enter a published 3-letter FB winds station (e.g. OMA or OFK)';calculateRoute();return}
 if(!current.route.length){calculateRoute();return}
 text('#route-wind-summary',`Loading official ${station} ${cycle}h winds aloft…`);
 try{const report=await fetchJSON(`/api/winds-aloft?station=${encodeURIComponent(station)}&fcst=${encodeURIComponent(cycle)}`);
  if(request!==routeWindState.request)return;
  if(!report.available||!report.rows?.length)throw Error(`No ${station} FB forecast available`);
  routeWindState.report=report;
 }catch(err){if(request!==routeWindState.request)return;routeWindState.error=err.message}
 calculateRoute();
}
$('#route-wind-refresh').addEventListener('click',loadRouteWinds);
for(const name of ['groundspeed','fuelburn','route-altitude'])$('#'+name).addEventListener('input',calculateRoute);
for(const name of ['route-wind-cycle','route-wind-station'])$('#'+name).addEventListener('change',loadRouteWinds);
$('#route-wind-station').addEventListener('input',()=>{routeWindState.report=null;routeWindState.error='Forecast station changed; update route winds';calculateRoute()});
function updateForecastLocations(){const selected=$('#forecast-select').value;const opts=[{id:current.homeId},...current.route.filter(x=>x.id!==current.homeId)].filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i);$('#forecast-select').replaceChildren();opts.forEach(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.id;$('#forecast-select').append(option)});$('#forecast-select').value=opts.some(x=>x.id===selected)?selected:current.route.at(-1)?.id||current.homeId;loadLocationForecast()}

const categoryClass=cat=>['VFR','MVFR','IFR','LIFR'].includes(cat)?cat.toLowerCase():'unknown';
function routeMarker(p,index){
 const c=categoryClass(p.metar?.fltCat);
 const sym=index===0?'D':index===current.route.length-1?'A':String(index);
 return L.divIcon({className:'',html:`<div class="route-airport-marker ${c}">${htmlEscape(sym)}</div>`,iconSize:[23,23],iconAnchor:[11,11]});
}
function routePopup(p,index){
 const category=htmlEscape(p.metar?.fltCat||'No reported flight category');
 const observed=htmlEscape(dateTime(p.metar?.obsTime));
 const raw=htmlEscape(p.metar?.rawOb||'No METAR available');
 const taf=htmlEscape(p.taf?.rawTAF||'No published TAF');
 return `<div class="route-pop"><strong>${htmlEscape(p.id)} · ${category}</strong><div>${index===0?'Departure':index===current.route.length-1?'Destination':'Intermediate stop'} · ${observed}</div><b>METAR</b><pre>${raw}</pre><b>TAF</b><pre>${taf}</pre></div>`;
}
function routeBounds(map){
 const points=current.route.filter(p=>p.coords).map(p=>p.coords);
 if(points.length>1)map.fitBounds(L.latLngBounds(points).pad(.20),{maxZoom:10});
 else if(points.length===1)map.setView(points[0],8);
 else map.setView(homeCoords(),current.mapStyle==='sectional'?8:7);
}
function routeLayers(map,{withRadar=true}={}){
 const pts=current.route.filter(p=>p.coords);
 const routeLayer=L.layerGroup().addTo(map);
 // Missing-coordinate airports are intentionally omitted, never placed at a made-up position.
 current.route.forEach((p,i)=>{if(!p.coords)return;L.marker(p.coords,{icon:routeMarker(p,i)}).addTo(routeLayer).bindPopup(routePopup(p,i),{maxWidth:310})});
 if(pts.length>=2)L.polyline(pts.map(p=>p.coords),{color:'#4ce2ff',weight:4,opacity:.98,dashArray:'9 6'}).addTo(routeLayer);
 if(!pts.length)L.marker(homeCoords()).addTo(routeLayer).bindPopup(current.homeId+' · Home airport');
 const radarLayer=withRadar?addRadarLayer(map):null;
 routeBounds(map);
 return {routeLayer,radarLayer};
}
function initRouteWeatherMap(){
 if(!$('#route-weather-map')||current.routeWeatherMap||!window.L)return;
 current.routeWeatherMap=makeMap('route-weather-map',7);
 drawSmallRouteMap();
}
function drawSmallRouteMap(){
 const map=current.routeWeatherMap;if(!map)return;
 if(current.routeWeatherLayer){map.removeLayer(current.routeWeatherLayer);current.routeWeatherLayer=null}
 if(current.routeRadarLayer){map.removeLayer(current.routeRadarLayer);current.routeRadarLayer=null}
 const {routeLayer,radarLayer}=routeLayers(map,{withRadar:current.routeRadarOn});
 current.routeWeatherLayer=routeLayer;current.routeRadarLayer=radarLayer;
 text('#route-map-message',!current.route.length?'Enter a route to see airports, radar and a connecting line.':current.route.some(p=>!p.coords)?'Some airport locations were unavailable; those stops cannot be plotted.':'Click any marker for METAR and TAF.');
 const frame=latestRadarFrame();text('#route-map-stamp',frame&&current.routeRadarOn?'Radar '+dateTime(frame.time):current.routeRadarOn?'Radar unavailable':'Radar hidden');
 setTimeout(()=>map.invalidateSize(),80);
}
function expandRouteMap(){
 const shell=document.createElement('div');
 const toolbar=document.createElement('div');toolbar.className='modal-route-toolbar';
 const info=document.createElement('span');info.textContent='Click airport markers for observations. Route legs are straight-line approximations.';
 const label=document.createElement('label');label.className='radar-toggle';
 const input=document.createElement('input');input.type='checkbox';input.checked=current.routeRadarOn;
 label.append(input,document.createTextNode(' Radar overlay'));toolbar.append(info,label);
 const mapNode=document.createElement('div');mapNode.className='modal-route-map';
 shell.append(toolbar,mapNode);
 showModal('Route Weather Map',shell,'https://www.1800wxbrief.com/');
 current.modalMap=makeMap(mapNode,7);
 let layers=routeLayers(current.modalMap,{withRadar:input.checked});
 current.modalRouteLayer=layers.routeLayer;current.modalRouteRadarLayer=layers.radarLayer;
 input.onchange=()=>{current.routeRadarOn=input.checked;$('#route-radar').checked=input.checked;
   if(current.modalRouteRadarLayer)current.modalMap.removeLayer(current.modalRouteRadarLayer);
   current.modalRouteRadarLayer=input.checked?addRadarLayer(current.modalMap):null;drawSmallRouteMap()};
 watchModalMapSize(mapNode,current.modalMap);
}
if($('#expand-route-map'))$('#expand-route-map').onclick=expandRouteMap;
if($('#route-radar'))$('#route-radar').onchange=e=>{current.routeRadarOn=e.target.checked;drawSmallRouteMap()};

function drawRouteWeather(){const host=$('#route-weather');if(!host)return;host.replaceChildren();if(!current.route.length){host.textContent='No route has been entered.';return}for(const p of current.route){const line=document.createElement('div');line.className='airport-row';const btn=document.createElement('button');btn.textContent=p.id;btn.title='Show airport weather';btn.onclick=()=>openAirport(p);const cat=document.createElement('span');cat.textContent=p.metar?.fltCat||'NO METAR';cat.className='category '+(p.metar?.fltCat||'');line.append(btn,cat);host.append(line)}}
async function loadRoute(e){e?.preventDefault();let ids;try{ids=[normalize($('#route-from').value),...$('#route-via').value.split(',').map(x=>x.trim()).filter(Boolean).map(normalize),normalize($('#route-to').value)];if(ids.length>12)throw Error('Use at most 12 airports');}catch(err){text('#route-status',err.message);return}const button=$('#route-form button[type=submit]');button.disabled=true;text('#route-status','Loading airport observations and route positions…');try{current.route=await lookupAirports(ids);drawRouteWeather();drawSmallRouteMap();const can=calculateRoute();loadRouteWinds();const found=current.route.filter(x=>x.metar).length;const noReports=current.route.filter(x=>!x.metar).map(x=>x.id);text('#route-status',`${found}/${ids.length} airport METARs available · ${can?'Straight-line distance shown; loading forecast winds for ETA/fuel.':'Some airport coordinates unavailable; estimate not calculated.'}${noReports.length?' No on-field METAR: '+noReports.join(', ')+'.':''} Not an operational flight plan.`);updateForecastLocations();if($('.tab.active')?.dataset.map==='route')mapMode('route')}catch(err){text('#route-status','Route lookup failed: '+err.message)}finally{button.disabled=false}}
$('#route-form').addEventListener('submit',loadRoute);
// Airport lookup includes independent NOTAM retrieval for the LOOKED-UP airport,
// not the home airport. Data remains labeled as staging when NMS_API_ENV=test.
async function loadAirportPopupNotams(airport,holder){
 const heading=document.createElement('div');heading.className='airport-notam-title';
 const label=document.createElement('strong');label.textContent=airport+' · FAA NOTAMs';
 const refresh=document.createElement('button');refresh.type='button';refresh.className='outline';refresh.textContent='Refresh';
 heading.append(label,refresh);holder.append(heading);
 const state=document.createElement('p');state.className='airport-notam-status';state.setAttribute('role','status');holder.append(state);
 const list=document.createElement('div');list.className='airport-popup-notam-list';holder.append(list);
 let requestId=0;
 async function load(){
   const call=++requestId;refresh.disabled=true;state.textContent='Checking FAA NMS NOTAMs for '+airport+'…';list.replaceChildren();
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
   try{
     const response=await fetch('/api/notams?airport='+encodeURIComponent(airport),{signal:controller.signal,cache:'no-store'});
     const data=await response.json().catch(()=>({error:'Invalid NOTAM response'}));
     if(!response.ok)throw Error(data.error||'FAA NMS request failed (HTTP '+response.status+').');
     if(call!==requestId||!holder.isConnected)return;
     if(!Array.isArray(data.notams))throw Error('FAA NMS response does not contain a recognized notice list.');
     const testing=data.environment==='test';
     const total=Number.isFinite(data.total)?data.total:data.notams.length;
     state.textContent=(testing?'TEST ENVIRONMENT — NOT FOR FLIGHT USE · ':'')+total+' NOTAM'+(total===1?'':'s')+' returned for '+airport+' · checked '+dateTime(data.checkedAt)+(data.limited?' · provider results may be limited':'')+(data.cached?' · cached '+(data.cacheAgeSeconds||0)+'s ago':'');
     if(testing)state.classList.add('test');else state.classList.remove('test');
     if(data.notams.length===0){const empty=document.createElement('p');empty.className='fine';empty.textContent='The FAA NMS '+(testing?'test':'')+' service returned no notices for '+airport+'. This does not replace an official briefing.';list.append(empty);return;}
     for(const n of data.notams){
       const item=document.createElement('article');item.className='airport-popup-notam';
       const top=document.createElement('div');top.className='notam-item-top';
       const number=document.createElement('strong');number.textContent=n.number||'NOTAM';
       const tag=document.createElement('span');tag.className='notam-tag '+(n.isTfr?'critical':String(n.categoryCode||'other').toLowerCase());tag.textContent=n.category||'Other';top.append(number,tag);
       const reading=document.createElement('p');reading.textContent=n.reading||n.text||'Description unavailable';
       const dates=document.createElement('small');dates.textContent='Effective '+(n.start?dateTime(n.start):'unknown')+' — '+(n.end?dateTime(n.end):'permanent / unknown');
       const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Full NOTAM text';
       const raw=document.createElement('pre');raw.textContent=n.text||'Raw text unavailable';detail.append(summary,raw);
       item.append(top,reading,dates,detail);list.append(item);
     }
   }catch(err){
     if(call!==requestId||!holder.isConnected)return;
     state.classList.remove('test');state.textContent=(err.name==='AbortError'?'FAA NMS request timed out.':err.message)+' No notices are being represented as current.';
   }finally{clearTimeout(timer);if(call===requestId&&holder.isConnected)refresh.disabled=false;}
 }
 refresh.addEventListener('click',load);
 await load();
}

function airportInfoRow(label,value){
 if(value==null||value==='')return null;
 const line=document.createElement('div');line.className='airport-info-line';
 const name=document.createElement('strong');name.textContent=label;
 const val=document.createElement('span');val.textContent=String(value);
 line.append(name,val);return line;
}
function fieldFrom(obj,...keys){for(const key of keys){const v=obj?.[key];if(v!=null&&v!==''&&v!==0)return v}return null}
async function loadAirportDetails(id,section,stationData){
 const tag=document.createElement('h3');tag.textContent='Airport & trip-planning information';section.append(tag);
 const box=document.createElement('div');box.className='airport-info-grid';section.append(box);
 const message=document.createElement('p');message.className='fine';message.textContent='Loading airport facilities and communications…';section.append(message);
 const links=document.createElement('div');links.className='airport-info-links';section.append(links);
 function external(label,url){const a=document.createElement('a');a.textContent=label+' ↗';a.href=url;a.rel='noopener noreferrer';a.target='_blank';links.append(a)}
 external('FAA Chart Supplement / airport search','https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dafd/');
 external('FAA airport data','https://adip.faa.gov/agis/public/#/airportData/'+encodeURIComponent(id));
 external('AirNav airport information','https://www.airnav.com/airport/'+encodeURIComponent(id));
 try{
  const d=await fetchJSON('/api/airport-info?id='+encodeURIComponent(id));
  if(!section.isConnected)return;
  const a=d.airport||stationData||{};
  const rows=[
   ['Airport',fieldFrom(a,'name','airportName','site')],
   ['City / State',[fieldFrom(a,'city','municipality'),fieldFrom(a,'state','stateCode','region')].filter(Boolean).join(', ')],
   ['Airport type',fieldFrom(a,'type')],
   ['Control tower',a.controlTower?String(a.controlTower)+(a.controlTowerSource?' · '+a.controlTowerSource:''):'Not independently verified'],
   ['Airspace / class',a.airspaceClass?'Class '+a.airspaceClass+(a.airspaceSource?' · '+a.airspaceSource:''):'Not verified — refer to current FAA sectional'],
   ['Field elevation (MSL)',Number.isFinite(Number(a.fieldElevationFt))&&a.fieldElevationFt!=null?Number(a.fieldElevationFt).toLocaleString('en-US',{maximumFractionDigits:1})+' ft'+(a.fieldElevationSource?' · '+a.fieldElevationSource:''):'Not verified — refer to FAA Chart Supplement'],
   ['Airport telephone',fieldFrom(a,'phone','telephone','airportPhone')],
   ['Fuel reported',fieldFrom(a,'fuel','fuelTypes')],
   ['Services / FBO',fieldFrom(a,'services','fbo','fboName')],
  ];
  for(const [label,value] of rows){const row=airportInfoRow(label,value);if(row)box.append(row)}
  if(d.frequencies?.length){const h=document.createElement('h4');h.textContent='Radio frequencies (community dataset)';box.append(h);for(const f of d.frequencies.slice(0,25)){const row=airportInfoRow(f.type||'COM',String(f.mhz)+' MHz'+(f.description?' · '+f.description:''));if(row)box.append(row)}}
  if(d.runways?.length){const h=document.createElement('h4');h.textContent='Runways (community dataset)';box.append(h);for(const r of d.runways.slice(0,12)){const label=[r.le_ident,r.he_ident].filter(Boolean).join(' / ')||'Runway';const dims=[r.length_ft&&r.length_ft+' ft',r.width_ft&&'× '+r.width_ft+' ft',r.surface].filter(Boolean).join(' ');const row=airportInfoRow(label,dims);if(row)box.append(row)}}
  message.textContent=(d.frequencies?.length||d.runways?.length)?'Runways and frequencies are from OurAirports (community data). Airport elevation and airspace show their own sources above. Verify every value against current FAA publications, NOTAMs and airport/FBO.':'Detailed runways, communications, FBOs, fuel, and phones are not available from the connected data sources for this airport. Use official sources above to verify.';
 }catch(err){message.textContent='Airport details unavailable: '+err.message+'. Elevation and airspace are not verified. Use the official FAA sources linked above.';const a=stationData||{};const row=airportInfoRow('Airport',fieldFrom(a,'name','airportName'));if(row)box.append(row)}
}

function openAirport(p){
 const block=document.createElement('div');
 block.innerHTML=`<div class="modal-row"><strong>${htmlEscape(p.id)}</strong> · ${htmlEscape(p.metar?.fltCat||'No reported flight category')} · ${htmlEscape(dateTime(p.metar?.obsTime))}</div><div class="modal-row"><strong>METAR</strong><pre>${htmlEscape(p.metar?.rawOb||'No current observation available.')}</pre></div><div class="modal-row"><strong>TAF</strong><pre>${htmlEscape(p.taf?.rawTAF||'No published TAF for this airport.')}</pre></div>`;
 const info=document.createElement('section');info.className='modal-row airport-details-section';block.append(info);const section=document.createElement('section');section.className='modal-row airport-notam-section';block.append(section);
 const btn=document.createElement('button');btn.className='primary';btn.textContent='Show multi-day forecast for this airport';
 btn.onclick=()=>{$('#forecast-select').value=p.id;closeModal();scrollToPanel('forecast-section');loadLocationForecast()};
 if([...$('#forecast-select').options].some(x=>x.value===p.id))block.append(btn);
 showModal(p.id+' · Airport Weather & NOTAMs',block,'https://aviationweather.gov/');
 loadAirportDetails(p.id,info,p.airport);loadAirportPopupNotams(p.id,section);
}
$('#airport-search').onsubmit=async e=>{e.preventDefault();let id;try{id=normalize($('#airport-id').value)}catch(err){status(err.message);return}status(`Looking up ${id}…`);try{const [p]=await lookupAirports([id]);current.route.some(x=>x.id===id)||current.route.push(p);updateForecastLocations();status('');openAirport(p)}catch(err){status('Airport lookup failed: '+err.message)}};
function iconFor(x){const s=String(x||'').toLowerCase();if(/thunder/.test(s))return '⛈';if(/snow|sleet|ice/.test(s))return '❄';if(/rain|shower|drizzle/.test(s))return '🌧';if(/cloud|overcast/.test(s))return '☁';if(/fog|haze/.test(s))return '≋';return '☀'}
function forecastTiles(periods){const host=$('#forecast-days');host.replaceChildren();const daytime=periods.filter(p=>p.isDaytime);const samples=daytime.length?daytime.slice(0,5):periods.slice(0,5);for(const p of samples){const tile=document.createElement('div');tile.className='day';const day=document.createElement('strong');day.textContent=p.name||'Period';const symbol=document.createElement('div');symbol.className='symbol';symbol.textContent=iconFor(p.shortForecast);const t=document.createElement('div');t.className='temperature';t.textContent=p.temperature!=null?p.temperature+'°':'—';const info=document.createElement('small');info.textContent=p.shortForecast||'Forecast unavailable';const wind=document.createElement('small');wind.textContent=[p.windDirection,p.windSpeed].filter(Boolean).join(' ')||'Wind unavailable';tile.append(day,symbol,t,info,wind);host.append(tile)}if(!samples.length)host.textContent='No forecast periods available.'}
async function loadLocationForecast(){const id=$('#forecast-select').value||current.homeId;const p=current.route.find(x=>x.id===id);const coords=p?.coords||(id===current.homeId?homeCoords():null);if(!coords){text('#forecast-status',`${id}: Coordinates unavailable for NWS forecast`);return}text('#forecast-status','Loading NWS forecast near '+id+'…');try{const data=await fetchJSON(`/api/location-forecast?lat=${coords[0]}&lon=${coords[1]}`);forecastTiles(data.periods||[]);text('#forecast-status',id+' · NWS general forecast, not an aviation flight category or TAF.');text('#forecast-updated',dateTime(data.updated))}catch(err){text('#forecast-status','NWS forecast unavailable: '+err.message);text('#forecast-days','No forecast available')}}
$('#forecast-select').onchange=loadLocationForecast;
function modalSection(type){let content=document.createElement('div'),source='';switch(type){case'airport':content.innerHTML=`<div class="modal-row"><strong>METAR</strong><pre>${htmlEscape(current.metar?.rawOb||'Unavailable')}</pre></div><div class="modal-row"><strong>TAF</strong><pre>${htmlEscape(current.taf?.rawTAF||'Unavailable')}</pre></div><div class="modal-row">${decodeMETAR(current.metar)}</div>`;source='https://aviationweather.gov/';break;case'route':content.innerHTML=`<p class="source-note">Straight-line segment estimates only; terrain, airspace, winds, hazards, NOTAMs and route clearance are not evaluated. Official briefing required.</p>`;for(const p of current.route){const row=document.createElement('div');row.className='modal-row';row.innerHTML=`<strong>${htmlEscape(p.id)} · ${htmlEscape(p.metar?.fltCat||'No category')}</strong><pre>${htmlEscape(p.metar?.rawOb||'No METAR')}</pre><pre>${htmlEscape(p.taf?.rawTAF||'No published TAF')}</pre>`;content.append(row)}source='https://www.1800wxbrief.com/';break;case'forecast':content.innerHTML='<p class="source-note">Choose an airport from the dashboard forecast selector to update the five-period forecast. Detailed forecast products are available from NWS.</p>';source='https://www.weather.gov/';break;case'winds':if(lastWindReport?.available){content.append(windRowsToElement(lastWindReport))}else content.innerHTML='<p>Official winds aloft unavailable. Use the AWC link for source data.</p>';source='https://aviationweather.gov/windtemp';break;case'models':content.innerHTML='<p>Open NOAA operational products for live HRRR and GFS model runs. Full interactive model animation is not included in this release.</p><div class="modal-row"><a href="https://www.nco.ncep.noaa.gov/pmb/products/hrrr/" target="_blank" rel="noopener">HRRR model charts ↗</a></div><div class="modal-row"><a href="https://www.nco.ncep.noaa.gov/pmb/products/gfs/" target="_blank" rel="noopener">GFS model charts ↗</a></div>';source='https://nomads.ncep.noaa.gov/';break;case'alerts':for(const a of current.alerts){const row=document.createElement('div');row.className='modal-row';row.innerHTML=`<strong>${htmlEscape(a.properties?.event||'Alert')}</strong><p>${htmlEscape(a.properties?.areaDesc||'')}</p><p>${htmlEscape(a.properties?.headline||'')}</p><p>${htmlEscape(a.properties?.description||'')}</p>`;content.append(row)}if(!current.alerts.length)content.textContent=current.alertsError?'NWS weather alerts could not be retrieved: '+current.alertsError:'No active NWS weather alerts reported for '+current.homeId+'.';source='https://www.weather.gov/';break}showModal(({airport:current.homeId+' Aviation',route:'Route Airport Weather',forecast:'Extended Forecast',winds:'Winds Aloft',models:'Forecast Models',alerts:'Local NWS Weather Alerts'})[type]||'Details',content,source)}
$$('[data-modal]').forEach(b=>b.addEventListener('click',()=>modalSection(b.dataset.modal)));

let lastWindReport=null;
function windRowsToElement(report){
 const root=document.createElement('div');root.className='wind-detail';
 const metadata=document.createElement('p');metadata.className='source-note';metadata.textContent=`${report.modelGuidance?'GFS MODEL GUIDANCE (not an official FB table)':'Official FB table'} · Station ${report.station} · ${report.fcst}h · ${report.header?.join(' · ')||'Validity unavailable'}`;root.append(metadata);
 for(const entry of report.rows||[]){
   const line=document.createElement('div');line.className='wind-row';
   const alt=document.createElement('span');alt.textContent=entry.altitude.toLocaleString('en-US')+' ft';
   const barb=document.createElement('span');barb.className='wind-arrow';barb.textContent=entry.calm?'○':'➤';barb.style.transform=entry.calm?'none':`rotate(${(entry.direction+90)%360}deg)`;
   const val=document.createElement('span');val.textContent=entry.calm?'Calm':`${String(entry.direction).padStart(3,'0')}° / ${entry.speed} kt`;
   const temp=document.createElement('small');temp.textContent=entry.tempC===null?'':`${entry.tempC}°C`;
   line.append(alt,barb,val,temp);root.append(line);
 }
 return root;
}
async function loadWinds(){
 const fcst=$('#wind-cycle').value,station=$('#wind-station').value.trim().toUpperCase().replace(/^K(?=[A-Z]{3}$)/,'');$('#wind-station').value=station;if(!/^[A-Z]{3}$/.test(station)){text('#winds-status',/^[A-Z0-9]{3,4}$/.test(station)?`${station} is an airport identifier, not an FB winds-aloft forecast station. Enter an official 3-letter winds station (e.g. OMA, OFK, DSM); do not prefix numeric identifiers with K.`:'Enter an official 3-letter winds/temperatures forecast station (e.g. OMA, OFK, DSM).');text('#winds-rows','Winds aloft are published for designated forecast stations, not every airport.');return;}
 text('#winds-status',`Loading ${station} · ${fcst}-hour forecast…`);
 try{
   const d=await fetchJSON(`/api/winds-aloft?fcst=${encodeURIComponent(fcst)}&station=${encodeURIComponent(station)}`);
   lastWindReport=d;
   const host=$('#winds-rows');host.replaceChildren();
   if(!d.available){text('#winds-status',`No official FB winds table for ${station}. Select another forecast station.`);host.textContent='No station forecast available for this cycle.';return}
   text('#winds-status',`${d.modelGuidance?'GFS MODEL GUIDANCE — NOT AN OFFICIAL FB FORECAST':'Official FB winds'} · ${station} · ${fcst}h · ${d.header?.find(s=>/VALID/i.test(s))||'See source valid time'}`);
   const el=windRowsToElement(d);const metadata=el.querySelector('.source-note');metadata.remove();
   while(el.firstChild)host.append(el.firstChild);
 }catch(err){lastWindReport=null;text('#winds-status','Official winds data unavailable: '+err.message);text('#winds-rows','Data unavailable — use AWC link below. No estimated winds are shown.');}
}
$('#wind-cycle').onchange=loadWinds;$('#wind-station').addEventListener('change',loadWinds);$('#wind-station').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadWinds()}});$('#wind-station-go').onclick=loadWinds;$('#wind-station').addEventListener('input',()=>{$('#wind-station').dataset.userSelected='true'});
$('#quick-plan').onclick=()=>{
 $('#route-from').value=$('#quick-from').value;
 $('#route-to').value=$('#quick-to').value;
 scrollToPanel('route-section');
 $('#route-form').requestSubmit();
};

let refreshBusy=false;async function refresh(){if(refreshBusy)return;refreshBusy=true;text('#checked','Refreshing sources…');status('');try{await Promise.allSettled([loadAviation(),loadForecastSummary(),loadAlerts(),loadRadar(),loadLocationForecast(),loadWinds(),loadNotams(),...(current.route.length?[loadRouteWinds()]:[])]);text('#checked','Updated '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'}))}finally{refreshBusy=false}}
$('#refresh').onclick=refresh;
// Independent live UTC/Zulu clock, 24-hour format with seconds. No network request required.
function updateZuluClock(){
  const now=new Date();
  const zulu=[now.getUTCHours(),now.getUTCMinutes(),now.getUTCSeconds()]
    .map(value=>String(value).padStart(2,'0')).join(':')+'Z';
  const time=$('#utc');
  if(time){time.textContent=zulu;time.dateTime=now.toISOString();}
}
updateZuluClock();
setInterval(updateZuluClock,1000);

// User-selectable home airport and map style. Keep state local to the browser.
$('#map-style').value=['sectional','street','satellite'].includes(current.mapStyle)?current.mapStyle:'sectional';
$('#map-style').addEventListener('change',e=>{current.mapStyle=e.target.value;writePref('wc-map-style-v13',current.mapStyle);changeBaseLayers()});
$('#home-airport').value=current.homeId;
function refreshHomeLabels(){
 $('#home-airport').value=current.homeId;
 text('#home-airport-status',current.homeId+' · selected home airport');
 text('#route-current-from',current.homeId);
 const title=$('#airport-section .panelhead h2');if(title)title.textContent='✈ '+current.homeId+' AVIATION';
 $('#quick-from').value=current.homeId;$('#route-from').value=current.homeId;
 const forecast=$('#forecast-select');if(forecast){forecast.replaceChildren();const option=document.createElement('option');option.value=current.homeId;option.textContent=current.homeId+' · home';forecast.append(option)}
 text('#notam-panel-airport',current.homeId);text('#notam-home-id',current.homeId);text('#notam-summary','NOTAM feed pending');
 const label=$('#wind')?.closest('.stat')?.querySelector('.stathead span');if(label)label.textContent='WINDS AT '+current.homeId;
 const windStations=$('#wind-station');if(windStations){const short=/^K[A-Z]{3}$/.test(current.homeId)?current.homeId.slice(1):null;if(!windStations.dataset.userSelected&&short)windStations.value=short;else if(!short)text('#winds-status',`${current.homeId} is not automatically a winds-aloft reporting station. Select a published 3-letter FB station (such as OFK or OMA).`)}
}
refreshHomeLabels();
$('#home-airport-form').addEventListener('submit',async e=>{
 e.preventDefault();let id;try{id=normalize($('#home-airport').value)}catch(err){status(err.message);return}
 const btn=$('#home-airport-form button');btn.disabled=true;text('#home-airport-status','Checking airport '+id+'…');
 try{
  const [airport]=await lookupAirports([id]);if(!airport?.coords)throw Error('No usable coordinates for '+id+'. Choose a supported airport identifier.');
  current.homeId=id;current.homeCoords=airport.coords;
  writePref('wc-home-airport-v13',id);writePref('wc-home-coords-v13',JSON.stringify(airport.coords));
  refreshHomeLabels();updateForecastLocations();
  for(const map of mapsRegistry){if(map===current.map||map===current.routeWeatherMap)map.setView(homeCoords(),current.mapStyle==='sectional'?8:7)}
  // Remove previous home pin to avoid multiple home airports on the map.
  if(current.homeMarker)current.map.removeLayer(current.homeMarker);
  current.homeMarker=L.marker(homeCoords()).addTo(current.map).bindPopup(current.homeId+' · Home airport');
  if(!current.route.length)drawSmallRouteMap();
  await Promise.allSettled([loadAviation(),loadForecastSummary(),loadAlerts(),loadLocationForecast(),loadWinds(),loadNotams()]);status('Home airport saved: '+id);
 }catch(err){text('#home-airport-status','Unable to select: '+err.message);status(err.message)}finally{btn.disabled=false}
});

const autoRefresh=$('#auto-refresh');autoRefresh.checked=readPref('wc-auto-refresh-v25','on')==='on';
autoRefresh.onchange=()=>{writePref('wc-auto-refresh-v25',autoRefresh.checked?'on':'off');if(autoRefresh.checked)refresh()};
// Fullscreen gracefully falls back to an app-style maximized view when the browser forbids the API.
function refreshWallLabel(){const active=Boolean(document.fullscreenElement)||document.body.classList.contains('wall-maximized');text('#wall-mode',active?'⛶ Exit Wall':'⛶ Wall');}
$('#wall-mode').onclick=async()=>{
 if(document.fullscreenElement){try{await document.exitFullscreen()}catch(err){status('Unable to exit fullscreen: '+err.message)}refreshWallLabel();return}
 if(document.body.classList.contains('wall-maximized')){document.body.classList.remove('wall-maximized');refreshWallLabel();return}
 try{
  if(typeof document.documentElement.requestFullscreen!=='function')throw Error('Native fullscreen is not supported');
  await document.documentElement.requestFullscreen();
 }catch(err){
  document.body.classList.add('wall-maximized');
  status('Browser fullscreen is restricted; using maximized dashboard display instead.');
 }
 refreshWallLabel();
 setTimeout(()=>{repairMobileMap();fitDashboard()},150);
};
document.addEventListener('fullscreenchange',()=>{refreshWallLabel();setTimeout(()=>{repairMobileMap();fitDashboard()},150)});
let fitActive=false;
function fitDashboard(){
 if(!fitActive)return;
 const main=$('main'),header=$('.top');
 if(!main)return;
 // Reflow at a wider internal size as we scale down: the rendered dashboard
 // fills the available width AND height, instead of occupying only the left half.
 const viewWidth=Math.max(320,window.innerWidth-12);
 const headerHeight=header?.getBoundingClientRect().height||0;
 const viewHeight=Math.max(160,window.innerHeight-headerHeight-6);
 main.style.transform='none';
 main.style.removeProperty('height');
 main.style.maxWidth='none';
 let scale=1;
 for(let pass=0;pass<5;pass++){
  const internalWidth=Math.min(5000,viewWidth/scale);
  main.style.width=internalWidth+'px';
  const contentHeight=Math.max(1,main.scrollHeight,main.offsetHeight);
  const next=Math.max(0.12,Math.min(1,viewHeight/contentHeight));
  if(Math.abs(next-scale)<0.006){scale=next;break}
  scale=next;
 }
 main.style.width=Math.min(5000,viewWidth/scale)+'px';
 const naturalHeight=Math.max(1,main.scrollHeight,main.offsetHeight);
 scale=Math.max(0.12,Math.min(1,viewHeight/naturalHeight));
 // Fit both dimensions after final layout; never allow content to clip offscreen.
 scale=Math.min(scale,viewWidth/main.offsetWidth);
 main.style.transform='scale('+scale+')';
 main.style.transformOrigin='top left';
 main.style.height=naturalHeight+'px';
 main.dataset.fitScale=scale.toFixed(3);
 [current.map,current.routeWeatherMap].filter(Boolean).forEach(m=>setTimeout(()=>m.invalidateSize({pan:false}),100));
}
function toggleFit(){
 fitActive=!fitActive;
 const main=$('main');
 document.body.classList.toggle('dashboard-fit',fitActive);
 text('#fit-screen',fitActive?'⤢ Exit Fit':'⤢ Fit Screen');
 if(!fitActive){main.style.removeProperty('width');main.style.removeProperty('max-width');main.style.removeProperty('height');main.style.removeProperty('transform');main.style.removeProperty('transform-origin');delete main.dataset.fitScale;repairMobileMap();return}
 fitDashboard();
}
$('#fit-screen').onclick=toggleFit;
window.addEventListener('resize',()=>{if(fitActive)requestAnimationFrame(fitDashboard)});

function repairMobileMap(){if(!current.map)return;const visible=$('#main-map')?.getBoundingClientRect();if(visible&&visible.width>20&&visible.height>20){current.map.invalidateSize({pan:false});if(!current.mapLayer&&['radar','route'].includes($('.tab.active')?.dataset.map))current.mapLayer=addRadarLayer(current.map)}}
window.addEventListener('resize',()=>setTimeout(repairMobileMap,120));
window.addEventListener('orientationchange',()=>setTimeout(repairMobileMap,500));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){setTimeout(repairMobileMap,120);if(autoRefresh.checked)refresh()}});
try{current.map=makeMap('main-map');initRouteWeatherMap();current.homeMarker=L.marker(homeCoords()).addTo(current.map).bindPopup(current.homeId+' · Home airport');changeBaseLayers();refresh();setTimeout(repairMobileMap,800)}catch(err){status('Map library unavailable: '+err.message);refresh()}
setInterval(()=>{if(autoRefresh.checked&&!document.hidden)refresh()},180000);


// Make chart thumbnails resilient to source outages. The text fallback stays clickable.
function attachChartFallbacks(){
  document.querySelectorAll('.thumb[data-open-chart]').forEach(button=>{
    const key=button.dataset.openChart, img=button.querySelector('img');
    if(!img || !charts[key])return;
    img.src=charts[key].image+'?v='+Math.floor(Date.now()/600000);
    img.onerror=()=>{
      img.style.display='none';
      if(button.querySelector('.chart-fallback'))return;
      const fallback=document.createElement('div');fallback.className='chart-fallback';
      const icon=document.createElement('div');icon.className='chart-fallback-icon';icon.textContent=key==='surface'?'≋':'⚡';
      const title=document.createElement('strong');title.textContent=key==='surface'?'WPC SURFACE ANALYSIS':'SPC CONVECTIVE OUTLOOK';
      const note=document.createElement('small');note.textContent='Live chart temporarily unavailable · Tap for official source';
      fallback.append(icon,title,note);button.prepend(fallback);
    };
  });
}
attachChartFallbacks();

// v0.9: Match compact mockup hierarchy without hiding flight-planning capabilities.
const routeEditor=document.getElementById('route-form');
const routeToggle=document.getElementById('toggle-route-edit');
if(routeToggle&&routeEditor){
 routeToggle.addEventListener('click',()=>{
   const opening=routeEditor.classList.contains('is-collapsed');
   routeEditor.classList.toggle('is-collapsed',!opening);
   routeToggle.setAttribute('aria-expanded',String(opening));
   routeToggle.querySelector('span').textContent=opening?'▴':'▾';
 });
 routeEditor.addEventListener('submit',()=>{
   const from=document.getElementById('route-from').value.trim().toUpperCase();
   const to=document.getElementById('route-to').value.trim().toUpperCase();
   document.getElementById('route-current-from').textContent=from||'KOMA';
   document.getElementById('route-current-to').textContent=to||'Enter destination';
 });
 const quick=document.getElementById('quick-plan');
 quick?.addEventListener('click',()=>{
   document.getElementById('route-current-from').textContent=document.getElementById('quick-from').value.trim().toUpperCase()||'KOMA';
   document.getElementById('route-current-to').textContent=document.getElementById('quick-to').value.trim().toUpperCase()||'Enter destination';
 });
}



// NOAA SPC convective chart day selector (official NOAA categorical outlook map service).
let activeConvectiveDay='1';
function setConvectiveDay(day){
 if(!['1','2','3'].includes(day))return;
 activeConvectiveDay=day;
 charts.convective.name='SPC Day '+day+' Convective Outlook';
 charts.convective.image='/api/chart/convective?day='+day;
 document.querySelectorAll('[data-day]').forEach(btn=>btn.classList.toggle('active',btn.dataset.day===day));
 text('#convective-caption','Click to enlarge Day '+day+' SPC outlook');
 const image=$('#convective-chart-img');
 if(image){image.style.display='block';image.src=charts.convective.image+'&v='+Math.floor(Date.now()/600000);
  image.onerror=()=>{image.style.display='none';text('#convective-chart-message','NOAA image unavailable from this connection. Open the official SPC outlook link below.');};
  image.onload=()=>text('#convective-chart-message','Official NOAA SPC Day '+day+' categorical outlook. Check issued/valid times.');
 }
 if(document.querySelector('[data-map="convective"]')?.classList.contains('active'))mapMode('convective');
}
document.querySelectorAll('[data-day]').forEach(btn=>btn.addEventListener('click',()=>setConvectiveDay(btn.dataset.day)));
setConvectiveDay('1');
// Airport NOTAM feed. No sample or made-up NOTAMs are displayed.
let notamPage=1,notamNotices=[],notamTotal=0,notamHasMore=false,notamAirport='',notamLastCheck='';
const notamSafe=htmlEscape;
function showNotamStatus(message){text('#notam-feed-status',message)}
function notamCategory(n){if(n.isTfr)return 'AIRSPACE';return String(n.categoryCode||'OTHER').toUpperCase()}
function notamFilterMatches(n,filter){
 if(filter==='all')return true;
 const code=notamCategory(n);
 if(filter==='AIRSPACE')return code==='AIRSPACE'||code==='TFR'||n.isTfr;
 if(filter==='OTHER')return !['RUNWAY','RWY_COND','TAXIWAY','AIRSPACE','TFR','NAVAID'].includes(code);
 if(filter==='RUNWAY')return code==='RUNWAY'||code==='RWY_COND';
 return code===filter;
}
function renderNotams(){
 const area=$('#notam-list');area.replaceChildren();const filter=$('#notam-filter').value;
 const filtered=notamNotices.filter(n=>notamFilterMatches(n,filter));
 for(const n of filtered){
   const item=document.createElement('article');item.className='notam-item';
   const header=document.createElement('div');header.className='notam-item-top';
   const number=document.createElement('strong');number.textContent=n.number||'NOTAM';
   const tag=document.createElement('span');tag.className='notam-tag '+(n.isTfr?'critical':notamCategory(n).toLowerCase());tag.textContent=n.category||'Other';
   header.append(number,tag);
   const reading=document.createElement('p');reading.className='notam-reading';reading.textContent=n.reading||n.text||'Text unavailable';
   const times=document.createElement('small');times.textContent='Effective '+(n.start?dateTime(n.start):'time unknown')+' — '+(n.end?dateTime(n.end):'permanent / end unknown');
   const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Full NOTAM text';
   const raw=document.createElement('pre');raw.textContent=n.text||'No raw notice text';details.append(summary,raw);
   item.append(header,reading,times,details);area.append(item);
 }
 if(!filtered.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=notamNotices.length?'No loaded notices match this filter.':'No notices have been returned.';area.append(empty)}
 text('#notam-count-detail',notamNotices.length+' of '+notamTotal+' reported notices loaded');
 $('#notam-more').classList.toggle('hidden',!notamHasMore);
}
async function loadNotams(page=1){
 const airport=current.homeId;
 if(page===1){notamPage=1;notamNotices=[];notamHasMore=false;notamTotal=0;notamAirport=airport;}
 showNotamStatus('Loading '+airport+' NOTAMs…');
 $('#notam-more').disabled=true;
 try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);let data;try{const response=await fetch('/api/notams?airport='+encodeURIComponent(airport)+'&page='+page,{signal:controller.signal,cache:'no-store'});data=await response.json().catch(()=>({error:'Invalid NOTAM service response'}));if(!response.ok)throw Error(data.error||'NOTAM service returned HTTP '+response.status);}finally{clearTimeout(timer);}
   if(current.homeId!==airport)return;
   notamPage=page;notamNotices=notamNotices.concat(data.notams||[]);notamHasMore=!!data.hasMore;notamTotal=data.total;
   notamLastCheck=data.checkedAt;text('#notam-checked',(data.cached?'Cached · last checked ':'Checked ')+dateTime(data.checkedAt));
   const testing=data.environment==='test';
   text('#notam-home-id',testing?'TEST':String(data.total));text('#notam-summary',airport+(testing?' · TEST DATA — NOT FOR FLIGHT USE':' · reported NOTAMs'));
   showNotamStatus(testing?'FAA NMS PRE-PRODUCTION / TEST DATA. NOT VALID FOR FLIGHT PLANNING.':data.total===0?'Provider returned no notices for '+airport+'.':'FAA NMS notices for '+airport+(data.cached?' · cached · next FAA pull no sooner than 3 minutes after last request':''));
   renderNotams();
 }catch(err){
   if(current.homeId!==airport)return;
   if(page===1){notamNotices=[];notamHasMore=false;notamTotal=0;$('#notam-list').replaceChildren();text('#notam-home-id',airport);text('#notam-summary','NOTAM feed unavailable')}
   showNotamStatus((err.name==='AbortError'?'FAA NMS request timed out after 30 seconds.':err.message)+' No notices are being represented as current.');
   text('#notam-count-detail','Data unavailable');
 }finally{$('#notam-more').disabled=false}
}
$('#notam-refresh').addEventListener('click',()=>loadNotams(1));
$('#notam-filter').addEventListener('change',renderNotams);
$('#notam-more').addEventListener('click',()=>{if(notamHasMore)loadNotams(notamPage+1)});
$('#notam-expand').addEventListener('click',()=>{
 const div=document.createElement('div');div.className='notam-modal-list';
 const source=$('#notam-list');div.textContent='';for(const child of source.children)div.append(child.cloneNode(true));
 showModal(current.homeId+' · Airport NOTAMs',div,'https://notams.aim.faa.gov/notamSearch/');
});

// Freely positioned, resizable card canvas. Handles use Pointer Events for mouse, touch and pen.
// Persist per browser; includes all four summary cards and every detailed panel.
(function setupFreeLayout(){
 const board=$('#custom-board'),toggle=$('#layout-toggle'),reset=$('#layout-reset');
 if(!board||!toggle||!reset)return;
 const ids=['temp','dewpoint','wind','flightcat','notam-home-id','airport-section','wind-section','charts-section','route-section','forecast-section','notam-section'];
 const tiles=ids.slice(0,5).map(id=>document.getElementById(id)?.closest('.stat')).filter(Boolean);
 const details=ids.slice(5).map(id=>document.getElementById(id)).filter(Boolean);
 const nodes=[...tiles,...details];
 tiles.forEach((n,i)=>{n.id='tile-'+['forecast','dewpoint','wind','category','notam'][i]});
 const originals=new Map(nodes.map(n=>({node:n,parent:n.parentElement,next:n.nextSibling})) .map(x=>[x.node,{parent:x.parent,next:x.next}]));
 const key='weather-command-free-layout-v17';
 let active=false,editing=false,interaction=null;
 let raf=0;
 const minW=185,minH=78;
 const rectBoard=()=>board.getBoundingClientRect();
 const maxRight=()=>Math.max(0,...nodes.map(n=>n.offsetLeft+n.offsetWidth));
 const maxBottom=()=>Math.max(0,...nodes.map(n=>n.offsetTop+n.offsetHeight));
 const refreshMaps=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{setTimeout(()=>{for(const m of mapsRegistry){try{m.invalidateSize()}catch{}}},65)})};
 function adjustBoard(){if(!active)return;board.style.minHeight=(maxBottom()+28)+'px'}
 function state(){return {version:15,boardWidth:board.clientWidth,cards:nodes.map(n=>({id:n.id,x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth,h:n.offsetHeight,collapsed:n.classList.contains('card-collapsed'),openHeight:Number(n.dataset.openHeight)||0}))}}
 function save(){if(!active)return;try{localStorage.setItem(key,JSON.stringify(state()))}catch{}adjustBoard()}
 const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
 function position(n,x,y,w,h){
   const width=board.clientWidth||1100;
   const proposedW=clamp(Math.round(w),Math.min(minW,width),width);
   n.style.position='absolute';n.style.left=clamp(Math.round(x),0,Math.max(0,width-proposedW))+'px';n.style.top=Math.max(0,Math.round(y))+'px';
   n.style.width=proposedW+'px';n.style.height=Math.max(minH,Math.round(h))+'px';
 }
 function measuredLayout(){
   const base=rectBoard(), mainRect=board.parentElement.getBoundingClientRect();
   let fallback=0;
   return nodes.map(n=>{
     const r=n.getBoundingClientRect();
     if(r.width<5||r.height<5){const y=fallback;fallback+=240;return {n,x:0,y,w:Math.min(board.clientWidth,370),h:220}}
     return {n,x:r.left-mainRect.left,y:r.top-base.top,w:r.width,h:r.height};
   });
 }
 function enter(saved){
   if(active)return;board.classList.remove('hidden');const measurements=measuredLayout();
   document.body.classList.add('free-layout-active');
   nodes.forEach(n=>board.appendChild(n));active=true;
   const data=new Map((saved?.cards||[]).map(x=>[x.id,x]));const scale=saved?.boardWidth>0?board.clientWidth/saved.boardWidth:1;
   let safetyY=0;
   for(const m of measurements){const c=data.get(m.n.id);let x=c?c.x*scale:m.x,y=c?c.y:m.y,w=c?c.w*scale:m.w,h=c?c.h:m.h;
     if(!Number.isFinite(y)||y<0||(!c&&m.w<10)){y=safetyY;x=0;w=300;h=240}
     position(m.n,x,y,w,h);safetyY=Math.max(safetyY,y+h+12);
     if(c?.collapsed){m.n.dataset.openHeight=String(c.openHeight||h);m.n.classList.add('card-collapsed');m.n.style.height='56px'}
   }
   nodes.forEach(addControls);adjustBoard();refreshMaps();text('#layout-state','Custom layout saved on this device');
 }
 function addControls(n){if(n.querySelector(':scope > .free-controls'))return;
   const toolbar=document.createElement('div');toolbar.className='free-controls';
   const drag=document.createElement('div');drag.className='free-grip';drag.tabIndex=0;drag.title='Drag to move panel';drag.textContent='⠿ MOVE';
   const collapse=document.createElement('button');collapse.type='button';collapse.className='free-collapse';collapse.title='Collapse or expand panel';collapse.textContent=n.classList.contains('card-collapsed')?'+':'−';
   const handle=document.createElement('div');handle.className='free-resize';handle.title='Drag corner to resize width and height';handle.setAttribute('role','separator');handle.setAttribute('aria-label','Resize panel');
   collapse.addEventListener('click',e=>{e.stopPropagation();const shrinking=!n.classList.contains('card-collapsed');if(shrinking){n.dataset.openHeight=n.offsetHeight;n.classList.add('card-collapsed');n.style.height='56px';collapse.textContent='+'}
      else{n.classList.remove('card-collapsed');n.style.height=Math.max(150,Number(n.dataset.openHeight)||230)+'px';collapse.textContent='−'}save();refreshMaps()});
   for(const [target,mode] of [[drag,'move'],[handle,'resize']]){
     target.addEventListener('pointerdown',e=>{
       if((mode==='move'&&!editing)||e.button!==0)return;e.preventDefault();e.stopPropagation();
       interaction={id:e.pointerId,n,mode,startX:e.clientX,startY:e.clientY,x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth,h:n.offsetHeight};
       n.style.zIndex='20';target.setPointerCapture(e.pointerId);document.body.classList.add('free-drag-active');
     });
     target.addEventListener('pointermove',e=>{
       if(!interaction||interaction.id!==e.pointerId||interaction.n!==n)return;
       e.preventDefault();const k=interaction,dx=e.clientX-k.startX,dy=e.clientY-k.startY;
       if(k.mode==='move')position(n,k.x+dx,k.y+dy,k.w,k.h);
       else{if(n.classList.contains('card-collapsed')){n.classList.remove('card-collapsed');n.style.height=Math.max(150,Number(n.dataset.openHeight)||200)+'px';collapse.textContent='−'}position(n,k.x,k.y,k.w+dx,k.h+dy)}
       adjustBoard();refreshMaps();
     });
     const stop=e=>{if(!interaction||interaction.id!==e.pointerId||interaction.n!==n)return;n.style.zIndex='';interaction=null;document.body.classList.remove('free-drag-active');save();refreshMaps()};
     target.addEventListener('pointerup',stop);target.addEventListener('pointercancel',stop);
   }
   drag.addEventListener('keydown',e=>{if(!editing)return;const dirs={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]};if(!dirs[e.key])return;e.preventDefault();position(n,n.offsetLeft+dirs[e.key][0],n.offsetTop+dirs[e.key][1],n.offsetWidth,n.offsetHeight);save()});
   toolbar.append(drag,collapse);n.append(toolbar,handle);
 }
 function setEditing(v){editing=v;document.body.classList.toggle('free-layout-editing',v);toggle.textContent=v?'Done Arranging':'Arrange Panels';toggle.setAttribute('aria-pressed',String(v));text('#layout-state',v?'Drag MOVE handle; pull lower-right corner to resize; − collapses':'Custom layout saved on this device');refreshMaps()}
 toggle.addEventListener('click',()=>{if(!active)enter(null);setEditing(!editing);save()});
 reset.addEventListener('click',()=>{
   if(!window.confirm('Restore original dashboard arrangement on this device?'))return;
   setEditing(false);nodes.forEach(n=>{
     n.querySelector(':scope > .free-controls')?.remove();n.querySelector(':scope > .free-resize')?.remove();
     n.classList.remove('card-collapsed');n.removeAttribute('style');delete n.dataset.openHeight;
   });
   nodes.forEach(n=>{const o=originals.get(n);if(o?.next&&o.next.parentNode===o.parent)o.parent.insertBefore(n,o.next);else o.parent.append(n)});
   // original order is preserved by DOM for the four tiles, even after moving them into the custom canvas
   const byParent=[...new Set(nodes.map(n=>originals.get(n).parent))];for(const parent of byParent){const part=nodes.filter(n=>originals.get(n).parent===parent);part.forEach((n)=>{const after=originals.get(n).next;if(after?.parentNode===parent)parent.insertBefore(n,after)})}
   board.classList.add('hidden');board.style.minHeight='';document.body.classList.remove('free-layout-active');active=false;
   try{localStorage.removeItem(key);localStorage.removeItem('wc-layout-v13');localStorage.removeItem('weather-command-layout-v12')}catch{}
   text('#layout-state','Default layout');refreshMaps();
 });
 window.addEventListener('resize',()=>{if(!active||interaction)return;const bw=board.clientWidth;nodes.forEach(n=>{if(n.offsetLeft+n.offsetWidth>bw)position(n,Math.min(n.offsetLeft,Math.max(0,bw-n.offsetWidth)),n.offsetTop,Math.min(n.offsetWidth,bw),n.offsetHeight)});adjustBoard();refreshMaps()});
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.version===15&&Array.isArray(saved.cards)){enter(saved);setEditing(false)}}catch{}
})();

$('#radar-quality')?.addEventListener('change',()=>{if(current.map&&$('.tab.active')?.dataset.map==='radar')transitionRadar(current.map,'mapLayer');});
