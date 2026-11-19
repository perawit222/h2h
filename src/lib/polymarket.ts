import {
  AnomalyAlert,
  AnomalyTag,
  GameTitle,
  MarketCategory,
  MatchFormat,
  PricePoint,
  RadarResponse,
  SubMarketSnapshot,
} from '@/types/esports';

const GAMMA_BASE =
  process.env.POLYMARKET_GAMMA_URL?.replace(/\/$/, '') || 'https://gamma-api.polymarket.com';

interface GammaMarketRaw {
  id?: string;
  question?: string;
  slug?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  volume?: string | number;
  volumeNum?: number;
  volume24hr?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  oneDayPriceChange?: number;
  oneHourPriceChange?: number;
  endDate?: string;
  gameStartTime?: string;
  active?: boolean;
  closed?: boolean;
  groupItemTitle?: string;
}

interface GammaEventRaw {
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  startTime?: string;
  endDate?: string;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  markets?: GammaMarketRaw[];
  tags?: { label?: string; slug?: string }[];
}

const GAME_MATCHERS: { game: GameTitle; patterns: RegExp[] }[] = [
  {
    game: 'CS2',
    patterns: [
      /counter-strike/i,
      /\bcs2\b/i,
      /\bcs:go\b/i,
      /\bblast\b.*\b(premier|open|rivals|bounty)\b/i,
      /\besl\s+pro\s+league\b/i,
      /\biem\b/i,
      /\bcct\b/i,
    ],
  },
  {
    game: 'Valorant',
    patterns: [/\bvalorant\b/i, /\bvct\b/i, /\bchallengers\b.*\bvalorant\b/i],
  },
  {
    game: 'LoL',
    patterns: [
      /\blol:/i,
      /league\s+of\s+legends/i,
      /\blck\b/i,
      /\blpl\b/i,
      /\blec\b/i,
      /\blcs\b/i,
    ],
  },
  {
    game: 'Dota 2',
    patterns: [/\bdota\s*2?\b/i, /\bdreamleague\b/i, /\bblast\s+slam\b/i, /\bwallachia\b/i],
  },
  {
    game: 'NBA',
    patterns: [
      /\bnba\b/i,
      /\b(lakers|celtics|warriors|knicks|bucks|nuggets|suns|mavericks|thunder|cavaliers|timberwolves|clippers|heat|76ers|sixers|pacers|magic|hawks|bulls|nets|pistons|pelicans|wizards|raptors|rockets|spurs|grizzlies|kings|blazers|jazz|hornets)\b/i,
    ],
  },
  {
    game: 'Tennis',
    patterns: [
      /\btennis\b/i,
      /\batp\b/i,
      /\bwta\b/i,
      /\bgrand\s+slam\b/i,
      /\bwimbledon\b/i,
      /\broland\s+garros\b/i,
      /\bus\s+open\b/i,
      /\baustralian\s+open\b/i,
    ],
  },
  {
    game: 'Football',
    patterns: [
      /premier\s+league/i,
      /la\s+liga/i,
      /bundesliga/i,
      /serie\s+a/i,
      /ligue\s+1/i,
      /\bsoccer\b/i,
      /\bfootball\b/i,
      /\b(fc|cf|ac|sc|united|arsenal|chelsea|liverpool|barcelona|real\s+madrid|bayern|psg|juventus|inter|milan)\b/i,
    ],
  },
];

const TIER1_REGEX =
  /(pgl\s+major|iem\s+(katowice|cologne|dallas|rio|chengdu)|blast\s+(premier|world|slam)|esl\s+pro\s+league|vct\s+(americas|emea|pacific|cn|masters|champions)|lck\b|lpl\b|lec\b|the\s+international|dreamleague|esl\s+one|premier\s+league|la\s+liga|bundesliga|serie\s+a|ligue\s+1|\bnba\b|\batp\b|\bwta\b)/i;

