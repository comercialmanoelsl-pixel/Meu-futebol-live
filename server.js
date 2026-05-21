const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

const SPORTMONKS_KEY = process.env.SPORTMONKS_KEY || '';
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || '';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const OPENWEATHER_KEY = process.env.OPENWEATHER_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const TEAM_PROFILES = {
  'palmeiras': {power:88, style:'muito forte em casa, posse alta, volume ofensivo'},
  'flamengo': {power:88, style:'elenco forte, pressão ofensiva alta'},
  'botafogo': {power:84, style:'time competitivo, transição forte e bom volume ofensivo'},
  'fluminense': {power:82, style:'posse e pressão em casa'},
  'atletico mineiro': {power:84, style:'muito forte em casa e intenso em jogos decisivos'},
  'atlético mineiro': {power:84, style:'muito forte em casa e intenso em jogos decisivos'},
  'athletico pr': {power:80, style:'mandante forte, Arena aumenta intensidade'},
  'juventus': {power:86, style:'time grande, superior tecnicamente, costuma crescer em jogos por vaga europeia'},
  'torino': {power:70, style:'mandante competitivo, mas inferior aos grandes italianos'},
  'milan': {power:85, style:'elenco forte, tende a pressionar quando precisa vencer'},
  'inter': {power:88, style:'time muito forte, controle e eficiência ofensiva'},
  'como': {power:72, style:'pode aumentar agressividade quando precisa pontuar'},
  'manchester city': {power:92, style:'posse dominante e volume ofensivo'},
  'arsenal': {power:88, style:'pressão alta e grande volume ofensivo'},
  'liverpool': {power:90, style:'pressão alta, intensidade e volume ofensivo'},
  'always ready': {power:69, style:'em casa ganha força pela altitude; fora perde força'},
  'bolivar': {power:78, style:'muito forte em casa pela altitude'},
  'bolívar': {power:78, style:'muito forte em casa pela altitude'}
};
const NEED_KEYWORDS = ['precisa vencer','obrigação','classificação','vaga','champions','libertadores','rebaixamento','mata-mata','decisivo','pressionado','pressão','crise','g4','g6'];

app.use(express.static('public'));

const ESPN_LEAGUES = [
  ['bra.1','Brasileirão Série A'],['bra.2','Brasileirão Série B'],
  ['conmebol.libertadores','Libertadores'],['conmebol.sudamericana','Sul-Americana'],
  ['eng.1','Premier League'],['esp.1','La Liga'],['ita.1','Serie A Itália']
].map(([key,name])=>({key,name}));

const CONTEXT_NOTES = [
  ['Always Ready','em casa costuma ter vantagem pela altitude de El Alto'],
  ['Bolívar','em casa costuma ter vantagem pela altitude de La Paz'],
  ['The Strongest','em casa costuma ter vantagem pela altitude de La Paz'],
  ['LDU Quito','joga em altitude relevante em Quito'],
  ['Bodo/Glimt','costuma ser equipe forte/ofensiva no contexto da Noruega'],
  ['Athletico-PR','costuma ter força importante como mandante'],
  ['Atlético-MG','em casa costuma aumentar intensidade em jogos decisivos'],
  ['Fluminense','em casa costuma assumir mais posse e pressão em Libertadores'],
  ['Palmeiras','costuma ter alto volume ofensivo como mandante']
];

const isoDate = d => String(d || new Date().toISOString().slice(0,10));
const yyyymmdd = d => isoDate(d).replaceAll('-','');
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const gameKey = (h,a) => norm(h)+'_'+norm(a);
const num = v => { const n = Number(String(v ?? '').replace('%','').trim()); return isNaN(n) ? 0 : n; };
const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

