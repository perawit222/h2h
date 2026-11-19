'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Download,
  ExternalLink,
  Info,
  Layers,
  Radio,
  Search,
  ShieldAlert,
  Swords,
  Table2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  AnomalyAlert,
  GameTitle,
  MarketCategory,
  RadarResponse,
  SubMarketSnapshot,
} from '@/types/esports';

interface AnomalyRadarProps {
  data: RadarResponse;
  isLoading: boolean;
}

const GAMES: ('All' | GameTitle)[] = ['All', 'CS2', 'Valorant', 'Dota 2', 'LoL'];

function formatUsd(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${Math.round(val).toLocaleString()}`;
}

function formatLocalStart(iso?: string): string {
  if (!iso) return 'TBD';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return 'TBD';
  }
}

function getGameBadgeClass(game: GameTitle): string {
  switch (game) {
    case 'CS2':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'Valorant':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'LoL':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'Dota 2':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
  }
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#f43f5e';
  if (score >= 48) return '#eab308';
  return '#5ce6b6';
}

export function AnomalyRadar({ data, isLoading }: AnomalyRadarProps) {
  const [viewMode, setViewMode] = useState<'matches' | 'table'>('matches');
  const [showMethodology, setShowMethodology] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters (inspired by cs2-polymarket-alerts)
  const [selectedGame, setSelectedGame] = useState<'All' | GameTitle>('All');
  const [tierFilter, setTierFilter] = useState<'all' | 'lower' | 'tier1'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'All' | MarketCategory>('All');
  const [minVol, setMinVol] = useState<number>(0);
  const [stripHeavyFavs, setStripHeavyFavs] = useState<boolean>(true); // >= 1.20 odds default
  const [sortBy, setSortBy] = useState<'suspicion' | 'volume' | 'swing' | 'time'>('volume');
  const [query, setQuery] = useState<string>('');

  const filteredAlerts = useMemo(() => {
    const list = data.alerts.filter((a) => {
      if (selectedGame !== 'All' && a.game !== selectedGame) return false;
      if (tierFilter === 'lower' && a.tier !== 'Lower Tier (T2/T3)') return false;
      if (tierFilter === 'tier1' && a.tier !== 'Tier 1') return false;
      if (categoryFilter !== 'All' && a.marketCategory !== categoryFilter) return false;
      if (a.volume24h < minVol) return false;
      if (stripHeavyFavs && a.decimalOdds < 1.2) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const hay = `${a.matchName} ${a.tournament} ${a.teamA} ${a.teamB} ${a.game}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'volume') return b.volume24h - a.volume24h;
      if (sortBy === 'swing') return Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h);
      if (sortBy === 'time') {
        const tA = a.startTimeIso ? new Date(a.startTimeIso).getTime() : Number.MAX_SAFE_INTEGER;
        const tB = b.startTimeIso ? new Date(b.startTimeIso).getTime() : Number.MAX_SAFE_INTEGER;
        return tA - tB;
      }
      return b.suspicionScore - a.suspicionScore || b.volume24h - a.volume24h;
    });
  }, [data.alerts, selectedGame, tierFilter, categoryFilter, minVol, stripHeavyFavs, sortBy, query]);

  // Top 3 sharpest 24h swings / skews spotlight (like Przechylenia)
  const topSpotlight = useMemo(() => {
    return [...filteredAlerts]
      .sort(
        (a, b) =>
          Math.abs(b.priceChange24h) * 100 +
          b.suspicionScore * 0.4 -
          (Math.abs(a.priceChange24h) * 100 + a.suspicionScore * 0.4)
      )
      .slice(0, 3);
  }, [filteredAlerts]);

  const total24hVol = useMemo(
    () => filteredAlerts.reduce((acc, a) => acc + a.volume24h, 0),
    [filteredAlerts]
  );
  const flaggedHigh = useMemo(
    () => filteredAlerts.filter((a) => a.suspicionScore >= 65).length,
    [filteredAlerts]
  );
  const lowerTierCount = useMemo(
    () => filteredAlerts.filter((a) => a.tier === 'Lower Tier (T2/T3)').length,
    [filteredAlerts]
  );

  const handleExportCsv = () => {
    const headers = [
      'Game',
      'Match',
      'Tournament',
      'Tier',
      'StartTime',
      'FlaggedOutcome',
      'ImpliedProbPct',
      'DecimalOdds',
      'PriceChange24hPct',
      'Volume24hUSD',
      'LiquidityUSD',
      'SuspicionScore',
      'PolymarketURL',
    ];
    const rows = filteredAlerts.map((a) => [
      a.game,
      `"${a.matchName.replace(/"/g, '""')}"`,
      `"${a.tournament.replace(/"/g, '""')}"`,
      a.tier,
      a.startTimeIso || '',
      `"${a.outcome.replace(/"/g, '""')}"`,
      Math.round(a.impliedOdds * 100),
      a.decimalOdds.toFixed(2),
      (a.priceChange24h * 100).toFixed(1),
      Math.round(a.volume24h),
      Math.round(a.liquidity),
      a.suspicionScore,
      a.polymarketUrl,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `h2h-polymarket-radar-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header Row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-bold tracking-tight text-[#ecf3ff] flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[#4bb5f7]" />
              Polymarket Esports Radar — Inflow &amp; Anomaly Monitor
            </h2>
            {data.source === 'live' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5ce6b6]/35 bg-[#5ce6b6]/10 px-2.5 py-0.5 text-xs font-medium text-[#72e4c2]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5ce6b6] animate-pulse" />
                Live Polymarket Feed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                <Radio className="h-3 w-3" />
                Fallback Mode
              </span>
            )}
          </div>
          <p className="text-xs text-[#a0b1cb] mt-0.5">
            Live H2H esports market surveillance · Tier 2/3 focus · Multi-market breakdown (Match Winner, Map 1/2, Handicaps)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400">
            {data.totalMarketsScanned} sub-markets · 120s cache
          </span>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#263750] bg-[#111c2d] hover:border-[#4bb5f7]/60 px-2.5 py-1.5 text-xs font-medium text-[#90d5ff] transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Collapsible Methodology Banner */}
      <div className="rounded-xl border border-[#263750] bg-[#111c2d]/80 px-4 py-2.5">
        <button
          onClick={() => setShowMethodology((v) => !v)}
          className="w-full flex items-center justify-between text-xs text-[#90d5ff] font-medium cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5" />
            How to read Radar signals? (H2H Match Grouping · Odds ≥ 1.20 Filter · Lower-Tier Watchlist)
          </span>
          {showMethodology ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showMethodology && (
          <div className="mt-2.5 pt-2.5 border-t border-[#263750]/80 text-xs text-[#a0b1cb] space-y-1.5 leading-relaxed">
            <p>
              • <strong className="text-slate-200">H2H Match Grouping:</strong> Only live &amp; upcoming head-to-head
              esports matches are tracked. Click any match card to inspect all Polymarket sub-markets (Match Winner, Map
              1/2 Winners, Map Handicap, O/U) where Tier-2/3 match-fixing anomalies most frequently appear.
            </p>
            <p>
              • <strong className="text-slate-200">Odds ≥ 1.20 Noise Filter:</strong> Enabled by default to strip
              near-certainty favorites (&gt;83% implied) so underdog steam and sharp swings stand out immediately.
            </p>
            <p>
              • <strong className="text-slate-200">Suspicion Score (0–100):</strong> Weighted composite of 1h/24h
              implied probability swing, 24h volume-to-liquidity turnover ratio, lower-tier tournament multiplier, and
              underdog buy pressure.
            </p>
          </div>
        )}
      </div>

      {/* Top KPI Strip (4 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4">
          <div className="flex items-center justify-between text-xs text-[#a0b1cb]">
            <span>Active H2H Matches</span>
            <Swords className="h-4 w-4 text-[#4bb5f7]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#ecf3ff]">
            {filteredAlerts.length}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Out of {data.totalEventsScanned} live events
          </div>
        </div>

        <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4">
          <div className="flex items-center justify-between text-xs text-[#a0b1cb]">
            <span>24h Total Volume</span>
            <DollarSign className="h-4 w-4 text-[#5ce6b6]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#72e4c2]">
            {formatUsd(total24hVol)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Across all filtered sub-markets</div>
        </div>

        <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4">
          <div className="flex items-center justify-between text-xs text-[#a0b1cb]">
            <span>High-Suspicion (≥65)</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-rose-400">
            {flaggedHigh}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Sharp swings &amp; turnover spikes</div>
        </div>

        <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4">
          <div className="flex items-center justify-between text-xs text-[#a0b1cb]">
            <span>Lower Tier (T2/T3)</span>
            <Activity className="h-4 w-4 text-[#eac382]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#eac382]">
            {lowerTierCount}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Qualifiers &amp; regional circuits</div>
        </div>
      </div>

      {/* Spotlight: Biggest 24h Swings & Skews (cs2-polymarket-alerts style) */}
      {topSpotlight.length > 0 && (
        <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#90d5ff]">
              <TrendingUp className="h-4 w-4 text-[#5ce6b6]" />
              Top Odds Swings &amp; Imbalances (24h Spotlight)
            </div>
            <span className="text-[11px] text-[#a0b1cb]">Click any card to inspect sub-markets</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topSpotlight.map((item) => {
              const pct = Math.round(item.impliedOdds * 100);
              const swing = (item.priceChange24h * 100).toFixed(1);
              return (
                <button
                  key={`spot-${item.id}`}
                  type="button"
                  onClick={() => {
                    setViewMode('matches');
                    setExpandedId(expandedId === item.id ? null : item.id);
                  }}
                  className="text-left rounded-lg border border-[#263750] bg-[#0c1523] hover:border-[#4bb5f7]/60 p-3 space-y-2 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getGameBadgeClass(item.game)}`}>
                      {item.game}
                    </span>
                    {item.tier === 'Lower Tier (T2/T3)' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#eac382]/15 text-[#eac382] border border-[#eac382]/30">
                        Lower Tier
                      </span>
                    )}
                    <span className="ml-auto font-mono text-xs font-bold text-[#72e4c2]">
                      {formatUsd(item.volume24h)}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-[#ecf3ff] truncate">{item.matchName}</div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[#72e4c2] truncate">
                      ↑ {pct}% → {item.outcome} ({item.decimalOdds.toFixed(2)}x)
                    </span>
                    <span
                      className={`font-mono font-semibold ${
                        item.priceChange24h >= 0 ? 'text-[#5ce6b6]' : 'text-rose-400'
                      }`}
                    >
                      {item.priceChange24h >= 0 ? `+${swing}%` : `${swing}%`}
                    </span>
                  </div>

                  {/* Skew progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#4bb5f7] to-[#5ce6b6]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* View Switcher + Pro Filter Bar */}
      <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Game Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {GAMES.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGame(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  selectedGame === g
                    ? 'bg-[#4bb5f7]/20 text-[#90d5ff] border border-[#4bb5f7]/50'
                    : 'bg-[#0c1523] text-[#a0b1cb] border border-[#263750] hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Matches vs Table Switcher */}
          <div className="flex rounded-lg border border-[#263750] bg-[#0c1523] p-0.5 text-xs">
            <button
              onClick={() => setViewMode('matches')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md cursor-pointer ${
                viewMode === 'matches' ? 'bg-[#1a2b44] text-[#90d5ff] font-medium' : 'text-[#a0b1cb]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Matches
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md cursor-pointer ${
                viewMode === 'table' ? 'bg-[#1a2b44] text-[#90d5ff] font-medium' : 'text-[#a0b1cb]'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>

        {/* Second Row: Search, Tier, Category, Min Vol, Min Odds, Sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search match, team, tournament..."
              className="w-full rounded-lg border border-[#263750] bg-[#0c1523] pl-8 pr-3 py-1.5 text-xs text-[#ecf3ff] placeholder:text-slate-500 focus:outline-none focus:border-[#4bb5f7]"
            />
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as 'all' | 'lower' | 'tier1')}
            className="rounded-lg border border-[#263750] bg-[#0c1523] px-2.5 py-1.5 text-xs text-[#ecf3ff]"
          >
            <option value="all">All Tiers</option>
            <option value="lower">Lower Tier (T2/T3)</option>
            <option value="tier1">Tier 1</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'All' | MarketCategory)}
            className="rounded-lg border border-[#263750] bg-[#0c1523] px-2.5 py-1.5 text-xs text-[#ecf3ff]"
          >
            <option value="All">All Market Types</option>
            <option value="Match Winner">Match Winner</option>
            <option value="Map Winner">Map Winner</option>
            <option value="Handicap / Total">Handicap / Total</option>
          </select>

          <select
            value={minVol}
            onChange={(e) => setMinVol(Number(e.target.value))}
            className="rounded-lg border border-[#263750] bg-[#0c1523] px-2.5 py-1.5 text-xs text-[#ecf3ff]"
          >
            <option value={0}>Vol: Any</option>
            <option value={500}>Vol ≥ $500</option>
            <option value={2500}>Vol ≥ $2.5K</option>
            <option value={10000}>Vol ≥ $10K</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'suspicion' | 'volume' | 'swing' | 'time')}
            className="rounded-lg border border-[#263750] bg-[#0c1523] px-2.5 py-1.5 text-xs text-[#ecf3ff]"
          >
            <option value="volume">Sort: 24h Volume</option>
            <option value="suspicion">Sort: Suspicion Score</option>
            <option value="swing">Sort: Biggest 24h Swing</option>
            <option value="time">Sort: Start Time</option>
          </select>

          <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#263750] bg-[#0c1523] px-2.5 py-1.5 text-xs text-[#a0b1cb] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={stripHeavyFavs}
              onChange={(e) => setStripHeavyFavs(e.target.checked)}
              className="accent-[#4bb5f7]"
            />
            Odds ≥ 1.20
          </label>
        </div>
      </div>

      {/* Main Feed */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-[#263750] bg-[#111c2d] animate-pulse" />
          ))}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-10 text-center">
          <p className="text-sm text-[#a0b1cb]">No live Polymarket esports matches match your filters.</p>
          <button
            onClick={() => {
              setSelectedGame('All');
              setTierFilter('all');
              setCategoryFilter('All');
              setMinVol(0);
              setStripHeavyFavs(false);
              setQuery('');
            }}
            className="mt-2 text-xs text-[#4bb5f7] hover:underline cursor-pointer"
          >
            Reset all filters
          </button>
        </div>
      ) : viewMode === 'matches' ? (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <MatchRadarCard
              key={alert.id}
              alert={alert}
              isExpanded={expandedId === alert.id}
              onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
            />
          ))}
        </div>
      ) : (
        <RadarTable alerts={filteredAlerts} />
      )}
    </div>
  );
}

