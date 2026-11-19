import { EsportsMatch, MatchAnalysis, RiskLevel } from '@/types/esports';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function runDeterministicAnalysis(match: EsportsMatch): MatchAnalysis {
  const { teamA, teamB, h2h, mapOrDraftContext, isLan, format, narrativeNotes } = match;

  // 1. Recent Form Model
  const formDiff = teamA.winRateLast10 - teamB.winRateLast10;
  const recentWinsA = teamA.recentForm.filter((r) => r === 'W').length;
  const recentWinsB = teamB.recentForm.filter((r) => r === 'W').length;
  const starBonusA = teamA.starPlayer.trend === 'hot' ? 4 : teamA.starPlayer.trend === 'cold' ? -4 : 0;
  const starBonusB = teamB.starPlayer.trend === 'hot' ? 4 : teamB.starPlayer.trend === 'cold' ? -4 : 0;
  const formEdgeA = formDiff * 0.45 + (recentWinsA - recentWinsB) * 3 + (starBonusA - starBonusB);

  // 2. Head-to-Head Model
  const totalH2H = Math.max(1, h2h.teamAWins + h2h.teamBWins);
  const h2hRateA = h2h.teamAWins / totalH2H;
  const h2hEdgeA = (h2hRateA - 0.5) * 30 + clamp(h2h.mapDiffA * 1.5, -8, 8);

  // 3. Stats & Map/Draft Edge
  const mapEdgeA = mapOrDraftContext.edgeTeam === 'A' ? 14 : mapOrDraftContext.edgeTeam === 'B' ? -14 : 0;

  // 4. Narratives & Environment (LAN vs Online, Stand-in, Format variance)
  const envRateA = isLan ? teamA.lanWinRate : teamA.onlineWinRate;
  const envRateB = isLan ? teamB.lanWinRate : teamB.onlineWinRate;
  let envEdgeA = (envRateA - envRateB) * 0.35;
  if (teamA.hasStandIn) envEdgeA -= 10;
  if (teamB.hasStandIn) envEdgeA += 10;

  // Composite Fair Probability for Team A
  const rawScoreA = 50 + formEdgeA * 0.4 + h2hEdgeA * 0.25 + mapEdgeA * 0.4 + envEdgeA * 0.35;
  const fairProbA = clamp(rawScoreA / 100, 0.2, 0.82);
  const fairProbB = 1 - fairProbA;

  // Remove vig to estimate market true prob
  const vigSum = teamA.impliedProb + teamB.impliedProb;
  const marketProbA = teamA.impliedProb / vigSum;
  const marketProbB = teamB.impliedProb / vigSum;

  const edgeA = (fairProbA - marketProbA) * 100;
  const edgeB = (fairProbB - marketProbB) * 100;

  const recommendA = edgeA >= edgeB;
  const bestEdge = Number(Math.max(edgeA, edgeB).toFixed(1));
  const recTeam = recommendA ? teamA : teamB;
  const recFairProb = recommendA ? fairProbA : fairProbB;
  const fairOddsDecimal = Number((1 / recFairProb).toFixed(2));
  const marketOddsDecimal = recTeam.oddsDecimal;

  // Risk calculation
  let riskPoints = 25;
  if (format === 'Bo1') riskPoints += 32;
  else if (format === 'Bo3') riskPoints += 12;
  if (teamA.hasStandIn || teamB.hasStandIn) riskPoints += 22;
  if (recTeam.oddsDecimal >= 2.35) riskPoints += 18;
  if (Math.abs(formDiff) <= 6) riskPoints += 10;
  if (!isLan) riskPoints += 8;

  const riskLevel: RiskLevel =
    riskPoints >= 75 ? 'Extreme' : riskPoints >= 55 ? 'High' : riskPoints >= 35 ? 'Medium' : 'Low';

  // Interest score 1-10
  const interestRaw = 4.2 + bestEdge * 0.55 - (riskLevel === 'Extreme' ? 1.5 : 0) + (match.tier === 'S-Tier' ? 0.8 : 0);
  const interestScore = clamp(Math.round(interestRaw), 1, 10);

  // Narrative tags
  const narrativeTags: string[] = [];
  if (isLan) {
    if (teamA.lanWinRate - teamA.onlineWinRate >= 5) narrativeTags.push(`${teamA.tag} LAN Buff`);
    if (teamB.lanWinRate - teamB.onlineWinRate >= 5) narrativeTags.push(`${teamB.tag} LAN Buff`);
    if (teamA.onlineWinRate - teamA.lanWinRate >= 5) narrativeTags.push(`${teamA.tag} Stage Dip`);
    if (teamB.onlineWinRate - teamB.lanWinRate >= 5) narrativeTags.push(`${teamB.tag} Stage Dip`);
  } else {
    narrativeTags.push('Online Environment');
  }
  if (format === 'Bo1') narrativeTags.push('Bo1 Upset Variance');
  if (format === 'Bo5') narrativeTags.push('Deep Pool Endurance');
  if (teamA.hasStandIn || teamB.hasStandIn) narrativeTags.push('Stand-in Volatility');
  if (h2h.teamAWins >= h2h.teamBWins + 3) narrativeTags.push(`${teamA.tag} H2H Dominance`);
  if (h2h.teamBWins >= h2h.teamAWins + 3) narrativeTags.push(`${teamB.tag} H2H Dominance`);
  if (recTeam.oddsDecimal >= 2.1) narrativeTags.push('Live Dog Value');
  if (narrativeTags.length < 3) narrativeTags.push(`${match.tier} Spotlight`);

  const formScore = clamp(Math.round(50 + Math.abs(formEdgeA) * 1.4), 35, 95);
  const h2hScore = clamp(Math.round(50 + Math.abs(h2hEdgeA) * 1.5), 35, 95);
  const draftScore = mapOrDraftContext.edgeTeam === 'Even' ? 54 : 78;
  const narrativeScore = clamp(Math.round(55 + Math.abs(envEdgeA) * 2.2), 40, 92);

  const verdictHeadline =
    bestEdge >= 4.5
      ? `Value detected on ${recTeam.name} (${marketOddsDecimal.toFixed(2)} vs. ${fairOddsDecimal.toFixed(2)} fair)`
      : bestEdge >= 1.5
        ? `Slight edge leaning ${recTeam.name} — monitor live veto/draft before sizing`
        : `Efficient market line — lean ${recTeam.name} with disciplined stake sizing`;

  return {
    matchId: match.id,
    engine: 'deterministic',
    interestScore,
    estimatedEdgePct: Math.max(0.4, bestEdge),
    riskLevel,
    recommendedSide: recTeam.name,
    fairOddsDecimal,
    marketOddsDecimal,
    verdictHeadline,
    narrativeTags: Array.from(new Set(narrativeTags)).slice(0, 4),
    pillars: {
      recentForm: {
        title: 'Recent Form & Star Output',
        score: formScore,
        lean: formEdgeA >= 0 ? teamA.name : teamB.name,
        summary: `${teamA.tag} (${teamA.winRateLast10}% L10) faces ${teamB.tag} (${teamB.winRateLast10}% L10). ${
          formEdgeA >= 0 ? teamA.name : teamB.name
        } enters with stronger recent series stability.`,
        bullets: [
          `${teamA.tag} Last 5: ${teamA.recentForm.join('-')} | Star ${teamA.starPlayer.name}: ${teamA.starPlayer.metricValue} (${teamA.starPlayer.trend})`,
          `${teamB.tag} Last 5: ${teamB.recentForm.join('-')} | Star ${teamB.starPlayer.name}: ${teamB.starPlayer.metricValue} (${teamB.starPlayer.trend})`,
          `Form differential projects a ${Math.abs(formDiff)}% L10 win-rate gap favoring ${
            formDiff >= 0 ? teamA.tag : teamB.tag
          }.`,
        ],
      },
      headToHead: {
        title: 'Head-to-Head (H2H)',
        score: h2hScore,
        lean: h2h.teamAWins >= h2h.teamBWins ? teamA.name : teamB.name,
        summary: `Historical series record stands ${h2h.teamAWins}–${h2h.teamBWins} (${teamA.tag}–${teamB.tag}). ${h2h.lastMeetingSummary}.`,
        bullets: [
          `Series Record: ${teamA.tag} ${h2h.teamAWins} – ${h2h.teamBWins} ${teamB.tag} (Map Diff: ${
            h2h.mapDiffA >= 0 ? `+${h2h.mapDiffA}` : h2h.mapDiffA
          } ${teamA.tag})`,
          `Recent Context: ${h2h.lastMeetingSummary}`,
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
          `Key Battlegrounds / Priority Picks: ${mapOrDraftContext.keyMapsOrHeroes.join(', ')}`,
          `Format Impact (${format}): ${
            format === 'Bo5'
              ? 'Rewards deeper tactical map/champion pool and stamina.'
              : format === 'Bo1'
                ? 'High single-map variance; pistol/early-game snowballs dominate.'
                : 'Standard veto equilibrium; ban phase heavily shapes Map 3 decider.'
          }`,
        ],
      },
      narrativesAndCurses: {
        title: 'Narratives & "Curses"',
        score: narrativeScore,
        lean: envEdgeA >= 0 ? teamA.name : teamB.name,
        summary: `${isLan ? 'LAN Stage' : 'Online'} environment favors ${
          envEdgeA >= 0 ? teamA.tag : teamB.tag
        } (${envRateA}% vs ${envRateB}% split win rate).`,
        bullets: [
          ...narrativeNotes,
          `${teamA.tag} LAN/Online Split: ${teamA.lanWinRate}% / ${teamA.onlineWinRate}% vs ${teamB.tag}: ${teamB.lanWinRate}% / ${teamB.onlineWinRate}%`,
        ],
      },
    },
  };
}

