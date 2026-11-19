import {
  EsportsMatch,
  MatchAnalysis,
  RecommendedMarketAngle,
  RiskLevel,
} from '@/types/esports';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getInvestabilityLabel(score: number): string {
  if (score >= 8) return 'Prime Value (High Conviction)';
  if (score >= 6) return 'Playable Edge (Moderate Risk)';
  if (score >= 4) return 'Speculative (High Variance)';
  return 'Avoid / Extreme Risk';
}

function computeLiquidityProfile(match: EsportsMatch, interestScore: number): {
  liquidityTier: 'Deep' | 'Moderate' | 'Thin' | 'Unpriced';
  maxSafeStakeUsd: number;
  recommendedUnits: string;
} {
  const liq = match.liquidity ?? 0;
  const vol = match.volume24h ?? 0;

  let liquidityTier: 'Deep' | 'Moderate' | 'Thin' | 'Unpriced' = 'Unpriced';
  let maxSafeStakeUsd = 0;

  if (liq >= 25000 || vol >= 50000) {
    liquidityTier = 'Deep';
    // ~10% of orderbook liquidity before noticeable slippage
    maxSafeStakeUsd = Math.round(Math.min(10000, Math.max(1500, liq * 0.1)));
  } else if (liq >= 5000 || vol >= 8000) {
    liquidityTier = 'Moderate';
    maxSafeStakeUsd = Math.round(Math.min(2500, Math.max(300, liq * 0.08)));
  } else if (liq > 0 || vol > 0) {
    liquidityTier = 'Thin';
    maxSafeStakeUsd = Math.round(Math.max(50, Math.min(350, (liq || vol) * 0.05)));
  } else {
    liquidityTier = 'Unpriced';
    maxSafeStakeUsd = 250; // conservative reference cap when no live Polymarket book
  }

  let recommendedUnits = '0.0u (Pass)';
  if (interestScore >= 8) {
    recommendedUnits = liquidityTier === 'Thin' ? '0.75u (Capped by Thin Book)' : '2.0u (High Conviction)';
  } else if (interestScore >= 6) {
    recommendedUnits = liquidityTier === 'Thin' ? '0.5u (Thin Liquidity)' : '1.0u (Standard)';
  } else if (interestScore >= 4) {
    recommendedUnits = '0.5u (Small / Speculative)';
  }

  return { liquidityTier, maxSafeStakeUsd, recommendedUnits };
}

function pickBestMarketAngle(
  match: EsportsMatch,
  recTeamName: string,
  recOdds: number,
  bestEdge: number
): RecommendedMarketAngle {
  const subs = match.markets || [];
  const hcpMarket = subs.find((s) => /handicap/i.test(s.question));
  const ouMarket = subs.find((s) => /o\/u|over\/under|total/i.test(s.question));
  const map1Market = subs.find((s) => /map\s+1|game\s+1/i.test(s.question));

  // If moneyline favorite is heavily juiced (< 1.50) and Handicap (-1.5) is available, suggest Handicap!
  if (recOdds < 1.5 && hcpMarket) {
    const isTeamA = hcpMarket.teamA.toLowerCase().includes(recTeamName.toLowerCase());
    const sel = isTeamA ? hcpMarket.teamA : hcpMarket.teamB;
    const odds = isTeamA ? hcpMarket.oddsA : hcpMarket.oddsB;
    return {
      category: 'Map Handicap',
      question: hcpMarket.question,
      selection: sel,
      oddsDecimal: odds,
      edgeNote: `Moneyline (${recOdds.toFixed(2)}x) is heavily juiced — Map Handicap offers cleaner risk/reward at ${odds.toFixed(2)}x.`,
    };
  }

  // If teams are tightly matched (odds both ~1.75–2.15) and Over/Under is available, highlight O/U!
  if (Math.abs(match.teamA.oddsDecimal - match.teamB.oddsDecimal) <= 0.32 && ouMarket && bestEdge < 3.5) {
    return {
      category: 'Games Total (O/U)',
      question: ouMarket.question,
      selection: ouMarket.teamA, // Over
      oddsDecimal: ouMarket.oddsA,
      edgeNote: `Tightly priced coin-flip series — Over maps (${ouMarket.oddsA.toFixed(2)}x) avoids picking a side in a 3-map war.`,
    };
  }

  // If Map 1 Winner has a sharper 24h swing than Match Winner, highlight Map 1
  if (map1Market && Math.abs(map1Market.priceChange24h) >= 0.08) {
    const sideA = map1Market.priceChange24h >= 0;
    return {
      category: 'Map 1 Winner',
      question: map1Market.question,
      selection: sideA ? map1Market.teamA : map1Market.teamB,
      oddsDecimal: sideA ? map1Market.oddsA : map1Market.oddsB,
      edgeNote: `Sharp ${(map1Market.priceChange24h * 100).toFixed(1)}% 24h order-book movement detected specifically on Map 1.`,
    };
  }

  return {
    category: 'Match Winner (Moneyline)',
    question: `${match.teamA.name} vs ${match.teamB.name} (${match.format})`,
    selection: recTeamName,
    oddsDecimal: recOdds,
    edgeNote: `Direct series moneyline offers the deepest liquidity and cleanest +${bestEdge.toFixed(1)}% estimated edge.`,
  };
}

