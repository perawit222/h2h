import {
  EsportsMatch,
  MatchAnalysis,
  RecommendedMarketAngle,
  RiskLevel,
  VerdictBadge,
} from '@/types/esports';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getInvestabilityLabel(score: number, verdict: VerdictBadge): string {
  if (verdict === 'TRAP MATCH / AVOID') return 'Trap Match — Do Not Bet';
  if (verdict === 'HIGH VARIANCE / SKIP') return 'High Variance — Skip / Pass';
  if (score >= 8) return 'Prime Series Lock (High Conviction)';
  if (score >= 6) return 'Playable Series Edge';
  if (score >= 4) return 'Marginal / Speculative';
  return 'Avoid / Extreme Risk';
}

function isEsportsTitle(game: EsportsMatch['game']): boolean {
  return game === 'CS2' || game === 'Valorant' || game === 'LoL' || game === 'Dota 2';
}

function detectContextFlags(match: EsportsMatch) {
  const metaText = `${match.tournament} ${match.stage} ${match.narrativeNotes.join(' ')}`;
  const isHighStakes = /(playoff|final|semifinal|quarterfinal|elimination|decider|major|worlds|international|masters)/i.test(
    metaText
  );
  const isDeadRubberRisk =
    !isHighStakes && /(group\s+[a-d]|regular\s+season|open\s+qual|contenders)/i.test(metaText);
  const hasStandIn = Boolean(match.teamA.hasStandIn || match.teamB.hasStandIn);
  const maxSwing = (match.markets || []).reduce(
    (mx, s) => Math.max(mx, Math.abs(s.priceChange24h)),
    0
  );
  const hasSuspiciousSwing = maxSwing >= 0.14;
  return { isHighStakes, isDeadRubberRisk, hasStandIn, hasSuspiciousSwing, maxSwing };
}

function computeLiquidityProfile(
  match: EsportsMatch,
  interestScore: number,
  isSkipOrTrap: boolean
): {
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
    maxSafeStakeUsd = Math.round(Math.min(10000, Math.max(1500, liq * 0.1)));
  } else if (liq >= 5000 || vol >= 8000) {
    liquidityTier = 'Moderate';
    maxSafeStakeUsd = Math.round(Math.min(2500, Math.max(300, liq * 0.08)));
  } else if (liq > 0 || vol > 0) {
    liquidityTier = 'Thin';
    maxSafeStakeUsd = Math.round(Math.max(50, Math.min(350, (liq || vol) * 0.05)));
  } else {
    liquidityTier = 'Unpriced';
    maxSafeStakeUsd = 250;
  }

  if (isSkipOrTrap) {
    return {
      liquidityTier,
      maxSafeStakeUsd: 0,
      recommendedUnits: '0.0u (NO BET / Skip)',
    };
  }

  let recommendedUnits = '0.5u (Small)';
  if (interestScore >= 8) {
    recommendedUnits =
      liquidityTier === 'Thin' ? '0.75u (Capped by Thin Book)' : '2.0u (Series Lock)';
  } else if (interestScore >= 6) {
    recommendedUnits = liquidityTier === 'Thin' ? '0.5u (Thin Book)' : '1.0u (Standard Series)';
  }

  return { liquidityTier, maxSafeStakeUsd, recommendedUnits };
}

/**
 * Series-First Multi-Factor Deterministic Engine (6 Pillars)
 * Strictly evaluates Pillars 1-5 BEFORE comparing against bookmaker odds (Pillar 6).
 */