export async function analyzeMatch(match: EsportsMatch): Promise<MatchAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return runDeterministicAnalysis(match);
  }

  try {
    const prompt = `You are a sharp quantitative esports betting analyst. Analyze this match and return ONLY valid JSON matching the exact schema below.

Match Data:
${JSON.stringify(match)}

Required JSON schema:
{
  "interestScore": number (1-10 integer),
  "estimatedEdgePct": number (e.g. 5.4),
  "riskLevel": "Low" | "Medium" | "High" | "Extreme",
  "recommendedSide": string (team name),
  "fairOddsDecimal": number,
  "marketOddsDecimal": number,
  "verdictHeadline": string (concise 1-sentence thesis),
  "narrativeTags": string[] (3-4 short tags like "LAN Buff", "Bo1 Variance"),
  "pillars": {
    "recentForm": { "title": "Recent Form & Star Output", "score": number (0-100), "lean": string, "summary": string, "bullets": string[] },
    "headToHead": { "title": "Head-to-Head (H2H)", "score": number (0-100), "lean": string, "summary": string, "bullets": string[] },
    "statsAndDraft": { "title": "Stats & Map/Draft Edge", "score": number (0-100), "lean": string, "summary": string, "bullets": string[] },
    "narrativesAndCurses": { "title": "Narratives & \\"Curses\\"", "score": number (0-100), "lean": string, "summary": string, "bullets": string[] }
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

    if (!res.ok) {
      return runDeterministicAnalysis(match);
    }

    const payload = await res.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return runDeterministicAnalysis(match);
    }

    const parsed = JSON.parse(rawText);
    return {
      matchId: match.id,
      engine: 'gemini',
      interestScore: clamp(Math.round(Number(parsed.interestScore) || 6), 1, 10),
      estimatedEdgePct: Number(parsed.estimatedEdgePct) || 3.5,
      riskLevel: (['Low', 'Medium', 'High', 'Extreme'].includes(parsed.riskLevel)
        ? parsed.riskLevel
        : 'Medium') as RiskLevel,
      recommendedSide: parsed.recommendedSide || match.teamA.name,
      fairOddsDecimal: Number(parsed.fairOddsDecimal) || match.teamA.oddsDecimal,
      marketOddsDecimal: Number(parsed.marketOddsDecimal) || match.teamA.oddsDecimal,
      verdictHeadline: parsed.verdictHeadline || 'AI-generated betting edge assessment.',
      narrativeTags: Array.isArray(parsed.narrativeTags) ? parsed.narrativeTags.slice(0, 4) : [],
      pillars: parsed.pillars,
    };
  } catch {
    return runDeterministicAnalysis(match);
  }
}