export function runDeterministicAnalysis(match: EsportsMatch): MatchAnalysis {
  const { teamA, teamB, h2h, mapOrDraftContext, isLan, format, narrativeNotes } = match;

  const formDiff = teamA.winRateLast10 - teamB.winRateLast10;
  const recentWinsA = teamA.recentForm.filter((r) => r === 'W').length;
  const recentWinsB = teamB.recentForm.filter((r) => r === 'W').length;
  const starBonusA = teamA.starPlayer.trend === 'hot' ? 4 : teamA.starPlayer.trend === 'cold' ? -4 : 0;
  const starBonusB = teamB.starPlayer.trend === 'hot' ? 4 : teamB.starPlayer.trend === 'cold' ? -4 : 0;
  const formEdgeA = formDiff * 0.45 + (recentWinsA - recentWinsB) * 3 + (starBonusA - starBonusB);

  const totalH2H = Math.max(1, h2h.teamAWins + h2h.teamBWins);
  const h2hRateA = h2h.teamAWins / totalH2H;
  const h2hEdgeA = (h2hRateA - 0.5) * 30 + clamp(h2h.mapDiffA * 1.5, -8, 8);

  const mapEdgeA = mapOrDraftContext.edgeTeam === 'A' ? 14 : mapOrDraftContext.edgeTeam === 'B' ? -14 : 0;

  const envRateA = isLan ? teamA.lanWinRate : teamA.onlineWinRate;
  const envRateB = isLan ? teamB.lanWinRate : teamB.onlineWinRate;
  let envEdgeA = (envRateA - envRateB) * 0.35;
  if (teamA.hasStandIn) envEdgeA -= 10;
  if (teamB.hasStandIn) envEdgeA += 10;

  const rawScoreA = 50 + formEdgeA * 0.4 + h2hEdgeA * 0.25 + mapEdgeA * 0.4 + envEdgeA * 0.35;
  const fairProbA = clamp(rawScoreA / 100, 0.2, 0.82);
  const fairProbB = 1 - fairProbA;

  const vigSum = teamA.impliedProb + teamB.impliedProb;
  const marketProbA = teamA.impliedProb / vigSum;
  const marketProbB = teamB.impliedProb / vigSum;

  const edgeA = (fairProbA - marketProbA) * 100;
  const edgeB = (fairProbB - marketProbB) * 100;

  const recommendA = edgeA >= edgeB;
  const bestEdge = Number(Math.max(0.4, Math.max(edgeA, edgeB)).toFixed(1));
  const recTeam = recommendA ? teamA : teamB;
  const recFairProb = recommendA ? fairProbA : fairProbB;
  const fairOddsDecimal = Number((1 / recFairProb).toFixed(2));
  const marketOddsDecimal = recTeam.oddsDecimal;

  // Risk points (higher = riskier)
  let riskPoints = 22;
  if (format === 'Bo1') riskPoints += 32;
  else if (format === 'Bo3') riskPoints += 12;
  if (teamA.hasStandIn || teamB.hasStandIn) riskPoints += 22;
  if (recTeam.oddsDecimal >= 2.35) riskPoints += 18;
  if (Math.abs(formDiff) <= 6) riskPoints += 10;
  if (!isLan) riskPoints += 10;
  if (match.tier === 'B-Tier') riskPoints += 14;
  if ((match.liquidity ?? 0) > 0 && (match.liquidity ?? 0) < 5000) riskPoints += 12;

  const riskLevel: RiskLevel =
    riskPoints >= 75 ? 'Extreme' : riskPoints >= 55 ? 'High' : riskPoints >= 35 ? 'Medium' : 'Low';

  // 1-10 Investability Scale: 10 = High Conviction / Best to Invest, 1 = Extremely Risky / Avoid
  let investRaw = 5.5 + bestEdge * 0.48;
  if (riskLevel === 'Extreme') investRaw -= 3.2;
  else if (riskLevel === 'High') investRaw -= 1.8;
  else if (riskLevel === 'Low') investRaw += 1.0;
  if (match.tier === 'S-Tier') investRaw += 0.8;
  if ((match.liquidity ?? 0) >= 20000) investRaw += 0.6;
  const interestScore = clamp(Math.round(investRaw), 1, 10);

  const { liquidityTier, maxSafeStakeUsd, recommendedUnits } = computeLiquidityProfile(
    match,
    interestScore
  );
  const recommendedMarket = pickBestMarketAngle(match, recTeam.name, marketOddsDecimal, bestEdge);

  const narrativeTags: string[] = [];
  if (isLan) {
    if (teamA.lanWinRate - teamA.onlineWinRate >= 5) narrativeTags.push(`${teamA.tag} LAN Buff`);
    if (teamB.lanWinRate - teamB.onlineWinRate >= 5) narrativeTags.push(`${teamB.tag} LAN Buff`);
  } else {
    narrativeTags.push('Online Variance');
  }
  if (format === 'Bo1') narrativeTags.push('Bo1 Upset Risk');
  if (format === 'Bo5') narrativeTags.push('Deep Pool Endurance');
  if (liquidityTier === 'Deep') narrativeTags.push('Deep Liquidity');
  if (liquidityTier === 'Thin') narrativeTags.push('Thin Book Warning');
  if (recTeam.oddsDecimal >= 2.1) narrativeTags.push('Underdog Value');
  if (narrativeTags.length < 3) narrativeTags.push(`${match.tier} Fixture`);

  const formScore = clamp(Math.round(50 + Math.abs(formEdgeA) * 1.4), 35, 95);
  const h2hScore = clamp(Math.round(50 + Math.abs(h2hEdgeA) * 1.5), 35, 95);
  const draftScore = mapOrDraftContext.edgeTeam === 'Even' ? 54 : 78;
  const narrativeScore = clamp(Math.round(55 + Math.abs(envEdgeA) * 2.2), 40, 92);

  const verdictHeadline =
    interestScore >= 8
      ? `High-conviction play on ${recommendedMarket.selection} (${recommendedMarket.category} @ ${recommendedMarket.oddsDecimal.toFixed(2)}x)`
      : interestScore >= 5
        ? `Playable edge leaning ${recommendedMarket.selection} — size conservatively (${recommendedUnits})`
        : `High variance / thin margin — treat as speculative or pass (${interestScore}/10)`;

  return {
    matchId: match.id,
    engine: 'deterministic',
    interestScore,
    investabilityLabel: getInvestabilityLabel(interestScore),
    estimatedEdgePct: bestEdge,
    riskLevel,
    recommendedSide: recTeam.name,
    fairOddsDecimal,
    marketOddsDecimal,
    maxSafeStakeUsd,
    recommendedUnits,
    liquidityTier,
    recommendedMarket,
    verdictHeadline,
    narrativeTags: Array.from(new Set(narrativeTags)).slice(0, 4),
    pillars: {
      recentForm: {
        title: 'Recent Form & Star Output',
        score: formScore,
        lean: formEdgeA >= 0 ? teamA.name : teamB.name,
        summary: `${teamA.tag} (${teamA.winRateLast10}% L10) faces ${teamB.tag} (${teamB.winRateLast10}% L10). ${
          formEdgeA >= 0 ? teamA.name : teamB.name
        } projects stronger recent consistency.`,
        bullets: [
          `${teamA.tag} Last 5: ${teamA.recentForm.join('-')} | ${teamA.starPlayer.name}: ${teamA.starPlayer.metricValue}`,
          `${teamB.tag} Last 5: ${teamB.recentForm.join('-')} | ${teamB.starPlayer.name}: ${teamB.starPlayer.metricValue}`,
        ],
      },
      headToHead: {
        title: 'Head-to-Head (H2H)',
        score: h2hScore,
        lean: h2h.teamAWins >= h2h.teamBWins ? teamA.name : teamB.name,
        summary: h2h.lastMeetingSummary,
        bullets: [
          `Historical Edge: ${teamA.tag} ${h2h.teamAWins} – ${h2h.teamBWins} ${teamB.tag}`,
          `Market Context: ${match.source} (${match.stage})`,
        ],
      },
      statsAndDraft: {
        title: 'Stats & Map/Draft Edge',
        score: draftScore,
        lean:
          mapOrDraftContext.edgeTeam === 'A'
            ? teamA.name
            : mapOrDraftContext.edgeTeam === 'B'
              ? teamB.name
              : 'Even Matchup',
        summary: mapOrDraftContext.statHighlight,
        bullets: [
          `Key Maps / Draft Priority: ${mapOrDraftContext.keyMapsOrHeroes.join(', ')}`,
          `Best Market Angle: ${recommendedMarket.edgeNote}`,
        ],
      },
      narrativesAndCurses: {
        title: 'Narratives & "Curses"',
        score: narrativeScore,
        lean: envEdgeA >= 0 ? teamA.name : teamB.name,
        summary: `${isLan ? 'LAN Stage' : 'Online'} environment + ${liquidityTier} liquidity tier (max safe stake ~$${maxSafeStakeUsd.toLocaleString()}).`,
        bullets: [
          ...narrativeNotes,
          `${teamA.tag} LAN/Online: ${teamA.lanWinRate}%/${teamA.onlineWinRate}% vs ${teamB.tag}: ${teamB.lanWinRate}%/${teamB.onlineWinRate}%`,
        ],
      },
    },
  };
}

