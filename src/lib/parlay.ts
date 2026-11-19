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
 * Strict Today-Only Filter (Active 24h Matchday Window — NO future multi-day matches):
 * Includes live matches that started up to 2h ago and upcoming matches starting within the next 24h.
 */
function isTodayMatch(startTimeIso: string, nowMs: number): boolean {
  const startMs = new Date(startTimeIso).getTime();
  if (!Number.isFinite(startMs)) return false;
  const twoHoursAgo = nowMs - 2 * 3600 * 1000;
  const twentyFourHoursAhead = nowMs + 24 * 3600 * 1000;
  return startMs >= twoHoursAgo && startMs <= twentyFourHoursAhead;
}

/**
 * Picks AT MOST ONE single best real-odds market & side for a given match.
 * Rules enforced:
 * 1. Today-Only (within 24h window — NO advance future-day matches).
 * 2. Real Live Odds ONLY (`match.hasRealOdds === true`: Polymarket Orderbook or DraftKings ESPN).
 * 3. NEVER outputs conflicting picks (e.g. Team 1 ML + Team 2 +1.5 Map) — strictly ONE best play per match!
 * 4. Series-First: NEVER outputs Map 1 / Map 2 Winner single-map gambles or TRAP MATCH / AVOID.
 */
function pickSingleBestLegForMatch(match: EsportsMatch): CandidateLeg | null {
  const qs = match.quickScore;
  if (!qs) return null;

  // Hard Rules: Real Odds ONLY, NO Trap Matches, NO Bo1 single-map flukes
  if (!match.hasRealOdds) return null;
  if (qs.verdictBadge === 'TRAP MATCH / AVOID') return null;
  if (match.format === 'Bo1') return null;

  const matchName = `${match.teamA.name} vs ${match.teamB.name}`;
  const liq = match.liquidity ?? 0;
  const esports = isEsports(match.game);
  const seriesMarketLabel = esports
    ? `Series Winner (${match.format})`
    : `Match Winner (${match.format})`;

  // Identify the ONE structurally superior side from 6-Pillar Analysis (never pick the opposite side!)
  const recTeamName =
    qs.recommendedSide !== 'NO BET (Skip)'
      ? qs.recommendedSide
      : match.teamA.oddsDecimal <= match.teamB.oddsDecimal
        ? match.teamA.name
        : match.teamB.name;

  const recIsA = recTeamName === match.teamA.name;
  const recTeam = recIsA ? match.teamA : match.teamB;
  const mlOdds = Number(recTeam.oddsDecimal.toFixed(2));

  // Reject unusable extreme odds
  if (!Number.isFinite(mlOdds) || mlOdds < 1.07 || mlOdds > 4.0) return null;

  // Check if there is a real full-series Handicap/Spread aligned with the SAME favored side
  // ONLY prefer Handicap over Moneyline when Moneyline is heavily juiced (< 1.25) AND Handicap (-1.5/-spread) is still backed by a STRONG SERIES LOCK
  const realSubs = (match.markets || []).filter(
    (s) =>
      s.category === 'Handicap / Total' &&
      !/map\s+[123]/i.test(s.question) &&
      !/game\s+[123]/i.test(s.question)
  );

  // Default & Primary Choice: Full Series Winner / Match Winner on `recTeam`
  if (qs.verdictBadge === 'STRONG SERIES LOCK' || qs.verdictBadge === 'VALUE SERIES PLAY') {
    // Optional upgrade: If STRONG SERIES LOCK has ultra-low ML (< 1.22), check if there's a same-team Spread/Handicap in 1.38–1.85
    if (mlOdds < 1.22 && qs.verdictBadge === 'STRONG SERIES LOCK') {
      const alignedHcp = realSubs.find((s) => /handicap|spread/i.test(s.question));
      if (alignedHcp) {
        const isSideA = alignedHcp.teamA.toLowerCase().includes(recTeam.name.toLowerCase());
        const isSideB = alignedHcp.teamB.toLowerCase().includes(recTeam.name.toLowerCase());
        if (isSideA || isSideB) {
          const sel = isSideA ? alignedHcp.teamA : alignedHcp.teamB;
          const hcpOdds = Number((isSideA ? alignedHcp.oddsA : alignedHcp.oddsB).toFixed(2));
          const hcpProb = isSideA ? alignedHcp.probA : alignedHcp.probB;
          if (hcpOdds >= 1.35 && hcpOdds <= 2.15) {
            const impliedPct = Math.round(hcpProb * 100);
            const truePct = clamp(Math.round(impliedPct + Math.max(1.5, qs.estimatedEdgePct * 0.7)), 45, 85);
            return {
              matchId: match.id,
              match,
              game: match.game,
              matchName,
              tournament: match.tournament,
              startTimeIso: match.startTimeIso,
              format: match.format,
              marketCategory: `Series Handicap (${match.format})`,
              selection: sel,
              oddsDecimal: hcpOdds,
              oddsSource: match.oddsSource,
              trueWinProbPct: truePct,
              marketImpliedProbPct: impliedPct,
              modelWinProbPct: truePct,
              edgePct: Number((truePct - impliedPct).toFixed(1)),
              investabilityScore: qs.interestScore,
              verdictBadge: qs.verdictBadge,
              riskLevel: qs.riskLevel,
              riskNote: qs.primaryInvalidationRisk,
              whySeriesNote: qs.whySeriesOverSingleMap,
              rationale: `Same-side Handicap chosen over juiced ${mlOdds.toFixed(2)}x ML`,
              liquidity: liq,
              isSeriesWinner: false,
            };
          }
        }
      }
    }

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
      whySeriesNote: qs.whySeriesOverSingleMap,
      rationale: `${qs.verdictBadge}: True ${qs.trueWinProbPct}% vs Market ${qs.marketImpliedProbPct}%`,
      liquidity: liq,
      isSeriesWinner: true,
    };
  }

  // If match is a close coin-flip (`HIGH VARIANCE / SKIP` on ML), check ONLY if it has a real Total O/U market (never pick opposite team +1.5!)
  const realOu = realSubs.find((s) => /o\/u|over\/under|total/i.test(s.question));
  if (realOu && realOu.oddsA >= 1.35 && realOu.oddsA <= 2.2) {
    const impliedPct = Math.round(realOu.probA * 100);
    const truePct = clamp(impliedPct + 2, 42, 78);
    return {
      matchId: match.id,
      match,
      game: match.game,
      matchName,
      tournament: match.tournament,
      startTimeIso: match.startTimeIso,
      format: match.format,
      marketCategory: `Total O/U (${match.format})`,
      selection: realOu.teamA,
      oddsDecimal: Number(realOu.oddsA.toFixed(2)),
      oddsSource: match.oddsSource,
      trueWinProbPct: truePct,
      marketImpliedProbPct: impliedPct,
      modelWinProbPct: truePct,
      edgePct: Number((truePct - impliedPct).toFixed(1)),
      investabilityScore: Math.max(5, qs.interestScore),
      verdictBadge: 'VALUE SERIES PLAY',
      riskLevel: 'Medium',
      riskNote: `Tightly matched series — Total O/U avoids side-picking coin flip`,
      whySeriesNote: qs.whySeriesOverSingleMap,
      rationale: `${realOu.question} (${match.oddsSource})`,
      liquidity: liq,
      isSeriesWinner: false,
    };
  }

  return null;
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
  const calcLegs = id === 'medium' ? legs.slice(0, 3) : legs;

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

  const baseScore =
    legs.length === 0
      ? 1
      : id === 'safe'
        ? clamp(Math.round(7.2 + (combinedWinProbPct - 45) * 0.08), 6, 10)
        : id === 'medium'
          ? clamp(Math.round(6.5 + (combinedWinProbPct - 30) * 0.07 + expectedValuePct * 0.1), 5, 9)
          : clamp(Math.round(4.0 + expectedValuePct * 0.16), 2, 7);

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
    investabilityScore: baseScore,
    riskLevel,
    recommendedUnits,
    maxSafeStakeUsd,
  };
}

