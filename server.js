
const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || "";

app.use(express.static("public"));

const ESPN_LEAGUES = [
  { key: "bra.1", name: "Brasileirão Série A" },
  { key: "bra.2", name: "Brasileirão Série B" },
  { key: "conmebol.libertadores", name: "Libertadores" },
  { key: "conmebol.sudamericana", name: "Sul-Americana" },
  { key: "eng.1", name: "Premier League" },
  { key: "esp.1", name: "La Liga" },
  { key: "ita.1", name: "Serie A Itália" },
  { key: "ger.1", name: "Bundesliga" },
  { key: "fra.1", name: "Ligue 1" },
  { key: "ned.1", name: "Eredivisie" },
  { key: "nor.1", name: "Noruega" },
  { key: "por.1", name: "Portugal" },
  { key: "ksa.1", name: "Saudita" }
];

function isoDate(dateStr){ return String(dateStr || new Date().toISOString().slice(0,10)); }
function yyyymmdd(dateStr){ return isoDate(dateStr).replaceAll("-", ""); }
function norm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,""); }
function gameKey(h,a){ return norm(h)+"_"+norm(a); }

async function espn(path){
  const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/" + path, {
    headers: {"User-Agent":"Mozilla/5.0","Accept":"application/json,text/plain,*/*"}
  });
  if(!res.ok) throw new Error("ESPN HTTP " + res.status);
  return res.json();
}

async function apiFootball(path){
  if(!API_FOOTBALL_KEY) throw new Error("API_FOOTBALL_KEY não configurada no Render");
  const res = await fetch("https://v3.football.api-sports.io" + path, {
    headers: {"x-apisports-key": API_FOOTBALL_KEY, "Accept":"application/json"}
  });
  if(!res.ok) throw new Error("API-Football HTTP " + res.status);
  const json = await res.json();
  if(json.errors && Object.keys(json.errors).length) throw new Error("API-Football: " + JSON.stringify(json.errors));
  return json;
}

function normalizeEspnGame(event, league){
  const comp = event.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const home = competitors.find(c=>c.homeAway==="home") || competitors[0] || {};
  const away = competitors.find(c=>c.homeAway==="away") || competitors[1] || {};
  const status = event.status || {};
  const type = status.type || {};
  return {
    source:"ESPN", id:event.id, espnId:event.id, fixtureId:"",
    leagueKey:league.key, league:league.name, date:event.date || "",
    time:event.date ? new Date(event.date).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}) : "",
    status:type.description || type.detail || type.name || "",
    state:type.state || "", live:type.state==="in", minute:status.displayClock || "",
    home:{name:home.team?.displayName || home.team?.name || "", logo:home.team?.logo || "", score:home.score ?? ""},
    away:{name:away.team?.displayName || away.team?.name || "", logo:away.team?.logo || "", score:away.score ?? ""}
  };
}

function normalizeApiGame(m){
  const f=m.fixture||{}, l=m.league||{}, t=m.teams||{}, g=m.goals||{}, s=f.status||{};
  const short=s.short||"";
  const live=["1H","2H","HT","ET","BT","P","SUSP","INT","LIVE"].includes(short);
  const finished=["FT","AET","PEN"].includes(short);
  return {
    source:"API-Football", id:String(f.id||""), espnId:"", fixtureId:f.id || "",
    league:l.name || "", leagueKey:"", date:f.date || "",
    time:f.date ? new Date(f.date).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}) : "",
    status:s.long || short || "", state:live ? "in" : finished ? "post" : "pre",
    live, minute:s.elapsed ? String(s.elapsed)+"'" : "",
    home:{name:t.home?.name || "", logo:t.home?.logo || "", score:g.home ?? ""},
    away:{name:t.away?.name || "", logo:t.away?.logo || "", score:g.away ?? ""}
  };
}

app.get("/api/health", (req,res)=>res.json({ok:true, hasApiFootballKey:!!API_FOOTBALL_KEY}));

app.get("/api/games", async (req,res)=>{
  const date = isoDate(req.query.date);
  const out=[], errors=[];
  await Promise.all(ESPN_LEAGUES.map(async league=>{
    try{
      const data = await espn(`${league.key}/scoreboard?dates=${yyyymmdd(date)}&limit=200`);
      (data.events||[]).forEach(ev=>out.push(normalizeEspnGame(ev, league)));
    }catch(e){ errors.push({source:"ESPN", league:league.name, error:String(e.message||e)}); }
  }));
  try{
    const apiData = await apiFootball(`/fixtures?date=${date}`);
    (apiData.response||[]).forEach(m=>out.push(normalizeApiGame(m)));
  }catch(e){ errors.push({source:"API-Football", error:String(e.message||e)}); }

  const map = new Map();
  for(const g of out){
    const key = gameKey(g.home.name, g.away.name);
    if(!key || key==="_") continue;
    const old = map.get(key);
    if(!old) map.set(key,g);
    else if(g.source==="API-Football") map.set(key,{...old,...g,espnId:old.espnId||g.espnId,leagueKey:old.leagueKey||g.leagueKey});
  }
  const games = Array.from(map.values()).sort((a,b)=>new Date(a.date)-new Date(b.date));
  res.json({ok:true,date,total:games.length,games,errors});
});

