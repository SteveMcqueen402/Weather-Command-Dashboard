(()=>{'use strict';
const $=id=>document.getElementById(id);
const presets={
 general:{headline:'The weather picture.\nAll in view.',description:'A connected aviation weather workspace built for pilots, flight schools, and the displays that keep your operation moving.',button:'Explore the live dashboard'},
 pilots:{headline:'Your weather.\nOne command center.',description:'Move between airport conditions, flight advisories, route information and radar without losing your place.',button:'Explore pilot features'},
 schools:{headline:'Give every pilot\nthe bigger picture.',description:'Put a clear, shared aviation weather workspace in your flight school briefing area and on instructors’ screens.',button:'See the school dashboard'},
 fbo:{headline:'A better briefing\nstarts on screen.',description:'Bring a modern weather command center to your FBO or airport lounge, with information made for shared displays.',button:'See the display experience'},
 hangars:{headline:'Your hangar wall.\nYour weather picture.',description:'Turn your existing TV or monitor into an always-visible, aviation-focused weather information display.',button:'Explore wall displays'}
};
const title=$('campaign-title'),description=$('campaign-description'),button=$('campaign-button'),audience=$('campaign-audience'),tag=$('campaign-tag'),status=$('campaign-status');
function safe(v,max){return String(v||'').replace(/[<>]/g,'').trim().slice(0,max)}
function params(){const p=new URLSearchParams(location.search);return p}
function apply(){
 const headline=safe(title.value,110)||presets[audience.value].headline;
 const supporting=safe(description.value,260)||presets[audience.value].description;
 const action=safe(button.value,50)||presets[audience.value].button;
 const head=$('campaign-headline');head.replaceChildren();
 const lines=headline.split(/\n/);lines.forEach((line,i)=>{if(i)head.append(document.createElement('br'));if(i===lines.length-1){const em=document.createElement('em');em.textContent=line;head.append(em)}else head.append(document.createTextNode(line))});
 $('campaign-subheadline').textContent=supporting;
 $('hero-cta').firstChild.textContent=action+' ';
 document.title='Weather Command | Quadrant Display Systems';
}
function setPreset(v){const p=presets[v]||presets.general;title.value=p.headline;description.value=p.description;button.value=p.button;apply()}
audience.addEventListener('change',()=>{setPreset(audience.value);status.textContent='Audience changed. Copy a new link to share this variation.'});
for(const el of [title,description,button,tag])el.addEventListener('input',apply);
function urlForCampaign(){const p=new URLSearchParams();if(audience.value!=='general')p.set('audience',audience.value);const preset=presets[audience.value];if(title.value.trim()!==preset.headline)p.set('headline',safe(title.value,110));if(description.value.trim()!==preset.description)p.set('description',safe(description.value,260));if(button.value.trim()!==preset.button)p.set('button',safe(button.value,50));if(tag.value.trim())p.set('campaign',safe(tag.value,50));return location.origin+'/qds'+(p.size?'?'+p.toString():'')+'#hero'}
$('campaign-copy').addEventListener('click',async()=>{const url=urlForCampaign();try{await navigator.clipboard.writeText(url);status.textContent='Campaign link copied. Open it on any device to see this version.'}catch{status.textContent='Your link: '+url}});
$('campaign-reset').addEventListener('click',()=>{audience.value='general';tag.value='';setPreset('general');history.replaceState(null,'','/qds#campaign');status.textContent='Restored the QDS default campaign.'});
const query=params();const v=query.get('audience');audience.value=presets[v]?v:'general';setPreset(audience.value);
if(query.has('headline'))title.value=safe(query.get('headline'),110);if(query.has('description'))description.value=safe(query.get('description'),260);if(query.has('button'))button.value=safe(query.get('button'),50);if(query.has('campaign'))tag.value=safe(query.get('campaign'),50);apply();
const stage=$('gallery-stage');const captions={desktop:'Dashboard interface displayed in a desktop-style frame.',wall:'Actual Weather Command interface framed as a dedicated wall display.',mobile:'The same live product window framed for a mobile screen; mobile layouts vary by device.'};
for(const tab of document.querySelectorAll('.gallery-tabs .tab'))tab.addEventListener('click',()=>{const v=tab.dataset.view;stage.dataset.view=v;$('gallery-caption').textContent=captions[v];for(const other of document.querySelectorAll('.gallery-tabs .tab')){const selected=other===tab;other.classList.toggle('active',selected);other.setAttribute('aria-selected',selected?'true':'false')}});
$('year').textContent=new Date().getFullYear();
})();