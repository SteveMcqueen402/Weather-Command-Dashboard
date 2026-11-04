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
function openChart(key){const c=charts[key];if(!c)return;const wrap=document.createElement('div');const img=document.createElement('img');img.src=c.image+'?v='+Math.floor(Date.now()/900000);img.alt=c.name;img.onerror=()=>{img.style.display='none';const p=document.createElement('p');p.className='source-note';p.textContent='Official chart temporarily unavailable. Open the WPC/SPC source using the link above.';wrap.append(p)};wrap.append(img);showModal(c.name,wrap,c.source)}
$$('[data-open-chart]').forEach(el=>el.addEventListener('click',()=>openChart(el.dataset.openChart)));
function scrollToPanel(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'center'})}
$$('[data-detail]').forEach(el=>el.addEventListener('click',()=>scrollToPanel(el.dataset.detail)));
$$('[data-target]').forEach(el=>el.addEventListener('click',()=>{scrollToPanel(el.dataset.target);$$('[data-target]').forEach(b=>b.classList.toggle('active',b===el))}));
function makeMap(node,zoom=6){if(!window.L)throw Error('Interactive map library unavailable');const m=L.map(node,{zoomControl:true}).setView(homeCoords(),current.mapStyle==='sectional'?Math.max(8,zoom):zoom);m.wcBaseLayer=createBaseLayer(current.mapStyle).addTo(m);mapsRegistry.add(m);m.on('unload',()=>mapsRegistry.delete(m));return m}
function latestRadarFrame(){const a=current.radar?.radar?.past||[];return a.length?a[Math.max(0,Math.min(current.radarFrame,a.length-1))]:null}
function addRadarLayer(map){const frame=latestRadarFrame();if(!frame)return null;const url=`${current.radar.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;const l=L.tileLayer(url,{maxNativeZoom:7,maxZoom:18,opacity:.78,attribution:'Radar © RainViewer'}).addTo(map);text('#map-caption','Radar observation: '+dateTime(frame.time));return l}
function removeMainLayers(){if(current.mapLayer){current.map.removeLayer(current.mapLayer);current.mapLayer=null}if(current.routeLayer){current.map.removeLayer(current.routeLayer);current.routeLayer=null}}
function drawRouteOn(map){const pts=current.route.filter(p=>p.coords);const group=L.layerGroup().addTo(map);if(pts.length){const coords=pts.map(x=>x.coords);pts.forEach(p=>{const name=htmlEscape(p.id), report=htmlEscape(p.metar?.rawOb||'METAR unavailable');L.marker(p.coords).addTo(group).bindPopup(`<strong>${name}</strong><p>${report}</p>`)});if(coords.length>1)L.polyline(coords,{color:'#55d9ff',weight:4,dashArray:'8 6'}).addTo(group);if(coords.length>1)map.fitBounds(L.latLngBounds(coords).pad(.18));else map.setView(coords[0],8)}else{L.marker(homeCoords()).bindPopup(current.homeId).addTo(group);map.setView(homeCoords(),current.mapStyle==='sectional'?8:6)}return group}
function mapMode(mode){setTab('map',mode);$('#play-radar').classList.toggle('hidden',mode!=='radar');$('#map-chart').classList.add('hidden');$('#main-map').classList.remove('hidden');$('#chart-unavailable').classList.add('hidden');removeMainLayers();if(mode==='radar'){current.map.setView(homeCoords(),current.mapStyle==='sectional'?8:6);current.mapLayer=addRadarLayer(current.map);$('#map-source').href='https://radar.weather.gov/';text('#map-source','NOAA radar ↗')}else if(mode==='route'){current.routeLayer=drawRouteOn(current.map);if(current.routeRadarOn)current.mapLayer=addRadarLayer(current.map);text('#map-caption','Straight-line planning display; not an approved flight route');$('#map-source').href='https://aviationweather.gov/';text('#map-source','Aviation Weather Center ↗');}else{const c=charts[mode];if(!c)return;$('#main-map').classList.add('hidden');$('#map-chart').classList.remove('hidden');const image=$('#map-chart-image');image.style.display='block';image.src=c.image+'?v='+Math.floor(Date.now()/900000);image.alt=c.name;image.onerror=()=>{image.style.display='none';$('#chart-unavailable').classList.remove('hidden')};$('#map-source').href=c.source;text('#map-source','Official source ↗');text('#map-caption',c.name+' · verify analysis/valid time on chart')}if(mode==='radar'||mode==='route')setTimeout(()=>current.map.invalidateSize(),100)}
$$('[data-map]').forEach(btn=>btn.addEventListener('click',()=>mapMode(btn.dataset.map)));
function modalMap(){const node=document.createElement('div');node.className='modal-map';showModal('Regional Radar / Route Map',node,'https://radar.weather.gov/');current.modalMap=makeMap(node,7);if($('.tab.active')?.dataset.map==='route'){drawRouteOn(current.modalMap);if(current.routeRadarOn)addRadarLayer(current.modalMap)}else addRadarLayer(current.modalMap);setTimeout(()=>current.modalMap?.invalidateSize(),150)}
$('#expand-map').onclick=()=>{const active=$('.tab.active')?.dataset.map;if(charts[active])openChart(active);else modalMap()};$('#map-full').onclick=$('#expand-map').onclick;
function pauseRadar(){current.radarPlaying=false;clearInterval(current.radarTimer);text('#play-radar','▶')}
$('#play-radar').onclick=()=>{if(current.radarPlaying){pauseRadar();return}if((current.radar?.radar?.past||[]).length<2)return;current.radarPlaying=true;text('#play-radar','Ⅱ');current.radarTimer=setInterval(()=>{const frames=current.radar.radar.past;current.radarFrame=(current.radarFrame+1)%frames.length;if($('.tab.active')?.dataset.map==='radar'){if(current.mapLayer)current.map.removeLayer(current.mapLayer);current.mapLayer=addRadarLayer(current.map)}},850)};
async function loadRadar(){try{const r=await fetchJSON('/api/radar');current.radar=r;const frames=r?.radar?.past||[];current.radarFrame=frames.length-1;if($('.tab.active')?.dataset.map==='radar'){if(current.mapLayer)current.map.removeLayer(current.mapLayer);current.mapLayer=addRadarLayer(current.map)}drawSmallRouteMap();if(!frames.length)text('#map-caption','No recent radar frames available')}catch(err){text('#map-caption','Radar unavailable · '+err.message);drawSmallRouteMap()}}
function decodeMETAR(m){if(!m)return '<p>Observation unavailable.</p>';const rows=[['Station',m.icaoId],['Wind',m.wdir==null?'Unavailable':`${m.wdir}° at ${m.wspd??'—'} kt${m.wgst?' gust '+m.wgst+' kt':''}`],['Visibility',m.visib==null?'Unavailable':m.visib+' SM'],['Flight category',m.fltCat||'Unavailable'],['Temperature',m.temp==null?'Unavailable':m.temp+'°C'],['Dew point',m.dewp==null?'Unavailable':m.dewp+'°C'],['Altimeter',m.altim==null?'Unavailable':m.altim+' hPa (source field)']];return rows.map(([a,b])=>`<div><strong>${htmlEscape(a)}</strong><br>${htmlEscape(b)}</div>`).join('')}
function aviationTab(tab){setTab('aviation',tab);$('#aviation-raw').classList.toggle('hidden',tab==='decoded');$('#aviation-decoded').classList.toggle('hidden',tab!=='decoded');if(tab==='metar')text('#aviation-raw',current.metar?.rawOb||current.homeId+' METAR unavailable');if(tab==='taf')text('#aviation-raw',current.taf?.rawTAF||current.homeId+' TAF unavailable');if(tab==='decoded')$('#aviation-decoded').innerHTML=decodeMETAR(current.metar)}
$$('[data-aviation]').forEach(b=>b.onclick=()=>aviationTab(b.dataset.aviation));
async function loadAviation(){try{const d=await fetchJSON('/api/airport-route?ids='+encodeURIComponent(current.homeId));const m=d.metars?.find(x=>codeOf(x)===current.homeId)||null;const t=d.tafs?.find(x=>codeOf(x)===current.homeId)||null;current.metar=m;current.taf=t;text('#wind',m?.wspd!=null?m.wspd+' kt':'—');text('#windinfo',m?.wdir!=null?`${m.wdir}°${m.wgst?` · gust ${m.wgst} kt`:''}`:'Wind direction unavailable');text('#flightcat',m?.fltCat||'—');text('#flightdetail',m?.visib!=null?`Visibility ${m.visib} SM`:'Category/visibility unavailable');$('#flightcat').style.color=({VFR:'#57e69e',MVFR:'#7ebdff',IFR:'#ff6873',LIFR:'#e88eff'})[m?.fltCat]||'';text('#aviation-time','Observed '+dateTime(m?.obsTime));aviationTab($('.pill.active')?.dataset.aviation||'metar');if(!m)status(current.homeId+' METAR unavailable; not every airport publishes observations.')}catch(err){status('Aviation observations unavailable: '+err.message)}}
async function loadForecastSummary(){try{const c=homeCoords();const r=await fetchJSON('/api/location-forecast?lat='+c[0]+'&lon='+c[1]);current.forecast=r;const p=r?.periods?.[0];text('#temp',p?.temperature!=null?`${p.temperature}°${p.temperatureUnit||'F'}`:'—');text('#conditions',p?.shortForecast||'NWS forecast unavailable')}catch(err){text('#conditions','NWS forecast unavailable')}}
async function loadAlerts(){try{const c=homeCoords();const d=await fetchJSON('/api/home-alerts?lat='+c[0]+'&lon='+c[1]);const items=d?.features||[];current.alerts=items;text('#alerts-count',items.length);text('#alerts-label',items.length?'NWS alerts near '+current.homeId:'No NWS alerts near '+current.homeId);const host=$('#alerts-list');host.replaceChildren();if(!items.length){host.textContent='No current NWS alerts for '+current.homeId+'.';return}items.slice(0,15).forEach(a=>{const box=document.createElement('div');box.className='alert';const title=document.createElement('strong');title.textContent=a.properties?.event||'Weather alert';const detail=document.createElement('small');detail.textContent=a.properties?.areaDesc||'';box.append(title,detail);host.append(box)})}catch(err){text('#alerts-count','—');text('#alerts-list','NWS alerts unavailable: '+err.message)}}
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
 if(current.routeWeatherMap||!window.L)return;
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
$('#expand-route-map').onclick=expandRouteMap;
$('#route-radar').onchange=e=>{current.routeRadarOn=e.target.checked;drawSmallRouteMap()};

function drawRouteWeather(){const host=$('#route-weather');host.replaceChildren();if(!current.route.length){host.textContent='No route has been entered.';return}for(const p of current.route){const line=document.createElement('div');line.className='airport-row';const btn=document.createElement('button');btn.textContent=p.id;btn.title='Show airport weather';btn.onclick=()=>openAirport(p);const cat=document.createElement('span');cat.textContent=p.metar?.fltCat||'NO METAR';cat.className='category '+(p.metar?.fltCat||'');line.append(btn,cat);host.append(line)}}
async function loadRoute(e){e?.preventDefault();let ids;try{ids=[normalize($('#route-from').value),...$('#route-via').value.split(',').map(x=>x.trim()).filter(Boolean).map(normalize),normalize($('#route-to').value)];if(ids.length>12)throw Error('Use at most 12 airports');}catch(err){text('#route-status',err.message);return}const button=$('#route-form button[type=submit]');button.disabled=true;text('#route-status','Loading airport observations and route positions…');try{current.route=await lookupAirports(ids);drawRouteWeather();drawSmallRouteMap();const can=calculateRoute();const found=current.route.filter(x=>x.metar).length;text('#route-status',`${found}/${ids.length} METARs found · ${can?'Straight-line distance, time and fuel estimates shown.':'Some airport coordinates unavailable; estimate not calculated.'} Not an operational flight plan.`);updateForecastLocations();if($('.tab.active')?.dataset.map==='route')mapMode('route')}catch(err){text('#route-status','Route lookup failed: '+err.message)}finally{button.disabled=false}}
$('#route-form').addEventListener('submit',loadRoute);
function openAirport(p){const block=document.createElement('div');block.innerHTML=`<div class="modal-row"><strong>${htmlEscape(p.id)}</strong> · ${htmlEscape(p.metar?.fltCat||'No reported flight category')} · ${htmlEscape(dateTime(p.metar?.obsTime))}</div><div class="modal-row"><strong>METAR</strong><pre>${htmlEscape(p.metar?.rawOb||'No current observation available.')}</pre></div><div class="modal-row"><strong>TAF</strong><pre>${htmlEscape(p.taf?.rawTAF||'No published TAF for this airport.')}</pre></div>`;const btn=document.createElement('button');btn.className='primary';btn.textContent='Show multi-day forecast for this airport';btn.onclick=()=>{$('#forecast-select').value=p.id;closeModal();scrollToPanel('forecast-section');loadLocationForecast()};if([...$('#forecast-select').options].some(x=>x.value===p.id))block.append(btn);showModal(p.id+' · Airport Weather',block,'https://aviationweather.gov/')}
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

async function refresh(){text('#checked','Refreshing sources…');status('');await Promise.allSettled([loadAviation(),loadForecastSummary(),loadAlerts(),loadRadar(),loadLocationForecast(),loadWinds()]);text('#checked','Updated '+new Date().toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',timeZoneName:'short'}))}
$('#refresh').onclick=refresh;setInterval(()=>{text('#utc',new Date().toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})+' UTC')},30000);text('#utc',new Date().toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})+' UTC');

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
 const label=document.querySelector('.stat:nth-child(2) .stathead span');if(label)label.textContent='WINDS AT '+current.homeId;
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
  await Promise.allSettled([loadAviation(),loadForecastSummary(),loadAlerts(),loadLocationForecast(),loadWinds()]);status('Home airport saved: '+id);
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


// v1.3 dashboard arranger: exact grid placement, width+height editing, accessible move controls.
(function configurePanelLayout(){
 const board=$('#custom-board'),toggle=$('#layout-toggle'),reset=$('#layout-reset');if(!board||!toggle||!reset)return;
 const ids=['airport-section','wind-section','charts-section','route-section','route-weather-panel','forecast-section','model-section','surface-panel','convective-panel','alert-section'];
 const nodes=ids.map(id=>document.getElementById(id)).filter(Boolean);
 const original=new Map(nodes.map(n=>[n.id,{parent:n.parentElement,index:[...n.parentElement.children].indexOf(n)}]));
 const storageKey='wc-layout-v13';const olderKey='weather-command-layout-v12';
 const defaults={'charts-section':7,'airport-section':3,'wind-section':3,'route-section':4,'route-weather-panel':4,'forecast-section':4,'model-section':4,'surface-panel':4,'convective-panel':4,'alert-section':4};
 let enabled=false,editing=false,dragged=null;
 function resizeMaps(){requestAnimationFrame(()=>setTimeout(()=>{for(const m of mapsRegistry){try{m.invalidateSize()}catch{}}},100))}
 const getPanels=()=>[...board.children].filter(n=>nodes.includes(n));
 function save(){if(!enabled)return;try{localStorage.setItem(storageKey,JSON.stringify({order:getPanels().map(x=>x.id),widths:Object.fromEntries(nodes.map(n=>[n.id,Number(n.dataset.span)||4])),heights:Object.fromEntries(nodes.map(n=>[n.id,Number(n.dataset.panelHeight)||0]))}))}catch{}}
 function moveTo(n,index){const others=getPanels().filter(x=>x!==n);const point=others[Math.max(0,Math.min(index,others.length))];if(point)board.insertBefore(n,point);else board.append(n);save();resizeMaps();refreshControls()}
 function refreshControls(){getPanels().forEach((n,index)=>{const sel=n.querySelector('.layout-position');if(sel){sel.replaceChildren();getPanels().forEach((x,i)=>{const opt=document.createElement('option');opt.value=String(i);opt.textContent=(i+1)+'. '+(x.querySelector('h2')?.textContent||x.id);sel.append(opt)});sel.value=String(index)}const h=n.querySelector('.layout-height-output');if(h)h.textContent=(n.dataset.panelHeight||'Auto')+(n.dataset.panelHeight?'px':'')})}
 function setupControls(n){let el=n.querySelector(':scope > .layout-controls');if(el)return el;
  el=document.createElement('div');el.className='layout-controls';el.hidden=true;
  const grip=document.createElement('span');grip.className='drag-handle';grip.textContent='⠿ Drag';grip.draggable=true;grip.title='Drag this handle to another panel';
  grip.addEventListener('dragstart',e=>{if(!editing){e.preventDefault();return}dragged=n;n.classList.add('dragging');e.dataTransfer.setData('text/plain',n.id);e.dataTransfer.effectAllowed='move'});
  grip.addEventListener('dragend',()=>{dragged=null;n.classList.remove('dragging');nodes.forEach(x=>x.classList.remove('drop-target'))});
  const tools=document.createElement('div');tools.className='layout-tools';
  function control(label,element){const wrap=document.createElement('label');wrap.className='layout-tool';wrap.append(document.createTextNode(label),element);tools.append(wrap)}
  const pos=document.createElement('select');pos.className='layout-position';pos.setAttribute('aria-label','Move '+n.id+' to panel position');pos.onchange=()=>moveTo(n,Number(pos.value));control('Position',pos);
  const width=document.createElement('input');width.type='range';width.min='2';width.max='12';width.step='1';width.value=n.dataset.span||defaults[n.id]||4;width.title='Panel width: '+width.value+' of 12 columns';
  const widthInfo=document.createElement('output');widthInfo.textContent=width.value+'/12';width.oninput=()=>{n.dataset.span=width.value;widthInfo.textContent=width.value+'/12';width.title='Panel width '+width.value+' columns';resizeMaps();save()};
  const widthWrap=document.createElement('span');widthWrap.className='layout-slider';widthWrap.append(width,widthInfo);control('Width',widthWrap);
  const height=document.createElement('input');height.type='range';height.min='160';height.max='850';height.step='10';height.value=n.dataset.panelHeight||'320';height.title='Panel height';
  const heightInfo=document.createElement('output');heightInfo.className='layout-height-output';heightInfo.textContent=n.dataset.panelHeight?n.dataset.panelHeight+'px':'Auto';
  height.oninput=()=>{n.dataset.panelHeight=height.value;n.style.minHeight=height.value+'px';n.style.setProperty('--user-panel-height',height.value+'px');heightInfo.textContent=height.value+'px';save();resizeMaps()};
  const heightWrap=document.createElement('span');heightWrap.className='layout-slider';heightWrap.append(height,heightInfo);control('Height',heightWrap);
  const auto=document.createElement('button');auto.type='button';auto.textContent='Auto height';auto.onclick=()=>{delete n.dataset.panelHeight;n.style.minHeight='';n.style.removeProperty('--user-panel-height');heightInfo.textContent='Auto';save();resizeMaps()};tools.append(auto);
  const back=document.createElement('button');back.type='button';back.textContent='←';back.title='Move earlier';back.onclick=()=>moveTo(n,Math.max(0,getPanels().indexOf(n)-1));
  const next=document.createElement('button');next.type='button';next.textContent='→';next.title='Move later';next.onclick=()=>moveTo(n,Math.min(getPanels().length-1,getPanels().indexOf(n)+1));
  tools.append(back,next);el.append(grip,tools);n.prepend(el);
  n.addEventListener('dragover',e=>{if(!editing||!dragged||dragged===n)return;e.preventDefault();n.classList.add('drop-target')});
  n.addEventListener('dragleave',()=>n.classList.remove('drop-target'));
  n.addEventListener('drop',e=>{if(!editing||!dragged||dragged===n)return;e.preventDefault();n.classList.remove('drop-target');const rect=n.getBoundingClientRect();const after=e.clientY>rect.top+rect.height/2;board.insertBefore(dragged,after?n.nextSibling:n);save();resizeMaps();refreshControls()});
  return el;
 }
 function custom(data){enabled=true;board.classList.remove('hidden');const arranged=[...new Set([...(data?.order||[]),...ids])].map(id=>document.getElementById(id)).filter(n=>nodes.includes(n));
  arranged.forEach(n=>{n.dataset.span=String(Math.min(12,Math.max(2,Number(data?.widths?.[n.id]??data?.sizes?.[n.id]??defaults[n.id])||4)));const ht=Number(data?.heights?.[n.id]||0);if(ht>=160&&ht<=850){n.dataset.panelHeight=String(ht);n.style.minHeight=ht+'px';n.style.setProperty('--user-panel-height',ht+'px')}board.append(n)});refreshControls();resizeMaps();text('#layout-state','Saved on this device')}
 function setEditing(value){editing=value;document.body.classList.toggle('layout-editing',value);toggle.textContent=value?'Done Arranging':'Arrange Panels';toggle.setAttribute('aria-pressed',String(value));nodes.forEach(n=>setupControls(n).hidden=!value);text('#layout-state',value?'Drag, resize or choose panel position':'Layout saved on this device');refreshControls();resizeMaps()}
 toggle.onclick=()=>{if(!enabled)custom(null);setEditing(!editing);save()};
 reset.onclick=()=>{if(!confirm('Restore default layout on this device?'))return;setEditing(false);nodes.forEach(n=>{n.querySelector(':scope > .layout-controls')?.remove();delete n.dataset.span;delete n.dataset.panelHeight;n.style.minHeight='';n.style.removeProperty('--user-panel-height')});const parents=[...new Set(nodes.map(n=>original.get(n.id).parent))];parents.forEach(parent=>nodes.filter(n=>original.get(n.id).parent===parent).sort((a,b)=>original.get(a.id).index-original.get(b.id).index).forEach(n=>parent.append(n)));board.classList.add('hidden');enabled=false;try{localStorage.removeItem(storageKey);localStorage.removeItem(olderKey)}catch{}text('#layout-state','Default layout');resizeMaps()};
 try{const data=JSON.parse(localStorage.getItem(storageKey)||localStorage.getItem(olderKey)||'null');if(data&&Array.isArray(data.order)){custom(data);setEditing(false)}}catch{}
})();
