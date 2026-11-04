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
function closeModal(){if(current.modalMap){current.modalMap.remove();current.modalMap=null;current.modalRouteLayer=null;current.modalRouteRadarLayer=null}$('#modal').classList.add('hidden');$('#modal-content').replaceChildren()}
$('#modal-close').addEventListener('click',closeModal);$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
function openChart(key){const c=charts[key];if(!c)return;const wrap=document.createElement('div');const img=document.createElement('img');img.src=c.image+(c.image.includes('?')?'&':'?')+'v='+Math.floor(Date.now()/900000);img.alt=c.name;img.onerror=()=>{img.style.display='none';const p=document.createElement('p');p.className='source-note';p.textContent='Official chart temporarily unavailable. Open the WPC/SPC source using the link above.';wrap.append(p)};wrap.append(img);showModal(c.name,wrap,c.source)}
$$('[data-open-chart]').forEach(el=>el.addEventListener('click',()=>openChart(el.dataset.openChart)));
function scrollToPanel(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'center'})}
$$('[data-detail]').forEach(el=>el.addEventListener('click',()=>scrollToPanel(el.dataset.detail)));
$$('[data-target]').forEach(el=>el.addEventListener('click',()=>{scrollToPanel(el.dataset.target);$$('[data-target]').forEach(b=>b.classList.toggle('active',b===el))}));
function makeMap(node,zoom=6){if(!window.L)throw Error('Interactive map library unavailable');const m=L.map(node,{zoomControl:true}).setView(homeCoords(),current.mapStyle==='sectional'?Math.max(8,zoom):zoom);m.wcBaseLayer=createBaseLayer(current.mapStyle).addTo(m);mapsRegistry.add(m);m.on('unload',()=>mapsRegistry.delete(m));return m}
function latestRadarFrame(){const a=current.radar?.radar?.past||[];return a.length?a[Math.max(0,Math.min(current.radarFrame,a.length-1))]:null}
function addRadarLayer(map){const frame=latestRadarFrame();if(!frame||!map)return null;const sharp=$('#radar-quality')?.value!=='smooth';const url=`${current.radar.host}${frame.path}/512/{z}/{x}/{y}/2/${sharp?'0_1':'1_1'}.png`;const layer=L.tileLayer(url,{tileSize:256,maxNativeZoom:7,maxZoom:18,opacity:.78,updateWhenIdle:true,keepBuffer:1,attribution:'Radar © RainViewer'});layer.addTo(map);text('#map-caption','Radar '+dateTime(frame.time)+' · '+(sharp?'sharp':'smoothed')+' rendering (source max zoom 7)');return layer}
function transitionRadar(map,slot){if(!map)return;const prior=current[slot];const next=addRadarLayer(map);if(!next)return;current[slot]=next;let retired=false;const retire=()=>{if(retired)return;retired=true;if(prior&&prior!==next&&map.hasLayer(prior))map.removeLayer(prior)};next.once('load',retire);setTimeout(retire,1400)}
function removeMainLayers(){if(current.mapLayer){current.map.removeLayer(current.mapLayer);current.mapLayer=null}if(current.routeLayer){current.map.removeLayer(current.routeLayer);current.routeLayer=null}}
function drawRouteOn(map){const pts=current.route.filter(p=>p.coords);const group=L.layerGroup().addTo(map);if(pts.length){const coords=pts.map(x=>x.coords);pts.forEach(p=>{const name=htmlEscape(p.id), report=htmlEscape(p.metar?.rawOb||'METAR unavailable');L.marker(p.coords).addTo(group).bindPopup(`<strong>${name}</strong><p>${report}</p>`)});if(coords.length>1)L.polyline(coords,{color:'#55d9ff',weight:4,dashArray:'8 6'}).addTo(group);if(coords.length>1)map.fitBounds(L.latLngBounds(coords).pad(.18));else map.setView(coords[0],8)}else{L.marker(homeCoords()).bindPopup(current.homeId).addTo(group);map.setView(homeCoords(),current.mapStyle==='sectional'?8:6)}return group}
function mapMode(mode){setTab('map',mode);$('#play-radar').classList.toggle('hidden',mode!=='radar');$('#map-chart').classList.add('hidden');$('#main-map').classList.remove('hidden');$('#chart-unavailable').classList.add('hidden');removeMainLayers();if(mode==='radar'){current.map.setView(homeCoords(),current.mapStyle==='sectional'?8:6);current.mapLayer=addRadarLayer(current.map);$('#map-source').href='https://radar.weather.gov/';text('#map-source','NOAA radar ↗')}else if(mode==='route'){current.routeLayer=drawRouteOn(current.map);if(current.routeRadarOn)current.mapLayer=addRadarLayer(current.map);text('#map-caption','Straight-line planning display; not an approved flight route');$('#map-source').href='https://aviationweather.gov/';text('#map-source','Aviation Weather Center ↗');}else{const c=charts[mode];if(!c)return;$('#main-map').classList.add('hidden');$('#map-chart').classList.remove('hidden');const image=$('#map-chart-image');image.style.display='block';image.src=c.image+(c.image.includes('?')?'&':'?')+'v='+Math.floor(Date.now()/900000);image.alt=c.name;image.onerror=()=>{image.style.display='none';$('#chart-unavailable').classList.remove('hidden')};$('#map-source').href=c.source;text('#map-source','Official source ↗');text('#map-caption',c.name+' · verify analysis/valid time on chart')}if(mode==='radar'||mode==='route')setTimeout(()=>current.map.invalidateSize(),100)}
$$('[data-map]').forEach(btn=>btn.addEventListener('click',()=>mapMode(btn.dataset.map)));
function modalMap(){const node=document.createElement('div');node.className='modal-map';showModal('Regional Radar / Route Map',node,'https://radar.weather.gov/');current.modalMap=makeMap(node,7);if($('.tab.active')?.dataset.map==='route'){drawRouteOn(current.modalMap);if(current.routeRadarOn)addRadarLayer(current.modalMap)}else addRadarLayer(current.modalMap);setTimeout(()=>current.modalMap?.invalidateSize(),150)}
$('#expand-map').onclick=()=>{const active=$('.tab.active')?.dataset.map;if(charts[active])openChart(active);else modalMap()};$('#map-full').onclick=$('#expand-map').onclick;
function pauseRadar(){current.radarPlaying=false;clearInterval(current.radarTimer);text('#play-radar','▶')}
$('#play-radar').onclick=()=>{if(current.radarPlaying){pauseRadar();return}if((current.radar?.radar?.past||[]).length<2)return;current.radarPlaying=true;text('#play-radar','Ⅱ');current.radarTimer=setInterval(()=>{const frames=current.radar.radar.past;current.radarFrame=(current.radarFrame+1)%frames.length;if($('.tab.active')?.dataset.map==='radar'){transitionRadar(current.map,'mapLayer')}},1500)};
async function loadRadar(){try{const r=await fetchJSON('/api/radar');current.radar=r;const frames=r?.radar?.past||[];current.radarFrame=frames.length-1;if($('.tab.active')?.dataset.map==='radar'){transitionRadar(current.map,'mapLayer')}drawSmallRouteMap();if(!frames.length)text('#map-caption','No recent radar frames available')}catch(err){text('#map-caption','Radar unavailable · '+err.message);drawSmallRouteMap()}}
function decodeMETAR(m){if(!m)return '<p>Observation unavailable.</p>';const rows=[['Station',m.icaoId],['Wind',m.wdir==null?'Unavailable':`${m.wdir}° at ${m.wspd??'—'} kt${m.wgst?' gust '+m.wgst+' kt':''}`],['Visibility',m.visib==null?'Unavailable':m.visib+' SM'],['Flight category',m.fltCat||'Unavailable'],['Temperature',m.temp==null?'Unavailable':m.temp+'°C'],['Dew point',m.dewp==null?'Unavailable':m.dewp+'°C'],['Altimeter',m.altim==null?'Unavailable':m.altim+' hPa (source field)']];return rows.map(([a,b])=>`<div><strong>${htmlEscape(a)}</strong><br>${htmlEscape(b)}</div>`).join('')}
function aviationTab(tab){setTab('aviation',tab);$('#aviation-raw').classList.toggle('hidden',tab==='decoded');$('#aviation-decoded').classList.toggle('hidden',tab!=='decoded');if(tab==='metar')text('#aviation-raw',current.metar?.rawOb||current.homeId+' METAR unavailable');if(tab==='taf')text('#aviation-raw',current.taf?.rawTAF||current.homeId+' TAF unavailable');if(tab==='decoded')$('#aviation-decoded').innerHTML=decodeMETAR(current.metar)}
$$('[data-aviation]').forEach(b=>b.onclick=()=>aviationTab(b.dataset.aviation));
async function loadAviation(){try{const d=await fetchJSON('/api/airport-route?ids='+encodeURIComponent(current.homeId));const m=d.metars?.find(x=>codeOf(x)===current.homeId)||null;const t=d.tafs?.find(x=>codeOf(x)===current.homeId)||null;current.metar=m;current.taf=t;text('#dewpoint',m?.dewp!=null?Number(m.dewp).toFixed(0)+'°C':'—');text('#dewpoint-detail',m?.temp!=null&&m?.dewp!=null?'Temp '+Number(m.temp).toFixed(0)+'°C · Dew '+Number(m.dewp).toFixed(0)+'°C':'Dew point observation unavailable');text('#wind',m?.wspd!=null?m.wspd+' kt':'—');text('#windinfo',m?.wdir!=null?`${m.wdir}°${m.wgst?` · gust ${m.wgst} kt`:''}`:'Wind direction unavailable');text('#flightcat',m?.fltCat||'—');text('#flightdetail',m?.visib!=null?`Visibility ${m.visib} SM`:'Category/visibility unavailable');$('#flightcat').style.color=({VFR:'#57e69e',MVFR:'#7ebdff',IFR:'#ff6873',LIFR:'#e88eff'})[m?.fltCat]||'';text('#aviation-time','Observed '+dateTime(m?.obsTime));aviationTab($('.pill.active')?.dataset.aviation||'metar');if(!m)status(current.homeId+' METAR unavailable; not every airport publishes observations.')}catch(err){text('#dewpoint','—');text('#dewpoint-detail','Observation unavailable');status('Aviation observations unavailable: '+err.message)}}
async function loadForecastSummary(){try{const c=homeCoords();const r=await fetchJSON('/api/location-forecast?lat='+c[0]+'&lon='+c[1]);current.forecast=r;const p=r?.periods?.[0];text('#temp',p?.temperature!=null?`${p.temperature}°${p.temperatureUnit||'F'}`:'—');text('#conditions',p?.shortForecast||'NWS forecast unavailable')}catch(err){text('#conditions','NWS forecast unavailable')}}
async function loadAlerts(){try{const c=homeCoords();const d=await fetchJSON('/api/home-alerts?lat='+c[0]+'&lon='+c[1]);const items=d?.features||[];current.alerts=items;const host=$('#alerts-list');host.replaceChildren();if(!items.length){host.textContent='No current NWS alerts for '+current.homeId+'.';return}items.slice(0,15).forEach(a=>{const box=document.createElement('div');box.className='alert';const title=document.createElement('strong');title.textContent=a.properties?.event||'Weather alert';const detail=document.createElement('small');detail.textContent=a.properties?.areaDesc||'';box.append(title,detail);host.append(box)})}catch(err){text('#alerts-list','NWS alerts unavailable: '+err.message)}}
function normalize(code){const c=String(code||'').trim().toUpperCase();if(!/^[A-Z0-9]{3,4}$/.test(c))throw Error('Enter a 3- or 4-character airport identifier');return c.length===3?'K'+c:c}
function coordsOf(x){const lat=Number(x?.lat??x?.latitude??x?.latitude_deg??x?.latDecimal),lon=Number(x?.lon??x?.longitude??x?.longitude_deg??x?.lonDecimal);return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null}
function codeOf(x){return String(x?.icaoId??x?.icao??x?.id??x?.ident??x?.stationId??'').toUpperCase()}
async function lookupAirports(ids){const resp=await fetchJSON('/api/airport-route?ids='+encodeURIComponent(ids.join(',')));return ids.map(id=>({id,metar:resp.metars?.find(x=>codeOf(x)===id),taf:resp.tafs?.find(x=>codeOf(x)===id),coords:coordsOf(resp.airports?.find(x=>codeOf(x)===id))||coordsOf(resp.metars?.find(x=>codeOf(x)===id))||(id===current.homeId?homeCoords():null)}))}
function distanceNM(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);const h=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(h)))}
function calculateRoute(){let sum=0;let complete=true;for(let i=1;i<current.route.length;i++){const a=current.route[i-1].coords,b=current.route[i].coords;if(a&&b)sum+=distanceNM(a,b);else complete=false}const gs=Number($('#groundspeed').value),gph=Number($('#fuelburn').value);const can=complete&&current.route.length>1&&gs>0&&gph>0;text('#distance',can?sum.toFixed(0)+' NM':'—');text('#ete',can?(sum/gs).toFixed(1)+' h':'—');text('#fuel',can?(sum/gs*gph).toFixed(1)+' gal':'—');return can}
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
 setTimeout(()=>current.modalMap?.invalidateSize(),150);
}
if($('#expand-route-map'))$('#expand-route-map').onclick=expandRouteMap;
if($('#route-radar'))$('#route-radar').onchange=e=>{current.routeRadarOn=e.target.checked;drawSmallRouteMap()};

