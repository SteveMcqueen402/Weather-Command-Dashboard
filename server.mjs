import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeTeam,normalizeGames,normalizeAllNFL,normalizeRoster,normalizeInjuries,normalizeLeaders,normalizeStats,normalizeStandings,normalizeNews,calculateMarketProbability,selectFeatured} from './lib/normalize.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
try{if(typeof process.loadEnvFile==='function')process.loadEnvFile(path.join(root,'.env'))}catch{}
const PORT=Number(process.env.PORT||3000);
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CORE='https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const serviceStart=new Date().toISOString();
const cache=new Map();
const nowISO=()=>new Date().toISOString();
const seasonNow=()=>{const d=new Date();return d.getUTCMonth()<=3?d.getUTCFullYear()-1:d.getUTCFullYear()};
const daysId=()=>{const d=new Date();const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(p=>[p.type,p.value]));return `${parts.year}${parts.month}${parts.day}`};
const allowedHosts=new Set(['site.api.espn.com','sports.core.api.espn.com','api.the-odds-api.com']);
const errors={};
async function fetchJSON(url,ttl){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!allowedHosts.has(parsed.hostname))throw Error('Upstream URL not allowed');
 const cached=cache.get(url),now=Date.now();
 if(cached&&now-cached.fetched<ttl)return {...cached,fromCache:true,stale:false};
 try{
  const resp=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'BillsCommandDashboard/1.0 (personal NFL dashboard)'},signal:AbortSignal.timeout(12000)});
  if(!resp.ok)throw Error(`Provider returned HTTP ${resp.status}`);
  const size=Number(resp.headers.get('content-length')||'0');if(size>12000000)throw Error('Provider response too large');
  const body=await resp.text();if(body.length>12000000)throw Error('Provider response too large');
  const data=JSON.parse(body);
  const fresh={data,fetched:now,updatedAt:nowISO(),stale:false,fromCache:false};cache.set(url,fresh);return fresh;
 }catch(err){if(cached&&now-cached.fetched<86400000)return {...cached,stale:true,error:err.message};throw err}
}
async function getFeed(name,url,ttl){try{const r=await fetchJSON(url,ttl);return {name,ok:true,data:r.data,updatedAt:r.updatedAt,stale:r.stale,error:r.error||null}}catch(err){errors[name]=err.message;return {name,ok:false,data:null,updatedAt:null,stale:false,error:err.message}}}
async function getOdds(){
 const key=process.env.ODDS_API_KEY;
 if(!key)return {ok:false,enabled:false,error:'Set ODDS_API_KEY to receive live futures-market probabilities.',data:null};
 const url=`https://api.the-odds-api.com/v4/sports/americanfootball_nfl_super_bowl_winner/odds?apiKey=${encodeURIComponent(key)}&regions=us&markets=outrights&oddsFormat=american`;
 // Preserve credits: at most one attempt per 2 hours, including failures, per server instance.
 const prior=cache.get('odds');if(prior&&Date.now()-prior.fetched<7200000)return prior.payload;
 try{const resp=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(13000)});
  if(!resp.ok)throw Error(`Odds provider HTTP ${resp.status}; check your account or rate limit`);
  const body=await resp.json();const p=calculateMarketProbability(body);
  const payload={ok:!!p,enabled:true,data:p,error:p?null:'No Buffalo Bills Super Bowl futures available in provider response.'};
  cache.set('odds',{fetched:Date.now(),payload});return payload;
 }catch(err){const payload={ok:false,enabled:true,error:err.message,data:null};cache.set('odds',{fetched:Date.now(),payload});return payload}
}
function staticFpiSnapshot(){
 // Only valid for a narrowly dated view; always labelled, never described as live.
 const asOf='2026-11-20';const days=(Date.now()-Date.parse(asOf+'T00:00:00Z'))/86400000;
 if(days<0||days>8)return null;
 return {percent:15.4,asOf,source:'ESPN FPI, as reported Nov 20, 2026',url:'https://www.sportsgrid.com/nfl/article/espn-ranks-all-32-nfl-teams-by-their-chances-of-making-the-2026-playoffs',method:'Published FPI snapshot; NOT live',live:false};
}
const baseFeeds=season=>({
 team:[`${ESPN}/teams/2`,90000],
 schedule:[`${ESPN}/teams/2/schedule?season=${season}`,180000],
 roster:[`${ESPN}/teams/2/roster`,900000],
 injuries:[`${ESPN}/teams/2/injuries`,180000],
 leaders:[`${ESPN}/teams/2/leaders?season=${season}`,300000],
 stats:[`${CORE}/seasons/${season}/types/2/teams/2/statistics`,300000],
 standings:[`https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=${season}&type=2`,180000],
 news:[`${ESPN}/news?team=2&limit=12`,300000]
});
function officialGameDayInactives(){
 if(daysId()!=='20261122')return null;
 return {date:'2026-11-22',published:'2026-11-22T11:32:00-05:00',source:'Buffalo Bills official game-day inactive report',url:'https://www.buffalobills.com/news/buffalo-bills-inactives-vs-dolphins-week-11',players:[['Skyler Bell','WR'],['Dorian Williams','ILB'],['Christian Benford','CB'],['Mike Danna','OLB'],['Jude Bowry','T/G'],['Dalton Kincaid','TE'],['T.J. Sanders','DL']].map(([name,position])=>({name,position}))};
}
function resultPayload(feeds,odds,live){
 const data={};const sources={};for(const [k,v] of Object.entries(feeds)){data[k]=v?.data||null;sources[k]={ok:!!v?.ok,updatedAt:v?.updatedAt||null,stale:!!v?.stale,error:v?.error||null,url:k==='stats'?'https://www.espn.com/nfl/team/stats/_/name/buf':`https://www.espn.com/nfl/team/_/name/buf`}}
 let injured=normalizeInjuries(data.injuries);
 const roster=normalizeRoster(data.roster);
 // ESPN roster status is not a game injury designation, never infer one from 'active'.
 const games=normalizeGames(data.schedule,live.data);
 const team=normalizeTeam(data.team);
 const standings=normalizeStandings(data.standings);
 const divisionRank=standings.findIndex(x=>x.abbr==='BUF');
 if(!team.record&&divisionRank>=0)team.record=standings[divisionRank].record;
 if(team.wins==null&&divisionRank>=0){team.wins=standings[divisionRank].wins;team.losses=standings[divisionRank].losses;}
 const timeline=games.filter(x=>x.status==='post').sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const next=games.filter(x=>x.status==='pre').slice(0,8);
 const oddsValue=odds.data||staticFpiSnapshot();
 return {generatedAt:nowISO(),season:seasonNow(),team,divisionRank:divisionRank<0?null:divisionRank+1,standings,roster,injuries:injured,gamedayInactives:officialGameDayInactives(),leaders:normalizeLeaders(data.leaders),stats:normalizeStats(data.stats),news:normalizeNews(data.news),games,featured:selectFeatured(games),upcoming:next,history:timeline,scoreboard:normalizeAllNFL(live.data),odds:{...odds,value:oddsValue},sources:{...sources,live:{ok:live.ok,updatedAt:live.updatedAt,stale:live.stale,error:live.error}},links:{bills:'https://www.buffalobills.com/',injuries:'https://www.buffalobills.com/team/injury-report/',nfl:'https://www.nfl.com/teams/buffalo-bills/',espn:'https://www.espn.com/nfl/team/_/name/buf',odds:'https://the-odds-api.com/sports/super-bowl-winner-odds.html'}};
}
async function bootstrap(){
 const season=seasonNow();const feeds=baseFeeds(season);
 const all=await Promise.all([...Object.entries(feeds).map(async ([k,[u,ttl]])=>[k,await getFeed(k,u,ttl)]),getFeed('live',`${ESPN}/scoreboard?dates=${daysId()}`,25000).then(x=>['live',x]),getOdds().then(x=>['odds',x])]);
 const map=Object.fromEntries(all);return resultPayload(Object.fromEntries(Object.entries(feeds).map(([k])=>[k,map[k]])),map.odds,map.live);
}
async function live(){const r=await getFeed('live',`${ESPN}/scoreboard?dates=${daysId()}`,25000);return {generatedAt:nowISO(),ok:r.ok,updatedAt:r.updatedAt,stale:r.stale,error:r.error,scoreboard:normalizeAllNFL(r.data),events:r.data?.events||[]};}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
function send(res,status,body,contentType='application/json; charset=utf-8'){
 res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' https://a.espncdn.com https://cdn.espn.com https://a1.espncdn.com data:; connect-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; base-uri 'self'; frame-ancestors 'none'"});res.end(body)
}
const server=http.createServer(async(req,res)=>{
 if(req.method!=='GET'){send(res,405,JSON.stringify({error:'Method not allowed'}));return}
 try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/health'){send(res,200,JSON.stringify({ok:true,project:'Bills Command Dashboard',uptimeSeconds:Math.floor(process.uptime()),startedAt:serviceStart,oddsConfigured:!!process.env.ODDS_API_KEY}));return}
  if(u.pathname==='/api/dashboard'){send(res,200,JSON.stringify(await bootstrap()));return}
  if(u.pathname==='/api/live'){send(res,200,JSON.stringify(await live()));return}
  const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
  const file=files[u.pathname];if(!file){send(res,404,JSON.stringify({error:'Not found'}));return}
  const bytes=await fs.readFile(path.join(root,file));send(res,200,bytes,types[path.extname(file)]||'application/octet-stream');
 }catch(err){console.error('Dashboard request error',err);send(res,502,JSON.stringify({error:'Dashboard data temporarily unavailable',detail:err.message}));}
});
if(process.env.NODE_ENV!=='test')server.listen(PORT,'0.0.0.0',()=>console.log(`Buffalo Bills Command Dashboard at http://localhost:${PORT}`));
export {server,bootstrap,live,staticFpiSnapshot};