function normalizeStats(resp){
  const rows=[];
  (resp||[]).forEach(tb=>{
    const team=tb.team?.name||"";
    (tb.statistics||[]).forEach(s=>rows.push({team,label:s.type||"",value:s.value ?? ""}));
  });
  return rows;
}
function normalizeEvents(events){
  return (events||[]).map(e=>({minute:e.time?.elapsed?String(e.time.elapsed)+"'":"",team:e.team?.name||"",player:e.player?.name||"",type:e.type||"",detail:e.detail||"",comments:e.comments||""}));
}
function normalizeLineups(lineups){
  const rows=[];
  (lineups||[]).forEach(tb=>{
    const team=tb.team?.name||"", formation=tb.formation||"";
    (tb.startXI||[]).forEach(x=>rows.push({team,formation,player:x.player?.name||"",number:x.player?.number||"",pos:x.player?.pos||"",type:"Titular"}));
    (tb.substitutes||[]).forEach(x=>rows.push({team,formation,player:x.player?.name||"",number:x.player?.number||"",pos:x.player?.pos||"",type:"Reserva"}));
  });
  return rows;
}

function num(v){const n=Number(String(v??"").replace("%","").trim()); return isNaN(n)?0:n;}
function splitByTeam(stats){
  const teams=[...new Set(stats.map(s=>s.team).filter(Boolean))];
  const home=teams[0]||"Casa", away=teams[1]||"Fora";
  const homeStats={}, awayStats={};
  stats.forEach(s=>{(s.team===home?homeStats:awayStats)[String(s.label).toLowerCase()]=s.value});
  return {home,away,homeStats,awayStats};
}
function find(obj, labels){const k=Object.keys(obj).find(k=>labels.some(l=>k.includes(l))); return k?obj[k]:"";}

function makeAnalysis(stats, events, game){
  const t=splitByTeam(stats), hs=t.homeStats, as=t.awayStats;
  const homeShots=num(find(hs,["total shots","shots total"])), awayShots=num(find(as,["total shots","shots total"]));
  const homeTarget=num(find(hs,["shots on goal","shots on target"])), awayTarget=num(find(as,["shots on goal","shots on target"]));
  const homeCorners=num(find(hs,["corner"])), awayCorners=num(find(as,["corner"]));
  const homePoss=num(find(hs,["ball possession","possession"])), awayPoss=num(find(as,["ball possession","possession"]));
  const homeScore=num(game?.home?.score), awayScore=num(game?.away?.score);
  const elapsed = num(String(game?.minute||"").replace("'","")) || 0;
  const isPre = game?.state === "pre";

  let hp= isPre ? 52 : 35, ap= isPre ? 46 : 35;
  hp += Math.min(homeShots*2.1,28)+Math.min(homeTarget*3.2,22)+Math.min(homeCorners*2.6,22)+Math.min(homePoss*.22,16)+(homeScore<awayScore?10:0);
  ap += Math.min(awayShots*2.1,28)+Math.min(awayTarget*3.2,22)+Math.min(awayCorners*2.6,22)+Math.min(awayPoss*.22,16)+(awayScore<homeScore?10:0);

  if(isPre){
    // Pré-jogo: estimativa simples sem histórico real ainda.
    hp += 8; // mandante tende a começar com ligeira pressão.
    ap += 2;
  }

  hp=Math.max(0,Math.min(100,Math.round(hp))); ap=Math.max(0,Math.min(100,Math.round(ap)));
  const leader=hp>=ap?t.home:t.away, pressure=Math.max(hp,ap);
  const level=pressure>=85?"EXTREMA":pressure>=75?"MUITO ALTA":pressure>=60?"ALTA":pressure>=42?"MODERADA":"BAIXA";

  const totalShots = homeShots + awayShots;
  const totalCorners = homeCorners + awayCorners;
  const shotMeter = isPre ? Math.max(hp, ap) : Math.min(100, Math.round(totalShots * 4 + homeTarget*3 + awayTarget*3 + elapsed*0.25));
  const cornerMeter = isPre ? Math.round((hp + ap) / 2) : Math.min(100, Math.round(totalCorners * 10 + elapsed*0.15));
  const goalHeat = Math.min(100, Math.round((homeTarget+awayTarget)*12 + totalShots*2 + (homeScore!==awayScore ? 8 : 0)));

  const reasons=[];
  if(isPre){
    reasons.push(`${leader} tende a iniciar com mais iniciativa ofensiva.`);
    reasons.push("Pré-jogo usa contexto inicial, mando e estimativa de pressão.");
  } else {
    if(homeShots||awayShots) reasons.push(`${leader} tem maior volume ofensivo no momento.`);
    if((homeCorners>awayCorners&&leader===t.home)||(awayCorners>homeCorners&&leader===t.away)) reasons.push("Escanteios reforçam pressão territorial.");
    if((homeTarget>awayTarget&&leader===t.home)||(awayTarget>homeTarget&&leader===t.away)) reasons.push("Chutes no gol indicam chegada mais perigosa.");
    if(homeScore < awayScore && leader === t.home) reasons.push(`${t.home} está atrás no placar e tende a aumentar agressividade.`);
    if(awayScore < homeScore && leader === t.away) reasons.push(`${t.away} está atrás no placar e tende a aumentar agressividade.`);
  }

  let status = "Jogo em observação";
  if(isPre) status = "Pré-jogo com tendência ofensiva";
  else if(pressure >= 85) status = "Pressão absurda";
  else if(shotMeter >= 75) status = "Jogo aberto";
  else if(cornerMeter >= 70) status = "Escanteios em alta";
  else if(pressure >= 65) status = "Domínio ofensivo";
  else if(goalHeat >= 65) status = "Perigo de gol";

  const human = isPre
    ? `${leader} aparece com maior tendência inicial de pressão, principalmente pelo contexto pré-jogo e mando.`
    : `${leader} está empurrando mais o jogo neste momento.`;

  return {
    homeTeam:t.home, awayTeam:t.away,
    homePressure:hp, awayPressure:ap, pressure, pressureTeam:leader, pressureLevel:level,
    status, human,
    shotMeter, cornerMeter, goalHeat,
    shotTrend: shotMeter>=75?"Alta":shotMeter>=50?"Moderada":"Baixa",
    cornerTrend: cornerMeter>=75?"Alta":cornerMeter>=50?"Moderada":"Baixa",
    goalTrend: goalHeat>=75?"Alta":goalHeat>=50?"Moderada":"Baixa",
    reasons,
    raw:{homeShots,awayShots,homeTarget,awayTarget,homeCorners,awayCorners,homePoss,awayPoss}
  };
}

