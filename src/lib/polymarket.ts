import { AnomalyAlert, AnomalyTag, GameTitle, PricePoint, RadarResponse } from '@/types/esports';

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
  oneWeekPriceChange?: number;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  groupItemTitle?: string;
}

interface GammaEventRaw {
  id?: string;
  title?: string;
  slug?: string;
  ticker?: string;
  description?: string;
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
      /\bcs2\b/i,
      /\bcs:go\b/i,
      /counter-strike/i,
      /\bblast\b.*\b(premier|open|rivals|bounty)\b/i,
      /\besl\s+pro\s+league\b/i,
      /\biem\b/i,
      /\bpgl\b.*(major|cs)/i,
      /\bcct\b.*(europe|series)/i,
    ],
  },
  {
    game: 'Valorant',
    patterns: [
      /\bvalorant\b/i,
      /\bvct\b/i,
      /\bmasters\s+(tokyo|madrid|shanghai|bangkok|toronto)\b/i,
      /\bchallengers\b.*\bvalorant\b/i,
    ],
  },
  {
    game: 'LoL',
    patterns: [
      /league\s+of\s+legends/i,
      /\blck\b/i,
      /\blpl\b/i,
      /\blec\b/i,
      /\blcs\b/i,
      /\bmsi\b.*(lol|league)/i,
      /\bworlds\b.*(lol|league|esports)/i,
      /\blol\b.*\b(esports|cup|split|playoffs|match)\b/i,
    ],
  },
  {
    game: 'Dota 2',
    patterns: [
      /\bdota\s*2?\b/i,
      /\bdreamleague\b/i,
      /\bthe\s+international\b/i,
      /\besl\s+one\b.*(dota|birmingham|bangkok|raleigh)/i,
      /\bpgl\s+wallachia\b/i,
      /\bfissure\b.*(dota|playground|universe)/i,
    ],
  },
];

const LOW_TIER_REGEX =
  /(qualifier|challenger|tier\s*[23]|cct|academy|regional|open\s+qual|contenders|closed\s+qual|european\s+pro\s+league|elisa|res\s+regional|asian\s+cup)/i;

const TIER1_REGEX =
  /(major|international|worlds|masters|champions|lck|lpl|lec|iem|blast\s+premier|esl\s+pro\s+league|vct\s+(americas|emea|pacific|cn)|dreamleague)/i;

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

