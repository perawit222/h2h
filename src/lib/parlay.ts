import { DailyParlayTier, EsportsMatch, ParlayLeg, RiskLevel } from '@/types/esports';

interface CandidateLeg extends ParlayLeg {
  liquidity: number;
  matchScore: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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

    // 1. Moneyline legs (Team A and Team B)
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
        modelWinProbPct: Math.round(modelProb * 100),
        edgePct,
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
      `${match.teamA.tag} (${match.teamA.winRateLast10}% L10) moneyline in ${match.format}`,
      match.teamA.oddsDecimal <= match.teamB.oddsDecimal ? 0.8 : 0.4
    );

    addSide(
      match.teamB.name,
      match.teamB.oddsDecimal,
      match.teamB.impliedProb,
      'Match Winner',
      `${match.teamB.tag} (${match.teamB.winRateLast10}% L10) moneyline in ${match.format}`,
      match.teamB.oddsDecimal < match.teamA.oddsDecimal ? 0.8 : 0.4
    );

    // 2. Sub-markets (Handicap +1.5 / -1.5, Over/Under, Map 1 Winner)
    for (const s of subs) {
      if (s.category === 'Match Winner') continue;
      const isHcp = /handicap/i.test(s.question);
      const isOu = /o\/u|over\/under|total/i.test(s.question);
      const label = isHcp ? 'Map Handicap' : isOu ? 'Total Maps O/U' : 'Map Winner';

      addSide(
        s.teamA,
        s.oddsA,
        s.probA,
        label,
        `${s.question} — ${s.teamA} priced at ${s.oddsA.toFixed(2)}x`,
        isHcp && s.oddsA <= 1.35 ? 1.2 : 0.6
      );
      addSide(
        s.teamB,
        s.oddsB,
        s.probB,
        label,
        `${s.question} — ${s.teamB} priced at ${s.oddsB.toFixed(2)}x`,
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
  const combinedOdds =
    legs.length > 0
      ? Number(legs.reduce((acc, l) => acc * l.oddsDecimal, 1).toFixed(2))
      : 1.0;

  const combinedProb =
    legs.length > 0
      ? legs.reduce((acc, l) => acc * (l.modelWinProbPct / 100), 1)
      : 0;

  const combinedWinProbPct = Math.round(combinedProb * 100);
  const expectedValuePct =
    legs.length > 0 ? Number(((combinedProb * combinedOdds - 1) * 100).toFixed(1)) : 0;

  const minLiq = legs.reduce(
    (m, l) => (l.liquidity > 0 ? Math.min(m, l.liquidity) : m),
    Number.MAX_SAFE_INTEGER
  );
  const maxSafeStakeUsd =
    minLiq === Number.MAX_SAFE_INTEGER
      ? id === 'safe'
        ? 500
        : id === 'medium'
          ? 300
          : 150
      : Math.round(clamp(minLiq * (id === 'safe' ? 0.1 : id === 'medium' ? 0.08 : 0.05), 50, 5000));

  const baseScore =
    id === 'safe'
      ? clamp(Math.round(6.5 + (combinedWinProbPct - 45) * 0.08), 5, 10)
      : id === 'medium'
        ? clamp(Math.round(5.5 + (combinedWinProbPct - 30) * 0.07 + expectedValuePct * 0.12), 4, 9)
        : clamp(Math.round(3.5 + expectedValuePct * 0.18), 2, 7);

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

  // 1. SAFE STEP (1.10x – 1.34x per leg, multiplied together for high-safety compounding)
  let safeLegs = pickUniqueMatchLegs(
    candidates,
    1.08,
    1.34,
    3,
    (a, b) => b.modelWinProbPct - a.modelWinProbPct || b.matchScore - a.matchScore
  );
  if (safeLegs.length < 2) {
    safeLegs = pickUniqueMatchLegs(
      candidates,
      1.06,
      1.45,
      3,
      (a, b) => b.modelWinProbPct - a.modelWinProbPct
    );
  }

  // 2. MEDIUM HIGH-WINRATE STEP (1.35x – 1.65x per leg, strong win-rate & conviction)
  let mediumLegs = pickUniqueMatchLegs(
    candidates,
    1.35,
    1.65,
    3,
    (a, b) => b.modelWinProbPct + b.edgePct * 2 - (a.modelWinProbPct + a.edgePct * 2)
  );
  if (mediumLegs.length < 2) {
    mediumLegs = pickUniqueMatchLegs(
      candidates,
      1.28,
      1.75,
      3,
      (a, b) => b.modelWinProbPct - a.modelWinProbPct
    );
  }

  // 3. WORTH-THE-RISK VALUE STEP (1.70x – 3.60x per leg, highest EV / mispriced dogs & handicaps)
  let valueLegs = pickUniqueMatchLegs(
    candidates,
    1.7,
    3.6,
    3,
    (a, b) => b.edgePct * b.oddsDecimal - a.edgePct * a.oddsDecimal
  );
  if (valueLegs.length < 2) {
    valueLegs = pickUniqueMatchLegs(
      candidates,
      1.55,
      4.0,
      2,
      (a, b) => b.edgePct - a.edgePct
    );
  }

  return [
    summarizeParlay(
      'safe',
      'Tier 1 · Safe Compounder',
      'SAFE STEP',
      '1.10x – 1.30x / leg',
      'High-probability anchors & +1.5 safety cushions compounded for steady, low-variance returns.',
      safeLegs,
      'Low',
      '2.0u – 3.0u'
    ),
    summarizeParlay(
      'medium',
      'Tier 2 · High-Winrate Core',
      'MEDIUM STEP',
      '1.35x – 1.60x / leg',
      'Strong favorites & sharp handicaps with superior win-rate and positive model edge.',
      mediumLegs,
      'Medium',
      '1.0u – 1.5u'
    ),
    summarizeParlay(
      'value_risk',
      'Tier 3 · High-Value Upside',
      'WORTH THE RISK',
      '1.75x – 3.50x / leg',
      'Mispriced underdogs, -1.5 sweeps & Over 2.5 spots offering asymmetric +EV payout.',
      valueLegs,
      'High',
      '0.25u – 0.5u'
    ),
  ];
}