function detectGame(text: string, tags?: { label?: string; slug?: string }[]): GameTitle | null {
  const tagText = (tags || []).map((t) => `${t.label || ''} ${t.slug || ''}`).join(' ');
  const combined = `${text} ${tagText}`;
  for (const matcher of GAME_MATCHERS) {
    if (matcher.patterns.some((re) => re.test(combined))) {
      return matcher.game;
    }
  }
  return null;
}

function parseJsonArray(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function classifyMarket(question: string): MarketCategory {
  if (/map\s+\d+\s+winner/i.test(question) || /game\s+\d+\s+winner/i.test(question)) {
    return 'Map Winner';
  }
  if (/handicap|o\/u|over\/under|total/i.test(question)) {
    return 'Handicap / Total';
  }
  if (/vs\.?/i.test(question)) {
    return 'Match Winner';
  }
  return 'Other';
}

function parseEventMeta(
  title: string,
  game: GameTitle,
  tags?: { label?: string; slug?: string }[]
): {
  cleanMatch: string;
  tournament: string;
  format: MatchFormat;
  teamA?: string;
  teamB?: string;
} {
  const stripped = title
    .replace(/^(Counter-Strike|CS2|Valorant|Dota 2|LoL|League of Legends|NBA|ATP|WTA):\s*/i, '')
    .trim();

  let format: MatchFormat = 'Bo3';
  if (game === 'Football') format = '90m';
  else if (game === 'NBA') format = '4Q';
  else if (game === 'Tennis') format = 'Sets';
  else if (/\(BO5\)/i.test(stripped)) format = 'Bo5';
  else if (/\(BO1\)/i.test(stripped)) format = 'Bo1';

  // Handle "ATP World Tour Finals, Group: Player A vs Player B"
  let matchPart = stripped;
  let tournament = '';
  if (stripped.includes(':') && !stripped.includes(' - ')) {
    const idx = stripped.indexOf(':');
    tournament = stripped.slice(0, idx).trim();
    matchPart = stripped.slice(idx + 1).trim();
  } else {
    const parts = stripped.split(/\s+-\s+/);
    matchPart = parts[0].replace(/\(BO[135]\)/gi, '').trim();
    tournament = parts.slice(1).join(' - ').trim();
  }

  if (!tournament) {
    const tagStr = (tags || []).map((t) => t.label || '').join(' ');
    if (/premier league/i.test(tagStr)) tournament = 'Premier League';
    else if (/la liga/i.test(tagStr)) tournament = 'La Liga';
    else if (/bundesliga/i.test(tagStr)) tournament = 'Bundesliga';
    else if (/serie a/i.test(tagStr)) tournament = 'Serie A';
    else if (/ligue 1/i.test(tagStr)) tournament = 'Ligue 1';
    else if (game === 'NBA') tournament = 'NBA Regular Season';
    else if (game === 'Tennis') tournament = 'ATP / WTA Tour';
    else if (game === 'Football') tournament = 'Top 5 European Football';
    else tournament = `${game} Pro Match`;
  }

  const vsSplit = matchPart.split(/\s+vs\.?\s+/i);
  const teamA = vsSplit[0]?.trim();
  const teamB = vsSplit[1]?.trim();

  return {
    cleanMatch: teamA && teamB ? `${teamA} vs ${teamB}` : matchPart,
    tournament,
    format,
    teamA,
    teamB,
  };
}

function normalizeIso(raw?: string): string | undefined {
  if (!raw) return undefined;
  // Convert "2026-11-19 11:30:00+00" -> "2026-11-19T11:30:00Z"
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T').replace(/\+00$/, 'Z');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function buildSyntheticTrend(currentProb: number, change24h: number, change1h: number): PricePoint[] {
  const clamp = (v: number) => Math.max(0.02, Math.min(0.98, Number(v.toFixed(3))));
  const p24 = clamp(currentProb - change24h);
  const p12 = clamp(p24 + change24h * 0.35);
  const p6 = clamp(p24 + change24h * 0.6);
  const p2 = clamp(currentProb - change1h * 1.2);
  const p1 = clamp(currentProb - change1h);

  return [
    { time: '-24h', prob: Math.round(p24 * 100) },
    { time: '-12h', prob: Math.round(p12 * 100) },
    { time: '-6h', prob: Math.round(p6 * 100) },
    { time: '-2h', prob: Math.round(p2 * 100) },
    { time: '-1h', prob: Math.round(p1 * 100) },
    { time: 'Now', prob: Math.round(currentProb * 100) },
  ];
}

function scoreEventAnomaly(params: {
  eventTitle: string;
  outcome: string;
  impliedProb: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  change24h: number;
  change1h: number;
  category: MarketCategory;
}): {
  suspicionScore: number;
  severity: 'critical' | 'elevated' | 'watch';
  tags: AnomalyTag[];
  tier: 'Tier 1' | 'Lower Tier (T2/T3)';
  reasonSummary: string;
} {
  const { eventTitle, outcome, impliedProb, volume24h, totalVolume, liquidity, change24h, change1h, category } =
    params;

  const isTier1 = TIER1_REGEX.test(eventTitle);
  const tier: 'Tier 1' | 'Lower Tier (T2/T3)' = isTier1 ? 'Tier 1' : 'Lower Tier (T2/T3)';

  const abs24h = Math.abs(change24h);
  const abs1h = Math.abs(change1h);
  const volToLiq = liquidity > 0 ? volume24h / liquidity : volume24h > 2000 ? 3.5 : 0;
  const volShare24h = totalVolume > 0 ? volume24h / totalVolume : 0;

  let score = 20;
  const tags: AnomalyTag[] = [];
  const reasons: string[] = [];

  if (abs1h >= 0.05 || abs24h >= 0.08) {
    const swingPoints = Math.min(34, Math.round(abs24h * 145 + abs1h * 160));
    score += swingPoints;
    tags.push('Odds Swing');
    const pct = Number(((abs1h >= 0.05 ? change1h : change24h) * 100).toFixed(1));
    reasons.push(
      `${pct >= 0 ? `+${pct}%` : `${pct}%`} probability swing on ${outcome} (${category})`
    );
  }

  if ((volume24h >= 3000 && volToLiq >= 1.2) || volume24h >= 15000) {
    const spikePoints = Math.min(28, Math.round(volToLiq * 9 + (volume24h >= 25000 ? 12 : 4)));
    score += spikePoints;
    tags.push('Volume Spike');
    reasons.push(
      `$${Math.round(volume24h).toLocaleString()} 24h inflow (${volToLiq.toFixed(1)}x liquidity)`
    );
  } else if (volume24h >= 1500 && volShare24h >= 0.7) {
    score += 10;
    tags.push('Volume Spike');
  }

  if (!isTier1 && (volume24h >= 1500 || abs24h >= 0.07)) {
    score += 18;
    tags.push('Low-Tier Anomaly');
    if (reasons.length === 0) {
      reasons.push(`Elevated T2/T3 betting activity ($${Math.round(volume24h).toLocaleString()} 24h vol)`);
    }
  }

  if (impliedProb <= 0.4 && (change24h >= 0.05 || change1h >= 0.03)) {
    score += 16;
    tags.push('Underdog Drift');
    reasons.push(`Underdog (${Math.round(impliedProb * 100)}%) drawing sharp buy pressure`);
  }

  if (liquidity > 0 && liquidity < 6000 && volume24h > 1500) {
    score += 9;
    tags.push('Thin Liquidity');
  }

  if (tags.length === 0) {
    tags.push('Sharp Action');
    reasons.push(`Active live order-book ($${Math.round(volume24h).toLocaleString()} 24h vol)`);
  }

  const finalScore = Math.max(15, Math.min(98, Math.round(score)));
  const severity: 'critical' | 'elevated' | 'watch' =
    finalScore >= 70 ? 'critical' : finalScore >= 48 ? 'elevated' : 'watch';

  return {
    suspicionScore: finalScore,
    severity,
    tags: Array.from(new Set(tags)).slice(0, 3),
    tier,
    reasonSummary: reasons[0],
  };
}

async function fetchGammaEvents(url: string): Promise<GammaEventRaw[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      next: { revalidate: 120 },
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'H2H-Esports-Terminal/1.0',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function getFallbackAlerts(): AnomalyAlert[] {
  const inHours = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();
  return [
    {
      id: 'fb-cs2-1',
      eventId: 'fb-ev-1',
      marketId: 'fb-m-1',
      eventTitle: 'Counter-Strike: B8 vs Monte (BO3) - CCT Europe Series',
      matchName: 'B8 vs Monte',
      tournament: 'CCT Europe Series',
      format: 'Bo3',
      game: 'CS2',
      teamA: 'B8',
      teamB: 'Monte',
      outcome: 'B8',
      opponentOutcome: 'Monte',
      marketCategory: 'Match Winner',
      volume24h: 64200,
      totalVolume: 78500,
      liquidity: 12400,
      impliedOdds: 0.36,
      decimalOdds: 2.78,
      opponentImpliedOdds: 0.64,
      opponentDecimalOdds: 1.56,
      priceChange24h: 0.16,
      priceChange1h: 0.08,
      suspicionScore: 88,
      severity: 'critical',
      tags: ['Low-Tier Anomaly', 'Volume Spike', 'Underdog Drift'],
      reasonSummary: '+16.0% probability swing on B8 (Match Winner) with 5.2x liquidity turnover.',
      polymarketUrl: 'https://polymarket.com/sports/esports',
      startTimeIso: inHours(2),
      endDate: inHours(5),
      trend: buildSyntheticTrend(0.36, 0.16, 0.08),
      tier: 'Lower Tier (T2/T3)',
      subMarkets: [],
    },
  ];
}

export async function fetchPolymarketEsportsRadar(): Promise<RadarResponse> {
  const fetchedAt = new Date().toISOString();
  // Look from yesterday UTC so currently LIVE matches that started a few hours ago are included
  const minDate = new Date(Date.now() - 18 * 3600 * 1000).toISOString().slice(0, 10);

  const endpoints = [
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=esports&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=25`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=counter-strike-2&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=15`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=dota-2&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=15`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=valorant&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=15`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=nba&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=6`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=tennis&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=12`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=premier-league&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=10`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=la-liga&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=8`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=bundesliga&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=8`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=ligue-1&end_date_min=${minDate}&order=volume24hr&ascending=false&limit=8`,
  ];

  const results = await Promise.all(endpoints.map(fetchGammaEvents));
  const eventMap = new Map<string, GammaEventRaw>();
  for (const batch of results) {
    for (const ev of batch) {
      if (ev.id && !eventMap.has(ev.id)) {
        eventMap.set(ev.id, ev);
      }
    }
  }

  const allEvents = Array.from(eventMap.values());
  const alerts: AnomalyAlert[] = [];
  let totalMarketsScanned = 0;

  for (const ev of allEvents) {
    const evTitle = ev.title || '';
    // Keep strictly real head-to-head match events ("vs" or "vs.") and skip Exact Score / More Markets clutter
    if (!/\bvs\.?\b/i.test(evTitle)) continue;
    if (/(exact score|more markets)/i.test(evTitle)) continue;

    const game = detectGame(`${evTitle} ${ev.description || ''}`, ev.tags);
    if (!game) continue;

    const meta = parseEventMeta(evTitle, game, ev.tags);
    const rawMarkets = (ev.markets || []).filter((m) => !m.closed);
    if (rawMarkets.length === 0) continue;

    const subMarkets: SubMarketSnapshot[] = [];
    let bestStartTime = normalizeIso(ev.startTime);

    // Special handling for 3-way Football markets ("Will Arsenal win?" Yes/No + "Will Newcastle win?" Yes/No)
    const yesNoWinMarkets = rawMarkets.filter((m) => {
      const outs = parseJsonArray(m.outcomes);
      return outs.length === 2 && outs[0] === 'Yes' && outs[1] === 'No' && /will .+ win/i.test(m.question || '');
    });

    if (game === 'Football' && yesNoWinMarkets.length >= 2 && meta.teamA && meta.teamB) {
      const mA = yesNoWinMarkets.find((m) =>
        (m.question || '').toLowerCase().includes(meta.teamA!.toLowerCase().split(' ')[0])
      ) || yesNoWinMarkets[0];
      const mB = yesNoWinMarkets.find((m) => m.id !== mA.id) || yesNoWinMarkets[1];
      const pA = Math.max(0.05, Math.min(0.95, Number(parseJsonArray(mA.outcomePrices)[0]) || 0.45));
      const pB = Math.max(0.05, Math.min(0.95, Number(parseJsonArray(mB.outcomePrices)[0]) || 0.35));
      if (!bestStartTime && mA.gameStartTime) bestStartTime = normalizeIso(mA.gameStartTime);

      subMarkets.push({
        id: String(mA.id || ev.id),
        question: `Match Winner (90m): ${meta.teamA} vs ${meta.teamB}`,
        category: 'Match Winner',
        teamA: meta.teamA,
        teamB: meta.teamB,
        probA: pA,
        probB: pB,
        oddsA: Number((1 / pA).toFixed(2)),
        oddsB: Number((1 / pB).toFixed(2)),
        volume24h: (Number(mA.volume24hr ?? 0) || 0) + (Number(mB.volume24hr ?? 0) || 0),
        totalVolume: (Number(mA.volumeNum ?? 0) || 0) + (Number(mB.volumeNum ?? 0) || 0),
        liquidity: (Number(mA.liquidityNum ?? 0) || 0) + (Number(mB.liquidityNum ?? 0) || 0),
        priceChange24h: Number(mA.oneDayPriceChange ?? 0) || 0,
        priceChange1h: Number(mA.oneHourPriceChange ?? 0) || 0,
      });
    }

    for (const m of rawMarkets) {
      totalMarketsScanned++;
      const outcomes = parseJsonArray(m.outcomes);
      const prices = parseJsonArray(m.outcomePrices).map(Number);
      if (outcomes.length < 2 || !Number.isFinite(prices[0]) || !Number.isFinite(prices[1])) {
        continue;
      }
      // Skip raw Yes/No sub-markets if we already synthesized the clean Football H2H market
      if (game === 'Football' && outcomes[0] === 'Yes' && outcomes[1] === 'No' && subMarkets.length > 0) {
        continue;
      }

      if (!bestStartTime && m.gameStartTime) {
        bestStartTime = normalizeIso(m.gameStartTime);
      }

      const pA = Math.max(0.01, Math.min(0.99, prices[0]));
      const pB = Math.max(0.01, Math.min(0.99, prices[1]));
      const q = m.question || evTitle;

      subMarkets.push({
        id: String(m.id || Math.random()),
        question: q,
        category: classifyMarket(q),
        teamA: outcomes[0],
        teamB: outcomes[1],
        probA: pA,
        probB: pB,
        oddsA: Number((1 / pA).toFixed(2)),
        oddsB: Number((1 / pB).toFixed(2)),
        volume24h: Number(m.volume24hr ?? 0) || 0,
        totalVolume: Number(m.volumeNum ?? m.volume ?? 0) || 0,
        liquidity: Number(m.liquidityNum ?? m.liquidity ?? 0) || 0,
        priceChange24h: Number(m.oneDayPriceChange ?? 0) || 0,
        priceChange1h: Number(m.oneHourPriceChange ?? 0) || 0,
      });
    }

    if (subMarkets.length === 0) continue;

    // Sort sub-markets: Match Winner first, then Map Winner, then highest 24h volume
    subMarkets.sort((a, b) => {
      const catRank = (c: MarketCategory) =>
        c === 'Match Winner' ? 0 : c === 'Map Winner' ? 1 : c === 'Handicap / Total' ? 2 : 3;
      const diff = catRank(a.category) - catRank(b.category);
      return diff !== 0 ? diff : b.volume24h - a.volume24h;
    });

    // Primary market for headline display: prefer Match Winner, else highest volume team market
    const primary =
      subMarkets.find((s) => s.category === 'Match Winner') ||
      subMarkets.find((s) => s.category === 'Map Winner') ||
      subMarkets[0];

    // Also find sharpest anomaly across all sub-markets (e.g. a Map 1 Winner or Handicap swing)
    const sharpest = subMarkets.reduce((best, cur) =>
      Math.abs(cur.priceChange24h) + Math.abs(cur.priceChange1h) >
      Math.abs(best.priceChange24h) + Math.abs(best.priceChange1h)
        ? cur
        : best
    , primary);

    // Pick which side moved positively (or the leading side if no swing)
    const teamAMovedUp = sharpest.priceChange24h >= 0;
    const flaggedOutcome = teamAMovedUp ? primary.teamA : primary.teamB;
    const opponentOutcome = teamAMovedUp ? primary.teamB : primary.teamA;
    const flaggedProb = teamAMovedUp ? primary.probA : primary.probB;
    const opponentProb = teamAMovedUp ? primary.probB : primary.probA;
    const effectiveChange24h = teamAMovedUp ? sharpest.priceChange24h : -sharpest.priceChange24h;
    const effectiveChange1h = teamAMovedUp ? sharpest.priceChange1h : -sharpest.priceChange1h;

    const eventVol24h =
      Number(ev.volume24hr ?? 0) || subMarkets.reduce((acc, s) => acc + s.volume24h, 0);
    const eventTotalVol =
      Number(ev.volume ?? 0) || subMarkets.reduce((acc, s) => acc + s.totalVolume, 0);
    const eventLiquidity =
      Number(ev.liquidity ?? 0) || subMarkets.reduce((acc, s) => acc + s.liquidity, 0);

    const analysis = scoreEventAnomaly({
      eventTitle: evTitle,
      outcome: flaggedOutcome,
      impliedProb: flaggedProb,
      volume24h: eventVol24h,
      totalVolume: eventTotalVol,
      liquidity: eventLiquidity,
      change24h: effectiveChange24h,
      change1h: effectiveChange1h,
      category: sharpest.category,
    });

    const polymarketUrl = ev.slug
      ? `https://polymarket.com/event/${ev.slug}`
      : 'https://polymarket.com/sports/esports';

    alerts.push({
      id: `pm-ev-${ev.id}`,
      eventId: String(ev.id),
      marketId: primary.id,
      eventTitle: evTitle,
      matchName: meta.cleanMatch,
      tournament: meta.tournament,
      format: meta.format,
      game,
      teamA: primary.teamA,
      teamB: primary.teamB,
      outcome: flaggedOutcome,
      opponentOutcome,
      marketCategory: sharpest.category,
      volume24h: eventVol24h,
      totalVolume: eventTotalVol,
      liquidity: eventLiquidity,
      impliedOdds: flaggedProb,
      decimalOdds: Number((1 / flaggedProb).toFixed(2)),
      opponentImpliedOdds: opponentProb,
      opponentDecimalOdds: Number((1 / opponentProb).toFixed(2)),
      priceChange24h: effectiveChange24h,
      priceChange1h: effectiveChange1h,
      suspicionScore: analysis.suspicionScore,
      severity: analysis.severity,
      tags: analysis.tags,
      reasonSummary: analysis.reasonSummary,
      polymarketUrl,
      startTimeIso: bestStartTime || normalizeIso(ev.endDate),
      endDate: normalizeIso(ev.endDate),
      trend: buildSyntheticTrend(flaggedProb, effectiveChange24h, effectiveChange1h),
      tier: analysis.tier,
      subMarkets,
    });
  }

  if (alerts.length > 0) {
    alerts.sort((a, b) => b.suspicionScore - a.suspicionScore || b.volume24h - a.volume24h);
    return {
      source: 'live',
      fetchedAt,
      totalMarketsScanned,
      totalEventsScanned: alerts.length,
      flaggedCount: alerts.filter((a) => a.suspicionScore >= 48).length,
      alerts: alerts.slice(0, 80),
    };
  }

  const fallback = getFallbackAlerts();
  return {
    source: 'fallback',
    fetchedAt,
    totalMarketsScanned: fallback.length,
    totalEventsScanned: fallback.length,
    flaggedCount: fallback.length,
    alerts: fallback,
    note: 'Polymarket Gamma API returned 0 active H2H esports matches or timed out. Showing fallback mode.',
  };
}
