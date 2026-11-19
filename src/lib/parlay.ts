import { DailyParlayTier, EsportsMatch, ParlayLeg, RiskLevel } from '@/types/esports';

interface CandidateLeg extends ParlayLeg {
  liquidity: number;
  matchScore: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function buildLegRiskProfile(
  match: EsportsMatch,
  odds: number,
  category: string,
  modelProbPct: number
): { investabilityScore: number; riskLevel: RiskLevel; riskNote: string } {
  let riskPts = 20;
  const warnings: string[] = [];

  if (match.format === 'Bo1') {
    riskPts += 28;
    warnings.push('Bo1 single-map variance');
  }
  if (match.game === 'Football' && category === 'Match Winner') {
    riskPts += 16;
    warnings.push('90m Draw risk — AH or DNB safer');
  }
  if (match.tier === 'B-Tier') {
    riskPts += 16;
    warnings.push('Lower-tier T2/T3 volatility');
  }
  if ((match.liquidity ?? 0) > 0 && (match.liquidity ?? 0) < 5000) {
    riskPts += 14;
    warnings.push('Thin orderbook — keep stake small');
  }
  if (odds >= 2.15) {
    riskPts += 18;
    warnings.push('Underdog / high-variance price');
  } else if (odds <= 1.35) {
    riskPts -= 8;
  }

  const riskLevel: RiskLevel =
    riskPts >= 70 ? 'Extreme' : riskPts >= 50 ? 'High' : riskPts >= 32 ? 'Medium' : 'Low';

  const baseScore = match.quickScore?.interestScore ?? 6;
  const adjusted = clamp(
    Math.round(baseScore + (modelProbPct >= 68 ? 1 : 0) - (riskLevel === 'High' ? 1 : riskLevel === 'Extreme' ? 2 : 0)),
    1,
    10
  );

  const riskNote =
    warnings.length > 0
      ? warnings.slice(0, 2).join(' · ')
      : match.liquidity && match.liquidity >= 20000
        ? 'Low risk · Deep Polymarket liquidity & strong form'
        : 'Balanced edge · Standard unit sizing recommended';

  return { investabilityScore: adjusted, riskLevel, riskNote };
}

function extractCandidateLegs(matches: EsportsMatch[]): CandidateLeg[] {
  const candidates: CandidateLeg[] = [];

  for (const match of matches) {
    const quick = match.quickScore;
    const matchScore = quick?.interestScore ?? 5;
    const baseEdge = quick?.estimatedEdgePct ?? 2.0;
    const liq = match.liquidity ?? 0;
    const matchName = `${match.teamA.name} vs ${match.teamB.name}`;
    const subs = match.markets || [];

    const addSide = (
      selection: string,
      odds: number,
      impliedProb: number,
      category: string,
      rationale: string,
      edgeBonus = 0
    ) => {
      if (!Number.isFinite(odds) || odds < 1.06 || odds > 4.5) return;
      const edgePct = Number(Math.max(0.5, baseEdge + edgeBonus).toFixed(1));
      const modelProb = clamp(impliedProb + edgePct / 100, 0.2, 0.94);
      const modelWinProbPct = Math.round(modelProb * 100);
      const risk = buildLegRiskProfile(match, odds, category, modelWinProbPct);

      candidates.push({
        matchId: match.id,
        match,
        game: match.game,
        matchName,
        tournament: match.tournament,
        startTimeIso: match.startTimeIso,
        marketCategory: category,
        selection,
        oddsDecimal: Number(odds.toFixed(2)),
        modelWinProbPct,
        edgePct,
        investabilityScore: risk.investabilityScore,
        riskLevel: risk.riskLevel,
        riskNote: risk.riskNote,
        rationale,
        liquidity: liq,
        matchScore,
      });
    };

    addSide(
      match.teamA.name,
      match.teamA.oddsDecimal,
      match.teamA.impliedProb,
      'Match Winner',
      `${match.teamA.tag} (${match.teamA.winRateLast10}% L10) moneyline`,
      match.teamA.oddsDecimal <= match.teamB.oddsDecimal ? 0.8 : 0.4
    );

    addSide(
      match.teamB.name,
      match.teamB.oddsDecimal,
      match.teamB.impliedProb,
      'Match Winner',
      `${match.teamB.tag} (${match.teamB.winRateLast10}% L10) moneyline`,
      match.teamB.oddsDecimal < match.teamA.oddsDecimal ? 0.8 : 0.4
    );

    for (const s of subs) {
      if (s.category === 'Match Winner') continue;
      const isHcp = /handicap|spread/i.test(s.question);
      const isOu = /o\/u|over\/under|total/i.test(s.question);
      const label = isHcp ? 'Handicap / Spread' : isOu ? 'Over / Under' : 'Map / Set Winner';

      addSide(
        s.teamA,
        s.oddsA,
        s.probA,
        label,
        `${s.question} — ${s.teamA} @ ${s.oddsA.toFixed(2)}x`,
        isHcp && s.oddsA <= 1.35 ? 1.2 : 0.6
      );
      addSide(
        s.teamB,
        s.oddsB,
        s.probB,
        label,
        `${s.question} — ${s.teamB} @ ${s.oddsB.toFixed(2)}x`,
        isHcp && s.oddsB <= 1.35 ? 1.2 : 0.6
      );
    }
  }

  return candidates;
}

function pickUniqueMatchLegs(
  pool: CandidateLeg[],
  minOdds: number,
  maxOdds: number,
  maxLegs: number,
  sortFn: (a: CandidateLeg, b: CandidateLeg) => number
): CandidateLeg[] {
  const filtered = pool
    .filter((c) => c.oddsDecimal >= minOdds && c.oddsDecimal <= maxOdds)
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
  // For Tier 2 (Top 10 Vetted), compute combined multiplier on top 3 anchors by default (UI lets user toggle any of the 10!)
  const calcLegs = id === 'medium' ? legs.slice(0, 3) : legs;

  const combinedOdds =
    calcLegs.length > 0
      ? Number(calcLegs.reduce((acc, l) => acc * l.oddsDecimal, 1).toFixed(2))
      : 1.0;

  const combinedProb =
    calcLegs.length > 0
      ? calcLegs.reduce((acc, l) => acc * (l.modelWinProbPct / 100), 1)
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
      ? clamp(Math.round(7.0 + (combinedWinProbPct - 45) * 0.08), 6, 10)
      : id === 'medium'
        ? clamp(Math.round(6.2 + (combinedWinProbPct - 30) * 0.07 + expectedValuePct * 0.1), 5, 9)
        : clamp(Math.round(3.8 + expectedValuePct * 0.16), 2, 7);

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
  const candidates = extractCandidateLegs(matches);

  // 1. SAFE STEP (1.10x – 1.32x per leg, compounded for high safety)
  let safeLegs = pickUniqueMatchLegs(
    candidates,
    1.08,
    1.34,
    3,
    (a, b) => b.modelWinProbPct - a.modelWinProbPct || b.investabilityScore - a.investabilityScore
  );
  if (safeLegs.length < 2) {
    safeLegs = pickUniqueMatchLegs(
      candidates,
      1.06,
      1.42,
      3,
      (a, b) => b.modelWinProbPct - a.modelWinProbPct
    );
  }

  // 2. MEDIUM · TOP 10 VETTED DAILY PICKS (1.36x – 1.62x, prioritizing 1.40x–1.55x sweet spot)
  const mediumSort = (a: CandidateLeg, b: CandidateLeg) => {
    const distA = Math.abs(a.oddsDecimal - 1.47);
    const distB = Math.abs(b.oddsDecimal - 1.47);
    const scoreA = a.investabilityScore * 6 + a.modelWinProbPct - distA * 35;
    const scoreB = b.investabilityScore * 6 + b.modelWinProbPct - distB * 35;
    return scoreB - scoreA;
  };

  let mediumLegs = pickUniqueMatchLegs(candidates, 1.35, 1.62, 10, mediumSort);
  if (mediumLegs.length < 10) {
    // Expand slightly to 1.30–1.72 only if needed to fill up to 10 vetted picks
    mediumLegs = pickUniqueMatchLegs(candidates, 1.3, 1.72, 10, mediumSort);
  }

  // 3. WORTH-THE-RISK VALUE STEP (1.75x – 3.60x per leg, highest EV / asymmetric upside)
  let valueLegs = pickUniqueMatchLegs(
    candidates,
    1.75,
    3.6,
    3,
    (a, b) => b.edgePct * b.oddsDecimal - a.edgePct * a.oddsDecimal
  );
  if (valueLegs.length < 2) {
    valueLegs = pickUniqueMatchLegs(
      candidates,
      1.6,
      4.0,
      3,
      (a, b) => b.edgePct - a.edgePct
    );
  }

  return [
    summarizeParlay(
      'safe',
      'Tier 1 · Safe Compounder',
      'SAFE STEP',
      '1.10x – 1.30x / leg',
      'High-probability anchors & safety handicaps compounded for steady, low-variance returns.',
      safeLegs,
      'Low',
      '2.0u – 3.0u'
    ),
    summarizeParlay(
      'medium',
      'Tier 2 · Top 10 Vetted Core Picks',
      'TOP 10 CORE (1.40–1.55x)',
      '1.40x – 1.55x / leg',
      '10 vetted daily picks across Esports, Football Top 5, NBA & Tennis — each graded 1–10 with explicit risk notes. Select any legs to build your step.',
      mediumLegs,
      'Medium',
      '1.0u – 1.5u'
    ),
    summarizeParlay(
      'value_risk',
      'Tier 3 · High-Value Upside',
      'WORTH THE RISK',
      '1.75x – 3.50x / leg',
      'Mispriced underdogs, -1.5 handicaps & Over lines offering asymmetric +EV payout.',
      valueLegs,
      'High',
      '0.25u – 0.5u'
    ),
  ];
}
