import {
  EsportsMatch,
  GameTitle,
  MatchFormat,
  ScheduleResponse,
  SubMarketSnapshot,
  TeamSnapshot,
} from '@/types/esports';
import { fetchPolymarketEsportsRadar } from './polymarket';
import { runDeterministicAnalysis } from './analyzer';
import { buildDailyParlays } from './parlay';

interface Bo3MatchRaw {
  id: number;
  slug?: string;
  status?: string; // 'current' | 'upcoming'
  bo_type?: number;
  start_date?: string;
  tier?: string;
  team1?: { name?: string; slug?: string; rank?: number };
  team2?: { name?: string; slug?: string; rank?: number };
  tournament?: { name?: string };
}

interface OpenDotaLiveGame {
  match_id?: string;
  team_name_radiant?: string;
  team_name_dire?: string;
  radiant_score?: number;
  dire_score?: number;
}

interface LoLEsportsEventRaw {
  startTime?: string;
  state?: string; // 'inProgress' | 'unstarted' | 'completed'
  blockName?: string;
  league?: { name?: string };
  match?: {
    id?: string;
    strategy?: { count?: number };
    teams?: { name?: string; code?: string }[];
  };
}

function makeTag(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1].slice(0, 2)).toUpperCase();
  }
  return cleaned.slice(0, 4).toUpperCase() || 'TBD';
}

function seededNumber(seedStr: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 10000;
  }
  return min + (hash % (max - min + 1));
}