function fallbackPreGameAnalysis(game){
  const home = game?.home?.name || "Mandante";
  const away = game?.away?.name || "Visitante";
  return {
    homeTeam: home, awayTeam: away,
    homePressure: 62, awayPressure: 48,
    pressure: 62, pressureTeam: home, pressureLevel: "ALTA",
    status: "Pré-jogo em análise",
    human: `${home} tende a ter mais iniciativa por jogar como mandante. Para melhorar essa leitura, precisamos de histórico/casa-fora nas próximas versões.`,
    shotMeter: 61, cornerMeter: 58, goalHeat: 54,
    shotTrend: "Moderada", cornerTrend: "Moderada", goalTrend: "Moderada",
    reasons: ["Leitura inicial baseada em mando de campo.", "Sem estatísticas ao vivo disponíveis ainda."],
    raw:{homeShots:0,awayShots:0,homeTarget:0,awayTarget:0,homeCorners:0,awayCorners:0,homePoss:0,awayPoss:0}
  };
}

app.get("/api/game-details", async (req,res)=>{
  try{
    const fixtureId=req.query.fixtureId;
    const gameJson=req.query.game?JSON.parse(req.query.game):null;
    if(!fixtureId){
      res.json({ok:true,source:"Fallback inteligente",fixtureId:"",teamStats:[],events:[],lineups:[],analysis:fallbackPreGameAnalysis(gameJson)});
      return;
    }
    const [statsJson, eventsJson, lineupsJson] = await Promise.all([
      apiFootball(`/fixtures/statistics?fixture=${fixtureId}`).catch(()=>({response:[]})),
      apiFootball(`/fixtures/events?fixture=${fixtureId}`).catch(()=>({response:[]})),
      apiFootball(`/fixtures/lineups?fixture=${fixtureId}`).catch(()=>({response:[]}))
    ]);
    const teamStats=normalizeStats(statsJson.response);
    const events=normalizeEvents(eventsJson.response);
    const lineups=normalizeLineups(lineupsJson.response);
    const analysis=teamStats.length ? makeAnalysis(teamStats,events,gameJson) : fallbackPreGameAnalysis(gameJson);
    res.json({ok:true,source:teamStats.length?"API-Football":"Fallback inteligente",fixtureId,teamStats,events,lineups,analysis});
  }catch(e){res.status(500).json({ok:false,error:String(e.message||e)});}
});

app.listen(PORT, () => console.log("DhuniorStats V9 Radar rodando na porta " + PORT));