function drawRouteWeather(){const host=$('#route-weather');if(!host)return;host.replaceChildren();if(!current.route.length){host.textContent='No route has been entered.';return}for(const p of current.route){const line=document.createElement('div');line.className='airport-row';const btn=document.createElement('button');btn.textContent=p.id;btn.title='Show airport weather';btn.onclick=()=>openAirport(p);const cat=document.createElement('span');cat.textContent=p.metar?.fltCat||'NO METAR';cat.className='category '+(p.metar?.fltCat||'');line.append(btn,cat);host.append(line)}}
async function loadRoute(e){e?.preventDefault();let ids;try{ids=[normalize($('#route-from').value),...$('#route-via').value.split(',').map(x=>x.trim()).filter(Boolean).map(normalize),normalize($('#route-to').value)];if(ids.length>12)throw Error('Use at most 12 airports');}catch(err){text('#route-status',err.message);return}const button=$('#route-form button[type=submit]');button.disabled=true;text('#route-status','Loading airport observations and route positions…');try{current.route=await lookupAirports(ids);drawRouteWeather();drawSmallRouteMap();const can=calculateRoute();const found=current.route.filter(x=>x.metar).length;text('#route-status',`${found}/${ids.length} METARs found · ${can?'Straight-line distance, time and fuel estimates shown.':'Some airport coordinates unavailable; estimate not calculated.'} Not an operational flight plan.`);updateForecastLocations();if($('.tab.active')?.dataset.map==='route')mapMode('route')}catch(err){text('#route-status','Route lookup failed: '+err.message)}finally{button.disabled=false}}
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
     state.textContent=(testing?'TEST ENVIRONMENT — NOT FOR FLIGHT USE · ':'')+total+' NOTAM'+(total===1?'':'s')+' returned for '+airport+' · checked '+dateTime(data.checkedAt)+(data.limited?' · provider results may be limited':'');
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
function openAirport(p){
 const block=document.createElement('div');
 block.innerHTML=`<div class="modal-row"><strong>${htmlEscape(p.id)}</strong> · ${htmlEscape(p.metar?.fltCat||'No reported flight category')} · ${htmlEscape(dateTime(p.metar?.obsTime))}</div><div class="modal-row"><strong>METAR</strong><pre>${htmlEscape(p.metar?.rawOb||'No current observation available.')}</pre></div><div class="modal-row"><strong>TAF</strong><pre>${htmlEscape(p.taf?.rawTAF||'No published TAF for this airport.')}</pre></div>`;
 const section=document.createElement('section');section.className='modal-row airport-notam-section';block.append(section);
 const btn=document.createElement('button');btn.className='primary';btn.textContent='Show multi-day forecast for this airport';
 btn.onclick=()=>{$('#forecast-select').value=p.id;closeModal();scrollToPanel('forecast-section');loadLocationForecast()};
 if([...$('#forecast-select').options].some(x=>x.value===p.id))block.append(btn);
 showModal(p.id+' · Airport Weather & NOTAMs',block,'https://aviationweather.gov/');
 loadAirportPopupNotams(p.id,section);
}
$('#airport-search').onsubmit=async e=>{e.preventDefault();let id;try{id=normalize($('#airport-id').value)}catch(err){status(err.message);return}status(`Looking up ${id}…`);try{const [p]=await lookupAirports([id]);current.route.some(x=>x.id===id)||current.route.push(p);updateForecastLocations();status('');openAirport(p)}catch(err){status('Airport lookup failed: '+err.message)}};
function iconFor(x){const s=String(x||'').toLowerCase();if(/thunder/.test(s))return '⛈';if(/snow|sleet|ice/.test(s))return '❄';if(/rain|shower|drizzle/.test(s))return '🌧';if(/cloud|overcast/.test(s))return '☁';if(/fog|haze/.test(s))return '≋';return '☀'}
function forecastTiles(periods){const host=$('#forecast-days');host.replaceChildren();const daytime=periods.filter(p=>p.isDaytime);const samples=daytime.length?daytime.slice(0,5):periods.slice(0,5);for(const p of samples){const tile=document.createElement('div');tile.className='day';const day=document.createElement('strong');day.textContent=p.name||'Period';const symbol=document.createElement('div');symbol.className='symbol';symbol.textContent=iconFor(p.shortForecast);const t=document.createElement('div');t.className='temperature';t.textContent=p.temperature!=null?p.temperature+'°':'—';const info=document.createElement('small');info.textContent=p.shortForecast||'Forecast unavailable';const wind=document.createElement('small');wind.textContent=[p.windDirection,p.windSpeed].filter(Boolean).join(' ')||'Wind unavailable';tile.append(day,symbol,t,info,wind);host.append(tile)}if(!samples.length)host.textContent='No forecast periods available.'}
async function loadLocationForecast(){const id=$('#forecast-select').value||current.homeId;const p=current.route.find(x=>x.id===id);const coords=p?.coords||(id===current.homeId?homeCoords():null);if(!coords){text('#forecast-status',`${id}: Coordinates unavailable for NWS forecast`);return}text('#forecast-status','Loading NWS forecast near '+id+'…');try{const data=await fetchJSON(`/api/location-forecast?lat=${coords[0]}&lon=${coords[1]}`);forecastTiles(data.periods||[]);text('#forecast-status',id+' · NWS general forecast, not an aviation flight category or TAF.');text('#forecast-updated',dateTime(data.updated))}catch(err){text('#forecast-status','NWS forecast unavailable: '+err.message);text('#forecast-days','No forecast available')}}
$('#forecast-select').onchange=loadLocationForecast;
function modalSection(type){let content=document.createElement('div'),source='';switch(type){case'airport':content.innerHTML=`<div class="modal-row"><strong>METAR</strong><pre>${htmlEscape(current.metar?.rawOb||'Unavailable')}</pre></div><div class="modal-row"><strong>TAF</strong><pre>${htmlEscape(current.taf?.rawTAF||'Unavailable')}</pre></div><div class="modal-row">${decodeMETAR(current.metar)}</div>`;source='https://aviationweather.gov/';break;case'route':content.innerHTML=`<p class="source-note">Straight-line segment estimates only; terrain, airspace, winds, hazards, NOTAMs and route clearance are not evaluated. Official briefing required.</p>`;for(const p of current.route){const row=document.createElement('div');row.className='modal-row';row.innerHTML=`<strong>${htmlEscape(p.id)} · ${htmlEscape(p.metar?.fltCat||'No category')}</strong><pre>${htmlEscape(p.metar?.rawOb||'No METAR')}</pre><pre>${htmlEscape(p.taf?.rawTAF||'No published TAF')}</pre>`;content.append(row)}source='https://www.1800wxbrief.com/';break;case'forecast':content.innerHTML='<p class="source-note">Choose an airport from the dashboard forecast selector to update the five-period forecast. Detailed forecast products are available from NWS.</p>';source='https://www.weather.gov/';break;case'winds':if(lastWindReport?.available){content.append(windRowsToElement(lastWindReport))}else content.innerHTML='<p>Official winds aloft unavailable. Use the AWC link for source data.</p>';source='https://aviationweather.gov/windtemp';break;case'models':content.innerHTML='<p>Open NOAA operational products for live HRRR and GFS model runs. Full interactive model animation is not included in this release.</p><div class="modal-row"><a href="https://www.nco.ncep.noaa.gov/pmb/products/hrrr/" target="_blank" rel="noopener">HRRR model charts ↗</a></div><div class="modal-row"><a href="https://www.nco.ncep.noaa.gov/pmb/products/gfs/" target="_blank" rel="noopener">GFS model charts ↗</a></div>';source='https://nomads.ncep.noaa.gov/';break;case'alerts':for(const a of current.alerts){const row=document.createElement('div');row.className='modal-row';row.innerHTML=`<strong>${htmlEscape(a.properties?.event||'Alert')}</strong><p>${htmlEscape(a.properties?.areaDesc||'')}</p><p>${htmlEscape(a.properties?.headline||'')}</p>`;content.append(row)}if(!current.alerts.length)content.textContent='No active alerts retrieved.';source='https://www.weather.gov/';break}showModal(({airport:current.homeId+' Aviation',route:'Route Airport Weather',forecast:'Extended Forecast',winds:'Winds Aloft',models:'Forecast Models',alerts:'Nebraska Weather Alerts'})[type]||'Details',content,source)}
$$('[data-modal]').forEach(b=>b.addEventListener('click',()=>modalSection(b.dataset.modal)));

