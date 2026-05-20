const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const LEAGUES = [
  { key: "bra.1", name: "Brasileirão Série A" },
  { key: "bra.2", name: "Brasileirão Série B" },
  { key: "conmebol.libertadores", name: "Libertadores" },
  { key: "conmebol.sudamericana", name: "Sul-Americana" },
  { key: "eng.1", name: "Premier League" },
  { key: "esp.1", name: "La Liga" },
  { key: "ned.1", name: "Eredivisie" },
  { key: "nor.1", name: "Eliteserien" },
  { key: "ksa.1", name: "Saudita" },
  { key: "fra.1", name: "Ligue 1" }
];

function yyyymmdd(dateStr) {
  return String(dateStr || new Date().toISOString().slice(0, 10)).replaceAll("-", "");
}

async function espn(path) {
  const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + path;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json,text/plain,*/*"
    }
  });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status} em ${url}`);
  return res.json();
}

function gameScore(ev, side) {
  const comp = ev.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const c = competitors.find(x => x.homeAway === side);
  return c?.score ?? "";
}

function normalizeGame(event, league) {
  const comp = event.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const home = competitors.find(c => c.homeAway === "home") || competitors[0] || {};
  const away = competitors.find(c => c.homeAway === "away") || competitors[1] || {};
  const status = event.status || {};
  const type = status.type || {};

  return {
    id: event.id,
    leagueKey: league.key,
    league: league.name,
    name: event.name || event.shortName || "",
    date: event.date || "",
    time: event.date ? new Date(event.date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
    status: type.description || type.detail || type.name || "",
    state: type.state || "",
    completed: !!type.completed,
    live: type.state === "in",
    minute: status.displayClock || "",
    period: status.period || "",
    home: {
      id: home.team?.id || "",
      name: home.team?.displayName || home.team?.name || "",
      short: home.team?.shortDisplayName || "",
      logo: home.team?.logo || "",
      score: home.score ?? gameScore(event, "home")
    },
    away: {
      id: away.team?.id || "",
      name: away.team?.displayName || away.team?.name || "",
      short: away.team?.shortDisplayName || "",
      logo: away.team?.logo || "",
      score: away.score ?? gameScore(event, "away")
    }
  };
}

app.get("/api/leagues", (req, res) => {
  res.json({ ok: true, leagues: LEAGUES });
});

app.get("/api/games", async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const dates = yyyymmdd(date);
  const out = [];
  const errors = [];

  await Promise.all(LEAGUES.map(async league => {
    try {
      const data = await espn(`${league.key}/scoreboard?dates=${dates}&limit=200`);
      (data.events || []).forEach(ev => out.push(normalizeGame(ev, league)));
    } catch (e) {
      errors.push({ league: league.name, error: String(e.message || e) });
    }
  }));

  out.sort((a,b) => new Date(a.date) - new Date(b.date));
  res.json({ ok: true, date, total: out.length, games: out, errors });
});

function parseCompetitorStats(comp) {
  const rows = [];
  const teamName = comp.team?.displayName || comp.team?.name || "";
  (comp.statistics || []).forEach(s => {
    rows.push({
      team: teamName,
      name: s.name || s.abbreviation || "",
      label: s.displayName || s.label || s.name || "",
      value: s.displayValue ?? s.value ?? ""
    });
  });
  return rows;
}

function parsePlayerStats(boxscore) {
  const players = [];
  (boxscore.players || []).forEach(teamBlock => {
    const teamName = teamBlock.team?.displayName || "";
    (teamBlock.statistics || []).forEach(group => {
      const labels = group.labels || [];
      (group.athletes || []).forEach(a => {
        const athlete = a.athlete || {};
        const stats = {};
        (a.stats || []).forEach((v, i) => stats[labels[i] || `stat_${i}`] = v);
        players.push({
          team: teamName,
          player: athlete.displayName || athlete.fullName || "",
          position: athlete.position?.abbreviation || "",
          group: group.name || group.displayName || "",
          stats
        });
      });
    });
  });
  return players;
}

app.get("/api/game/:league/:id", async (req, res) => {
  try {
    const league = req.params.league;
    const id = req.params.id;
    const summary = await espn(`${league}/summary?event=${id}`);

    const comp = summary.header?.competitions?.[0] || {};
    const competitors = comp.competitors || [];
    const event = summary.header || {};

    const game = {
      id,
      league,
      name: event.name || event.shortName || "",
      status: comp.status?.type?.description || "",
      minute: comp.status?.displayClock || ""
    };

    const teamStats = [];
    competitors.forEach(c => teamStats.push(...parseCompetitorStats(c)));
    const playerStats = parsePlayerStats(summary.boxscore || {});

    const events = [];
    (summary.plays || []).forEach(p => {
      events.push({
        minute: p.clock?.displayValue || "",
        team: p.team?.displayName || "",
        type: p.type?.text || p.type?.abbreviation || "",
        text: p.text || ""
      });
    });

    res.json({
      ok: true,
      game,
      teamStats,
      playerStats,
      events,
      note: "Algumas estatísticas dependem da cobertura grátis da ESPN para cada liga/jogo."
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.listen(PORT, () => console.log(`Meu Futebol Live ESPN rodando na porta ${PORT}`));