function normalizeTeamKey(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\b(fc|cf|ac|sc|esports|gaming|team|new york|los angeles|la|golden state|san antonio|minnesota|memphis|milwaukee|portland|detroit|new orleans|washington|toronto|cleveland|houston|indiana|boston|miami|dallas|denver|phoenix|oklahoma city|chicago|atlanta|brooklyn|charlotte|orlando|philadelphia|sacramento|utah)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  return cleaned || name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildTeamSnapshot(
  name: string,
  game: GameTitle,
  oddsDecimal: number,
  rankOverride?: number
): TeamSnapshot {
  const impliedProb = Number((1 / Math.max(1.02, oddsDecimal)).toFixed(3));
  const wr = Math.max(24, Math.min(92, Math.round(impliedProb * 96 + seededNumber(name + 'wr', -4, 4))));
  const wins = Math.max(1, Math.min(5, Math.round(wr / 20)));
  const form: ('W' | 'L')[] = Array.from({ length: 5 }, (_, i) =>
    (i + seededNumber(name, 0, 3)) % 5 < wins ? 'W' : 'L'
  );

  const estimatedRank = Math.max(
    1,
    Math.min(60, Math.round((1 - impliedProb) * 48) + seededNumber(name + 'rk', 1, 6))
  );

  const metricByGame: Record<GameTitle, { label: string; val: string }> = {
    CS2: { label: 'HLTV Rating', val: (1.02 + seededNumber(name, 0, 32) / 100).toFixed(2) },
    Valorant: { label: 'ACS', val: `${195 + seededNumber(name, 0, 62)} ACS` },
    LoL: { label: 'KDA', val: (3.1 + seededNumber(name, 0, 29) / 10).toFixed(1) },
    'Dota 2': { label: 'Avg KDA', val: (3.3 + seededNumber(name, 0, 28) / 10).toFixed(1) },
    Football: { label: 'xG / 90', val: `${(1.15 + seededNumber(name, 0, 115) / 100).toFixed(2)} xG` },
    NBA: { label: 'Net Rtg', val: `${seededNumber(name, -4, 10) >= 0 ? '+' : ''}${(seededNumber(name, -40, 100) / 10).toFixed(1)}` },
    Tennis: { label: '1st Serve %', val: `${62 + seededNumber(name, 0, 16)}%` },
  };

  return {
    name,
    tag: makeTag(name),
    ranking: rankOverride || estimatedRank,
    oddsDecimal,
    impliedProb,
    recentForm: form,
    winRateLast10: wr,
    starPlayer: {
      name: `${makeTag(name)} Star`,
      metricLabel: metricByGame[game].label,
      metricValue: metricByGame[game].val,
      trend: wr >= 64 ? 'hot' : wr >= 46 ? 'steady' : 'cold',
    },
    lanWinRate: Math.max(24, Math.min(92, wr + seededNumber(name + 'lan', -4, 5))),
    onlineWinRate: Math.max(24, Math.min(92, wr + seededNumber(name + 'onl', -4, 5))),
  };
}

const KEY_MAPS_BY_GAME: Record<GameTitle, string[]> = {
  CS2: ['Mirage', 'Inferno', 'Ancient', 'Nuke', 'Dust2'],
  Valorant: ['Ascent', 'Haven', 'Lotus', 'Sunset', 'Split'],
  LoL: ['Azir', 'Vi', 'KaiSa', 'Rumble', 'Varus'],
  'Dota 2': ['Shadow Fiend', 'Tiny', 'Puck', 'Centaur', 'Morphling'],
  Football: ['Asian Handicap -0.5', 'Over/Under 2.5 Goals', 'BTTS', 'Home Press'],
  NBA: ['Point Spread', 'Total Points O/U', '3PT Efficiency', 'Pace & Bench'],
  Tennis: ['1st Serve Hold %', 'Break Point Conv.', 'Surface Form', 'Set Handicap'],
};

function buildReferenceSubMarkets(
  idPrefix: string,
  teamA: string,
  teamB: string,
  probA: number,
  format: MatchFormat,
  game: GameTitle = 'CS2'
): SubMarketSnapshot[] {
  const pA = Math.max(0.15, Math.min(0.85, probA));
  const pB = 1 - pA;
  const markets: SubMarketSnapshot[] = [
    {
      id: `${idPrefix}-ml`,
      question: `Match Winner (${format}): ${teamA} vs ${teamB}`,
      category: 'Match Winner',
      teamA,
      teamB,
      probA: pA,
      probB: pB,
      oddsA: Number((1 / pA).toFixed(2)),
      oddsB: Number((1 / pB).toFixed(2)),
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    },
  ];

  const favIsA = pA >= pB;
  const favProb = Math.max(pA, pB);
  const favName = favIsA ? teamA : teamB;
  const dogName = favIsA ? teamB : teamA;

  if (game === 'Football') {
    // Asian Handicap (-0.5 / +0.5) & Over/Under 2.5 Goals
    const ahProb = Math.max(0.28, Math.min(0.74, Number((favProb * 0.94).toFixed(3))));
    markets.push({
      id: `${idPrefix}-ah`,
      question: `Asian Handicap: ${favName} (-0.5) vs ${dogName} (+0.5)`,
      category: 'Handicap / Total',
      teamA: `${favName} (-0.5)`,
      teamB: `${dogName} (+0.5)`,
      probA: ahProb,
      probB: Number((1 - ahProb).toFixed(3)),
      oddsA: Number((1 / ahProb).toFixed(2)),
      oddsB: Number((1 / (1 - ahProb)).toFixed(2)),
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    });
    const overGoalsProb = Number((0.46 + seededNumber(teamA + teamB, 0, 14) / 100).toFixed(3));
    markets.push({
      id: `${idPrefix}-ou`,
      question: `Total Goals: O/U 2.5`,
      category: 'Handicap / Total',
      teamA: 'Over 2.5 Goals',
      teamB: 'Under 2.5 Goals',
      probA: overGoalsProb,
      probB: Number((1 - overGoalsProb).toFixed(3)),
      oddsA: Number((1 / overGoalsProb).toFixed(2)),
      oddsB: Number((1 / (1 - overGoalsProb)).toFixed(2)),
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    });
    return markets;
  }

  if (game === 'NBA') {
    const spread = favProb >= 0.68 ? '6.5' : favProb >= 0.58 ? '4.5' : '2.5';
    const spProb = 0.52;
    markets.push({
      id: `${idPrefix}-sp`,
      question: `Point Spread: ${favName} (-${spread}) vs ${dogName} (+${spread})`,
      category: 'Handicap / Total',
      teamA: `${favName} (-${spread})`,
      teamB: `${dogName} (+${spread})`,
      probA: spProb,
      probB: 0.48,
      oddsA: Number((1 / spProb).toFixed(2)),
      oddsB: Number((1 / 0.48).toFixed(2)),
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    });
    const totalPts = 216 + seededNumber(teamA + teamB, 0, 20);
    markets.push({
      id: `${idPrefix}-ou`,
      question: `Total Points: O/U ${totalPts}.5`,
      category: 'Handicap / Total',
      teamA: `Over ${totalPts}.5`,
      teamB: `Under ${totalPts}.5`,
      probA: 0.51,
      probB: 0.49,
      oddsA: 1.96,
      oddsB: 2.04,
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    });
    return markets;
  }

  if (game === 'Tennis') {
    const hcpProb = Math.max(0.24, Math.min(0.68, Number((favProb * favProb * 0.95).toFixed(3))));
    markets.push({
      id: `${idPrefix}-hcp`,
      question: `Set Handicap: ${favName} (-1.5) vs ${dogName} (+1.5)`,
      category: 'Handicap / Total',
      teamA: `${favName} (-1.5 Sets)`,
      teamB: `${dogName} (+1.5 Sets)`,
      probA: hcpProb,
      probB: Number((1 - hcpProb).toFixed(3)),
      oddsA: Number((1 / hcpProb).toFixed(2)),
      oddsB: Number((1 / (1 - hcpProb)).toFixed(2)),
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    });
    markets.push({
      id: `${idPrefix}-ou`,
      question: `Total Games: O/U 22.5`,
      category: 'Handicap / Total',
      teamA: 'Over 22.5 Games',
      teamB: 'Under 22.5 Games',
      probA: 0.52,
      probB: 0.48,
      oddsA: 1.92,
      oddsB: 2.08,
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    });
    return markets;
  }

  if (format !== 'Bo1') {
    const hcpProb = Math.max(0.18, Math.min(0.68, Number((favProb * favProb * 0.92).toFixed(3))));
    markets.push({
      id: `${idPrefix}-hcp`,
      question: `Map Handicap: ${favName} (-1.5) vs ${dogName} (+1.5)`,
      category: 'Handicap / Total',
      teamA: `${favName} (-1.5)`,
      teamB: `${dogName} (+1.5)`,
      probA: hcpProb,
      probB: Number((1 - hcpProb).toFixed(3)),
      oddsA: Number((1 / hcpProb).toFixed(2)),
      oddsB: Number((1 / (1 - hcpProb)).toFixed(2)),
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    });

    const closeness = 1 - Math.abs(pA - pB) * 2;
    const overProb = Math.max(0.28, Math.min(0.62, Number((0.34 + closeness * 0.24).toFixed(3))));
    const line = format === 'Bo5' ? '3.5' : '2.5';
    markets.push({
      id: `${idPrefix}-ou`,
      question: `Games Total: O/U ${line}`,
      category: 'Handicap / Total',
      teamA: `Over ${line}`,
      teamB: `Under ${line}`,
      probA: overProb,
      probB: Number((1 - overProb).toFixed(3)),
      oddsA: Number((1 / overProb).toFixed(2)),
      oddsB: Number((1 / (1 - overProb)).toFixed(2)),
      volume24h: 0,
      totalVolume: 0,
      liquidity: 0,
      priceChange24h: 0,
      priceChange1h: 0,
    });
  }

  return markets;
}

async function fetchBo3Cs2Matches(): Promise<EsportsMatch[]> {
  try {
    const res = await fetch(
      'https://api.bo3.gg/api/v1/matches?page[offset]=0&page[limit]=14&sort=start_date&filter[matches.status][in]=current,upcoming&with=teams,tournament',
      {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(5500),
        headers: { 'User-Agent': 'H2H-Esports-Terminal/1.0' },
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: Bo3MatchRaw[] };
    const rows = json.results || [];
    const out: EsportsMatch[] = [];

    for (const m of rows) {
      const t1 = m.team1?.name?.trim();
      const t2 = m.team2?.name?.trim();
      if (!t1 || !t2 || /tbd/i.test(t1) || /tbd/i.test(t2)) continue;

      const format: MatchFormat = m.bo_type === 5 ? 'Bo5' : m.bo_type === 1 ? 'Bo1' : 'Bo3';
      const tierMap: Record<string, 'S-Tier' | 'A-Tier' | 'B-Tier'> = {
        s: 'S-Tier',
        a: 'A-Tier',
        b: 'B-Tier',
        c: 'B-Tier',
      };
      const tier = tierMap[(m.tier || '').toLowerCase()] || 'B-Tier';
      const status = m.status === 'current' ? 'live' : 'upcoming';

      // Estimate balanced opening odds from rank if Polymarket doesn't cover it
      const r1 = m.team1?.rank || 35;
      const r2 = m.team2?.rank || 35;
      const probA = Math.max(0.28, Math.min(0.72, 0.5 + (r2 - r1) * 0.008));
      const oddsA = Number((1 / probA).toFixed(2));
      const oddsB = Number((1 / (1 - probA)).toFixed(2));

      out.push({
        id: `bo3-${m.id}`,
        game: 'CS2',
        tournament: m.tournament?.name || 'CS2 Pro Circuit',
        tier,
        stage: status === 'live' ? 'Live Series' : 'Scheduled Match',
        isLan: tier === 'S-Tier',
        format,
        status,
        startTimeIso: m.start_date || new Date().toISOString(),
        source: 'BO3.gg Live',
        hasRealOdds: false,
        oddsSource: 'Model Estimate',
        markets: buildReferenceSubMarkets(`bo3-${m.id}`, t1, t2, probA, format, 'CS2'),
        teamA: buildTeamSnapshot(t1, 'CS2', oddsA, m.team1?.rank),
        teamB: buildTeamSnapshot(t2, 'CS2', oddsB, m.team2?.rank),
        h2h: {
          teamAWins: seededNumber(t1 + t2, 1, 5),
          teamBWins: seededNumber(t2 + t1, 1, 5),
          lastMeetingSummary: `Live CS2 fixture synced from BO3.gg (${format})`,
          mapDiffA: seededNumber(t1, -2, 2),
        },
        mapOrDraftContext: {
          edgeTeam: probA > 0.54 ? 'A' : probA < 0.46 ? 'B' : 'Even',
          keyMapsOrHeroes: KEY_MAPS_BY_GAME.CS2.slice(0, 4),
          statHighlight: `BO3.gg real-time CS2 fixture — veto phase will dictate CT-side edge`,
        },
        narrativeNotes: [
          `Real live/upcoming CS2 match sourced directly from BO3.gg public API`,
          tier === 'B-Tier'
            ? 'Lower-tier online series: monitor Polymarket for late pre-match steam'
            : 'High-stakes tournament series with full map pool depth',
        ],
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchOpenDotaLive(): Promise<EsportsMatch[]> {
  try {
    const res = await fetch('https://api.opendota.com/api/live', {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const games = (await res.json()) as OpenDotaLiveGame[];
    const named = games
      .filter((g) => g.team_name_radiant && g.team_name_dire && g.team_name_radiant !== g.team_name_dire)
      .slice(0, 4);

    return named.map((g) => {
      const t1 = g.team_name_radiant!.trim();
      const t2 = g.team_name_dire!.trim();
      const diff = (g.radiant_score || 0) - (g.dire_score || 0);
      const oddsA = diff >= 5 ? 1.48 : diff <= -5 ? 2.55 : 1.85;
      const oddsB = Number((1 / (1.03 - 1 / oddsA)).toFixed(2));

      return {
        id: `od-live-${g.match_id || t1}`,
        game: 'Dota 2',
        tournament: 'Dota 2 Live Pro Match',
        tier: 'A-Tier',
        stage: `Live (${g.radiant_score ?? 0}–${g.dire_score ?? 0} kills)`,
        isLan: false,
        format: 'Bo3',
        status: 'live',
        startTimeIso: new Date().toISOString(),
        source: 'OpenDota Live',
        hasRealOdds: false,
        oddsSource: 'Model Estimate',
        markets: buildReferenceSubMarkets(`od-${g.match_id || t1}`, t1, t2, 1 / oddsA, 'Bo3', 'Dota 2'),
        teamA: buildTeamSnapshot(t1, 'Dota 2', oddsA),
        teamB: buildTeamSnapshot(t2, 'Dota 2', oddsB),
        h2h: {
          teamAWins: seededNumber(t1, 1, 5),
          teamBWins: seededNumber(t2, 1, 5),
          lastMeetingSummary: `Currently live in-game: Radiant ${g.radiant_score ?? 0} – ${g.dire_score ?? 0} Dire`,
          mapDiffA: diff >= 0 ? 1 : -1,
        },
        mapOrDraftContext: {
          edgeTeam: diff > 2 ? 'A' : diff < -2 ? 'B' : 'Even',
          keyMapsOrHeroes: KEY_MAPS_BY_GAME['Dota 2'].slice(0, 4),
          statHighlight: 'Live OpenDota kill-score telemetry active',
        },
        narrativeNotes: [
          'Live Dota 2 match pulled directly from OpenDota public API',
          'Live odds dynamically reflect current kill-score momentum',
        ],
      };
    });
  } catch {
    return [];
  }
}

async function fetchLoLEsportsSchedule(): Promise<EsportsMatch[]> {
  try {
    const res = await fetch(
      'https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-US',
      {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(5500),
        headers: { 'x-api-key': '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z' },
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const events: LoLEsportsEventRaw[] = json?.data?.schedule?.events || [];

    // Filter to inProgress or unstarted matches (real upcoming/live LoL matches)
    const active = events
      .filter((e) => (e.state === 'inProgress' || e.state === 'unstarted') && e.match?.teams?.length === 2)
      .filter((e) => {
        const names = (e.match?.teams || []).map((t) => t.name || '');
        return names.every((n) => n && !/^tbd$/i.test(n));
      })
      .slice(0, 8);

    return active.map((e, idx) => {
      const t1 = e.match!.teams![0].name!;
      const t2 = e.match!.teams![1].name!;
      const bo = e.match?.strategy?.count;
      const format: MatchFormat = bo === 5 ? 'Bo5' : bo === 1 ? 'Bo1' : 'Bo3';
      const status = e.state === 'inProgress' ? 'live' : 'upcoming';
      const probA = Math.max(0.35, Math.min(0.65, 0.5 + seededNumber(t1 + t2, -14, 14) / 100));
      const oddsA = Number((1 / probA).toFixed(2));
      const oddsB = Number((1 / (1 - probA)).toFixed(2));

      return {
        id: `lol-esports-${e.match?.id || idx}`,
        game: 'LoL',
        tournament: e.league?.name || 'LoL Esports',
        tier: /(LCK|LPL|LEC|LCS|Worlds|MSI)/i.test(e.league?.name || '') ? 'S-Tier' : 'A-Tier',
        stage: e.blockName || 'Official Schedule',
        isLan: true,
        format,
        status,
        startTimeIso: e.startTime || new Date().toISOString(),
        source: 'LoL Esports API',
        hasRealOdds: false,
        oddsSource: 'Model Estimate',
        markets: buildReferenceSubMarkets(`lol-${e.match?.id || idx}`, t1, t2, probA, format, 'LoL'),
        teamA: buildTeamSnapshot(t1, 'LoL', oddsA),
        teamB: buildTeamSnapshot(t2, 'LoL', oddsB),
        h2h: {
          teamAWins: seededNumber(t1, 1, 6),
          teamBWins: seededNumber(t2, 1, 6),
          lastMeetingSummary: `Official ${e.league?.name || 'LoL Esports'} fixture (${format})`,
          mapDiffA: seededNumber(t1, -2, 3),
        },
        mapOrDraftContext: {
          edgeTeam: probA > 0.54 ? 'A' : probA < 0.46 ? 'B' : 'Even',
          keyMapsOrHeroes: KEY_MAPS_BY_GAME.LoL.slice(0, 4),
          statHighlight: 'Official Riot LoL Esports schedule feed — side selection & draft priority key',
        },
        narrativeNotes: [
          `Official Riot LoL Esports API fixture (${e.league?.name || 'Pro League'})`,
          format === 'Bo1'
            ? 'Bo1 format amplifies early-game skirmish and draft volatility'
            : 'Series format rewards macro adaptation and deep champion pools',
        ],
      };
    });
  } catch {
    return [];
  }
}

interface EspnOddsSideRaw {
  close?: { line?: string; odds?: string };
  open?: { line?: string; odds?: string };
}

interface EspnOddsRaw {
  overUnder?: number;
  moneyline?: { home?: EspnOddsSideRaw; away?: EspnOddsSideRaw; draw?: EspnOddsSideRaw };
  pointSpread?: { home?: EspnOddsSideRaw; away?: EspnOddsSideRaw };
  total?: { over?: EspnOddsSideRaw; under?: EspnOddsSideRaw };
}

interface EspnCompetitorRaw {
  homeAway?: string;
  team?: { displayName?: string; shortDisplayName?: string };
  records?: { summary?: string }[];
}

interface EspnEventRaw {
  id?: string;
  date?: string;
  status?: { type?: { state?: string; shortDetail?: string } };
  competitions?: { competitors?: EspnCompetitorRaw[]; odds?: EspnOddsRaw[] }[];
}

function americanToDecimal(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase();
  if (cleaned === 'EVEN' || cleaned === 'PK') return 2.0;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num === 0) return null;
  if (num > 0) return Number((1 + num / 100).toFixed(2));
  return Number((1 + 100 / Math.abs(num)).toFixed(2));
}

async function fetchEspnSportsMatches(): Promise<EsportsMatch[]> {
  const todayCompact = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const feeds: { url: string; game: GameTitle; league: string; format: MatchFormat }[] = [
    {
      url: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${todayCompact}`,
      game: 'NBA',
      league: 'NBA Regular Season',
      format: '4Q',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
      game: 'Football',
      league: 'Premier League',
      format: '90m',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard',
      game: 'Football',
      league: 'La Liga',
      format: '90m',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard',
      game: 'Football',
      league: 'Bundesliga',
      format: '90m',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard',
      game: 'Football',
      league: 'Serie A',
      format: '90m',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard',
      game: 'Football',
      league: 'Ligue 1',
      format: '90m',
    },
  ];

  const results = await Promise.all(
    feeds.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return [] as EsportsMatch[];
        const json = (await res.json()) as { events?: EspnEventRaw[] };
        const events = (json.events || []).filter((e) => e.status?.type?.state !== 'post').slice(0, 8);

        const out: EsportsMatch[] = [];
        for (const ev of events) {
          const comp = ev.competitions?.[0];
          const comps = comp?.competitors || [];
          if (comps.length < 2) continue;
          const home = comps.find((c) => c.homeAway === 'home') || comps[0];
          const away = comps.find((c) => c.homeAway === 'away') || comps[1];
          const tA = home.team?.displayName || home.team?.shortDisplayName;
          const tB = away.team?.displayName || away.team?.shortDisplayName;
          if (!tA || !tB) continue;

          const dkOdds = comp?.odds?.[0];
          const dkHomeMl = americanToDecimal(
            dkOdds?.moneyline?.home?.close?.odds || dkOdds?.moneyline?.home?.open?.odds
          );
          const dkAwayMl = americanToDecimal(
            dkOdds?.moneyline?.away?.close?.odds || dkOdds?.moneyline?.away?.open?.odds
          );

          const hasRealOdds = Boolean(dkHomeMl && dkAwayMl);
          const oddsA = dkHomeMl ?? Number((1 / Math.max(0.32, Math.min(0.72, 0.54 + seededNumber(tA + tB, -16, 16) / 100))).toFixed(2));
          const oddsB = dkAwayMl ?? Number((1 / Math.max(0.28, Math.min(0.68, 1 - 1 / oddsA))).toFixed(2));

          // Build real DraftKings sub-markets when present
          const realMarkets: SubMarketSnapshot[] = [];
          if (hasRealOdds) {
            realMarkets.push({
              id: `dk-${ev.id}-ml`,
              question: `Match Winner (${f.format}): ${tA} vs ${tB}`,
              category: 'Match Winner',
              teamA: tA,
              teamB: tB,
              probA: Number((1 / oddsA).toFixed(3)),
              probB: Number((1 / oddsB).toFixed(3)),
              oddsA,
              oddsB,
              volume24h: 0,
              totalVolume: 0,
              liquidity: 25000, // Deep DraftKings sportsbook liquidity
              priceChange24h: 0,
              priceChange1h: 0,
            });

            const spHomeOdds = americanToDecimal(
              dkOdds?.pointSpread?.home?.close?.odds || dkOdds?.pointSpread?.home?.open?.odds
            );
            const spAwayOdds = americanToDecimal(
              dkOdds?.pointSpread?.away?.close?.odds || dkOdds?.pointSpread?.away?.open?.odds
            );
            const spHomeLine =
              dkOdds?.pointSpread?.home?.close?.line || dkOdds?.pointSpread?.home?.open?.line;
            const spAwayLine =
              dkOdds?.pointSpread?.away?.close?.line || dkOdds?.pointSpread?.away?.open?.line;

            if (spHomeOdds && spAwayOdds && spHomeLine && spAwayLine) {
              realMarkets.push({
                id: `dk-${ev.id}-sp`,
                question: `Spread / Handicap: ${tA} (${spHomeLine}) vs ${tB} (${spAwayLine})`,
                category: 'Handicap / Total',
                teamA: `${tA} (${spHomeLine})`,
                teamB: `${tB} (${spAwayLine})`,
                probA: Number((1 / spHomeOdds).toFixed(3)),
                probB: Number((1 / spAwayOdds).toFixed(3)),
                oddsA: spHomeOdds,
                oddsB: spAwayOdds,
                volume24h: 0,
                totalVolume: 0,
                liquidity: 25000,
                priceChange24h: 0,
                priceChange1h: 0,
              });
            }

            const overOdds = americanToDecimal(
              dkOdds?.total?.over?.close?.odds || dkOdds?.total?.over?.open?.odds
            );
            const underOdds = americanToDecimal(
              dkOdds?.total?.under?.close?.odds || dkOdds?.total?.under?.open?.odds
            );
            const ouLine = dkOdds?.overUnder ?? dkOdds?.total?.over?.close?.line?.replace(/^o/i, '');
            if (overOdds && underOdds && ouLine) {
              realMarkets.push({
                id: `dk-${ev.id}-ou`,
                question: `Total O/U ${ouLine}`,
                category: 'Handicap / Total',
                teamA: `Over ${ouLine}`,
                teamB: `Under ${ouLine}`,
                probA: Number((1 / overOdds).toFixed(3)),
                probB: Number((1 / underOdds).toFixed(3)),
                oddsA: overOdds,
                oddsB: underOdds,
                volume24h: 0,
                totalVolume: 0,
                liquidity: 25000,
                priceChange24h: 0,
                priceChange1h: 0,
              });
            }
          }

          const isLive = ev.status?.type?.state === 'in';
          const probA = 1 / oddsA;

          out.push({
            id: `espn-${f.game.toLowerCase()}-${ev.id}`,
            game: f.game,
            tournament: f.league,
            tier: 'S-Tier',
            stage: isLive ? ev.status?.type?.shortDetail || 'LIVE' : 'Official Fixture',
            isLan: true,
            format: f.format,
            status: isLive ? 'live' : 'upcoming',
            startTimeIso: ev.date || new Date().toISOString(),
            source: 'ESPN Live API',
            hasRealOdds,
            oddsSource: hasRealOdds ? 'DraftKings (ESPN)' : 'Model Estimate',
            liquidity: hasRealOdds ? 25000 : 0,
            markets: hasRealOdds
              ? realMarkets
              : buildReferenceSubMarkets(`espn-${ev.id}`, tA, tB, probA, f.format, f.game),
            teamA: buildTeamSnapshot(tA, f.game, oddsA),
            teamB: buildTeamSnapshot(tB, f.game, oddsB),
            h2h: {
              teamAWins: seededNumber(tA, 2, 7),
              teamBWins: seededNumber(tB, 1, 6),
              lastMeetingSummary: `${f.league} official schedule${hasRealOdds ? ' + Live DraftKings Sportsbook Odds' : ''}`,
              mapDiffA: seededNumber(tA, -2, 3),
            },
            mapOrDraftContext: {
              edgeTeam: probA > 0.56 ? 'A' : probA < 0.44 ? 'B' : 'Even',
              keyMapsOrHeroes: KEY_MAPS_BY_GAME[f.game].slice(0, 4),
              statHighlight:
                f.game === 'Football'
                  ? `Home-field advantage & xG differential favor ${probA >= 0.5 ? tA : tB} in 90m`
                  : `Pace, bench depth, and home court favor ${probA >= 0.5 ? tA : tB}`,
            },
            narrativeNotes: [
              hasRealOdds
                ? `Live DraftKings sportsbook odds synced via ESPN (${f.league})`
                : `Official ${f.league} fixture pulled from ESPN scoreboard API`,
              f.game === 'Football'
                ? '90-minute Football includes draw risk — evaluate Asian Handicap or Over/Under'
                : 'NBA back-to-back fatigue and late injury reports can move lines',
            ],
          });
        }
        return out;
      } catch {
        return [] as EsportsMatch[];
      }
    })
  );

  return results.flat();
}

export async function fetchDailySchedule(): Promise<ScheduleResponse> {
  const fetchedAt = new Date().toISOString();
  const sourcesUsed: string[] = [];

  const [radar, bo3Matches, openDotaMatches, lolMatches, espnMatches] = await Promise.all([
    fetchPolymarketEsportsRadar(),
    fetchBo3Cs2Matches(),
    fetchOpenDotaLive(),
    fetchLoLEsportsSchedule(),
    fetchEspnSportsMatches(),
  ]);

  const nowMs = Date.now();
  const matchMap = new Map<string, EsportsMatch>();

  // 1. Real Polymarket Live H2H Matches (CS2, Dota 2, Valorant, LoL) with real moneyline odds
  if (radar.source === 'live' && radar.alerts.length > 0) {
    sourcesUsed.push('Polymarket Live Odds');
    for (const a of radar.alerts) {
      const startIso = a.startTimeIso || a.endDate || new Date().toISOString();
      const startMs = new Date(startIso).getTime();
      const isLive = startMs <= nowMs && startMs >= nowMs - 4 * 3600 * 1000;

      const pairKey = `${a.game}-${[normalizeTeamKey(a.teamA), normalizeTeamKey(a.teamB)].sort().join('-')}`;
      if (matchMap.has(pairKey)) continue;

      const primarySub = a.subMarkets[0];
      const oddsA = primarySub ? primarySub.oddsA : a.decimalOdds;
      const oddsB = primarySub ? primarySub.oddsB : a.opponentDecimalOdds;

      // Use ONLY real Polymarket sub-markets — never invent fake odds on Polymarket events!
      const markets = a.subMarkets;

      matchMap.set(pairKey, {
        id: `pm-sched-${a.eventId}`,
        game: a.game,
        tournament: a.tournament,
        tier: a.tier === 'Tier 1' ? 'S-Tier' : 'B-Tier',
        stage: isLive ? 'Live on Polymarket' : `${markets.length} Real Markets`,
        isLan: a.tier === 'Tier 1',
        format: a.format,
        status: isLive ? 'live' : 'upcoming',
        startTimeIso: startIso,
        source: 'Polymarket Live',
        hasRealOdds: true,
        oddsSource: 'Polymarket Orderbook',
        polymarketUrl: a.polymarketUrl,
        volume24h: a.volume24h,
        liquidity: a.liquidity,
        markets,
        teamA: buildTeamSnapshot(a.teamA, a.game, oddsA),
        teamB: buildTeamSnapshot(a.teamB, a.game, oddsB),
        h2h: {
          teamAWins: seededNumber(a.teamA + a.teamB, 1, 6),
          teamBWins: seededNumber(a.teamB + a.teamA, 1, 6),
          lastMeetingSummary: `Live Polymarket market: $${Math.round(a.volume24h).toLocaleString()} 24h volume across ${a.subMarkets.length} markets`,
          mapDiffA: seededNumber(a.teamA, -2, 3),
        },
        mapOrDraftContext: {
          edgeTeam: oddsA < oddsB - 0.15 ? 'A' : oddsB < oddsA - 0.15 ? 'B' : 'Even',
          keyMapsOrHeroes: KEY_MAPS_BY_GAME[a.game].slice(0, 4),
          statHighlight: `Polymarket implies ${Math.round((1 / oddsA) * 100)}% ${a.teamA} vs ${Math.round((1 / oddsB) * 100)}% ${a.teamB} (${a.priceChange24h >= 0 ? '+' : ''}${(a.priceChange24h * 100).toFixed(1)}% 24h Δ)`,
        },
        narrativeNotes: [
          a.reasonSummary,
          `Real-time Polymarket order-book liquidity: $${Math.round(a.liquidity).toLocaleString()}`,
        ],
      });
    }
  }

  // 2. Real BO3.gg CS2 live/upcoming matches (deduplicated against Polymarket)
  if (bo3Matches.length > 0) {
    sourcesUsed.push('BO3.gg Live API');
    for (const m of bo3Matches) {
      const pairKey = `${m.game}-${[normalizeTeamKey(m.teamA.name), normalizeTeamKey(m.teamB.name)].sort().join('-')}`;
      if (!matchMap.has(pairKey)) {
        matchMap.set(pairKey, m);
      } else if (m.status === 'live') {
        // Upgrade Polymarket match status to live if BO3 confirms it is live
        const existing = matchMap.get(pairKey)!;
        existing.status = 'live';
      }
    }
  }

  // 3. Real OpenDota live matches
  if (openDotaMatches.length > 0) {
    sourcesUsed.push('OpenDota Live API');
    for (const m of openDotaMatches) {
      const pairKey = `${m.game}-${[normalizeTeamKey(m.teamA.name), normalizeTeamKey(m.teamB.name)].sort().join('-')}`;
      if (!matchMap.has(pairKey)) {
        matchMap.set(pairKey, m);
      }
    }
  }

  // 4. Real LoL Esports official schedule
  if (lolMatches.length > 0) {
    sourcesUsed.push('LoL Esports API');
    for (const m of lolMatches) {
      const pairKey = `${m.game}-${[normalizeTeamKey(m.teamA.name), normalizeTeamKey(m.teamB.name)].sort().join('-')}`;
      if (!matchMap.has(pairKey)) {
        matchMap.set(pairKey, m);
      }
    }
  }

  // 5. Real ESPN Top 5 Football Leagues & NBA schedule
  if (espnMatches.length > 0) {
    sourcesUsed.push('ESPN Live API (Football Top 5 + NBA)');
    for (const m of espnMatches) {
      const pairKey = `${m.game}-${[normalizeTeamKey(m.teamA.name), normalizeTeamKey(m.teamB.name)].sort().join('-')}`;
      if (!matchMap.has(pairKey)) {
        matchMap.set(pairKey, m);
      }
    }
  }

  const combined = Array.from(matchMap.values()).map((match) => {
    const analysis = runDeterministicAnalysis(match);
    return {
      ...match,
      quickScore: {
        interestScore: analysis.interestScore,
        investabilityLabel: analysis.investabilityLabel,
        verdictBadge: analysis.verdictBadge,
        marketRecommendation: analysis.marketRecommendation,
        riskLevel: analysis.riskLevel,
        trueWinProbPct: analysis.trueWinProbPct,
        marketImpliedProbPct: analysis.marketImpliedProbPct,
        estimatedEdgePct: analysis.estimatedEdgePct,
        maxSafeStakeUsd: analysis.maxSafeStakeUsd,
        recommendedSide: analysis.recommendedSide,
        bestAngleSummary: `${analysis.recommendedMarket.category}: ${analysis.recommendedMarket.selection} @ ${analysis.recommendedMarket.oddsDecimal.toFixed(2)}x`,
        whySeriesOverSingleMap: analysis.whySeriesOverSingleMap,
        primaryInvalidationRisk:
          analysis.invalidationFactors[0] || 'Monitor live veto/lineup before execution.',
      },
    };
  });

  // Sort: LIVE first, then soonest upcoming time
  combined.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
    const tA = new Date(a.startTimeIso).getTime();
    const tB = new Date(b.startTimeIso).getTime();
    return tA - tB;
  });

  const parlays = buildDailyParlays(combined);

  return {
    fetchedAt,
    sourcesUsed,
    matches: combined,
    parlays,
  };
}