let lastWindReport=null;
function windRowsToElement(report){
 const root=document.createElement('div');root.className='wind-detail';
 const metadata=document.createElement('p');metadata.className='source-note';metadata.textContent=`Station ${report.station} · ${report.fcst}h forecast · ${report.header?.join(' · ')||'Validity unavailable'}`;root.append(metadata);
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
 const fcst=$('#wind-cycle').value,station=$('#wind-station').value;
 text('#winds-status',`Loading ${station} · ${fcst}-hour forecast…`);
 try{
   const d=await fetchJSON(`/api/winds-aloft?fcst=${encodeURIComponent(fcst)}&station=${encodeURIComponent(station)}`);
   lastWindReport=d;
   const host=$('#winds-rows');host.replaceChildren();
   if(!d.available){text('#winds-status',`No official FB winds table for ${station}. Select another forecast station.`);host.textContent='No station forecast available for this cycle.';return}
   text('#winds-status',`${station} · ${fcst}h · ${d.header?.find(s=>/VALID/i.test(s))||'See official valid time'}`);
   const el=windRowsToElement(d);const metadata=el.querySelector('.source-note');metadata.remove();
   while(el.firstChild)host.append(el.firstChild);
 }catch(err){lastWindReport=null;text('#winds-status','Official winds data unavailable: '+err.message);text('#winds-rows','Data unavailable — use AWC link below. No estimated winds are shown.');}
}
$('#wind-cycle').onchange=loadWinds;$('#wind-station').onchange=loadWinds;
$('#quick-plan').onclick=()=>{
 $('#route-from').value=$('#quick-from').value;
 $('#route-to').value=$('#quick-to').value;
 scrollToPanel('route-section');
 $('#route-form').requestSubmit();
};

