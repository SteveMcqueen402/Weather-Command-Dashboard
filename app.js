const $=id=>document.getElementById(id);
const safeText=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=(s,fallback='#')=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:fallback}catch{return fallback}};
const safeLogo=(s,abbr='nfl')=>{try{const u=new URL(s);if(u.protocol==='https:'&&['a.espncdn.com','a1.espncdn.com','cdn.espn.com'].includes(u.host))return u.href}catch{}return `https://a.espncdn.com/i/teamlogos/nfl/500/${encodeURIComponent(String(abbr||'nfl').toLowerCase())}.png`};
const set=(id,x)=>{const el=$(id);if(el)el.textContent=x==null?'—':x};
const html=(id,s)=>{const el=$(id);if(el)el.innerHTML=s};
const count=x=>Number.isFinite(Number(x))?Number(x):null;
const dateTime=(s,opts={})=>{if(!s)return 'TBD';const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,opts):'TBD'};
const when=(s)=>dateTime(s,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const shortDate=(s)=>dateTime(s,{month:'short',day:'numeric'});
const fmt=x=>x==null?'—':Number(x).toLocaleString();
const statUnavailable='<div class="empty-message">This source is temporarily unavailable. No values have been estimated.</div>';
let state={data:null,loading:false,auto:true,compact:false,arrange:false,rosterFilter:'ALL',rosterSearch:'',lastSuccess:null,lastLive:null};
let liveTimer=null,fullTimer=null;
const billsLogo='https://a.espncdn.com/i/teamlogos/nfl/500/buf.png';
function statusBar(working,details){
 const el=$('sync-dot');el.className='sync-dot '+(working?'active':state.lastSuccess?'stale':'pending');
 set('sync-status',working?'DATA CONNECTED':state.lastSuccess?'PARTIAL / STALE':'FEEDS UNAVAILABLE');
 set('last-sync',state.lastSuccess?`Checked ${dateTime(state.lastSuccess,{hour:'numeric',minute:'2-digit'})}`:details||'Connection pending');
 set('refresh-message',details|| (working?'SOURCES CONNECTED':'CHECK DATA CONNECTIONS'));
}
async function getJSON(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error(`Dashboard server responded ${r.status}`);return r.json()}
function sourceState(key){return state.data?.sources?.[key]||{ok:false,stale:false,error:'Not checked'}}
function sourceMessage(key,message){const status=sourceState(key);return `<div class="${status.error?'feed-error':'empty-message'}">${safeText(message||status.error||'No data returned by this provider.')}<div><a target="_blank" rel="noopener" href="https://www.espn.com/nfl/team/_/name/buf">Check ESPN ↗</a></div></div>`}
function mergeLive(payload){
 if(!state.data||!payload?.scoreboard)return;
 state.data.scoreboard=payload.scoreboard;
 state.data.sources.live={ok:!!payload.ok,stale:!!payload.stale,updatedAt:payload.updatedAt,error:payload.error};
 const todayBills=payload.scoreboard.filter(g=>[g.home?.abbr,g.away?.abbr].includes('BUF'));
 for(const g of todayBills){const idx=state.data.games.findIndex(x=>x.id===g.id);if(idx!==-1)state.data.games[idx]=g;else state.data.games.push(g)}
 state.data.games.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 state.lastLive=payload.updatedAt;
}
async function refreshFull(manual=false){
 if(state.loading)return;state.loading=true;
 const btn=$('btn-refresh');btn.disabled=true;set('refresh-message','REFRESHING SOURCES…');
 try{const data=await getJSON('/api/dashboard');state.data=data;state.lastSuccess=data.generatedAt;
  renderAll();const ok=Object.values(data.sources).filter(s=>s.ok).length;
  statusBar(ok>0,`${ok} OF ${Object.keys(data.sources).length} ESPN FEEDS RESPONDING`);
 }catch(err){statusBar(false,err.message);if(!state.data){for(const id of ['division-list','injury-list-mini','news-list','trend-chart','schedule-list','stat-list','form-results','league-score-list','roster-grid','injury-table'])html(id,`<div class="feed-error">${safeText(err.message)}. Run the provided Node server and check its internet connection.</div>`)} }
 finally{state.loading=false;btn.disabled=false;}
}
async function refreshLive(){if(!state.auto||!state.data)return;try{const latest=await getJSON('/api/live');mergeLive(latest);renderGame();renderScores();renderTrend();renderKPIs();renderRecentForm();set('game-updated',`Score feed ${dateTime(latest.updatedAt,{hour:'numeric',minute:'2-digit',second:'2-digit'})}`);if(!latest.ok)statusBar(false,'SCORE FEED UNAVAILABLE')}catch(err){set('league-status','Live score update failed • retrying');}}
function renderAll(){if(!state.data)return;
 set('season-chip',`${state.data.season} SEASON`);renderKPIs();renderStandings();renderInjuries();renderNews();renderGame();renderTrend();renderSchedule();renderOdds();renderTeamStats();renderRecentForm();renderScores();renderRoster();
 set('footer-update',`Data checked ${dateTime(state.data.generatedAt,{dateStyle:'short',timeStyle:'short'})}`);
}
function renderKPIs(){const d=state.data;if(!d)return;
 const t=d.team||{};set('kpi-record',t.record|| (t.wins!=null&&t.losses!=null?`${t.wins}-${t.losses}`:'—'));set('kpi-record-sub','2026 regular season');
 set('kpi-seed',d.divisionRank==null?'—':`#${d.divisionRank}`);
 const p=t.wins!=null&&t.losses!=null?(t.wins+.5*(t.ties||0))/(t.wins+t.losses+(t.ties||0)||1)*100:null;set('kpi-win-pct',p==null?'—':`${p.toFixed(1)}%`);
 const finished=d.games.filter(g=>g.status==='post'&&g.billsScore!=null&&g.opponentScore!=null);
 const diff=finished.length?finished.reduce((x,g)=>x+g.billsScore-g.opponentScore,0):null;
 set('kpi-diff',diff===null?'—':`${diff>0?'+':''}${diff}`);set('kpi-diff-sub',finished.length?`${finished.length} completed games`:'Awaiting finalized games');
 const featured=featuredGame(d.games),upcoming=d.games.find(g=>g.status==='pre');const next=upcoming||featured;
 set('kpi-next',next?.opponentAbbr||'—');set('kpi-next-sub',next?.date?when(next.date):'No scheduled game');
 const prob=d.odds?.value;set('kpi-odds',prob?.percent==null?'—':`${Number(prob.percent).toFixed(1)}%`);set('kpi-odds-sub',prob?.live?'Futures odds estimate':'FPI dated snapshot • not live');
}
function renderStandings(){const data=state.data.standings;
 if(!data.length){html('division-list',sourceMessage('standings','AFC East standings are currently unavailable.'));return}
 html('division-list','<div class="standing-header"><span>CLUB</span><strong>W–L</strong><strong>WIN%</strong></div>'+data.map(r=>`<div class="standing-row ${r.abbr==='BUF'?'highlight':''}"><div class="standing-team"><img loading="lazy" src="${safeLogo(r.logo,r.abbr)}" alt=""><span>${safeText(r.name)}</span></div><strong>${r.wins!=null?`${r.wins}-${r.losses??0}`:safeText(r.record||'—')}</strong><strong class="record-detail">${r.pct!=null?(r.pct*100).toFixed(0)+'%':r.wins!=null?(100*r.wins/Math.max(1,r.wins+(r.losses||0))).toFixed(0)+'%':'—'}</strong></div>`).join(''));
}

function injuryBadge(s){const text=String(s||'Unspecified');const lower=text.toLowerCase();const cls=lower.includes('out')?'out':lower.includes('reserve')||lower.includes('ir')?'ir':lower.includes('doubt')?'doubtful':lower.includes('question')?'questionable':lower.includes('active')?'active':lower.includes('full')?'full':'';return `<span class="status-pill ${cls}">${safeText(text)}</span>`}
function renderInjuries(){const a=state.data.injuries||[];
 const inactive=state.data.gamedayInactives;
 const inactiveBlock=inactive?.players?.length?`<div class="injury-note"><strong>OFFICIAL GAME-DAY INACTIVES • ${safeText(shortDate(inactive.date))}</strong><div>${inactive.players.map(x=>`${safeText(x.position)} ${safeText(x.name)}`).join(' · ')}</div><small>Inactive does not necessarily mean injured. <a href="${safeUrl(inactive.url)}" target="_blank" rel="noopener">Official Bills list ↗</a></small></div>`:'';

 set('injury-count',`${a.length} REPORTED`);set('injury-sync',sourceState('injuries').updatedAt?`ESPN checked ${dateTime(sourceState('injuries').updatedAt,{hour:'numeric',minute:'2-digit'})}`:'ESPN injury feed unavailable');
 if(!a.length){let str=sourceState('injuries').ok?'No current player injury entries in the ESPN team feed. This does not confirm all players are active.':'Player-specific injury data unavailable from ESPN right now.';
 html('injury-list-mini',`<div class="empty-message">${safeText(str)}<div><a href="https://www.buffalobills.com/team/injury-report/" target="_blank" rel="noopener">Official injury report ↗</a></div></div>`);html('injury-table',`${inactiveBlock}<div class="empty-message">${safeText(str)}<div><a href="https://www.buffalobills.com/team/injury-report/" target="_blank" rel="noopener">Check official Bills injury report ↗</a></div></div>`);return}
 const risk=s=>{const t=s.toLowerCase();return t.includes('out')||t.includes('ir')?0:t.includes('doubt')?1:t.includes('question')?2:3};
 const sorted=[...a].sort((x,y)=>risk(x.status)-risk(y.status)||x.name.localeCompare(y.name));
 html('injury-list-mini','<div class="injury-mini-header"><span>PLAYER</span><span>INJURY</span><span>STATUS</span></div>'+sorted.slice(0,8).map(x=>`<div class="injury-line"><strong title="${safeText(x.name)}">${safeText(x.name)}</strong><span class="injury-condition" title="${safeText(x.injury||'Not specified')}">${safeText(x.injury||'—')}</span>${injuryBadge(x.status||'Not specified')}</div>`).join(''));
 html('injury-table',inactiveBlock+'<div class="injury-header"><div>PLAYER</div><div>POSITION</div><div>STATUS</div><div>INJURY / CONDITION</div><div>REPORTED</div></div>'+sorted.map(x=>`<div class="injury-data"><div><strong>${safeText(x.name)}</strong></div><div>${safeText(x.position)}</div><div>${injuryBadge(x.status)}</div><div>${safeText(x.injury)}</div><div>${safeText(x.date?shortDate(x.date):'—')}</div></div>`).join(''));
}
function renderNews(){const items=state.data.news||[];
 if(!items.length){html('news-list',sourceMessage('news','News from ESPN is temporarily unavailable.'));return}
 html('news-list',items.slice(0,7).map(n=>`<a class="news-row" href="${safeUrl(n.url,'https://www.buffalobills.com/news/')}" target="_blank" rel="noopener"><strong>${safeText(n.title)}</strong><small>${safeText(n.date?shortDate(n.date):'ESPN')}</small></a>`).join(''));
}
function featuredGame(games){if(!games?.length)return null;const live=games.find(g=>g.status==='in');if(live)return live;const now=Date.now();return games.find(g=>g.status==='pre'&&Date.parse(g.date)>now-5*3600000)||[...games].reverse().find(g=>g.status==='post')||games[0]}
function renderGame(){const g=featuredGame(state.data.games);if(!g){set('game-status-detail','Game schedule not available');return}
 const playing=g.status==='in',final=g.status==='post';
 const tag=$('game-live-tag');tag.textContent=playing?'LIVE NOW':final?'FINAL':'UP NEXT';tag.classList.toggle('live',playing);
 set('game-week',g.week?`WEEK ${g.week} • NFL`:'2026 NFL SEASON');set('game-venue',g.venue||'Venue not provided');set('game-network',g.network||'');
 set('game-bills-score',playing||final?fmt(g.billsScore):'—');set('game-opponent-score',playing||final?fmt(g.opponentScore):'—');
 const opParts=(g.opponent||'Opponent').split(' ');const short=opParts[opParts.length-1]||g.opponentAbbr;
 set('opponent-name',short.toUpperCase());set('opponent-abbr',g.opponentAbbr||'NFL');$('opponent-logo').src=safeLogo(g.opponentLogo,g.opponentAbbr);
 set('game-phase',playing?'LIVE':final?'FINAL':'PRE GAME');set('game-kickoff',playing?g.statusLabel:final?'GAME COMPLETE':dateTime(g.date,{weekday:'short',hour:'numeric',minute:'2-digit'}));set('game-location',g.isHome?'HOME · BUFFALO':'AWAY GAME');
 const indicator=$('game-live-indicator');indicator.classList.toggle('live',playing);indicator.textContent=playing?'● LIVE GAME UPDATE':final?'● FINAL RESULT':'● PREGAME';
 set('game-status-detail',playing?g.statusLabel:final?`${g.billsScore!=null&&g.opponentScore!=null?(g.billsScore>g.opponentScore?'BILLS WIN':g.billsScore<g.opponentScore?'GAME FINAL':'GAME TIED'):'GAME COMPLETE'} • ${g.statusLabel}`:`KICKOFF ${when(g.date)}`);
 set('game-play',playing?g.play||'Live play detail not available from current feed.':final?`Final score: Bills ${fmt(g.billsScore)} – ${fmt(g.opponentScore)} ${g.opponentAbbr}`:`${g.opponent} • ${g.venue||'venue TBD'}`);
 $('game-espn-link').href=safeUrl(g.sourceUrl,'https://www.espn.com/nfl/team/_/name/buf');set('game-updated',state.data.sources?.live?.updatedAt?`Last fetched ${dateTime(state.data.sources.live.updatedAt,{hour:'numeric',minute:'2-digit'})}`:'Score feed not checked');
}
function renderTrend(){const all=state.data.games.filter(g=>g.status==='post'&&g.billsScore!=null&&g.opponentScore!=null).slice(-10).reverse();
 if(!all.length){html('trend-chart','<div class="empty-message">No confirmed final scores in the ESPN schedule feed.</div>');set('trend-caption','RECENT FINAL SCORES');set('trend-summary','—');return}
 html('trend-chart','<table class="performance-table"><thead><tr><th scope="col">OPPONENT</th><th scope="col">FINAL • BUF–OPP</th><th scope="col">RESULT</th></tr></thead><tbody>'+all.map(g=>{const win=g.billsScore>g.opponentScore,loss=g.billsScore<g.opponentScore;const result=win?'W':loss?'L':'T';return `<tr><td><div class="performance-opponent"><strong>${safeText(g.opponentAbbr||'OPP')}</strong><small>${safeText(shortDate(g.date))} · ${g.isHome?'HOME':'AWAY'}</small></div></td><td class="performance-score">${g.billsScore} <span>–</span> ${g.opponentScore}</td><td><span class="performance-result ${win?'win':loss?'loss':'tie'}">${result}</span></td></tr>`}).join('')+'</tbody></table>');
 const w=all.filter(g=>g.billsScore>g.opponentScore).length,l=all.filter(g=>g.billsScore<g.opponentScore).length,t=all.length-w-l;
 set('trend-caption',`LAST ${all.length} FINAL GAMES`);
 $('trend-summary').innerHTML=`<span>${w} WINS · ${l} LOSSES${t?' · '+t+' TIES':''}</span><span>ESPN FINAL SCORES</span>`;
}
function renderSchedule(){const g=state.data.games.filter(g=>g.status==='pre').slice(0,9);
 if(!g.length){html('schedule-list','<div class="empty-message">No upcoming games returned in the current season schedule.</div>');return}
 html('schedule-list',g.map(x=>`<div class="schedule-row"><div class="schedule-date"><strong>${safeText(shortDate(x.date))}</strong><small>${safeText(dateTime(x.date,{weekday:'short'}))}</small></div><img src="${safeLogo(x.opponentLogo,x.opponentAbbr)}" alt=""><div class="schedule-opp"><strong>${safeText(x.isHome?'VS':'@')} ${safeText(x.opponent)}</strong><small>${safeText(x.venue||'')}${x.week?' • Week '+x.week:''}</small></div><div class="schedule-time">${safeText(dateTime(x.date,{hour:'numeric',minute:'2-digit'}))}<small>LOCAL</small></div></div>`).join(''));
}
function renderOdds(){const o=state.data.odds||{},p=o.value;
 if(!p||p.percent==null){set('odds-percent','—');$('odds-gauge').style.setProperty('--prob','0');set('odds-status','NO LIVE PROBABILITY AVAILABLE');set('odds-explanation','Provide ODDS_API_KEY on the server to load current bookmaker futures. No unverified percentage will be shown.');set('odds-source-link','The Odds API ↗');$('odds-source-link').href='https://the-odds-api.com/sports/super-bowl-winner-odds.html';set('odds-warning',o.error||'No probability model is connected.');return}
 $('odds-gauge').style.setProperty('--prob',String(Math.min(100,Math.max(0,p.percent))));set('odds-percent',`${Number(p.percent).toFixed(1)}%`);
 set('odds-status',p.live?'MARKET-IMPLIED PROBABILITY':'ESPN FPI ESTIMATE • DATED');
 const stamp=p.asOf?shortDate(p.asOf):'time unavailable';
 set('odds-explanation',p.live?`Consensus of ${p.books} sportsbook${p.books===1?'':'s'}, adjusted for the bookmakers’ combined margin. Updated ${stamp}.`:`This is ESPN's published model estimate as of ${p.asOf}. It does not refresh automatically; the live odds feed requires a key.`);
 $('odds-source-link').href=p.live?'https://the-odds-api.com/sports/super-bowl-winner-odds.html':safeUrl(p.url,'https://www.espn.com/nfl/fpi');set('odds-source-link',p.live?'The Odds API ↗':'ESPN FPI / source ↗');
 set('odds-warning',p.live?'Prices and probabilities vary by sportsbook and change over time. Not an NFL forecast.':'Dated snapshot, not real-time. Add an ODDS_API_KEY to show refreshed futures-market probabilities.');
}
function renderTeamStats(){const d=state.data;
 const preferred=[['totalYards','Total Yards'],['passingYards','Passing Yards'],['rushingYards','Rushing Yards'],['totalPoints','Total Points'],['pointsPerGame','Points Per Game'],['sacks','Sacks'],['thirdDownPct','Third Down %'],['turnovers','Turnovers'],['firstDowns','First Downs']];
 let shown=[];for(const [key,label] of preferred){const item=d.stats.find(x=>x.key===key);if(item)shown.push({label,value:item.value})}
 if(!shown.length){const completed=d.games.filter(g=>g.status==='post'&&g.billsScore!=null&&g.opponentScore!=null);
 if(completed.length){const sum=completed.reduce((v,x)=>({b:v.b+x.billsScore,o:v.o+x.opponentScore}),{b:0,o:0});shown=[{label:'Points For',value:sum.b},{label:'Points Against',value:sum.o},{label:'Points Per Game',value:(sum.b/completed.length).toFixed(1)},{label:'Points Allowed / Game',value:(sum.o/completed.length).toFixed(1)},{label:'Point Differential',value:(sum.b-sum.o)>0?`+${sum.b-sum.o}`:sum.b-sum.o}];}
 }
 if(!shown.length){html('stat-list',sourceMessage('stats','No verified team statistics returned.'));return}
 html('stat-list',shown.slice(0,10).map(x=>`<div class="stat-list-row"><span>${safeText(x.label)}</span><strong>${safeText(x.value)}</strong></div>`).join(''));
}
function renderRecentForm(){const d=state.data.games.filter(g=>g.status==='post'&&g.billsScore!=null&&g.opponentScore!=null).slice(-5).reverse();
 if(!d.length){html('form-results','<div class="empty-message">No recent final results available.</div>');return}
 html('form-results',d.map(g=>{const win=g.billsScore>g.opponentScore,loss=g.billsScore<g.opponentScore;return `<div class="form-item ${win?'win':loss?'loss':'tie'}"><small>${safeText(g.opponentAbbr||'OPP')}</small><span class="letter">${win?'W':loss?'L':'T'}</span><strong>${g.billsScore}-${g.opponentScore}</strong></div>`}).join(''));
}
function renderScores(){const a=state.data.scoreboard||[];const v=state.data.sources?.live;
 set('league-status',v?.ok?`LIVE FEED • ${dateTime(v.updatedAt,{hour:'numeric',minute:'2-digit',second:'2-digit'})}${v.stale?' • STALE':''}`:'SCORE FEED UNAVAILABLE');
 if(!a.length){html('league-score-list','<div class="empty-message">No NFL games returned for today. The scoreboard refreshes automatically on game days.</div>');return}
 const sorted=[...a].sort((x,y)=>{const xb=[x.home?.abbr,x.away?.abbr].includes('BUF');const yb=[y.home?.abbr,y.away?.abbr].includes('BUF');return Number(yb)-Number(xb)||Date.parse(x.date)-Date.parse(y.date)});
 html('league-score-list',sorted.map(g=>{const isBills=[g.home?.abbr,g.away?.abbr].includes('BUF');const s=g.status==='in'?'LIVE':g.status==='post'?'FINAL':dateTime(g.date,{hour:'numeric',minute:'2-digit'});
 const team=t=>`<div class="league-competitor"><img loading="lazy" src="${safeLogo(t.logo,t.abbr)}" alt=""><span>${safeText(t.abbr)}</span><b>${g.status==='pre'?'—':t.score==null?'—':fmt(t.score)}</b></div>`;
 return `<div class="league-score ${isBills?'bills-game':''}"><div class="league-top"><span>${g.status==='in'?'● LIVE':'NFL'}</span><span class="${g.status==='in'?'in':''}">${safeText(g.status==='in'&&g.statusLabel?g.statusLabel:s)}</span></div>${team(g.away)}${team(g.home)}<span class="league-bottom">${safeText(g.venue||g.name||'NFL')}</span></div>`}).join(''));
}
const OFF=['QB','RB','FB','WR','TE','LT','RT','LG','RG','C','G','OT','OL','T'];const DEF=['DT','NT','DE','DL','LB','ILB','OLB','MLB','CB','S','FS','SS','DB','EDGE'];const SPEC=['K','P','LS','PK'];
function groupPos(p){return OFF.includes(p)?'OFF':DEF.includes(p)?'DEF':SPEC.includes(p)?'SPEC':'OTHER'}
function renderRoster(){const p=state.data.roster||[],q=state.rosterSearch.toLowerCase(),group=state.rosterFilter;
 const filtered=p.filter(x=>{const matches=[x.name,x.position,x.number].some(v=>String(v||'').toLowerCase().includes(q));return matches&&(group==='ALL'||groupPos(x.position)===group)});
 set('roster-count',p.length?`${p.length} PLAYERS`:'—');set('roster-status',p.length?`${filtered.length} displayed • ESPN roster`:'ESPN roster feed not available');
 if(!p.length){html('roster-grid',sourceMessage('roster','ESPN did not return an active Bills roster.'));return}
 if(!filtered.length){html('roster-grid','<div class="empty-message">No players match your search or position filter.</div>');return}
 html('roster-grid',filtered.map(x=>`<div class="player-card">${x.headshot?`<img class="player-avatar" loading="lazy" src="${safeLogo(x.headshot,'nfl')}" alt="">`:`<div class="player-avatar player-placeholder">${safeText(x.number)}</div>`}<div class="player-details"><strong title="${safeText(x.name)}">${safeText(x.name)}</strong><small><span class="player-number">#${safeText(x.number)}</span> • ${safeText(x.position)}</small></div></div>`).join(''));
}
function setClock(){set('header-time',new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));}
function setAuto(on){state.auto=on;const b=$('btn-auto');b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));b.innerHTML=on?'<span class="blinkdot"></span><span> AUTO ON</span>':'<span> AUTO OFF</span>';localStorage.setItem('bills-auto',String(on));}
function setCompact(on){state.compact=on;document.documentElement.classList.toggle('compact-mode',on);$('btn-compact').classList.toggle('active',on);$('btn-compact').setAttribute('aria-pressed',String(on));localStorage.setItem('bills-compact',String(on))}
function setFridge(on){document.documentElement.classList.toggle('fridge-mode',on);const b=$('btn-fridge');b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));localStorage.setItem('bills-fridge',String(on))}
function setArrange(on){state.arrange=on;document.documentElement.classList.toggle('arrange-mode',on);$('btn-arrange').classList.toggle('selected',on);$('btn-arrange').textContent=on?'DONE ARRANGING':'ARRANGE PANELS';$('btn-arrange').setAttribute('aria-pressed',String(on));for(const p of document.querySelectorAll('.column .panel'))p.draggable=on}
function saveLayout(){const out={};for(const zone of document.querySelectorAll('[data-zone]'))out[zone.dataset.zone]=Array.from(zone.querySelectorAll(':scope > .panel')).map(p=>p.dataset.panel);localStorage.setItem('bills-panel-layout',JSON.stringify(out))}
function restoreLayout(){try{const data=JSON.parse(localStorage.getItem('bills-panel-layout')||'{}');for(const zone of document.querySelectorAll('[data-zone]')){const ids=data[zone.dataset.zone]||[];for(const id of ids){const child=zone.querySelector(`[data-panel="${CSS.escape(id)}"]`);if(child)zone.appendChild(child)}}}catch{}}
let dragPanel=null;
function initDrag(){for(const zone of document.querySelectorAll('[data-zone]')){
 zone.addEventListener('dragstart',e=>{if(!state.arrange)return;e.dataTransfer.effectAllowed='move';dragPanel=e.target.closest('.panel');if(!dragPanel)return;dragPanel.classList.add('dragging');e.dataTransfer.setData('text/plain',dragPanel.id)});
 zone.addEventListener('dragover',e=>{if(!state.arrange||!dragPanel)return;e.preventDefault();const target=e.target.closest('.panel');if(target&&target!==dragPanel&&target.parentElement===zone){target.classList.add('drag-over')}});
 zone.addEventListener('dragleave',e=>e.target.closest('.panel')?.classList.remove('drag-over'));
 zone.addEventListener('drop',e=>{if(!state.arrange||!dragPanel)return;e.preventDefault();const target=e.target.closest('.panel');if(target&&target!==dragPanel&&target.parentElement===zone){const mid=target.getBoundingClientRect().top+target.getBoundingClientRect().height/2;target.parentNode.insertBefore(dragPanel,e.clientY<mid?target:target.nextSibling);saveLayout()}document.querySelectorAll('.drag-over').forEach(p=>p.classList.remove('drag-over'))});
 zone.addEventListener('dragend',()=>{dragPanel?.classList.remove('dragging');document.querySelectorAll('.drag-over').forEach(p=>p.classList.remove('drag-over'));dragPanel=null});
 }}
