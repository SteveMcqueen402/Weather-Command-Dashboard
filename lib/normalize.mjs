// ESPN-facing data normalization. Missing or changed upstream fields remain unavailable;
// never manufacture scores, statistics, injuries, or probabilities.
export const BILLS_ID='2';
export const DIVISION=['BUF','NE','NYJ','MIA'];
export const list=value=>Array.isArray(value)?value:[];
export const num=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
export const val=(...values)=>values.find(v=>v!==undefined&&v!==null&&v!=='')??null;
export const dateMillis=x=>{const ms=Date.parse(x||'');return Number.isFinite(ms)?ms:0};
export const nameTeam=t=>t?.displayName||t?.name||t?.abbreviation||'Unknown team';
const safeImage=x=>typeof x==='string'&&/^https:\/\//.test(x)?x:null;
export function normalizeTeam(input){
 const t=input?.team||input||{};const rs=list(t.record?.items||input?.record?.items);const r=rs.find(x=>x.type==='total')||rs[0]||{};
 const summary=val(r.summary,t.record?.summary,t.record?.displayValue);
 const recordStats=list(r.stats);
 const rsValue=(...keys)=>{let z=recordStats.find(s=>keys.includes(s.name)||keys.includes(s.abbreviation));return num(val(z?.value,z?.displayValue))};
 const match=String(summary||'').match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
 const wins=val(rsValue('wins','W'),match?Number(match[1]):null),losses=val(rsValue('losses','L'),match?Number(match[2]):null),ties=val(rsValue('ties','T'),match?Number(match[3]||0):null);
 return {id:String(val(t.id,input?.id,BILLS_ID)),name:nameTeam(t),abbreviation:t.abbreviation||'BUF',logo:safeImage(val(t.logos?.[0]?.href,t.logo,'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png')),record:summary||([wins,losses].every(v=>v!=null)?`${wins}-${losses}${ties?'-'+ties:''}`:null),wins,losses,ties,standingNote:r.description||null,rank:val(t.rank,t.standingSummary),color:t.color||'00338D'};
}
export function normalizeGame(event){
 const c=list(event?.competitions)[0]||{};
 const comp=list(c.competitors);
 const isBills=x=>String(x?.team?.id)==='2'||String(x?.team?.abbreviation).toUpperCase()==='BUF';
 const home=comp.find(x=>x.homeAway==='home')||comp[0]||{};
 const away=comp.find(x=>x.homeAway==='away')||comp[1]||{};
 const bill=comp.find(isBills)||{};const opp=comp.find(x=>!isBills(x))||{};
 const st=c.status||event.status||{};const t=st.type||{};
 const state=val(t.state,t.name?.startsWith('STATUS_FINAL')?'post':null,'pre');
 const score=x=>num(val(x?.score?.value,x?.score?.displayValue,x?.score));
 const short=t.shortDetail||t.detail||st.displayClock||null;
 const rawDate=event.date||c.date||null;
 return {id:String(event.id||''),date:rawDate,status:state,statusLabel:String(short||({'post':'FINAL','in':'LIVE','pre':'SCHEDULED'}[state]||'SCHEDULED')),period:num(st.period),clock:st.displayClock||null,week:val(event.week?.number,event.week?.week, null),seasonType:val(event.season?.type,event.season?.type?.id),name:event.name||null,
  home:{id:home.team?.id,name:nameTeam(home.team),abbr:home.team?.abbreviation||'',logo:safeImage(val(home.team?.logo,home.team?.logos?.[0]?.href)),score:score(home)},
  away:{id:away.team?.id,name:nameTeam(away.team),abbr:away.team?.abbreviation||'',logo:safeImage(val(away.team?.logo,away.team?.logos?.[0]?.href)),score:score(away)},
  billsScore:score(bill),opponentScore:score(opp),opponent:nameTeam(opp.team),opponentAbbr:opp.team?.abbreviation||null,opponentLogo:safeImage(val(opp.team?.logo,opp.team?.logos?.[0]?.href)),isHome:bill.homeAway==='home',venue:c.venue?.fullName||null,network:list(c.broadcasts).flatMap(x=>list(x.names)).join(', ')||null,
  play:val(c.situation?.lastPlay?.text,c.situation?.lastPlay?.shortText),downDistance:c.situation?.downDistanceText||null, possession:c.situation?.possession||null,sourceUrl:event.links?.[0]?.href||null};
}
export function normalizeGames(schedule,scoreboard){
 const events=new Map();for(const ev of list(schedule?.events)){if(ev?.id)events.set(String(ev.id),ev)}
 for(const ev of list(scoreboard?.events)){if(ev?.id)events.set(String(ev.id),ev)}
 return [...events.values()].filter(e=>list(e.competitions).some(c=>list(c.competitors).some(p=>String(p.team?.id)==='2'||p.team?.abbreviation==='BUF'))).map(normalizeGame).sort((a,b)=>dateMillis(a.date)-dateMillis(b.date));
}
export function normalizeAllNFL(scoreboard){return list(scoreboard?.events).map(normalizeGame).sort((a,b)=>dateMillis(a.date)-dateMillis(b.date))}
export function normalizeRoster(input){
 let items=[];const a=list(input?.athletes);
 for(const g of a){if(g?.items)items.push(...list(g.items));else if(g?.athletes)items.push(...list(g.athletes));else if(g?.id||g?.displayName)items.push(g)}
 if(!items.length)items=list(input?.roster);
 const unique=new Map();for(const p of items){const x=p?.athlete||p;const id=String(x?.id||x?.uid||'');if(!id)continue;
 const position=val(x.position?.abbreviation,x.position?.displayName,x.position?.name,typeof x.position==='string'?x.position:null,'—');
 unique.set(id,{id,name:val(x.displayName,x.fullName,x.name,'Unknown player'),number:val(x.jersey,'—'),position,headshot:safeImage(val(x.headshot?.href,x.headshot,x.photo)),age:num(x.age),height:x.displayHeight||null,weight:x.displayWeight||null,experience:val(x.experience?.years,x.experience?.displayValue),status:val(x.status?.name,x.status?.type,x.status),links:list(x.links).map(l=>l.href).filter(Boolean)});
 }
 return [...unique.values()].sort((a,b)=>String(a.position).localeCompare(String(b.position))||a.name.localeCompare(b.name));
}
function unfoldInjuries(input){
 let out=[];const visit=(x,depth=0,team='')=>{
  if(depth>5||!x)return;
  if(Array.isArray(x)){for(const y of x)visit(y,depth+1,team);return}
  if(typeof x!=='object')return;
  let t=team;
  if(x.team?.id||x.team?.abbreviation)t=String(x.team?.abbreviation||x.team?.id);
  if(x.athlete&&(x.status||x.details||x.type||x.injuries?.length||x.date))out.push({...x,_team:t});
  for(const k of ['injuries','items','entries','teams','athletes'])if(Array.isArray(x[k]))visit(x[k],depth+1,t);
 };
 visit(input);return out;
}
export function normalizeInjuries(input){
 const rows=unfoldInjuries(input);const out=new Map();
 for(const r of rows){if(r._team&&!['2','BUF','Buffalo Bills'].includes(r._team))continue;
 const a=r.athlete||{};const id=String(a.id||a.uid||a.displayName||'');if(!id)continue;
 const detail=r.details||{};
 const s=val(r.status?.displayName,r.status?.name,r.status,detail.status, r.type?.description,r.type?.name,typeof r.type==='string'?r.type:null);
 const injury=val(detail.type,detail.detail,detail.injury,r.injury?.name,r.injury?.type,r.type?.description,'Not specified');
 out.set(id,{id,name:val(a.displayName,a.fullName,a.name,'Unknown'),position:val(a.position?.abbreviation,r.position?.abbreviation,'—'),status:typeof s==='string'?s:'Unspecified',injury:typeof injury==='string'?injury:'Not specified',returnDate:val(detail.returnDate,r.returnDate),date:val(r.date,r.updated),source:val(r.source?.name),headshot:safeImage(a.headshot?.href)});
 }
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export function normalizeLeaders(input){
 let groups=list(input?.leaders||input?.categories);let out=[];
 for(const g of groups){const title=val(g.displayName,g.name,g.abbreviation,'Leader');const entries=list(g.leaders||g.athletes||g.stats);
 for(const e of entries.slice(0,2)){const a=e.athlete||e.player||{};if(!a.displayName&&!a.fullName)continue;
 out.push({category:title,name:a.displayName||a.fullName,value:val(e.displayValue,e.value,e.stat?.displayValue,e.stat?.value),headshot:safeImage(a.headshot?.href),position:a.position?.abbreviation||null,id:a.id||null});}
 }
 return out.slice(0,16);
}
export function normalizeStats(input){
 const categories=list(input?.splits?.categories||input?.statistics?.splits?.categories||input?.categories||input?.results);
 const stats=[];for(const cat of categories){for(const s of list(cat.stats||cat.statistics)){if(!s.name&&!s.displayName)continue;stats.push({key:s.name||s.abbreviation,label:s.displayName||s.name,value:val(s.displayValue,s.value),numeric:num(s.value),category:cat.displayName||cat.name||null,rank:val(s.rank?.displayValue,s.rank)})}}
 if(!stats.length&&input?.team?.record?.items){for(const s of list(input.team.record.items[0]?.stats))stats.push({key:s.name,label:s.displayName||s.name,value:val(s.displayValue,s.value),numeric:num(s.value),category:'Record'});}
 return stats;
}
export function normalizeStandings(input){
 let all=[];
 const walk=(obj,depth=0)=>{if(!obj||depth>7)return;if(Array.isArray(obj)){obj.forEach(x=>walk(x,depth+1));return}if(typeof obj!=='object')return;
 if(obj.team&&(Array.isArray(obj.stats)||obj.records||obj.record))all.push(obj);
 for(const key of ['children','groups','standings','entries','items'])walk(obj[key],depth+1);
 };walk(input);
 const found=new Map();for(const row of all){const t=row.team||{};const abbr=String(t.abbreviation||'').toUpperCase();if(!DIVISION.includes(abbr))continue;const ss=list(row.stats);const lookup=(...keys)=>{const p=ss.find(z=>keys.includes(z.name)||keys.includes(z.abbreviation));return val(p?.value,p?.displayValue)};
 const ws=num(lookup('wins','W')),ls=num(lookup('losses','L')),ts=num(lookup('ties','T'));const pct=num(lookup('winPercent','PCT','winPct'));const overall=val(lookup('overall','record'),row.record?.summary,(ws!=null&&ls!=null?`${ws}-${ls}${ts?'-'+ts:''}`:null));
 found.set(abbr,{abbr,id:String(t.id||''),name:nameTeam(t),logo:safeImage(val(t.logo,t.logos?.[0]?.href)),wins:ws,losses:ls,ties:ts,pct,record:overall,pointDiff:num(lookup('pointDifferential','DIFF')),streak:lookup('streak','STRK')});
 }
 return [...found.values()].sort((a,b)=>(b.pct??(b.wins??0)/Math.max(1,(b.wins??0)+(b.losses??0)))-(a.pct??(a.wins??0)/Math.max(1,(a.wins??0)+(a.losses??0))));
}
export function normalizeNews(input){return list(input?.articles||input?.news||input?.items).slice(0,12).map(a=>({id:String(a.id||a.headline||''),title:a.headline||a.title||'',description:a.story||a.description||'',date:a.published||a.date||null,url:val(a.links?.web?.href,a.links?.api?.href,a.link),image:safeImage(a.images?.[0]?.url)})).filter(a=>a.title)}
export function calculateMarketProbability(raw){
 const games=Array.isArray(raw)?raw:[];let prices=[];let newest=null;
 for(const game of games){for(const book of list(game.bookmakers)){
  let m=list(book.markets).find(m=>m.key==='outrights');if(!m)continue;
  const outcome=list(m.outcomes).find(o=>/buffalo bills/i.test(o.name||''));if(!outcome)continue;
  const american=num(outcome.price);if(american==null||american===0)continue;
  const imp=x=>x>0?100/(x+100):(-x)/((-x)+100);
  const total=list(m.outcomes).reduce((sum,o)=>{const v=num(o.price);return sum+(v===null||v===0?0:imp(v))},0);
  // Calculate vig-adjusted (normalization across ALL teams), not a raw book percentage.
  if(total<=0)continue;
  prices.push({book:book.title||book.key||'Sportsbook',prob:100*imp(american)/total,american,lastUpdate:m.last_update||book.last_update||null});
  const d=Date.parse(m.last_update||book.last_update||'');if(Number.isFinite(d)&&(!newest||d>newest))newest=d;
 }}
 if(!prices.length)return null;
 return {percent:Math.round(10*prices.reduce((a,b)=>a+b.prob,0)/prices.length)/10,books:prices.length,prices,asOf:newest?new Date(newest).toISOString():null,method:'Sportsbook futures, normalized to remove bookmaker overround',live:true};
}
export function selectFeatured(games,now=Date.now()){
 const live=games.find(g=>g.status==='in');if(live)return live;
 const future=games.find(g=>g.status==='pre'&&dateMillis(g.date)>=now-6*3600000);if(future)return future;
 return [...games].reverse().find(g=>g.status==='post')||games[0]||null;
}
