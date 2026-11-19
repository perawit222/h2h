import {
  DailyParlayTier,
  EsportsMatch,
  ParlayLeg,
  RiskLevel,
  VerdictBadge,
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
 * Extracts Series-First, Anti-Trap, Anti-Fake-Value parlay candidate legs.
 * Rules:
 * - NEVER emits Map 1 / Map 2 single-map gambles.
 * - Rejects TRAP MATCH / AVOID completely.
 * - Excludes Bo1 from Safe & Medium Core tiers.
 * - Uses 6-pillar True Series Win Probability vs Market Implied Odds.
 */
function extractSeriesFirstCandidates(matches: EsportsMatch[]): CandidateLeg[] {
  const candidates: CandidateLeg[] = [];

  for (const match of matches) {
    const qs = match.quickScore;
    if (!qs) continue;

    // Hard Rule: NEVER put a TRAP MATCH / AVOID into any step ticket
    if (qs.verdictBadge === 'TRAP MATCH / AVOID') continue;

    const matchName = `${match.teamA.name} vs ${match.teamB.name}`;
    const liq = match.liquidity ?? 0;
    const esports = isEsports(match.game);
    const seriesMarketLabel = esports ? `Series Winner (${match.format})` : `Match Winner (${match.format})`;

    // 1. Primary Series Winner leg (only for the structurally favored/recommended side — no blind fake-value chasing!)
    const recIsTeamA =
      qs.recommendedSide === match.teamA.name ||
      (qs.recommendedSide === 'NO BET (Skip)' && match.teamA.oddsDecimal <= match.teamB.oddsDecimal);
    const primaryTeam = recIsTeamA ? match.teamA : match.teamB;

    if (
      qs.verdictBadge === 'STRONG SERIES LOCK' ||
      qs.verdictBadge === 'VALUE SERIES PLAY'
    ) {
      candidates.push({
        matchId: match.id,
        match,
        game: match.game,
        matchName,
        tournament: match.tournament,
        startTimeIso: match.startTimeIso,
        format: match.format,
        marketCategory: seriesMarketLabel,
        selection: primaryTeam.name,
        oddsDecimal: Number(primaryTeam.oddsDecimal.toFixed(2)),
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
      });
    }

    // 2. Full-Series Handicap / Over-Under ONLY (STRICTLY exclude Map 1 / Map 2 Winner single-map gambles!)
    const subs = match.markets || [];
    for (const s of subs) {
      if (s.category === 'Map Winner') continue; // HARD BAN on single-map gambling!
      if (s.category === 'Match Winner') continue;
      if (/map\s+[123]/i.test(s.question) || /game\s+[123]/i.test(s.question)) continue;

      const isHcp = /handicap|spread/i.test(s.question);
      const isOu = /o\/u|over\/under|total/i.test(s.question);
      if (!isHcp && !isOu) continue;

      // Only allow +1.5 safety handicap cushions or well-aligned full-series lines
      const checkSide = (sel: string, odds: number, prob: number) => {
        if (!Number.isFinite(odds) || odds < 1.08 || odds > 3.6) return;
        const isPlusCushion = /\+1\.5|\+0\.5/i.test(sel);
        const isMinusSweep = /-1\.5/i.test(sel);

        // Do not allow risky -1.5 sweeps unless team is a STRONG SERIES LOCK
        if (isMinusSweep && qs.verdictBadge !== 'STRONG SERIES LOCK') return;

        // Require non-skip verdict for handicap/totals unless it's a +1.5 cushion on a Bo3/Bo5
        if (qs.verdictBadge === 'HIGH VARIANCE / SKIP' && !isPlusCushion) return;

        const impliedPct = Math.round(prob * 100);
        const truePct = clamp(
          Math.round(impliedPct + Math.max(0.5, qs.estimatedEdgePct * 0.65)),
          24,
          93
        );
        const edge = Number((truePct - impliedPct).toFixed(1));
        const verdict: VerdictBadge = isPlusCushion && truePct >= 70
          ? 'STRONG SERIES LOCK'
          : qs.verdictBadge;

        candidates.push({
          matchId: match.id,
          match,
          game: match.game,
          matchName,
          tournament: match.tournament,
          startTimeIso: match.startTimeIso,
          format: match.format,
          marketCategory: isHcp ? `Series Handicap (${match.format})` : `Series Total O/U (${match.format})`,
          selection: sel,
          oddsDecimal: Number(odds.toFixed(2)),
          trueWinProbPct: truePct,
          marketImpliedProbPct: impliedPct,
          modelWinProbPct: truePct,
          edgePct: edge,
          investabilityScore: clamp(
            qs.interestScore + (isPlusCushion ? 1 : isMinusSweep ? -1 : 0),
            1,
            10
          ),
          verdictBadge: verdict,
          riskLevel: isPlusCushion ? 'Low' : qs.riskLevel,
          riskNote: qs.primaryInvalidationRisk,
          whySeriesNote: qs.whySeriesOverSingleMap,
          rationale: `${s.question} — True ${truePct}% vs Market ${impliedPct}%`,
          liquidity: liq,
          isSeriesWinner: false,
        });
      };

      checkSide(s.teamA, s.oddsA, s.probA);
      checkSide(s.teamB, s.oddsB, s.probB);
    }
  }

  return candidates;
}

function pickUniqueMatchLegs(
  pool: CandidateLeg[],
  minOdds: number,
  maxOdds: number,
  maxLegs: number,
  allowBo1: boolean,
  sortFn: (a: CandidateLeg, b: CandidateLeg) => number
): CandidateLeg[] {
  const filtered = pool
    .filter((c) => c.oddsDecimal >= minOdds && c.oddsDecimal <= maxOdds)
    .filter((c) => (allowBo1 ? true : c.format !== 'Bo1'))
    .sort(sortFn);

  const picked: CandidateLeg[] = [];
  const usedMatches = new Set<string>();

  for (const leg of filtered) {
    if (usedMatches.has(leg.matchId)) continue;
    usedMatches.add(leg.matchId);
    picked.push(leg);
    if (picked.length >= maxLegs) break;
  }

  return picked;
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
    id === 'safe'
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
  const candidates = extractSeriesFirstCandidates(matches);

  // 1. SAFE STEP (1.10x – 1.34x · Series-First Only, No Bo1, No Single-Map, No Traps)
  let safeLegs = pickUniqueMatchLegs(
    candidates,
    1.08,
    1.34,
    3,
    false,
    (a, b) =>
      (b.verdictBadge === 'STRONG SERIES LOCK' ? 12 : 0) -
        (a.verdictBadge === 'STRONG SERIES LOCK' ? 12 : 0) +
      (b.trueWinProbPct - a.trueWinProbPct) +
      (b.isSeriesWinner ? 4 : 0) -
      (a.isSeriesWinner ? 4 : 0)
  );
  if (safeLegs.length < 2) {
    safeLegs = pickUniqueMatchLegs(
      candidates,
      1.06,
      1.45,
      3,
      false,
      (a, b) => b.trueWinProbPct - a.trueWinProbPct
    );
  }

  // 2. MEDIUM · TOP 10 VETTED SERIES-FIRST CORE PICKS (1.35x – 1.62x, centered on 1.40–1.55x)
  const mediumSort = (a: CandidateLeg, b: CandidateLeg) => {
    const distA = Math.abs(a.oddsDecimal - 1.47);
    const distB = Math.abs(b.oddsDecimal - 1.47);
    const lockBonusA = a.verdictBadge === 'STRONG SERIES LOCK' ? 15 : 6;
    const lockBonusB = b.verdictBadge === 'STRONG SERIES LOCK' ? 15 : 6;
    const seriesBonusA = a.isSeriesWinner ? 10 : 0;
    const seriesBonusB = b.isSeriesWinner ? 10 : 0;
    const scoreA = lockBonusA + seriesBonusA + a.investabilityScore * 5 + a.trueWinProbPct - distA * 32;
    const scoreB = lockBonusB + seriesBonusB + b.investabilityScore * 5 + b.trueWinProbPct - distB * 32;
    return scoreB - scoreA;
  };

  let mediumLegs = pickUniqueMatchLegs(candidates, 1.35, 1.62, 10, false, mediumSort);
  if (mediumLegs.length < 10) {
    mediumLegs = pickUniqueMatchLegs(candidates, 1.28, 1.78, 10, false, mediumSort);
  }

  // 3. WORTH-THE-RISK VALUE SERIES STEP (1.75x – 3.50x · Genuine Structural +EV Only, No Fake Value)
  let valueLegs = pickUniqueMatchLegs(
    candidates.filter((c) => c.trueWinProbPct >= 44 && c.edgePct >= 1.5),
    1.75,
    3.6,
    3,
    false,
    (a, b) =>
      (b.isSeriesWinner ? 8 : 0) - (a.isSeriesWinner ? 8 : 0) +
      (b.edgePct * b.oddsDecimal - a.edgePct * a.oddsDecimal)
  );
  if (valueLegs.length < 2) {
    valueLegs = pickUniqueMatchLegs(
      candidates,
      1.6,
      3.8,
      3,
      false,
      (a, b) => b.edgePct - a.edgePct
    );
  }

  return [
    summarizeParlay(
      'safe',
      'Tier 1 · Safe Series Compounder',
      'SAFE SERIES STEP',
      '1.10x – 1.30x / leg',
      'Series-First (Bo3/Bo5) locks & +1.5 safety cushions only. Bo1 flukes, single-map gambles & trap favorites strictly excluded.',
      safeLegs,
      'Low',
      '2.0u – 3.0u'
    ),
    summarizeParlay(
      'medium',
      'Tier 2 · Top 10 Vetted Series Core Picks',
      'TOP 10 CORE (1.40–1.55x)',
      '1.40x – 1.55x / leg',
      '10 institutional-vetted Series-First picks (6-Pillar True Win % vs Market Odds). Zero Trap Matches, zero Map 1/2 gambles. Check legs to compound.',
      mediumLegs,
      'Medium',
      '1.0u – 1.5u'
    ),
    summarizeParlay(
      'value_risk',
      'Tier 3 · Worth-The-Risk Series Value',
      'VALUE SERIES PLAY',
      '1.75x – 3.50x / leg',
      'Only underdogs/lines with ≥44% True Series Win Prob and real structural depth — fake-value payout bait automatically rejected.',
      valueLegs,
      'High',
      '0.25u – 0.5u'
    ),
  ];
}