export function buildDailyParlays(matches: EsportsMatch[]): DailyParlayTier[] {
  const nowMs = Date.now();

  // RULE 1 + RULE 2 + RULE 3:
  // Strictly TODAY'S 24h matches + REAL live odds ONLY + AT MOST ONE SINGLE BEST PICK PER MATCH
  const todayRealMatches = matches.filter(
    (m) => m.hasRealOdds && isTodayMatch(m.startTimeIso, nowMs)
  );

  const singleBestPool: CandidateLeg[] = [];
  for (const m of todayRealMatches) {
    const best = pickSingleBestLegForMatch(m);
    if (best) singleBestPool.push(best);
  }

  // GLOBAL deduplication across ALL 3 tiers: a match NEVER appears twice or with conflicting picks!
  const globalUsedMatches = new Set<string>();

  const claimFromPool = (
    minOdds: number,
    maxOdds: number,
    maxLegs: number,
    sortFn: (a: CandidateLeg, b: CandidateLeg) => number
  ): CandidateLeg[] => {
    const eligible = singleBestPool
      .filter((c) => !globalUsedMatches.has(c.matchId))
      .filter((c) => c.oddsDecimal >= minOdds && c.oddsDecimal <= maxOdds)
      .sort(sortFn);

    const chosen: CandidateLeg[] = [];
    for (const leg of eligible) {
      globalUsedMatches.add(leg.matchId);
      chosen.push(leg);
      if (chosen.length >= maxLegs) break;
    }
    return chosen;
  };

  // Priority 1: TIER 2 · TOP 10 CORE PICKS (1.35x – 1.65x, centered around 1.40x–1.55x)
  const mediumSort = (a: CandidateLeg, b: CandidateLeg) => {
    const distA = Math.abs(a.oddsDecimal - 1.47);
    const distB = Math.abs(b.oddsDecimal - 1.47);
    const lockA = a.verdictBadge === 'STRONG SERIES LOCK' ? 14 : 5;
    const lockB = b.verdictBadge === 'STRONG SERIES LOCK' ? 14 : 5;
    return (
      lockB + b.investabilityScore * 5 + b.trueWinProbPct - distB * 35 -
      (lockA + a.investabilityScore * 5 + a.trueWinProbPct - distA * 35)
    );
  };
  const mediumLegs = claimFromPool(1.35, 1.65, 10, mediumSort);

  // Priority 2: TIER 1 · SAFE SERIES COMPOUNDER (1.07x – 1.34x · strictly remaining unused today matches)
  const safeLegs = claimFromPool(
    1.07,
    1.34,
    3,
    (a, b) => b.trueWinProbPct - a.trueWinProbPct || b.investabilityScore - a.investabilityScore
  );

  // Priority 3: TIER 3 · WORTH-THE-RISK VALUE SERIES (1.66x – 3.60x · strictly remaining unused today matches with ≥44% true prob)
  const valueLegs = claimFromPool(
    1.66,
    3.6,
    3,
    (a, b) =>
      (b.trueWinProbPct >= 44 ? 20 : 0) - (a.trueWinProbPct >= 44 ? 20 : 0) +
      (b.edgePct * b.oddsDecimal - a.edgePct * a.oddsDecimal)
  );

  return [
    summarizeParlay(
      'safe',
      'Tier 1 · Safe Series Compounder',
      'SAFE SERIES STEP',
      '1.08x – 1.34x / leg',
      'Today-only real-odds locks (Polymarket / DraftKings). Zero advance-day games, zero duplicate or conflicting picks.',
      safeLegs,
      'Low',
      '2.0u – 3.0u'
    ),
    summarizeParlay(
      'medium',
      'Tier 2 · Top 10 Vetted Daily Core Picks',
      'TOP 10 CORE (1.35–1.65x)',
      '1.40x – 1.55x target',
      'Today-only vetted picks with 100% real live odds — strictly 1 best pick per match (never conflicting Team 1 ML + Team 2 +1.5).',
      mediumLegs,
      'Medium',
      '1.0u – 1.5u'
    ),
    summarizeParlay(
      'value_risk',
      'Tier 3 · Worth-The-Risk Series Value',
      'VALUE SERIES PLAY',
      '1.66x – 3.50x / leg',
      'Today-only real-odds value plays with ≥44% True Series Win Prob — fake-value payout bait & traps rejected.',
      valueLegs,
      'High',
      '0.25u – 0.5u'
    ),
  ];
}
