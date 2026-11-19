export type GameTitle =
  | 'CS2'
  | 'Valorant'
  | 'LoL'
  | 'Dota 2'
  | 'Football'
  | 'NBA'
  | 'Tennis';

export type AnomalyTag =
  | 'Volume Spike'
  | 'Odds Swing'
  | 'Low-Tier Anomaly'
  | 'Underdog Drift'
  | 'Thin Liquidity'
  | 'Sharp Action';

export type MarketCategory = 'Match Winner' | 'Map Winner' | 'Handicap / Total' | 'Other';

export type VerdictBadge =
  | 'STRONG SERIES LOCK'
  | 'VALUE SERIES PLAY'
  | 'HIGH VARIANCE / SKIP'
  | 'TRAP MATCH / AVOID';

export interface PricePoint {
  time: string;
  prob: number;
}

export interface SubMarketSnapshot {
  id: string;
  question: string;
  category: MarketCategory;
  teamA: string;
  teamB: string;
  probA: number;
  probB: number;
  oddsA: number;
  oddsB: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  priceChange24h: number;
  priceChange1h: number;
}

export interface AnomalyAlert {
  id: string;
  eventId: string;
  marketId: string;
  eventTitle: string;
  matchName: string;
  tournament: string;
  format: MatchFormat;
  game: GameTitle;
  teamA: string;
  teamB: string;
  outcome: string;
  opponentOutcome?: string;
  marketCategory: MarketCategory;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  impliedOdds: number;
  decimalOdds: number;
  opponentImpliedOdds: number;
  opponentDecimalOdds: number;
  priceChange24h: number;
  priceChange1h: number;
  suspicionScore: number;
  severity: 'critical' | 'elevated' | 'watch';
  tags: AnomalyTag[];
  reasonSummary: string;
  polymarketUrl: string;
  startTimeIso?: string;
  endDate?: string;
  trend: PricePoint[];
  tier: 'Tier 1' | 'Lower Tier (T2/T3)';
  subMarkets: SubMarketSnapshot[];
}

export interface RadarResponse {
  source: 'live' | 'fallback';
  fetchedAt: string;
  totalMarketsScanned: number;
  totalEventsScanned: number;
  flaggedCount: number;
  alerts: AnomalyAlert[];
  note?: string;
}

export type MatchFormat = 'Bo1' | 'Bo3' | 'Bo5' | '90m' | '4Q' | 'Sets';
export type MatchStatus = 'live' | 'upcoming';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Extreme';

export interface TeamSnapshot {
  name: string;
  tag: string;
  ranking: number;
  oddsDecimal: number;
  impliedProb: number;
  recentForm: ('W' | 'L')[];
  winRateLast10: number;
  starPlayer: {
    name: string;
    metricLabel: string;
    metricValue: string;
    trend: 'hot' | 'steady' | 'cold';
  };
  lanWinRate: number;
  onlineWinRate: number;
  hasStandIn?: boolean;
}

export interface MatchQuickScore {
  interestScore: number; // 1 (Risky) to 10 (Best to Invest)
  investabilityLabel: string;
  verdictBadge: VerdictBadge;
  marketRecommendation: string;
  riskLevel: RiskLevel;
  trueWinProbPct: number;
  marketImpliedProbPct: number;
  estimatedEdgePct: number;
  maxSafeStakeUsd: number;
  recommendedSide: string;
  bestAngleSummary: string;
  whySeriesOverSingleMap: string;
  primaryInvalidationRisk: string;
}

export interface ParlayLeg {
  matchId: string;
  match: EsportsMatch;
  game: GameTitle;
  matchName: string;
  tournament: string;
  startTimeIso: string;
  format: MatchFormat;
  marketCategory: string;
  selection: string;
  oddsDecimal: number;
  trueWinProbPct: number;
  marketImpliedProbPct: number;
  modelWinProbPct: number;
  edgePct: number;
  investabilityScore: number; // 1-10
  verdictBadge: VerdictBadge;
  riskLevel: RiskLevel;
  riskNote: string;
  whySeriesNote: string;
  rationale: string;
}

export interface DailyParlayTier {
  id: 'safe' | 'medium' | 'value_risk';
  title: string;
  badge: string;
  targetOddsRange: string;
  description: string;
  legs: ParlayLeg[];
  combinedOdds: number;
  combinedWinProbPct: number;
  expectedValuePct: number;
  investabilityScore: number;
  riskLevel: RiskLevel;
  recommendedUnits: string;
  maxSafeStakeUsd: number;
}

export type MatchSource =
  | 'Polymarket Live'
  | 'BO3.gg Live'
  | 'OpenDota Live'
  | 'LoL Esports API'
  | 'ESPN Live API';

export interface EsportsMatch {
  id: string;
  game: GameTitle;
  tournament: string;
  tier: 'S-Tier' | 'A-Tier' | 'B-Tier';
  stage: string;
  isLan: boolean;
  format: MatchFormat;
  status: MatchStatus;
  startTimeIso: string;
  source: MatchSource;
  polymarketUrl?: string;
  volume24h?: number;
  liquidity?: number;
  markets?: SubMarketSnapshot[];
  quickScore?: MatchQuickScore;
  teamA: TeamSnapshot;
  teamB: TeamSnapshot;
  h2h: {
    teamAWins: number;
    teamBWins: number;
    lastMeetingSummary: string;
    mapDiffA: number;
  };
  mapOrDraftContext: {
    edgeTeam: 'A' | 'B' | 'Even';
    keyMapsOrHeroes: string[];
    statHighlight: string;
  };
  narrativeNotes: string[];
}

export interface ScheduleResponse {
  fetchedAt: string;
  sourcesUsed: string[];
  matches: EsportsMatch[];
  parlays: DailyParlayTier[];
}

export interface PillarDetail {
  title: string;
  score: number;
  lean: string;
  summary: string;
  bullets: string[];
}

export interface RecommendedMarketAngle {
  category: string;
  question: string;
  selection: string;
  oddsDecimal: number;
  edgeNote: string;
}

export interface MatchAnalysis {
  matchId: string;
  engine: 'gemini' | 'deterministic';
  verdictBadge: VerdictBadge;
  marketRecommendation: string; // e.g., "Series Winner (Bo3)" or "NO BET (Skip)"
  interestScore: number; // 1 (Extremely Risky / Avoid) to 10 (High Conviction / Best to Invest)
  investabilityLabel: string;
  trueWinProbPct: number; // Model True Series Win Probability BEFORE odds
  marketImpliedProbPct: number; // Vig-adjusted Market Implied Probability
  estimatedEdgePct: number;
  riskLevel: RiskLevel;
  recommendedSide: string;
  fairOddsDecimal: number;
  marketOddsDecimal: number;
  maxSafeStakeUsd: number;
  recommendedUnits: string;
  liquidityTier: 'Deep' | 'Moderate' | 'Thin' | 'Unpriced';
  recommendedMarket: RecommendedMarketAngle;
  whySeriesOverSingleMap: string;
  invalidationFactors: string[];
  verdictHeadline: string;
  narrativeTags: string[];
  pillars: {
    sosAndTrueForm: PillarDetail;
    seriesDepth: PillarDetail;
    stylisticH2H: PillarDetail;
    stakesAndContext: PillarDetail;
    narrativesAndCurses: PillarDetail;
    oddsSanityCheck: PillarDetail;
  };
}