export function runDeterministicAnalysis(match: EsportsMatch): MatchAnalysis {
  const { teamA, teamB, h2h, mapOrDraftContext, isLan, format, narrativeNotes, game } = match;
  const esports = isEsportsTitle(game);
  const ctx = detectContextFlags(match);

  // =========================================================================
  // STEP 1: EVALUATE PILLARS 1-5 STRICTLY BEFORE LOOKING AT BOOKMAKER ODDS
  // =========================================================================

  // Pillar 1: Strength of Schedule (SoS) & True Form
  const tierWeight = match.tier === 'S-Tier' ? 1.15 : match.tier === 'A-Tier' ? 1.0 : 0.85;
  const formDiff = (teamA.winRateLast10 - teamB.winRateLast10) * tierWeight;
  const rankDiff = clamp((teamB.ranking - teamA.ranking) * 0.45, -10, 10);
  const recentWinsA = teamA.recentForm.filter((r) => r === 'W').length;
  const recentWinsB = teamB.recentForm.filter((r) => r === 'W').length;
  const starBonusA =
    teamA.starPlayer.trend === 'hot' ? 4.5 : teamA.starPlayer.trend === 'cold' ? -4.5 : 0;
  const starBonusB =
    teamB.starPlayer.trend === 'hot' ? 4.5 : teamB.starPlayer.trend === 'cold' ? -4.5 : 0;
  const pillar1EdgeA =
    formDiff * 0.4 + rankDiff * 0.45 + (recentWinsA - recentWinsB) * 2.5 + (starBonusA - starBonusB);

  // Pillar 2: Series Depth (Map Pool / Draft Adaptability)
  const depthMultiplier = format === 'Bo5' ? 1.25 : format === 'Bo3' ? 1.0 : format === 'Bo1' ? 0.35 : 0.95;
  const rawDepthA =
    (mapOrDraftContext.edgeTeam === 'A' ? 14 : mapOrDraftContext.edgeTeam === 'B' ? -14 : 0) +
    (teamA.winRateLast10 - teamB.winRateLast10) * 0.18;
  const pillar2EdgeA = rawDepthA * depthMultiplier;

  // Pillar 3: Stylistic Matchup & Relevant H2H
  const totalH2H = Math.max(1, h2h.teamAWins + h2h.teamBWins);
  const h2hRateA = h2h.teamAWins / totalH2H;
  const pillar3EdgeA = (h2hRateA - 0.5) * 24 + clamp(h2h.mapDiffA * 1.4, -7, 7);

  // Pillar 4: Stakes, Motivation & Physical/Mental Context
  let pillar4EdgeA = 0;
  if (teamA.hasStandIn) pillar4EdgeA -= 12;
  if (teamB.hasStandIn) pillar4EdgeA += 12;
  if (ctx.isHighStakes) {
    // Higher-ranked veteran rosters execute cleaner in elimination/playoffs
    pillar4EdgeA += clamp((teamB.ranking - teamA.ranking) * 0.25, -5, 5);
  }

  // Pillar 5: Narratives, Environment & "Curses"
  const envRateA = isLan ? teamA.lanWinRate : teamA.onlineWinRate;
  const envRateB = isLan ? teamB.lanWinRate : teamB.onlineWinRate;
  const pillar5EdgeA = (envRateA - envRateB) * 0.35;

  // Composite TRUE SERIES WIN PROBABILITY (computed purely from Pillars 1–5, zero odds leakage)
  const structuralDiffA =
    pillar1EdgeA * 0.52 +
    pillar2EdgeA * 0.34 +
    pillar3EdgeA * 0.14 +
    pillar4EdgeA * 0.1 +
    pillar5EdgeA * 0.15;

  const trueProbA = clamp((50 + structuralDiffA) / 100, 0.1, 0.92);
  const trueProbB = 1 - trueProbA;

  // Identify structurally superior team BEFORE looking at odds
  const structuralFavIsA = trueProbA >= trueProbB;
  const favTeam = structuralFavIsA ? teamA : teamB;
  const dogTeam = structuralFavIsA ? teamB : teamA;
  const favTrueProb = structuralFavIsA ? trueProbA : trueProbB;
  const dogTrueProb = 1 - favTrueProb;

  // =========================================================================
  // STEP 2: PILLAR 6 — ODDS AS A FINAL SANITY CHECK (VALUE & TRAP DETECTION)
  // =========================================================================
  const vigSum = Math.max(0.01, teamA.impliedProb + teamB.impliedProb);
  const marketProbA = teamA.impliedProb / vigSum;
  const marketProbB = teamB.impliedProb / vigSum;

  const favMarketProb = structuralFavIsA ? marketProbA : marketProbB;
  const dogMarketProb = structuralFavIsA ? marketProbB : marketProbA;

  const favEdgePct = Number(((favTrueProb - favMarketProb) * 100).toFixed(1));
  const dogEdgePct = Number(((dogTrueProb - dogMarketProb) * 100).toFixed(1));

  // Anti-"Fake Value" Rule: Never chase an underdog solely for big odds if their true series prob < 44%
  const dogHasRealDepth = dogTrueProb >= 0.44 && dogEdgePct >= 3.5 && format !== 'Bo1';
  const chooseFav = !dogHasRealDepth || favEdgePct >= dogEdgePct - 1.5;

  const recTeam = chooseFav ? favTeam : dogTeam;
  const recTrueProb = chooseFav ? favTrueProb : dogTrueProb;
  const recMarketProb = chooseFav ? favMarketProb : dogMarketProb;
  const recEdgePct = chooseFav ? favEdgePct : dogEdgePct;

  const trueWinProbPct = Math.round(recTrueProb * 100);
  const marketImpliedProbPct = Math.round(recMarketProb * 100);
  const fairOddsDecimal = Number((1 / recTrueProb).toFixed(2));
  const marketOddsDecimal = recTeam.oddsDecimal;

  // Trap Favorite Detection (ONLY trigger on real trap signals: stand-in, suspicious swing, dead-rubber B-tier juiced fav, or severe -10% mispricing)
  const isTrapFavorite =
    marketOddsDecimal <= 1.28 &&
    (ctx.hasStandIn ||
      ctx.hasSuspiciousSwing ||
      (ctx.isDeadRubberRisk && match.tier === 'B-Tier' && recEdgePct < -3.5) ||
      recEdgePct <= -10.0);

  // Series-First Variance Penalty (Bo1 or coin-flip with zero structural depth)
  const isBo1 = format === 'Bo1';
  const isCoinFlipNoDepth = Math.abs(trueProbA - trueProbB) < 0.04 && recEdgePct < 1.5;

  // Risk calculation
  let riskPoints = 18;
  if (isBo1) riskPoints += 42;
  else if (format === 'Bo3') riskPoints += 10;
  else if (format === 'Bo5') riskPoints += 4;
  else if (game === 'Football') riskPoints += 16;
  if (ctx.hasStandIn) riskPoints += 24;
  if (ctx.isDeadRubberRisk) riskPoints += 12;
  if (ctx.hasSuspiciousSwing) riskPoints += 25;
  if (match.tier === 'B-Tier') riskPoints += 10;
  if ((match.liquidity ?? 0) > 0 && (match.liquidity ?? 0) < 3500) riskPoints += 10;
  if (recTrueProb < 0.52) riskPoints += 12;

  const riskLevel: RiskLevel =
    riskPoints >= 72 ? 'Extreme' : riskPoints >= 52 ? 'High' : riskPoints >= 32 ? 'Medium' : 'Low';

  // Verdict Badge Assignment (Strictly following Institutional Philosophy)
  let verdictBadge: VerdictBadge;
  if (isTrapFavorite || ctx.hasSuspiciousSwing) {
    verdictBadge = 'TRAP MATCH / AVOID';
  } else if (isBo1 || isCoinFlipNoDepth || (riskLevel === 'Extreme' && recEdgePct < 4)) {
    verdictBadge = 'HIGH VARIANCE / SKIP';
  } else if (
    recTrueProb >= 0.64 &&
    recEdgePct >= -2.5 &&
    (riskLevel === 'Low' || riskLevel === 'Medium') &&
    !ctx.hasStandIn
  ) {
    verdictBadge = 'STRONG SERIES LOCK';
  } else if (recEdgePct >= 1.0 && recTrueProb >= 0.45) {
    verdictBadge = 'VALUE SERIES PLAY';
  } else if (recTrueProb >= 0.56 && recEdgePct >= -4.0 && riskLevel !== 'Extreme') {
    verdictBadge = 'VALUE SERIES PLAY';
  } else {
    verdictBadge = 'HIGH VARIANCE / SKIP';
  }

  const isSkipOrTrap =
    verdictBadge === 'HIGH VARIANCE / SKIP' || verdictBadge === 'TRAP MATCH / AVOID';

  // Market Recommendation — NEVER push risky Map 1 / Map 2 single-map gambles!
  const seriesLabel = esports
    ? `Series Winner (${format})`
    : game === 'Football'
      ? 'Full-Match / Asian Handicap (90m)'
      : game === 'NBA'
        ? 'Full-Game Moneyline (4Q)'
        : 'Match Winner (Full Sets)';

  const marketRecommendation = isSkipOrTrap ? 'NO BET (Skip)' : `Recommended Market: ${seriesLabel}`;

  // 1-10 Investability Score
  let investRaw = 5.2 + recEdgePct * 0.42 + (recTrueProb - 0.5) * 8;
  if (verdictBadge === 'STRONG SERIES LOCK') investRaw = Math.max(investRaw, 8);
  if (verdictBadge === 'HIGH VARIANCE / SKIP') investRaw = Math.min(investRaw, 4);
  if (verdictBadge === 'TRAP MATCH / AVOID') investRaw = Math.min(investRaw, 2);
  if (isBo1) investRaw = Math.min(investRaw, 3);
  if (match.tier === 'S-Tier' && !isSkipOrTrap) investRaw += 0.6;
  const interestScore = clamp(Math.round(investRaw), 1, 10);

  const { liquidityTier, maxSafeStakeUsd, recommendedUnits } = computeLiquidityProfile(
    match,
    interestScore,
    isSkipOrTrap
  );

  // Recommended Market Angle (Series-First: strictly Series Winner or safe full-match line, never Map 1/2)
  const recommendedMarket: RecommendedMarketAngle = isSkipOrTrap
    ? {
        category: 'NO BET (Skip)',
        question: `${teamA.name} vs ${teamB.name} (${format})`,
        selection: 'PASS / WAIT FOR LIVE SERIES',
        oddsDecimal: marketOddsDecimal,
        edgeNote:
          verdictBadge === 'TRAP MATCH / AVOID'
            ? `Rejected by Trap Filter: ${
                ctx.hasSuspiciousSwing
                  ? `Suspicious ${(ctx.maxSwing * 100).toFixed(1)}% 24h price swing.`
                  : `Heavily juiced price (${marketOddsDecimal.toFixed(2)}x) carries unjustified downside risk.`
              }`
            : `Rejected by Series-First Variance Filter (${format}). Do not gamble on single-map flukes or thin edges.`,
      }
    : {
        category: seriesLabel,
        question: `${teamA.name} vs ${teamB.name} (${format})`,
        selection: recTeam.name,
        oddsDecimal: marketOddsDecimal,
        edgeNote: `Model True Win Prob (${trueWinProbPct}%) beats Market Implied (${marketImpliedProbPct}%) by ${
          recEdgePct >= 0 ? `+${recEdgePct}%` : `${recEdgePct}%`
        } over the full ${format}.`,
      };

  // Dedicated "Why Series > Single Map" Anti-Tilt Callout (1–2 sentences)
  const whySeriesOverSingleMap = isBo1
    ? `Bo1 carries severe pistol-round, early-cheese, and single-map variance with zero room for adaptation. Wait for a Bo3/Bo5 series market or skip entirely rather than gambling on one map.`
    : esports
      ? `${recTeam.name}'s deeper ${format} map/draft pool (${mapOrDraftContext.keyMapsOrHeroes
          .slice(0, 3)
          .join(', ')}) and mid-series adaptation insulate this play even if ${
          dogTeam.name === recTeam.name ? favTeam.name : dogTeam.name
        } steals Map 1 on their comfort pick. Backing the full ${format} Series Winner neutralizes pistol-round luck and cheese-draft variance.`
      : `Backing full-match structural superiority (${format}) filters out single-quarter, single-set, or early-goal variance—rewarding ${recTeam.name}'s deeper roster, conditioning, and tactical adjustments across the full contest.`;

  // Key Risk / Invalidation Factors
  const invalidationFactors: string[] = [];
  if (isBo1) {
    invalidationFactors.push(
      `Bo1 Format Penalty: One lost pistol/early skirmish or surprise pocket pick can invalidate superior macro instantly.`
    );
  } else if (esports) {
    invalidationFactors.push(
      `Veto / Draft Trap: If ${recTeam.name} floats ${mapOrDraftContext.keyMapsOrHeroes[0] || 'opponent comfort pick'} uncontested in the veto, Map 1 momentum could swing hard.`
    );
    invalidationFactors.push(
      `Slow Map 1 Start (Anti-Tilt): Expect potential volatility on opponent's map pick — do not panic-hedge before the decider pool kicks in.`
    );
  }
  if (game === 'Football') {
    invalidationFactors.push(
      `90-Minute Draw Risk: Low-scoring deadlocks invalidate straight Moneyline plays — consider Asian Handicap (-0.5 / DNB) if odds tighten.`
    );
  }
  if (ctx.isDeadRubberRisk) {
    invalidationFactors.push(
      `Motivation / Dead-Rubber Flag: ${match.stage} carries lower stakes than elimination playoffs; watch for experimental drafts or hidden strats.`
    );
  }
  if (ctx.hasStandIn) {
    invalidationFactors.push(
      `Roster Instability: Active stand-in disrupts mid-round calling and late-game synergy.`
    );
  }
  if (ctx.hasSuspiciousSwing) {
    invalidationFactors.push(
      `Market Integrity Alert: Abnormal ${(ctx.maxSwing * 100).toFixed(1)}% 24h Polymarket odds swing detected — potential insider leak or sharp steam against consensus.`
    );
  }
  if (liquidityTier === 'Thin') {
    invalidationFactors.push(
      `Thin Liquidity Risk: Orderbook depth ($${Math.round(match.liquidity ?? 0).toLocaleString()}) caps safe execution at ~$${maxSafeStakeUsd.toLocaleString()} before slippage.`
    );
  }
  if (invalidationFactors.length < 2) {
    invalidationFactors.push(
      `Live Line Shift: If pre-match odds drop below fair value (${fairOddsDecimal.toFixed(2)}x), edge evaporates — pass rather than chasing steam.`
    );
  }

  // Narrative Tags
  const narrativeTags: string[] = [verdictBadge];
  if (format === 'Bo3' || format === 'Bo5') narrativeTags.push(`Series-First (${format})`);
  if (isBo1) narrativeTags.push('Bo1 Variance Penalty');
  if (ctx.isHighStakes) narrativeTags.push('High Stakes / Playoffs');
  if (ctx.isDeadRubberRisk) narrativeTags.push('Group Stage Risk');
  if (ctx.hasSuspiciousSwing) narrativeTags.push('Suspicious Odds Swing');
  if (isLan) narrativeTags.push('LAN Stage');

  // 6 Pillar Scores
  const s1 = clamp(Math.round(52 + Math.abs(pillar1EdgeA) * 1.4), 35, 96);
  const s2 = isBo1 ? 34 : clamp(Math.round(54 + Math.abs(pillar2EdgeA) * 1.9), 40, 96);
  const s3 = clamp(Math.round(50 + Math.abs(pillar3EdgeA) * 1.6), 35, 92);
  const s4 = ctx.hasStandIn || ctx.isDeadRubberRisk ? 42 : ctx.isHighStakes ? 82 : 66;
  const s5 = clamp(Math.round(55 + Math.abs(pillar5EdgeA) * 2.1), 40, 92);
  const s6 = isSkipOrTrap ? 28 : clamp(Math.round(58 + recEdgePct * 4.5), 35, 96);

  const verdictHeadline =
    verdictBadge === 'STRONG SERIES LOCK'
      ? `STRONG SERIES LOCK: ${recTeam.name} (${seriesLabel}) — ${trueWinProbPct}% True Win Prob vs ${marketImpliedProbPct}% Market`
      : verdictBadge === 'VALUE SERIES PLAY'
        ? `VALUE SERIES PLAY: ${recTeam.name} (${seriesLabel}) @ ${marketOddsDecimal.toFixed(2)}x (+${Math.max(0, recEdgePct).toFixed(1)}% edge)`
        : verdictBadge === 'TRAP MATCH / AVOID'
          ? `TRAP MATCH / AVOID: Market line (${marketOddsDecimal.toFixed(2)}x) misprices structural or motivation risk — NO BET`
          : `HIGH VARIANCE / SKIP: Insufficient series depth edge in ${format} — Pass and wait for cleaner Bo3/Bo5 spots`;

  return {
    matchId: match.id,
    engine: 'deterministic',
    verdictBadge,
    marketRecommendation,
    interestScore,
    investabilityLabel: getInvestabilityLabel(interestScore, verdictBadge),
    trueWinProbPct,
    marketImpliedProbPct,
    estimatedEdgePct: recEdgePct,
    riskLevel,
    recommendedSide: isSkipOrTrap ? 'NO BET (Skip)' : recTeam.name,
    fairOddsDecimal,
    marketOddsDecimal,
    maxSafeStakeUsd,
    recommendedUnits,
    liquidityTier,
    recommendedMarket,
    whySeriesOverSingleMap,
    invalidationFactors: invalidationFactors.slice(0, 4),
    verdictHeadline,
    narrativeTags: Array.from(new Set(narrativeTags)).slice(0, 4),
    pillars: {
      sosAndTrueForm: {
        title: '1. Strength of Schedule (SoS) & True Form',
        score: s1,
        lean: pillar1EdgeA >= 0 ? teamA.name : teamB.name,
        summary: `Tier-weighted (${match.tier}) form favors ${
          pillar1EdgeA >= 0 ? teamA.name : teamB.name
        } (${teamA.tag} ${teamA.winRateLast10}% L10 vs ${teamB.tag} ${teamB.winRateLast10}% L10).`,
        bullets: [
          `${teamA.tag} (#${teamA.ranking}): L5 ${teamA.recentForm.join('-')} · ${teamA.starPlayer.name} ${teamA.starPlayer.metricValue} (${teamA.starPlayer.trend})`,
          `${teamB.tag} (#${teamB.ranking}): L5 ${teamB.recentForm.join('-')} · ${teamB.starPlayer.name} ${teamB.starPlayer.metricValue} (${teamB.starPlayer.trend})`,
        ],
      },
      seriesDepth: {
        title: '2. Series Depth (Map Pool / Draft Adaptability)',
        score: s2,
        lean:
          mapOrDraftContext.edgeTeam === 'A'
            ? teamA.name
            : mapOrDraftContext.edgeTeam === 'B'
              ? teamB.name
              : favTeam.name,
        summary: isBo1
          ? `Bo1 single-map format severely reduces map-pool/draft depth edge — penalized as High Variance.`
          : mapOrDraftContext.statHighlight,
        bullets: [
          `Key Pools / Tactical Factors: ${mapOrDraftContext.keyMapsOrHeroes.join(', ')}`,
          `Format Depth Weight (${format}): ${
            format === 'Bo5'
              ? 'Maximum 1.25x depth edge — deep champion/map pool dominates Games 3–5.'
              : format === 'Bo3'
                ? 'Standard 1.0x series insulation — punishes 2-map ponies over 3 maps.'
                : format === 'Bo1'
                  ? '0.35x Heavy Variance Penalty — skip single-map coin flips.'
                  : 'Full-match regulation depth & roster stamina evaluated.'
          }`,
        ],
      },
      stylisticH2H: {
        title: '3. Stylistic Matchup & Relevant H2H',
        score: s3,
        lean: h2h.teamAWins >= h2h.teamBWins ? teamA.name : teamB.name,
        summary: h2h.lastMeetingSummary,
        bullets: [
          `Core-Roster H2H Baseline: ${teamA.tag} ${h2h.teamAWins} – ${h2h.teamBWins} ${teamB.tag} (Diff: ${
            h2h.mapDiffA >= 0 ? `+${h2h.mapDiffA}` : h2h.mapDiffA
          })`,
          `Stylistic Clash: Structured macro discipline carries superior series conversion over high-variance early aggression.`,
        ],
      },
      stakesAndContext: {
        title: '4. Stakes, Motivation & Physical/Mental Context',
        score: s4,
        lean: ctx.hasStandIn ? 'Caution (Stand-in)' : ctx.isHighStakes ? favTeam.name : 'Watch Motivation',
        summary: ctx.isHighStakes
          ? `High-stakes ${match.stage} (${match.tournament}) ensures peak preparation and zero strat-hiding.`
          : `Lower-stakes ${match.stage} (${match.tournament}) — monitor for dead-rubber motivation or strat experimentation.`,
        bullets: [
          `Stand-In / Roster Check: ${ctx.hasStandIn ? 'RED FLAG — Active stand-in detected!' : 'Full core roster projected.'}`,
          `Integrity Check: ${
            ctx.hasSuspiciousSwing
              ? `WARNING — ${(ctx.maxSwing * 100).toFixed(1)}% sharp 24h odds movement detected on Polymarket.`
              : 'No abnormal order-book manipulation detected.'
          }`,
        ],
      },
      narrativesAndCurses: {
        title: '5. Narratives, Environment & "Curses"',
        score: s5,
        lean: pillar5EdgeA >= 0 ? teamA.name : teamB.name,
        summary: `${isLan ? 'LAN Stage' : 'Online'} environment favors ${
          pillar5EdgeA >= 0 ? teamA.tag : teamB.tag
        } (${envRateA}% vs ${envRateB}% split win rate).`,
        bullets: [
          ...narrativeNotes,
          `${teamA.tag} LAN/Online: ${teamA.lanWinRate}%/${teamA.onlineWinRate}% vs ${teamB.tag}: ${teamB.lanWinRate}%/${teamB.onlineWinRate}%`,
        ],
      },
      oddsSanityCheck: {
        title: '6. Odds Sanity Check (Value & Trap Detection)',
        score: s6,
        lean: isSkipOrTrap ? 'NO BET (Skip)' : recTeam.name,
        summary: `Model True Prob ${trueWinProbPct}% (Fair ${fairOddsDecimal.toFixed(2)}x) vs Market Implied ${marketImpliedProbPct}% (${marketOddsDecimal.toFixed(2)}x) → Edge ${
          recEdgePct >= 0 ? `+${recEdgePct}%` : `${recEdgePct}%`
        }.`,
        bullets: [
          `Fake-Value Filter: ${
            !dogHasRealDepth
              ? `Rejected underdog payout bait (${dogTeam.oddsDecimal.toFixed(2)}x) — insufficient depth (${Math.round(
                  dogTrueProb * 100
                )}% true prob) to reliably take a full series.`
              : `Underdog passes minimum 44% series-depth threshold with genuine +${dogEdgePct}% structural value.`
          }`,
          `Trap-Favorite Filter: ${
            isTrapFavorite
              ? `TRIGGERED — Juiced price (${marketOddsDecimal.toFixed(2)}x) flagged as TRAP MATCH / AVOID.`
              : `Passed — Price is justified by multi-factor series conviction and ${liquidityTier} liquidity.`
          }`,
        ],
      },
    },
  };
}