export async function analyzeMatch(match: EsportsMatch): Promise<MatchAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const base = runDeterministicAnalysis(match);

  if (!apiKey) {
    return base;
  }

  try {
    const prompt = `You are a sharp quantitative esports betting analyst. Analyze this match (including Moneyline, Map Handicap, Over/Under, and liquidity depth) and return ONLY valid JSON matching the exact schema below.
Scale rule: interestScore MUST be 1 to 10 where 10 = High Conviction / Best to Invest and 1 = Extremely Risky / Avoid.

Match Data:
${JSON.stringify(match)}

Required JSON schema:
{
  "interestScore": number (1-10 integer),
  "estimatedEdgePct": number,
  "riskLevel": "Low" | "Medium" | "High" | "Extreme",
  "recommendedSide": string,
  "fairOddsDecimal": number,
  "marketOddsDecimal": number,
  "verdictHeadline": string,
  "narrativeTags": string[],
  "pillars": {
    "recentForm": { "title": "Recent Form & Star Output", "score": number, "lean": string, "summary": string, "bullets": string[] },
    "headToHead": { "title": "Head-to-Head (H2H)", "score": number, "lean": string, "summary": string, "bullets": string[] },
    "statsAndDraft": { "title": "Stats & Map/Draft Edge", "score": number, "lean": string, "summary": string, "bullets": string[] },
    "narrativesAndCurses": { "title": "Narratives & \\"Curses\\"", "score": number, "lean": string, "summary": string, "bullets": string[] }
  }
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.35,
          },
        }),
      }
    );

    if (!res.ok) return base;
    const payload = await res.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return base;

    const parsed = JSON.parse(rawText);
    const score = clamp(Math.round(Number(parsed.interestScore) || base.interestScore), 1, 10);
    const liqProfile = computeLiquidityProfile(match, score);

    return {
      ...base,
      engine: 'gemini',
      interestScore: score,
      investabilityLabel: getInvestabilityLabel(score),
      estimatedEdgePct: Number(parsed.estimatedEdgePct) || base.estimatedEdgePct,
      riskLevel: (['Low', 'Medium', 'High', 'Extreme'].includes(parsed.riskLevel)
        ? parsed.riskLevel
        : base.riskLevel) as RiskLevel,
      recommendedSide: parsed.recommendedSide || base.recommendedSide,
      fairOddsDecimal: Number(parsed.fairOddsDecimal) || base.fairOddsDecimal,
      marketOddsDecimal: Number(parsed.marketOddsDecimal) || base.marketOddsDecimal,
      ...liqProfile,
      verdictHeadline: parsed.verdictHeadline || base.verdictHeadline,
      narrativeTags: Array.isArray(parsed.narrativeTags) ? parsed.narrativeTags.slice(0, 4) : base.narrativeTags,
      pillars: parsed.pillars || base.pillars,
    };
  } catch {
    return base;
  }
}