let modalPanel=null,modalPlaceholder=null;
function openModal(panelId){if(modalPanel)closeModal();const panel=$(panelId);if(!panel)return;
 modalPanel=panel;modalPlaceholder=document.createComment('panel original position');panel.parentNode.insertBefore(modalPlaceholder,panel);$('modal-host').appendChild(panel);$('modal-title').textContent=panel.querySelector('.panel-head h2')?.textContent||'EXPANDED VIEW';$('modal').hidden=false;document.body.style.overflow='hidden';$('modal-close').focus()}
function closeModal(){if(!modalPanel)return;modalPlaceholder.parentNode.insertBefore(modalPanel,modalPlaceholder);modalPlaceholder.remove();modalPlaceholder=null;modalPanel=null;$('modal').hidden=true;document.body.style.overflow=''}
function init(){
 setAuto(localStorage.getItem('bills-auto')!=='false');setCompact(localStorage.getItem('bills-compact')==='true');setFridge(location.search.includes('fridge=1')||(!location.search.includes('fridge=0')&&localStorage.getItem('bills-fridge')==='true'));restoreLayout();initDrag();setClock();setInterval(setClock,15000);
 $('btn-fridge').addEventListener('click',()=>setFridge(!document.documentElement.classList.contains('fridge-mode')));$('btn-refresh').addEventListener('click',()=>refreshFull(true));$('btn-auto').addEventListener('click',()=>setAuto(!state.auto));$('btn-compact').addEventListener('click',()=>setCompact(!state.compact));
 $('btn-wall').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch(err){set('refresh-message','Fullscreen unavailable in this browser')}});
 $('btn-arrange').addEventListener('click',()=>setArrange(!state.arrange));$('btn-reset').addEventListener('click',()=>{localStorage.removeItem('bills-panel-layout');location.reload()});
 $('roster-search').addEventListener('input',e=>{state.rosterSearch=e.target.value;state.data&&renderRoster()});$('roster-filter').addEventListener('change',e=>{state.rosterFilter=e.target.value;state.data&&renderRoster()});
 document.addEventListener('click',e=>{const btn=e.target.closest('[data-expand]');if(btn)openModal(btn.dataset.expand)});$('modal-close').addEventListener('click',closeModal);$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
 document.querySelectorAll('.nav-item').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('current'));a.classList.add('current');closeModal()}));
 refreshFull();liveTimer=setInterval(refreshLive,30000);fullTimer=setInterval(()=>{if(state.auto)refreshFull()},180000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.auto){refreshLive();if(state.data&&Date.now()-Date.parse(state.lastSuccess||0)>300000)refreshFull()}});
}
init();