function MatchRadarCard({
  alert,
  isExpanded,
  onToggle,
}: {
  alert: AnomalyAlert;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [selectedSubIdx, setSelectedSubIdx] = useState(0);
  const pct = Math.round(alert.impliedOdds * 100);
  const swingPct = (alert.priceChange24h * 100).toFixed(1);
  const isUp = alert.priceChange24h >= 0;
  const scoreColor = getScoreColor(alert.suspicionScore);

  const activeSub: SubMarketSnapshot | undefined = alert.subMarkets[selectedSubIdx] || alert.subMarkets[0];

  return (
    <div className="rounded-xl border border-[#263750] bg-[#111c2d] hover:border-[#4bb5f7]/50 transition-all overflow-hidden">
      {/* Main Clickable Row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggle();
        }}
        className="p-4 cursor-pointer"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Left: Match Header */}
          <div className="lg:col-span-5 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getGameBadgeClass(alert.game)}`}>
                {alert.game}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#0c1523] border border-[#263750] text-slate-300">
                {alert.format}
              </span>
              {alert.tier === 'Lower Tier (T2/T3)' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#eac382]/15 text-[#eac382] border border-[#eac382]/30">
                  Lower Tier
                </span>
              )}
              <span className="text-[11px] font-mono text-[#72e4c2] bg-[#5ce6b6]/10 border border-[#5ce6b6]/25 px-1.5 py-0.5 rounded">
                {formatLocalStart(alert.startTimeIso)}
              </span>
              <span className="text-[11px] text-slate-400">
                {alert.subMarkets.length} markets
              </span>
            </div>

            <div className="text-sm font-bold text-[#ecf3ff]">
              {alert.matchName}
            </div>
            <div className="text-xs text-[#a0b1cb] truncate">{alert.tournament}</div>
          </div>

          {/* Center: Skew Badge & Odds */}
          <div className="lg:col-span-4 space-y-1.5 border-t lg:border-t-0 lg:border-l border-[#263750]/80 pt-3 lg:pt-0 lg:pl-4">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-[#72e4c2]">
                {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-400" />}
                {pct}% → {alert.outcome}
              </span>
              <span className="font-mono text-[#eac382] font-semibold">
                {alert.decimalOdds.toFixed(2)}x
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-[#0c1523] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#4bb5f7] to-[#5ce6b6]"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#a0b1cb]">
              <span>
                24h Δ:{' '}
                <strong className={isUp ? 'text-[#5ce6b6]' : 'text-rose-400'}>
                  {isUp ? `+${swingPct}%` : `${swingPct}%`}
                </strong>
              </span>
              <span>
                Vol: <strong className="text-[#72e4c2] font-mono">{formatUsd(alert.volume24h)}</strong> · Liq:{' '}
                <span className="font-mono">{formatUsd(alert.liquidity)}</span>
              </span>
            </div>
          </div>

          {/* Right: Suspicion + Expand + Polymarket */}
          <div className="lg:col-span-3 flex items-center justify-between lg:justify-end gap-3 border-t lg:border-t-0 pt-3 lg:pt-0 border-[#263750]/80">
            <div className="text-left lg:text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Suspicion</div>
              <div className="text-lg font-bold font-mono tabular-nums" style={{ color: scoreColor }}>
                {alert.suspicionScore}
                <span className="text-xs font-normal text-slate-500">/100</span>
              </div>
            </div>

            <a
              href={alert.polymarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-lg border border-[#263750] bg-[#0c1523] hover:border-[#4bb5f7] px-2.5 py-1.5 text-xs font-medium text-[#90d5ff] transition-colors"
            >
              Polymarket
              <ExternalLink className="h-3 w-3" />
            </a>

            <div className="text-slate-400">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Multi-Market Inspector (cs2-polymarket-alerts style) */}
      {isExpanded && activeSub && (
        <div className="border-t border-[#263750] bg-[#0c1523] p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {alert.subMarkets.map((sub, idx) => (
                <button
                  key={sub.id}
                  onClick={() => setSelectedSubIdx(idx)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    idx === selectedSubIdx
                      ? 'bg-[#4bb5f7]/20 text-[#90d5ff] border border-[#4bb5f7]/50'
                      : 'bg-[#111c2d] text-[#a0b1cb] border border-[#263750] hover:text-white'
                  }`}
                >
                  {sub.category === 'Match Winner'
                    ? 'Match Winner'
                    : sub.question.replace(/^.*-\s*/, '').slice(0, 26)}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-[#a0b1cb]">{alert.reasonSummary}</span>
          </div>

          {/* Side-by-side Team A vs Team B comparison cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-[#5ce6b6]/30 bg-[#111c2d] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#ecf3ff]">{activeSub.teamA}</span>
                <span className="font-mono text-sm font-bold text-[#72e4c2]">
                  {Math.round(activeSub.probA * 100)}% ({activeSub.oddsA.toFixed(2)}x)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-[#5ce6b6]" style={{ width: `${Math.round(activeSub.probA * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-[#a0b1cb] font-mono">
                <span>24h Vol: {formatUsd(activeSub.volume24h)}</span>
                <span>
                  24h Δ: {activeSub.priceChange24h >= 0 ? '+' : ''}
                  {(activeSub.priceChange24h * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-rose-400/25 bg-[#111c2d] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#ecf3ff]">{activeSub.teamB}</span>
                <span className="font-mono text-sm font-bold text-[#f7a8a8]">
                  {Math.round(activeSub.probB * 100)}% ({activeSub.oddsB.toFixed(2)}x)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-[#f7a8a8]" style={{ width: `${Math.round(activeSub.probB * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-[#a0b1cb] font-mono">
                <span>Liquidity: {formatUsd(activeSub.liquidity)}</span>
                <span>
                  24h Δ: {-activeSub.priceChange24h >= 0 ? '+' : ''}
                  {(-activeSub.priceChange24h * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RadarTable({ alerts }: { alerts: AnomalyAlert[] }) {
  return (
    <div className="rounded-xl border border-[#263750] bg-[#111c2d] overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-[#263750] bg-[#0c1523] text-[11px] uppercase tracking-wider text-[#a0b1cb]">
          <tr>
            <th className="px-4 py-3">Start</th>
            <th className="px-4 py-3">Match / Tournament</th>
            <th className="px-4 py-3">Flagged Side</th>
            <th className="px-4 py-3 text-right">Odds</th>
            <th className="px-4 py-3 text-right">24h Δ</th>
            <th className="px-4 py-3 text-right">24h Vol</th>
            <th className="px-4 py-3 text-right">Liquidity</th>
            <th className="px-4 py-3 text-right">Score</th>
            <th className="px-4 py-3 text-right">Link</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#263750]/60">
          {alerts.map((a) => (
            <tr key={a.id} className="hover:bg-[#16243b]/70 transition-colors">
              <td className="px-4 py-3 font-mono text-[11px] text-[#a0b1cb] whitespace-nowrap">
                {formatLocalStart(a.startTimeIso)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getGameBadgeClass(a.game)}`}>
                    {a.game}
                  </span>
                  <span className="font-semibold text-[#ecf3ff]">{a.matchName}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">{a.tournament}</div>
              </td>
              <td className="px-4 py-3 font-medium text-[#72e4c2]">{a.outcome}</td>
              <td className="px-4 py-3 text-right font-mono text-[#eac382]">
                {a.decimalOdds.toFixed(2)}x ({Math.round(a.impliedOdds * 100)}%)
              </td>
              <td
                className={`px-4 py-3 text-right font-mono font-semibold ${
                  a.priceChange24h >= 0 ? 'text-[#5ce6b6]' : 'text-rose-400'
                }`}
              >
                {a.priceChange24h >= 0 ? '+' : ''}
                {(a.priceChange24h * 100).toFixed(1)}%
              </td>
              <td className="px-4 py-3 text-right font-mono text-[#72e4c2]">{formatUsd(a.volume24h)}</td>
              <td className="px-4 py-3 text-right font-mono text-[#a0b1cb]">{formatUsd(a.liquidity)}</td>
              <td
                className="px-4 py-3 text-right font-mono font-bold"
                style={{ color: getScoreColor(a.suspicionScore) }}
              >
                {a.suspicionScore}
              </td>
              <td className="px-4 py-3 text-right">
                <a
                  href={a.polymarketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#4bb5f7] hover:underline inline-flex items-center gap-0.5"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