async function refresh(){text('#checked','Refreshing sources…');status('');await Promise.allSettled([loadAviation(),loadForecastSummary(),loadAlerts(),loadRadar(),loadLocationForecast(),loadWinds(),loadNotams()]);text('#checked','Updated '+new Date().toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',timeZoneName:'short'}))}
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
 const windStations=$('#wind-station');if(windStations){const short=current.homeId.slice(1);if([...windStations.options].some(x=>x.value===short))windStations.value=short}
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

try{current.map=makeMap('main-map');initRouteWeatherMap();current.homeMarker=L.marker(homeCoords()).addTo(current.map).bindPopup(current.homeId+' · Home airport');changeBaseLayers();refresh();setInterval(refresh,300000)}catch(err){status('Map library unavailable: '+err.message);refresh()}

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
   notamLastCheck=data.checkedAt;text('#notam-checked','Checked '+dateTime(data.checkedAt));
   const testing=data.environment==='test';
   text('#notam-home-id',testing?'TEST':String(data.total));text('#notam-summary',airport+(testing?' · TEST DATA — NOT FOR FLIGHT USE':' · reported NOTAMs'));
   showNotamStatus(testing?'FAA NMS PRE-PRODUCTION / TEST DATA. NOT VALID FOR FLIGHT PLANNING.':data.total===0?'Provider returned no notices for '+airport+'.':'FAA NMS notices for '+airport);
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
 const ids=['temp','dewpoint','wind','flightcat','notam-home-id','airport-section','wind-section','charts-section','route-section','forecast-section','notam-section','surface-panel','alert-section'];
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
