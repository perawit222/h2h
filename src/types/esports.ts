export type GameTitle = 'CS2' | 'Valorant' | 'LoL' | 'Dota 2';

export type AnomalyTag =
  | 'Volume Spike'
  | 'Odds Swing'
  | 'Low-Tier Anomaly'
  | 'Underdog Drift'
  | 'Thin Liquidity'
  | 'Sharp Action';

export type MarketCategory = 'Match Winner' | 'Map Winner' | 'Handicap / Total' | 'Other';

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
  impliedOdds: number; // 0 to 1
  decimalOdds: number;
  opponentImpliedOdds: number;
  opponentDecimalOdds: number;
  priceChange24h: number; // e.g. +0.125 means +12.5%
  priceChange1h: number;
  suspicionScore: number; // 0 to 100
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

export type MatchFormat = 'Bo1' | 'Bo3' | 'Bo5';
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
  source: 'Polymarket Live' | 'BO3.gg Live' | 'OpenDota Live' | 'LoL Esports API';
  polymarketUrl?: string;
  volume24h?: number;
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
}

export interface PillarDetail {
  title: string;
  score: number;
  lean: string;
  summary: string;
  bullets: string[];
}

export interface MatchAnalysis {
  matchId: string;
  engine: 'gemini' | 'deterministic';
  interestScore: number;
  estimatedEdgePct: number;
  riskLevel: RiskLevel;
  recommendedSide: string;
  fairOddsDecimal: number;
  marketOddsDecimal: number;
  verdictHeadline: string;
  narrativeTags: string[];
  pillars: {
    recentForm: PillarDetail;
    headToHead: PillarDetail;
    statsAndDraft: PillarDetail;
    narrativesAndCurses: PillarDetail;
  };
}
