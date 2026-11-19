export type GameTitle = 'CS2' | 'Valorant' | 'LoL' | 'Dota 2';

export type AnomalyTag =
  | 'Volume Spike'
  | 'Odds Swing'
  | 'Low-Tier Anomaly'
  | 'Underdog Drift'
  | 'Thin Liquidity'
  | 'Sharp Action';

export interface PricePoint {
  time: string;
  prob: number;
}

export interface AnomalyAlert {
  id: string;
  marketId: string;
  eventTitle: string;
  matchName: string;
  game: GameTitle;
  outcome: string;
  opponentOutcome?: string;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  impliedOdds: number; // 0 to 1
  decimalOdds: number;
  priceChange24h: number; // e.g. +0.18 means +18%
  priceChange1h: number;
  suspicionScore: number; // 0 to 100
  severity: 'critical' | 'elevated' | 'watch';
  tags: AnomalyTag[];
  reasonSummary: string;
  polymarketUrl: string;
  endDate?: string;
  trend: PricePoint[];
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3 / Qualifier';
}

export interface RadarResponse {
  source: 'live' | 'fallback';
  fetchedAt: string;
  totalMarketsScanned: number;
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
  recentForm: ('W' | 'L')[]; // last 5-10
  winRateLast10: number; // 0-100
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
  source: 'OpenDota Live' | 'Polymarket Odds' | 'Curated Feed';
  polymarketUrl?: string;
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
  score: number; // 0-100 edge favorability
  lean: string;
  summary: string;
  bullets: string[];
}

export interface MatchAnalysis {
  matchId: string;
  engine: 'gemini' | 'deterministic';
  interestScore: number; // 1-10
  estimatedEdgePct: number; // e.g. 6.4
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