/**
 * Gemini AI + Deterministic Fallback Series-First Analyzer
 */
export async function analyzeMatch(match: EsportsMatch): Promise<MatchAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const base = runDeterministicAnalysis(match);

  if (!apiKey) {
    return base;
  }

  try {
    const systemInstructions = `You are an institutional-grade quantitative Esports & Sports betting analyst.
STRICT PHILOSOPHY (HARDCODED RULES):
1. SERIES-FIRST VARIANCE FILTER: Prioritize Bo3/Bo5 Series Winner (or full-match winner for traditional sports). Explicitly penalize Bo1 matches and individual Map 1/Map 2 bets as HIGH VARIANCE / SKIP. Never recommend single-map gambles.
2. EVALUATE PILLARS 1-5 BEFORE LOOKING AT ODDS: Calculate True Series Win Probability from (1) Strength of Schedule & True Form, (2) Series Depth / Map Pool / Draft Adaptability, (3) Stylistic Matchup & Core-Roster H2H, (4) Stakes, Motivation, Stand-ins & Fatigue, and (5) Narratives, LAN/Online Environment & Curses.
3. ODDS AS FINAL SANITY CHECK ONLY (PILLAR 6): Never chase attractive odds ("Fake Value") if an underdog lacks the map/draft depth to win 2+ maps. Reject "Trap Favorites" (1.15-1.28 odds with fatigue, stand-in, or dead-rubber motivation risk) as TRAP MATCH / AVOID -> NO BET (Skip).
4. ANTI-TILT RULE: Include a crisp 1-2 sentence "whySeriesOverSingleMap" explaining how depth protects the bet even if the team drops Map 1.
5. VERDICT BADGE MUST BE EXACTLY ONE OF: "STRONG SERIES LOCK", "VALUE SERIES PLAY", "HIGH VARIANCE / SKIP", "TRAP MATCH / AVOID".`;

    const prompt = `${systemInstructions}

Match Data:
${JSON.stringify(match)}

Return ONLY valid JSON matching:
{
  "verdictBadge": "STRONG SERIES LOCK" | "VALUE SERIES PLAY" | "HIGH VARIANCE / SKIP" | "TRAP MATCH / AVOID",
  "marketRecommendation": string ("Recommended Market: Series Winner (Bo3)" or "NO BET (Skip)"),
  "interestScore": number (1-10 integer, 10=Best to Invest, 1=Extreme Risk/Avoid),
  "trueWinProbPct": number (0-100),
  "marketImpliedProbPct": number (0-100),
  "estimatedEdgePct": number,
  "riskLevel": "Low" | "Medium" | "High" | "Extreme",
  "recommendedSide": string,
  "fairOddsDecimal": number,
  "marketOddsDecimal": number,
  "whySeriesOverSingleMap": string (1-2 sentences),
  "invalidationFactors": string[] (2-4 concise bullet points),
  "verdictHeadline": string,
  "narrativeTags": string[],
  "pillars": {
    "sosAndTrueForm": { "title": "1. Strength of Schedule (SoS) & True Form", "score": number, "lean": string, "summary": string, "bullets": string[] },
    "seriesDepth": { "title": "2. Series Depth (Map Pool / Draft Adaptability)", "score": number, "lean": string, "summary": string, "bullets": string[] },
    "stylisticH2H": { "title": "3. Stylistic Matchup & Relevant H2H", "score": number, "lean": string, "summary": string, "bullets": string[] },
    "stakesAndContext": { "title": "4. Stakes, Motivation & Physical/Mental Context", "score": number, "lean": string, "summary": string, "bullets": string[] },
    "narrativesAndCurses": { "title": "5. Narratives, Environment & \\"Curses\\"", "score": number, "lean": string, "summary": string, "bullets": string[] },
    "oddsSanityCheck": { "title": "6. Odds Sanity Check (Value & Trap Detection)", "score": number, "lean": string, "summary": string, "bullets": string[] }
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
            temperature: 0.25,
          },
        }),
      }
    );

    if (!res.ok) return base;
    const payload = await res.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return base;

    const parsed = JSON.parse(rawText);
    const validVerdicts: VerdictBadge[] = [
      'STRONG SERIES LOCK',
      'VALUE SERIES PLAY',
      'HIGH VARIANCE / SKIP',
      'TRAP MATCH / AVOID',
    ];
    const verdictBadge: VerdictBadge = validVerdicts.includes(parsed.verdictBadge)
      ? parsed.verdictBadge
      : base.verdictBadge;
    const isSkipOrTrap =
      verdictBadge === 'HIGH VARIANCE / SKIP' || verdictBadge === 'TRAP MATCH / AVOID';
    const score = clamp(Math.round(Number(parsed.interestScore) || base.interestScore), 1, 10);
    const liqProfile = computeLiquidityProfile(match, score, isSkipOrTrap);

    return {
      ...base,
      engine: 'gemini',
      verdictBadge,
      marketRecommendation: parsed.marketRecommendation || base.marketRecommendation,
      interestScore: score,
      investabilityLabel: getInvestabilityLabel(score, verdictBadge),
      trueWinProbPct: clamp(Math.round(Number(parsed.trueWinProbPct) || base.trueWinProbPct), 5, 95),
      marketImpliedProbPct: clamp(
        Math.round(Number(parsed.marketImpliedProbPct) || base.marketImpliedProbPct),
        5,
        95
      ),
      estimatedEdgePct: Number(parsed.estimatedEdgePct ?? base.estimatedEdgePct),
      riskLevel: (['Low', 'Medium', 'High', 'Extreme'].includes(parsed.riskLevel)
        ? parsed.riskLevel
        : base.riskLevel) as RiskLevel,
      recommendedSide: isSkipOrTrap ? 'NO BET (Skip)' : parsed.recommendedSide || base.recommendedSide,
      fairOddsDecimal: Number(parsed.fairOddsDecimal) || base.fairOddsDecimal,
      marketOddsDecimal: Number(parsed.marketOddsDecimal) || base.marketOddsDecimal,
      ...liqProfile,
      whySeriesOverSingleMap: parsed.whySeriesOverSingleMap || base.whySeriesOverSingleMap,
      invalidationFactors: Array.isArray(parsed.invalidationFactors)
        ? parsed.invalidationFactors.slice(0, 4)
        : base.invalidationFactors,
      verdictHeadline: parsed.verdictHeadline || base.verdictHeadline,
      narrativeTags: Array.isArray(parsed.narrativeTags)
        ? parsed.narrativeTags.slice(0, 4)
        : base.narrativeTags,
      pillars: parsed.pillars?.sosAndTrueForm ? parsed.pillars : base.pillars,
    };
  } catch {
    return base;
  }
}