async function fetchJson(url, options={}){
  const res = await fetch(url, options);
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}
async function sportMonks(path){
  if(!SPORTMONKS_KEY) throw new Error('SPORTMONKS_KEY não configurada');
  const sep = path.includes('?') ? '&' : '?';
  return fetchJson('https://api.sportmonks.com/v3/football' + path + sep + 'api_token=' + encodeURIComponent(SPORTMONKS_KEY), {headers:{Accept:'application/json'}});
}
async function safeSportMonks(path){ try { return await sportMonks(path); } catch(e){ return {data:null,error:String(e.message||e)}; } }
async function apiFootball(path){
  if(!API_FOOTBALL_KEY) throw new Error('API_FOOTBALL_KEY não configurada');
  return fetchJson('https://v3.football.api-sports.io' + path, {headers:{'x-apisports-key':API_FOOTBALL_KEY, Accept:'application/json'}});
}
async function safeApi(path){ try { return await apiFootball(path); } catch(e){ return {response:[],error:String(e.message||e)}; } }
async function espn(path){ return fetchJson('https://site.api.espn.com/apis/site/v2/sports/soccer/' + path, {headers:{'User-Agent':'Mozilla/5.0', Accept:'application/json'}}); }

function normalizeSportMonksGame(fx){
  const parts = fx.participants || [];
  const home = parts.find(p=>p.meta?.location==='home') || parts[0] || {};
  const away = parts.find(p=>p.meta?.location==='away') || parts[1] || {};
  const scoreOf = (team) => (fx.scores||[]).find(s=>s.participant_id===team.id && ['CURRENT','2ND_HALF','1ST_HALF'].includes(s.description))?.score?.goals ?? '';
  const state = String(fx.state?.state || fx.state?.name || '').toUpperCase();
  const live = ['LIVE','HT','1ST_HALF','2ND_HALF'].includes(state);
  const finished = ['FT','AET','FT_PEN'].includes(state);
  return {
    source:'SportMonks', id:'sm_'+fx.id, sportmonksId:fx.id, fixtureId:'', leagueId:fx.league_id||'', season:fx.season_id||'',
    league:fx.league?.name||'', date:fx.starting_at||'', venue:fx.venue?.name||'', city:fx.venue?.city_name||'',
    time:fx.starting_at ? new Date(fx.starting_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '',
    status:fx.state?.name || state || '', state:live?'in':finished?'post':'pre', live, minute:'',
    home:{id:home.id||'', name:home.name||'', logo:home.image_path||'', score:scoreOf(home)},
    away:{id:away.id||'', name:away.name||'', logo:away.image_path||'', score:scoreOf(away)}
  };
}
function normalizeApiGame(m){
  const f=m.fixture||{}, l=m.league||{}, t=m.teams||{}, g=m.goals||{}, s=f.status||{};
  const short=s.short||''; const live=['1H','2H','HT','ET','BT','P','SUSP','INT','LIVE'].includes(short); const finished=['FT','AET','PEN'].includes(short);
  return {source:'API-Football', id:String(f.id||''), fixtureId:f.id||'', sportmonksId:'', leagueId:l.id||'', season:l.season||'', league:l.name||'', date:f.date||'', venue:f.venue?.name||'', city:f.venue?.city||'', time:f.date?new Date(f.date).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'', status:s.long||short||'', state:live?'in':finished?'post':'pre', live, minute:s.elapsed?String(s.elapsed)+"'":'', home:{id:t.home?.id||'', name:t.home?.name||'', logo:t.home?.logo||'', score:g.home??''}, away:{id:t.away?.id||'', name:t.away?.name||'', logo:t.away?.logo||'', score:g.away??''}};
}
function normalizeEspnGame(event, league){
  const comp=event.competitions?.[0]||{}; const cs=comp.competitors||[]; const home=cs.find(c=>c.homeAway==='home')||cs[0]||{}; const away=cs.find(c=>c.homeAway==='away')||cs[1]||{}; const type=event.status?.type||{};
  return {source:'ESPN', id:event.id, fixtureId:'', sportmonksId:'', league:league.name, date:event.date||'', venue:comp.venue?.fullName||'', city:comp.venue?.address?.city||'', time:event.date?new Date(event.date).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'', status:type.description||type.detail||type.name||'', state:type.state||'', live:type.state==='in', minute:event.status?.displayClock||'', home:{id:'', name:home.team?.displayName||home.team?.name||'', logo:home.team?.logo||'', score:home.score??''}, away:{id:'', name:away.team?.displayName||away.team?.name||'', logo:away.team?.logo||'', score:away.score??''}};
}

app.get('/api/games', async (req,res)=>{
  const date = isoDate(req.query.date); const out=[]; const errors=[];
  if(SPORTMONKS_KEY){ try{ const sm=await sportMonks(`/fixtures/date/${date}?include=participants;scores;league;state;venue`); (sm.data||[]).forEach(f=>out.push(normalizeSportMonksGame(f))); }catch(e){ errors.push({source:'SportMonks', error:String(e.message||e)}); } }
  try{ const api=await apiFootball(`/fixtures?date=${date}`); (api.response||[]).forEach(m=>out.push(normalizeApiGame(m))); }catch(e){ errors.push({source:'API-Football', error:String(e.message||e)}); }
  await Promise.all(ESPN_LEAGUES.map(async league=>{ try{ const data=await espn(`${league.key}/scoreboard?dates=${yyyymmdd(date)}&limit=200`); (data.events||[]).forEach(ev=>out.push(normalizeEspnGame(ev, league))); }catch(e){} }));
  const map = new Map();
  for(const g of out){ const key=gameKey(g.home.name,g.away.name); if(!key || key==='_') continue; const old=map.get(key); if(!old) map.set(key,g); else if(g.source==='SportMonks') map.set(key,{...old,...g}); else if(g.source==='API-Football' && old.source==='ESPN') map.set(key,{...old,...g}); }
  const rank = g => g.live ? 0 : g.state==='pre' ? 1 : 2;
  const games=[...map.values()].sort((a,b)=>rank(a)-rank(b) || new Date(a.date)-new Date(b.date));
  res.json({ok:true,date,total:games.length,games,errors});
});

function normalizeApiStats(resp){ const rows=[]; (resp||[]).forEach(tb=>{ const team=tb.team?.name||''; (tb.statistics||[]).forEach(s=>rows.push({team,label:String(s.type||''),value:s.value??''})); }); return rows; }
function normalizeApiEvents(events){ return (events||[]).map(e=>({minute:e.time?.elapsed?String(e.time.elapsed)+"'":'',team:e.team?.name||'',player:e.player?.name||'',type:e.type||'',detail:e.detail||''})); }
function normalizeSportMonksStats(fixture, game){
  const rows=[];
  const parts=fixture.participants||[];

  const homeParticipant = parts.find(p=>String(p.meta?.location||'').toLowerCase()==='home') ||
    parts.find(p=>norm(p.name)===norm(game.home?.name)) || {id:game.home.id,name:game.home.name};
  const awayParticipant = parts.find(p=>String(p.meta?.location||'').toLowerCase()==='away') ||
    parts.find(p=>norm(p.name)===norm(game.away?.name)) || {id:game.away.id,name:game.away.name};

  function teamNameByParticipant(pid){
    if(String(pid)===String(homeParticipant.id)) return game.home.name || homeParticipant.name;
    if(String(pid)===String(awayParticipant.id)) return game.away.name || awayParticipant.name;
    const p = parts.find(x=>String(x.id)===String(pid));
    if(!p) return '';
    if(norm(p.name)===norm(game.home?.name)) return game.home.name;
    if(norm(p.name)===norm(game.away?.name)) return game.away.name;
    return p.name || '';
  }

  (fixture.statistics||[]).forEach(s=>{
    const type = s.type || {};
    const typeId = Number(s.type_id || type.id || 0);
    const label = String(type.name || type.developer_name || type.code || s.type_name || s.name || '').toLowerCase();
    const code = String(type.code || type.developer_name || '').toLowerCase();
    const team = teamNameByParticipant(s.participant_id);
    const value = s.data?.value ?? s.data?.count ?? s.value ?? '';
    if(team && (label || typeId || code)) rows.push({team,label,code,typeId,value});
  });
  return rows;
}
function normalizeSportMonksEvents(fixture){ return (fixture.events||[]).map(e=>({minute:e.minute?String(e.minute)+"'":'', team:e.participant?.name||'', player:e.player_name||e.player?.display_name||'', type:e.type?.name||'', detail:e.info||e.addition||''})); }
function normalizeSportMonksLineups(fixture){ return (fixture.lineups||[]).slice(0,40).map(l=>({team:l.participant?.name||'', player:l.player?.display_name||l.player_name||'', position:l.position?.name||'', type:l.type?.name||''})); }

function normalizeStatText(v){
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]/g,' ').replace(/\s+/g,' ').trim();
}
function sameTeam(a,b){ return norm(a)===norm(b) || norm(a).includes(norm(b)) || norm(b).includes(norm(a)); }
function statsBySide(stats, game){
  const homeStats={}, awayStats={};
  const homeName = game.home?.name || '';
  const awayName = game.away?.name || '';
  stats.forEach(s=>{
    const key = normalizeStatText(s.code || s.label || s.typeId);
    const row = {value:s.value, typeId:Number(s.typeId||0), label:normalizeStatText(s.label), code:normalizeStatText(s.code)};
    if(sameTeam(s.team, homeName)) homeStats[key || String(row.typeId)] = row;
    else if(sameTeam(s.team, awayName)) awayStats[key || String(row.typeId)] = row;
  });
  return {homeStats,awayStats};
}
function getStat(obj, ids=[], exactTexts=[], includes=[], excludes=[]){
  const rows = Object.values(obj||{});
  const byId = rows.find(r=>ids.includes(Number(r.typeId||0)));
  if(byId) return byId.value;
  const exact = rows.find(r=>exactTexts.some(t=>r.label===normalizeStatText(t) || r.code===normalizeStatText(t)));
  if(exact) return exact.value;
  const inc = rows.find(r=>{
    const txt = `${r.label} ${r.code}`;
    return includes.some(i=>txt.includes(normalizeStatText(i))) && !excludes.some(e=>txt.includes(normalizeStatText(e)));
  });
  return inc ? inc.value : '';
}
function statValue(obj, ids, exact, inc, exc){ return num(getStat(obj, ids, exact, inc, exc)); }
function totalShots(obj){
  const goalAttempts = statValue(obj, [54], ['goal attempts','goal-attempts','GOAL_ATTEMPTS'], ['goal attempts'], []);
  const shotsTotal = statValue(obj, [42], ['shots total','total shots','shots-total','SHOTS_TOTAL'], ['total shots','shots total'], ['on target','off target','blocked','inside','outside']);
  if(goalAttempts || shotsTotal) return Math.max(goalAttempts, shotsTotal);
  const on = statValue(obj, [86], ['shots on target','shots-on-target','SHOTS_ON_TARGET'], ['shots on target','shots on goal'], ['off','blocked']);
  const off = statValue(obj, [41], ['shots off target','shots-off-target','SHOTS_OFF_TARGET'], ['shots off target','shots off goal'], ['on','blocked']);
  const blocked = statValue(obj, [58,97], ['shots blocked','blocked shots','shots-blocked','blocked-shots'], ['blocked shots','shots blocked'], []);
  return on + off + blocked;
}
function makeLiveFromRows(stats, game){
  const {homeStats, awayStats} = statsBySide(stats, game);
  const homeName = game.home?.name || 'Mandante';
  const awayName = game.away?.name || 'Visitante';
  const finalHome = totalShots(homeStats);
  const finalAway = totalShots(awayStats);
  const targetHome = statValue(homeStats, [86], ['shots on target','shots-on-target','SHOTS_ON_TARGET'], ['shots on target','shots on goal'], ['off','blocked']);
  const targetAway = statValue(awayStats, [86], ['shots on target','shots-on-target','SHOTS_ON_TARGET'], ['shots on target','shots on goal'], ['off','blocked']);
  const cornerHome = statValue(homeStats, [34], ['corners','corner kicks','CORNERS'], ['corner'], []);
  const cornerAway = statValue(awayStats, [34], ['corners','corner kicks','CORNERS'], ['corner'], []);
  const possHome = statValue(homeStats, [45], ['ball possession','possession','BALL_POSSESSION'], ['possession'], []);
  const possAway = statValue(awayStats, [45], ['ball possession','possession','BALL_POSSESSION'], ['possession'], []);
  const has=!!(finalHome||finalAway||targetHome||targetAway||cornerHome||cornerAway||possHome||possAway);
  if(!has) return null;
  const hp=finalHome*2+targetHome*4+cornerHome*2+possHome*.25;
  const ap=finalAway*2+targetAway*4+cornerAway*2+possAway*.25;
  const leader=hp>=ap?homeName:awayName;
  return {
    dataType:'live', hasEnoughData:true,
    confidence:(finalHome+finalAway+cornerHome+cornerAway)>=10?'Alta':'Moderada',
    reading:`${leader} pressiona mais neste momento com base nas estatísticas ao vivo.`,
    pressureTeam:leader,
    finalizations:{home:finalHome,away:finalAway},
    shotsOnGoal:{home:targetHome,away:targetAway},
    corners:{home:cornerHome,away:cornerAway},
    possession:{home:possHome,away:possAway},
    base:[
      `Finalizações ao vivo: ${finalHome||'-'} x ${finalAway||'-'}.`,
      `Chutes no gol ao vivo: ${targetHome||'-'} x ${targetAway||'-'}.`,
      `Escanteios ao vivo: ${cornerHome||'-'} x ${cornerAway||'-'}.`,
      `Posse ao vivo: ${possHome||'-'}% x ${possAway||'-'}%.`
    ]
  };
}
async function newsContext(game){
  if(!NEWS_API_KEY) return {items:[],base:[]};
  try{ const q=encodeURIComponent(`"${game.home.name}" "${game.away.name}" futebol OR soccer`); const data=await fetchJson(`https://newsapi.org/v2/everything?q=${q}&language=pt&sortBy=publishedAt&pageSize=8&apiKey=${NEWS_API_KEY}`); const items=(data.articles||[]).slice(0,8).map(a=>({title:a.title||'',source:a.source?.name||'',url:a.url||''})); const rel=items.filter(i=>!/onde assistir|horário|transmissão/i.test(i.title)); return {items:rel.length?rel:items, base:(rel.length?rel:items).slice(0,4).map(a=>a.title)}; }catch(e){ return {items:[],base:[]}; }
}
async function weatherContext(game){
  if(!OPENWEATHER_KEY || !game.city) return {data:null,base:[]};
  try{ const q=encodeURIComponent(game.city); const data=await fetchJson(`https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${OPENWEATHER_KEY}&units=metric&lang=pt_br`); const desc=data.weather?.[0]?.description||''; const temp=Math.round(data.main?.temp||0); const wind=data.wind?.speed||0; return {data:{city:game.city,desc,temp,wind},base:[`Clima em ${game.city}: ${desc}, ${temp}°C, vento ${wind} m/s.`]}; }catch(e){return {data:null,base:[]};}
}

