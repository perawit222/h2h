import {
  DailyParlayTier,
  EsportsMatch,
  ParlayLeg,
  RiskLevel,
} from '@/types/esports';

interface CandidateLeg extends ParlayLeg {
  liquidity: number;
  isSeriesWinner: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isEsports(game: EsportsMatch['game']): boolean {
  return game === 'CS2' || game === 'Valorant' || game === 'LoL' || game === 'Dota 2';
}

/**
 * Strict Today-Only Filter (Active 24h Matchday Window — NO advance future-day matches):
 * Includes live matches that started up to 2h ago and upcoming matches starting within the next 26h
 * (covers full Asia + EU + US night slate for today's matchday).
 */
function isTodayMatch(startTimeIso: string, nowMs: number): boolean {
  const startMs = new Date(startTimeIso).getTime();
  if (!Number.isFinite(startMs)) return false;
  const twoHoursAgo = nowMs - 2 * 3600 * 1000;
  const twentySixHoursAhead = nowMs + 26 * 3600 * 1000;
  return startMs >= twoHoursAgo && startMs <= twentySixHoursAhead;
}

/**
 * Picks AT MOST ONE single best real-odds play for a given match.
 * Enforces:
 * - Today-Only (NO future multi-day games)
 * - 100% Real Live Odds ONLY (Polymarket Orderbook / DraftKings ESPN)
 * - Sure / High-Conviction ONLY (investabilityScore >= 6, NO Trap Matches, NO Bo1 flukes, NO Map 1/2 gambles)
 * - Strictly ONE best pick per match (NEVER conflicting Team 1 ML + Team 2 +1.5 Map)
 */
function pickSingleBestLegForMatch(match: EsportsMatch): CandidateLeg | null {
  const qs = match.quickScore;
  if (!qs) return null;

  if (!match.hasRealOdds) return null;
  if (qs.verdictBadge === 'TRAP MATCH / AVOID') return null;
  if (qs.verdictBadge === 'HIGH VARIANCE / SKIP') return null;
  if (match.format === 'Bo1') return null;
  // "เอาเฉพาะอันที่ชัวรนะ" — strict minimum conviction threshold (6/10+)
  if (qs.interestScore < 6) return null;

  const matchName = `${match.teamA.name} vs ${match.teamB.name}`;
  const liq = match.liquidity ?? 0;
  const esports = isEsports(match.game);
  const seriesMarketLabel = esports
    ? `Series Winner (${match.format})`
    : `Match Winner (${match.format})`;

  const recTeamName =
    qs.recommendedSide !== 'NO BET (Skip)'
      ? qs.recommendedSide
      : match.teamA.oddsDecimal <= match.teamB.oddsDecimal
        ? match.teamA.name
        : match.teamB.name;

  const recIsA = recTeamName === match.teamA.name;
  const recTeam = recIsA ? match.teamA : match.teamB;
  const mlOdds = Number(recTeam.oddsDecimal.toFixed(2));

  // Skip dead-certainty 1.01–1.04 odds (zero return) or extreme longshots > 3.60
  if (!Number.isFinite(mlOdds) || mlOdds < 1.05 || mlOdds > 3.6) return null;

  return {
    matchId: match.id,
    match,
    game: match.game,
    matchName,
    tournament: match.tournament,
    startTimeIso: match.startTimeIso,
    format: match.format,
    marketCategory: seriesMarketLabel,
    selection: recTeam.name,
    oddsDecimal: mlOdds,
    oddsSource: match.oddsSource,
    trueWinProbPct: qs.trueWinProbPct,
    marketImpliedProbPct: qs.marketImpliedProbPct,
    modelWinProbPct: qs.trueWinProbPct,
    edgePct: qs.estimatedEdgePct,
    investabilityScore: qs.interestScore,
    verdictBadge: qs.verdictBadge,
    riskLevel: qs.riskLevel,
    riskNote: qs.primaryInvalidationRisk,
    injurySummary: qs.injurySummary,
    whySeriesNote: qs.whySeriesOverSingleMap,
    rationale: `${qs.verdictBadge}: True ${qs.trueWinProbPct}% vs Market ${qs.marketImpliedProbPct}%`,
    liquidity: liq,
    isSeriesWinner: true,
  };
}

/**
 * Primary sort inside every tier:
 * Highest 1-10 Investability Score first -> Strong Series Lock -> Highest True Win % -> Highest Edge %
 */
function sortByInvestability(a: CandidateLeg, b: CandidateLeg): number {
  if (b.investabilityScore !== a.investabilityScore) {
    return b.investabilityScore - a.investabilityScore;
  }
  const lockA = a.verdictBadge === 'STRONG SERIES LOCK' ? 1 : 0;
  const lockB = b.verdictBadge === 'STRONG SERIES LOCK' ? 1 : 0;
  if (lockB !== lockA) return lockB - lockA;
  if (b.trueWinProbPct !== a.trueWinProbPct) return b.trueWinProbPct - a.trueWinProbPct;
  return b.edgePct - a.edgePct;
}

function summarizeParlay(
  id: 'safe' | 'medium' | 'value_risk',
  title: string,
  badge: string,
  targetOddsRange: string,
  description: string,
  legs: CandidateLeg[],
  riskLevel: RiskLevel,
  recommendedUnits: string
): DailyParlayTier {
  // Default compound preview uses top 3 highest-scoring picks (UI lets user toggle any of the 5-15 picks!)
  const calcLegs = legs.slice(0, 3);

  const combinedOdds =
    calcLegs.length > 0
      ? Number(calcLegs.reduce((acc, l) => acc * l.oddsDecimal, 1).toFixed(2))
      : 1.0;

  const combinedProb =
    calcLegs.length > 0
      ? calcLegs.reduce((acc, l) => acc * (l.trueWinProbPct / 100), 1)
      : 0;

  const combinedWinProbPct = Math.round(combinedProb * 100);
  const expectedValuePct =
    calcLegs.length > 0 ? Number(((combinedProb * combinedOdds - 1) * 100).toFixed(1)) : 0;

  const minLiq = calcLegs.reduce(
    (m, l) => (l.liquidity > 0 ? Math.min(m, l.liquidity) : m),
    Number.MAX_SAFE_INTEGER
  );
  const maxSafeStakeUsd =
    minLiq === Number.MAX_SAFE_INTEGER
      ? id === 'safe'
        ? 500
        : id === 'medium'
          ? 350
          : 150
      : Math.round(clamp(minLiq * (id === 'safe' ? 0.1 : id === 'medium' ? 0.08 : 0.05), 50, 5000));

  const avgScore =
    legs.length > 0
      ? Math.round(legs.reduce((s, l) => s + l.investabilityScore, 0) / legs.length)
      : 1;

  return {
    id,
    title,
    badge,
    targetOddsRange,
    description,
    legs,
    combinedOdds,
    combinedWinProbPct,
    expectedValuePct,
    investabilityScore: clamp(avgScore, 1, 10),
    riskLevel,
    recommendedUnits,
    maxSafeStakeUsd,
  };
}

export function buildDailyParlays(matches: EsportsMatch[]): DailyParlayTier[] {
  const nowMs = Date.now();

  const todayRealMatches = matches.filter(
    (m) => m.hasRealOdds && isTodayMatch(m.startTimeIso, nowMs)
  );

  const singleBestPool: CandidateLeg[] = [];
  for (const m of todayRealMatches) {
    const best = pickSingleBestLegForMatch(m);
    if (best) singleBestPool.push(best);
  }

  // GLOBAL 1-match-per-board deduplication across all 3 vertical tiers
  const globalUsedMatches = new Set<string>();

  const claimTier = (
    minOdds: number,
    maxOdds: number,
    minScore: number,
    maxLegs = 15
  ): CandidateLeg[] => {
    const eligible = singleBestPool
      .filter((c) => !globalUsedMatches.has(c.matchId))
      .filter((c) => c.investabilityScore >= minScore)
      .filter((c) => c.oddsDecimal >= minOdds && c.oddsDecimal <= maxOdds)
      .sort(sortByInvestability);

    const chosen: CandidateLeg[] = [];
    for (const leg of eligible) {
      globalUsedMatches.add(leg.matchId);
      chosen.push(leg);
      if (chosen.length >= maxLegs) break;
    }
    return chosen;
  };

  // 1. TIER 1 · SAFE SERIES COMPOUNDER (1.05x – 1.34x · min score 7/10 · up to 15 sure picks)
  const safeLegs = claimTier(1.05, 1.34, 7, 15);
  // If fewer than 5 sure safe picks exist strictly <= 1.34x, allow ultra-safe 9–10/10 locks up to 1.40x to try to reach 5
  if (safeLegs.length < 5) {
    const topUps = claimTier(1.35, 1.4, 9, 5 - safeLegs.length);
    safeLegs.push(...topUps);
    safeLegs.sort(sortByInvestability);
  }

  // 2. TIER 2 · MEDIUM HIGH-WINRATE CORE (1.35x – 1.65x · min score 7/10 · 5–15 sure picks)
  const mediumLegs = claimTier(1.35, 1.65, 7, 15);
  if (mediumLegs.length < 5) {
    const topUps = claimTier(1.32, 1.68, 6, 5 - mediumLegs.length);
    mediumLegs.push(...topUps);
    mediumLegs.sort(sortByInvestability);
  }

  // 3. TIER 3 · WORTH-THE-RISK SERIES VALUE (1.66x – 3.60x · min score 6/10 · 5–15 sure value picks)
  const valueLegs = claimTier(1.66, 3.6, 6, 15);

  return [
    summarizeParlay(
      'safe',
      '1. Safe Series Compounder (เซฟ)',
      'TIER 1 · SAFE',
      '1.05x – 1.35x / leg',
      'High-conviction locks (7/10–10/10) with real live odds — ranked by investability score. Zero traps, zero Bo1 flukes.',
      safeLegs,
      'Low',
      '2.0u – 3.0u'
    ),
    summarizeParlay(
      'medium',
      '2. Medium High-Winrate Core (ปานกลาง 1.40–1.55x)',
      'TIER 2 · MEDIUM CORE',
      '1.35x – 1.65x / leg',
      'Vetted high-winrate Series-First core picks (7/10–10/10) across Esports, Football Top 5, NBA & Tennis — ranked highest score first.',
      mediumLegs,
      'Medium',
      '1.0u – 1.5u'
    ),
    summarizeParlay(
      'value_risk',
      '3. Worth-The-Risk Series Value (คุ้มเสี่ยง)',
      'TIER 3 · WORTH THE RISK',
      '1.66x – 3.50x / leg',
      'Only vetted +EV picks (6/10–10/10) with genuine structural series depth — fake-value payout bait automatically rejected.',
      valueLegs,
      'High',
      '0.25u – 0.5u'
    ),
  ];
}