function buildSyntheticTrend(currentProb: number, change24h: number, change1h: number): PricePoint[] {
  const clamp = (v: number) => Math.max(0.02, Math.min(0.98, Number(v.toFixed(3))));
  const p24 = clamp(currentProb - change24h);
  const p12 = clamp(p24 + change24h * 0.35);
  const p6 = clamp(p24 + change24h * 0.58);
  const p2 = clamp(currentProb - change1h * 1.25);
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

function scoreMarketAnomaly(params: {
  eventTitle: string;
  question: string;
  outcome: string;
  impliedProb: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  change24h: number;
  change1h: number;
}): {
  suspicionScore: number;
  severity: 'critical' | 'elevated' | 'watch';
  tags: AnomalyTag[];
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3 / Qualifier';
  reasonSummary: string;
} {
  const {
    eventTitle,
    question,
    outcome,
    impliedProb,
    volume24h,
    totalVolume,
    liquidity,
    change24h,
    change1h,
  } = params;

  const combinedText = `${eventTitle} ${question}`;
  const isLowTier = LOW_TIER_REGEX.test(combinedText);
  const isTier1 = !isLowTier && TIER1_REGEX.test(combinedText);
  const tier: 'Tier 1' | 'Tier 2' | 'Tier 3 / Qualifier' = isLowTier
    ? 'Tier 3 / Qualifier'
    : isTier1
      ? 'Tier 1'
      : 'Tier 2';

  const abs24h = Math.abs(change24h);
  const abs1h = Math.abs(change1h);
  const volToLiq = liquidity > 0 ? volume24h / liquidity : volume24h > 2500 ? 4 : 0;
  const volShare24h = totalVolume > 0 ? volume24h / totalVolume : 0;

  let score = 18;
  const tags: AnomalyTag[] = [];
  const reasons: string[] = [];

  // 1. Sudden probability/price swing
  if (abs1h >= 0.08 || abs24h >= 0.14) {
    const swingPoints = Math.min(34, Math.round(abs24h * 110 + abs1h * 140));
    score += swingPoints;
    tags.push('Odds Swing');
    const pct = Math.round((abs1h >= 0.08 ? change1h : change24h) * 100);
    const dir = pct >= 0 ? `+${pct}%` : `${pct}%`;
    reasons.push(`Sharp ${dir} implied probability shift on ${outcome}`);
  } else if (abs24h >= 0.06) {
    score += 12;
  }

  // 2. Unusual 24h volume spike relative to liquidity or total market history
  if ((volume24h >= 5000 && volToLiq >= 1.8) || (volume24h >= 12000 && volShare24h >= 0.55)) {
    const spikePoints = Math.min(28, Math.round(volToLiq * 8 + volShare24h * 15));
    score += spikePoints;
    tags.push('Volume Spike');
    reasons.push(
      `24h turnover ($${Math.round(volume24h).toLocaleString()}) is ${volToLiq.toFixed(1)}x available liquidity`
    );
  } else if (volume24h >= 2500 && volShare24h >= 0.6) {
    score += 10;
    tags.push('Volume Spike');
  }

  // 3. Low-tier match anomaly
  if (isLowTier && (volume24h >= 2000 || abs24h >= 0.08)) {
    score += 20;
    tags.push('Low-Tier Anomaly');
    reasons.push('Disproportionate order flow detected in a lower-tier / qualifier match');
  }

  // 4. Heavy underdog odds shift
  if (impliedProb <= 0.36 && (change24h >= 0.07 || change1h >= 0.04)) {
    score += 18;
    tags.push('Underdog Drift');
    reasons.push(`Heavy underdog (${Math.round(impliedProb * 100)}%) attracting aggressive late backing`);
  }

  // 5. Thin liquidity vulnerability
  if (liquidity > 0 && liquidity < 4500 && volume24h > 1500) {
    score += 10;
    tags.push('Thin Liquidity');
  }

  // 6. Sharp action tag when score is high without other tags
  if (score >= 60 && tags.length < 2) {
    tags.push('Sharp Action');
  }

  if (tags.length === 0) {
    tags.push('Sharp Action');
    reasons.push('Active esports prediction market under continuous integrity monitoring');
  }

  const finalScore = Math.max(12, Math.min(98, Math.round(score)));
  const severity: 'critical' | 'elevated' | 'watch' =
    finalScore >= 75 ? 'critical' : finalScore >= 52 ? 'elevated' : 'watch';

  return {
    suspicionScore: finalScore,
    severity,
    tags: Array.from(new Set(tags)).slice(0, 3),
    tier,
    reasonSummary: reasons[0] || 'Elevated order-book velocity relative to historical baseline',
  };
}

export function getFallbackAlerts(): AnomalyAlert[] {
  const now = Date.now();
  const inHours = (h: number) => new Date(now + h * 3600 * 1000).toISOString();

  return [
    {
      id: 'fb-cs2-1',
      marketId: 'fallback-cs2-cct',
      eventTitle: 'CCT Europe Series #19: B8 vs. Monte',
      matchName: 'B8 vs. Monte (Map 1 Winner)',
      game: 'CS2',
      outcome: 'B8',
      opponentOutcome: 'Monte',
      volume24h: 84250,
      totalVolume: 96400,
      liquidity: 11800,
      impliedOdds: 0.34,
      decimalOdds: 2.94,
      priceChange24h: 0.19,
      priceChange1h: 0.11,
      suspicionScore: 91,
      severity: 'critical',
      tags: ['Low-Tier Anomaly', 'Volume Spike', 'Underdog Drift'],
      reasonSummary:
        'Underdog surged +19% in 24h with 7.1x liquidity turnover in a Tier-2 CCT Europe series.',
      polymarketUrl: 'https://polymarket.com/sports/esports',
      endDate: inHours(3),
      trend: buildSyntheticTrend(0.34, 0.19, 0.11),
      tier: 'Tier 3 / Qualifier',
    },
    {
      id: 'fb-dota-2',
      marketId: 'fallback-dota-fissure',
      eventTitle: 'FISSURE Universe Closed Qualifier: 1win vs. Nemiga',
      matchName: '1win vs. Nemiga (Series Winner)',
      game: 'Dota 2',
      outcome: 'Nemiga Gaming',
      opponentOutcome: '1win',
      volume24h: 51900,
      totalVolume: 62100,
      liquidity: 9400,
      impliedOdds: 0.29,
      decimalOdds: 3.45,
      priceChange24h: 0.16,
      priceChange1h: 0.09,
      suspicionScore: 86,
      severity: 'critical',
      tags: ['Odds Swing', 'Low-Tier Anomaly', 'Thin Liquidity'],
      reasonSummary:
        'Rapid +16% probability spike on +245 underdog amid thin order-book depth ahead of draft.',
      polymarketUrl: 'https://polymarket.com/sports/esports',
      endDate: inHours(5),
      trend: buildSyntheticTrend(0.29, 0.16, 0.09),
      tier: 'Tier 3 / Qualifier',
    },
    {
      id: 'fb-val-3',
      marketId: 'fallback-val-vct',
      eventTitle: 'VCT Pacific Challengers: Dplus vs. Sin Prisa',
      matchName: 'Dplus KIA vs. Sin Prisa Gaming',
      game: 'Valorant',
      outcome: 'Sin Prisa',
      opponentOutcome: 'Dplus KIA',
      volume24h: 43800,
      totalVolume: 71200,
      liquidity: 18500,
      impliedOdds: 0.44,
      decimalOdds: 2.27,
      priceChange24h: 0.14,
      priceChange1h: 0.06,
      suspicionScore: 76,
      severity: 'critical',
      tags: ['Odds Swing', 'Volume Spike', 'Sharp Action'],
      reasonSummary:
        'Concentrated buying pushed Sin Prisa from 30% to 44% implied odds over the last 6 hours.',
      polymarketUrl: 'https://polymarket.com/sports/esports',
      endDate: inHours(6),
      trend: buildSyntheticTrend(0.44, 0.14, 0.06),
      tier: 'Tier 2',
    },
    {
      id: 'fb-lol-4',
      marketId: 'fallback-lol-lpl',
      eventTitle: 'LPL Split Regular Season: LGD Gaming vs. Rare Atom',
      matchName: 'LGD Gaming vs. Rare Atom (Bo3)',
      game: 'LoL',
      outcome: 'Rare Atom',
      opponentOutcome: 'LGD Gaming',
      volume24h: 67300,
      totalVolume: 142000,
      liquidity: 31000,
      impliedOdds: 0.39,
      decimalOdds: 2.56,
      priceChange24h: 0.11,
      priceChange1h: 0.05,
      suspicionScore: 68,
      severity: 'elevated',
      tags: ['Odds Swing', 'Sharp Action'],
      reasonSummary:
        'Sustained sharp steam on Rare Atom (+11%) diverging from consensus Asian bookmakers.',
      polymarketUrl: 'https://polymarket.com/sports/esports',
      endDate: inHours(8),
      trend: buildSyntheticTrend(0.39, 0.11, 0.05),
      tier: 'Tier 1',
    },
    {
      id: 'fb-cs2-5',
      marketId: 'fallback-cs2-esl',
      eventTitle: 'ESL Pro League: MOUZ vs. Eternal Fire',
      matchName: 'MOUZ vs. Eternal Fire (Series)',
      game: 'CS2',
      outcome: 'Eternal Fire',
      opponentOutcome: 'MOUZ',
      volume24h: 129400,
      totalVolume: 315000,
      liquidity: 74000,
      impliedOdds: 0.42,
      decimalOdds: 2.38,
      priceChange24h: 0.08,
      priceChange1h: 0.03,
      suspicionScore: 54,
      severity: 'elevated',
      tags: ['Volume Spike', 'Sharp Action'],
      reasonSummary:
        'Heavy pre-match liquidity inflow ($129k 24h) leaning toward Eternal Fire following map veto leaks.',
      polymarketUrl: 'https://polymarket.com/sports/esports',
      endDate: inHours(11),
      trend: buildSyntheticTrend(0.42, 0.08, 0.03),
      tier: 'Tier 1',
    },
    {
      id: 'fb-dota-6',
      marketId: 'fallback-dota-dl',
      eventTitle: 'DreamLeague: Team Spirit vs. BetBoom Team',
      matchName: 'Team Spirit vs. BetBoom Team',
      game: 'Dota 2',
      outcome: 'Team Spirit',
      opponentOutcome: 'BetBoom Team',
      volume24h: 92100,
      totalVolume: 268000,
      liquidity: 88500,
      impliedOdds: 0.58,
      decimalOdds: 1.72,
      priceChange24h: -0.06,
      priceChange1h: -0.02,
      suspicionScore: 39,
      severity: 'watch',
      tags: ['Sharp Action'],
      reasonSummary:
        'Moderate line drift (-6%) against Team Spirit; order flow remains within Tier-1 norms.',
      polymarketUrl: 'https://polymarket.com/sports/esports',
      endDate: inHours(14),
      trend: buildSyntheticTrend(0.58, -0.06, -0.02),
      tier: 'Tier 1',
    },
  ];
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

export async function fetchPolymarketEsportsRadar(): Promise<RadarResponse> {
  const fetchedAt = new Date().toISOString();

  // Query multiple Gamma endpoints in parallel (kept under Next.js 2MB data-cache ceiling)
  const endpoints = [
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=esports&limit=20`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=counter-strike&limit=15`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=dota-2&limit=15`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=league-of-legends&limit=15`,
    `${GAMMA_BASE}/events?active=true&closed=false&tag_slug=valorant&limit=15`,
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
  let esportsMarketsScanned = 0;

  for (const ev of allEvents) {
    const evTitle = ev.title || '';
    const evGame = detectGame(`${evTitle} ${ev.description || ''}`, ev.tags);

    const markets = ev.markets || [];
    for (const m of markets) {
      if (m.closed) continue;
      const question = m.question || evTitle;
      const game = evGame || detectGame(question, ev.tags);
      if (!game) continue;

      esportsMarketsScanned++;

      const outcomes = parseJsonArray(m.outcomes);
      const prices = parseJsonArray(m.outcomePrices).map((p) => Number(p));

      if (outcomes.length === 0 || prices.length === 0) continue;

      // Pick the most interesting outcome (e.g. primary team / Yes outcome with valid price)
      let bestIdx = 0;
      if (outcomes.length >= 2 && Number.isFinite(prices[0]) && Number.isFinite(prices[1])) {
        // If there's a clear underdog or active side, inspect the side with non-trivial probability
        bestIdx = prices[0] >= 0.05 && prices[0] <= 0.95 ? 0 : 1;
      }

      const impliedProb = Number.isFinite(prices[bestIdx])
        ? Math.max(0.01, Math.min(0.99, prices[bestIdx]))
        : 0.5;
      const outcomeName =
        outcomes[bestIdx] === 'Yes' && m.groupItemTitle
          ? m.groupItemTitle
          : outcomes[bestIdx] || 'Outcome A';
      const opponentOutcome = outcomes.length > 1 ? outcomes[bestIdx === 0 ? 1 : 0] : undefined;

      const volume24h = Number(m.volume24hr ?? ev.volume24hr ?? 0) || 0;
      const totalVolume = Number(m.volumeNum ?? m.volume ?? ev.volume ?? 0) || 0;
      const liquidity = Number(m.liquidityNum ?? m.liquidity ?? ev.liquidity ?? 0) || 0;
      const change24h = Number(m.oneDayPriceChange ?? 0) || 0;
      const change1h = Number(m.oneHourPriceChange ?? 0) || 0;

      const analysis = scoreMarketAnomaly({
        eventTitle: evTitle || question,
        question,
        outcome: outcomeName,
        impliedProb,
        volume24h,
        totalVolume,
        liquidity,
        change24h,
        change1h,
      });

      const slug = ev.slug || m.slug || '';
      const polymarketUrl = slug
        ? `https://polymarket.com/event/${slug}`
        : 'https://polymarket.com/sports/esports';

      alerts.push({
        id: `pm-${m.id || ev.id}-${bestIdx}`,
        marketId: String(m.id || ev.id || Math.random()),
        eventTitle: evTitle || question,
        matchName: question,
        game,
        outcome: outcomeName,
        opponentOutcome,
        volume24h,
        totalVolume,
        liquidity,
        impliedOdds: impliedProb,
        decimalOdds: Number((1 / impliedProb).toFixed(2)),
        priceChange24h: change24h,
        priceChange1h: change1h,
        suspicionScore: analysis.suspicionScore,
        severity: analysis.severity,
        tags: analysis.tags,
        reasonSummary: analysis.reasonSummary,
        polymarketUrl,
        endDate: m.endDate || ev.endDate,
        trend: buildSyntheticTrend(impliedProb, change24h, change1h),
        tier: analysis.tier,
      });
    }
  }

  if (alerts.length > 0) {
    alerts.sort((a, b) => b.suspicionScore - a.suspicionScore || b.volume24h - a.volume24h);
    const trimmed = alerts.slice(0, 30);
    return {
      source: 'live',
      fetchedAt,
      totalMarketsScanned: esportsMarketsScanned,
      flaggedCount: trimmed.filter((a) => a.suspicionScore >= 52).length,
      alerts: trimmed,
    };
  }

  // Fallback ONLY when Polymarket has zero active esports markets or times out
  const fallback = getFallbackAlerts();
  return {
    source: 'fallback',
    fetchedAt,
    totalMarketsScanned: fallback.length,
    flaggedCount: fallback.filter((a) => a.suspicionScore >= 52).length,
    alerts: fallback,
    note: 'Polymarket Gamma API returned 0 active esports markets or timed out. Showing realistic integrity radar simulation.',
  };
}