function cleanNameKey(name){ return String(name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
function teamProfile(name){ const k=cleanNameKey(name); return TEAM_PROFILES[k] || Object.entries(TEAM_PROFILES).find(([key])=>k.includes(key)||key.includes(k))?.[1] || {power:65, style:'perfil específico ainda não cadastrado'}; }
function formSummary(fixtures, teamId){
  const games=(fixtures||[]).slice(0,10).map(f=>{ const isHome=f.teams?.home?.id==teamId; const gf=num(isHome?f.goals?.home:f.goals?.away); const ga=num(isHome?f.goals?.away:f.goals?.home); return {gf,ga,win:gf>ga,draw:gf===ga,loss:gf<ga}; });
  return {played:games.length,wins:games.filter(g=>g.win).length,draws:games.filter(g=>g.draw).length,losses:games.filter(g=>g.loss).length,gf:(avg(games.map(g=>g.gf))||0).toFixed(1),ga:(avg(games.map(g=>g.ga))||0).toFixed(1)};
}
async function apiContext(game){
  if(!game.home?.id || !game.away?.id) return {homeForm:{played:0},awayForm:{played:0},standings:[]};
  const [hr,ar,st]=await Promise.all([safeApi(`/fixtures?team=${game.home.id}&last=10`),safeApi(`/fixtures?team=${game.away.id}&last=10`),safeApi(`/standings?league=${game.leagueId||''}&season=${game.season||''}`)]);
  const standings=st.response?.[0]?.league?.standings?.[0]||[];
  return {homeForm:formSummary(hr.response||[],game.home.id),awayForm:formSummary(ar.response||[],game.away.id),standings};
}
function standingOf(standings, game, side){ const team=side==='home'?game.home:game.away; return (standings||[]).find(s=>s.team?.id==team.id || cleanNameKey(s.team?.name)===cleanNameKey(team.name)); }
async function geminiAnalyze(game, pregame, live){
  if(!GEMINI_API_KEY) return null;
  try{
    const prompt = `Você é o analista do DhuniorStats. Não invente dados. Use só o JSON. Mando de campo pesa pouco; força técnica, tabela, necessidade competitiva, notícias e estatísticas ao vivo pesam mais. Responda JSON válido sem markdown com: headline, favorite, confidence, explanation(array), offensiveTrend, cornerTrend. JSON: ${JSON.stringify({game,pregame,live})}`;
    const body={contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.2,responseMimeType:'application/json'}};
    const data=await fetchJson('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key='+encodeURIComponent(GEMINI_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const txt=data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    return JSON.parse(txt);
  }catch(e){ return null; }
}

function internalNotes(game){ const notes=[]; let homeBoost=0, awayBoost=0; for(const [team,note] of CONTEXT_NOTES){ if(norm(team)===norm(game.home.name)){notes.push(`${team}: ${note}.`); homeBoost+=8;} if(norm(team)===norm(game.away.name)){notes.push(`${team}: ${note}.`); awayBoost+=8;} } return {notes,homeBoost,awayBoost}; }
function makePregame(game, ctx){
  const home=game.home.name, away=game.away.name;
  const homeProf=teamProfile(home), awayProf=teamProfile(away);
  const base=[]; let homeScore=8+homeProf.power*.7, awayScore=awayProf.power*.7, evidence=0;
  homeScore += 4; // mando pesa, mas pouco
  base.push(`${home}: ${homeProf.style}.`); base.push(`${away}: ${awayProf.style}.`);
  if(homeProf.power > awayProf.power+7){ base.push(`${home} tem superioridade técnica pelo perfil do time.`); homeScore += (homeProf.power-awayProf.power)*.7; }
  if(awayProf.power > homeProf.power+7){ base.push(`${away} tem superioridade técnica pelo perfil do time.`); awayScore += (awayProf.power-homeProf.power)*.7; }
  if(ctx.api?.homeForm?.played && ctx.api?.awayForm?.played){
    const hp=ctx.api.homeForm.wins*3+ctx.api.homeForm.draws, ap=ctx.api.awayForm.wins*3+ctx.api.awayForm.draws;
    homeScore+=hp; awayScore+=ap; evidence++;
    base.push(`Forma recente: ${home} ${ctx.api.homeForm.wins}V/${ctx.api.homeForm.draws}E/${ctx.api.homeForm.losses}D; ${away} ${ctx.api.awayForm.wins}V/${ctx.api.awayForm.draws}E/${ctx.api.awayForm.losses}D.`);
  }
  const hs=standingOf(ctx.api?.standings||[], game, 'home'), as=standingOf(ctx.api?.standings||[], game, 'away');
  if(hs && as){ const hr=num(hs.rank), ar=num(as.rank); if(hr&&ar){ homeScore+=Math.max(0,20-hr); awayScore+=Math.max(0,20-ar); evidence++; base.push(`Tabela: ${home} ${hr}º; ${away} ${ar}º.`); } }
  const newsText=(ctx.news.base||[]).join(' ').toLowerCase(); const hk=cleanNameKey(home).split(' ')[0], ak=cleanNameKey(away).split(' ')[0]; const hasNeed=NEED_KEYWORDS.some(k=>newsText.includes(k));
  if(hasNeed && cleanNameKey(newsText).includes(hk)){ homeScore+=10; base.push(`${home} tem necessidade/pressão competitiva detectada em notícias.`); evidence++; }
  if(hasNeed && cleanNameKey(newsText).includes(ak)){ awayScore+=10; base.push(`${away} tem necessidade/pressão competitiva detectada em notícias.`); evidence++; }
  const internal=internalNotes(game); homeScore+=internal.homeBoost; awayScore+=internal.awayBoost; if(internal.notes.length){evidence++; base.push(...internal.notes);}
  for(const b of ctx.news.base||[]) base.push('Notícia: '+b); for(const b of ctx.weather.base||[]) base.push(b);
  const leader=homeScore>=awayScore?home:away; const gap=Math.abs(homeScore-awayScore); const winPctHome=Math.max(12,Math.min(78,Math.round(50+(homeScore-awayScore)*.65))); const winPctAway=100-winPctHome;
  const confidence=gap>18?'Alta':gap>9?'Moderada':'Baixa+';
  const predictions=[{key:'winner',label:`${leader} aparece com melhor tendência de vitória`,target:leader,status:'pending'},{key:'pressure',label:`${leader} tende a pressionar mais`,target:leader,status:'pending'},{key:'shots',label:`${leader} tende a ter mais finalizações`,target:leader,status:'pending'},{key:'corners',label:`${leader} tende a gerar mais escanteios`,target:leader,status:'pending'}];
  return {hasEnoughData:true,confidence,evidenceCount:evidence,pressureTeam:leader,probableWinner:leader,winPctHome,winPctAway,predictions,reading:`${leader} aparece melhor no contexto considerando força técnica, tabela, forma, notícias e mando.`,base,homeScore:Math.round(homeScore),awayScore:Math.round(awayScore)};
}
function historicalFallback(game,pregame){ const h=Math.max(6,Math.round((pregame.winPctHome||50)/6)); const a=Math.max(5,Math.round((pregame.winPctAway||50)/7)); return {dataType:'historical', finalizations:{home:h+4,away:a+3}, shotsOnGoal:{home:Math.max(2,Math.round((h+4)*.35)),away:Math.max(1,Math.round((a+3)*.35))}, corners:{home:Math.max(2,Math.round((h+4)*.42)),away:Math.max(1,Math.round((a+3)*.42))}, possession:{home:pregame.winPctHome||50,away:pregame.winPctAway||50}, reading:'Tendência histórica/contextual. Não é estatística ao vivo.'}; }
function updatePredictions(live, game, pregame){ if(!live) return pregame.predictions||[]; return (pregame.predictions||[]).map(p=>{ if(p.key==='winner'){ const hs=num(game.home.score), as=num(game.away.score); if(hs===as) return {...p,status:'pending'}; return {...p,status:(hs>as?game.home.name:game.away.name)===p.target?'good':'bad'}; } if(p.key==='pressure') return {...p,status:live.pressureTeam===p.target?'good':'bad'}; if(p.key==='shots'){ const h=live.finalizations.home,a=live.finalizations.away; if(h===a)return {...p,status:'pending'}; return {...p,status:(h>a?game.home.name:game.away.name)===p.target?'good':'bad'};} if(p.key==='corners'){ const h=live.corners.home,a=live.corners.away; if(h===a)return {...p,status:'pending'}; return {...p,status:(h>a?game.home.name:game.away.name)===p.target?'good':'bad'};} return p; }); }
function makePostGame(game, live){ if(game.state!=='post') return null; if(!live) return {title:'Pós-jogo',text:'Partida finalizada, mas as estatísticas detalhadas não foram entregues pela cobertura disponível.',points:['Resultado final disponível.','Sem base estatística suficiente para análise de volume.']}; const h=game.home.name,a=game.away.name; const hs=num(game.home.score), as=num(game.away.score); const winner=hs>as?h:as>hs?a:'empate'; const shotLeader=live.finalizations.home>live.finalizations.away?h:a; const possLeader=live.possession.home>live.possession.away?h:a; const efficient=winner!=='empate'&&winner!==shotLeader; return {title:'Pós-jogo', text: efficient?`${shotLeader} teve mais volume ofensivo, mas ${winner} foi mais eficiente e aproveitou melhor o que criou.`:`${winner==='empate'?'O jogo terminou empatado':winner+' confirmou o resultado'} com leitura alinhada ao volume apresentado na partida.`, points:[`Finalizações: ${live.finalizations.home} x ${live.finalizations.away}.`,`Chutes no gol: ${live.shotsOnGoal.home} x ${live.shotsOnGoal.away}.`,`Escanteios: ${live.corners.home} x ${live.corners.away}.`,`Maior posse: ${possLeader}.`]}; }

app.get('/api/game-details', async (req,res)=>{
  try{
    const game=JSON.parse(req.query.game||'{}'); const fixtureId=req.query.fixtureId; const sportmonksId=req.query.sportmonksId;
    let statsRows=[], events=[], lineups=[];
    if(SPORTMONKS_KEY && sportmonksId){ const sm=await safeSportMonks(`/fixtures/${sportmonksId}?include=statistics.type;events.type;events.participant;lineups.player;lineups.position;lineups.type;participants;scores`); if(sm.data){ statsRows=normalizeSportMonksStats(sm.data,game); events=normalizeSportMonksEvents(sm.data); lineups=normalizeSportMonksLineups(sm.data); } }
    if(!statsRows.length && fixtureId){ const [st,ev]=await Promise.all([safeApi(`/fixtures/statistics?fixture=${fixtureId}`),safeApi(`/fixtures/events?fixture=${fixtureId}`)]); statsRows=normalizeApiStats(st.response); events=events.length?events:normalizeApiEvents(ev.response); }
    const [news,weather,api]=await Promise.all([newsContext(game),weatherContext(game),apiContext(game)]);
    let pregame=makePregame(game,{news,weather,api}); const live=makeLiveFromRows(statsRows,game);
    const ai=await geminiAnalyze(game,pregame,live);
    if(ai && ai.favorite){ pregame={...pregame, probableWinner:ai.favorite, reading:ai.headline||pregame.reading, confidence:ai.confidence||pregame.confidence, base:[...(ai.explanation||[]), ...pregame.base]}; } const displayStats=live||historicalFallback(game,pregame); const predictions=updatePredictions(live,game,pregame); const predictionScore={good:predictions.filter(p=>p.status==='good').length,bad:predictions.filter(p=>p.status==='bad').length,total:predictions.filter(p=>['good','bad'].includes(p.status)).length}; const postGame=makePostGame(game,live); const main=live||{dataType:'trend',reading:pregame.reading,base:pregame.base};
    res.json({ok:true,teamStats:statsRows,events,lineups,players:{home:[],away:[]},news:news.items,weather:weather.data,postGame,analysis:{live:live?{...live,predictions,predictionScore}:{dataType:'none',reading:'Sem estatísticas ao vivo reais.',predictions,predictionScore},pregame,displayStats,main:{...main,predictions,predictionScore},contextSource:GEMINI_API_KEY?'SportMonks + tabela/forma + Gemini':'SportMonks + tabela/forma + contexto'}});
  }catch(e){ res.status(500).json({ok:false,error:String(e.message||e)}); }
});

app.listen(PORT,()=>console.log('DhuniorStats V19 IA Contexto rodando na porta '+PORT));
