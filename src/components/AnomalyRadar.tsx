'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Activity,
  DollarSign,
  ExternalLink,
  Filter,
  Radio,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AnomalyAlert, AnomalyTag, GameTitle, RadarResponse } from '@/types/esports';

interface AnomalyRadarProps {
  data: RadarResponse;
  isLoading: boolean;
}

const GAMES: ('All' | GameTitle)[] = ['All', 'CS2', 'Valorant', 'LoL', 'Dota 2'];
const ALL_TAGS: ('All' | AnomalyTag)[] = [
  'All',
  'Volume Spike',
  'Odds Swing',
  'Low-Tier Anomaly',
  'Underdog Drift',
  'Thin Liquidity',
  'Sharp Action',
];

function formatUsd(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${Math.round(val).toLocaleString()}`;
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
  if (score >= 75) return '#f43f5e'; // rose-500
  if (score >= 52) return '#f59e0b'; // amber-500
  return '#10b981'; // emerald-500
}

function getTagClass(tag: AnomalyTag): string {
  switch (tag) {
    case 'Low-Tier Anomaly':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'Volume Spike':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'Odds Swing':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    case 'Underdog Drift':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    case 'Thin Liquidity':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

export function AnomalyRadar({ data, isLoading }: AnomalyRadarProps) {
  const [selectedGame, setSelectedGame] = useState<'All' | GameTitle>('All');
  const [selectedTag, setSelectedTag] = useState<'All' | AnomalyTag>('All');
  const [minScore, setMinScore] = useState<number>(0);
  const [query, setQuery] = useState<string>('');

  const filteredAlerts = useMemo(() => {
    return data.alerts.filter((alert) => {
      if (selectedGame !== 'All' && alert.game !== selectedGame) return false;
      if (selectedTag !== 'All' && !alert.tags.includes(selectedTag)) return false;
      if (alert.suspicionScore < minScore) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const hay = `${alert.matchName} ${alert.eventTitle} ${alert.outcome} ${alert.game}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.alerts, selectedGame, selectedTag, minScore, query]);

  const total24hVol = useMemo(
    () => filteredAlerts.reduce((acc, a) => acc + a.volume24h, 0),
    [filteredAlerts]
  );

  const criticalCount = useMemo(
    () => filteredAlerts.filter((a) => a.suspicionScore >= 75).length,
    [filteredAlerts]
  );

  const chartData = useMemo(() => {
    return filteredAlerts.slice(0, 8).map((a) => ({
      name: a.outcome.length > 14 ? `${a.outcome.slice(0, 13)}…` : a.outcome,
      fullMatch: a.matchName,
      score: a.suspicionScore,
      volK: Number((a.volume24h / 1000).toFixed(1)),
    }));
  }, [filteredAlerts]);

  return (
    <div className="space-y-5">
      {/* Status Banner + KPI Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-400" />
              Suspicious Bet &amp; Anomaly Radar
            </h2>
            {data.source === 'live' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Polymarket Feed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                <Radio className="h-3 w-3" />
                Fallback Mode
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {data.note ||
              'Automated order-book surveillance scanning Polymarket Gamma API for odds swings, low-tier volume spikes, and underdog steam.'}
          </p>
        </div>

        <div className="text-xs font-mono text-slate-500">
          Cache TTL: 120s · Scanned {data.totalMarketsScanned} markets
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800/80 bg-[#0b111e] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Markets Scanned</span>
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-white">
            {data.totalMarketsScanned}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">CS2 · Valorant · LoL · Dota 2</div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#0b111e] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Critical Alerts (≥75)</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-rose-400">
            {criticalCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {filteredAlerts.length} total alerts in view
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#0b111e] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>24h Monitored Volume</span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-400">
            {formatUsd(total24hVol)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Aggregated esports order flow</div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#0b111e] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Highest Suspicion</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-300">
            {filteredAlerts[0]?.suspicionScore ?? 0}
            <span className="text-sm font-normal text-slate-500">/100</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 truncate">
            {filteredAlerts[0]?.outcome || 'No matches'}
          </div>
        </div>
      </div>

      {/* Suspicion Score Bar Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-slate-800/80 bg-[#0b111e] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-slate-200">
                Top Flagged Markets — Suspicion Index (0–100)
              </h3>
              <p className="text-xs text-slate-500">
                Composite anomaly score weighted by 1h/24h price swing, volume-to-liquidity ratio, and match tier
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Critical (75+)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Elevated (52–74)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Watch (&lt;52)
              </span>
            </div>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#1e293b' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                  formatter={(value, name) => [
                    name === 'score' ? `${value} / 100` : `$${value}K`,
                    name === 'score' ? 'Suspicion Score' : '24h Volume',
                  ]}
                />
                <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={42}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-800/80 bg-[#0b111e] p-3.5 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {GAMES.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGame(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectedGame === g
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-none">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search team or market..."
              className="w-full sm:w-48 rounded-lg border border-slate-800 bg-slate-950/90 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value as 'All' | AnomalyTag)}
              className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
            >
              {ALL_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag === 'All' ? 'All Alert Tags' : tag}
                </option>
              ))}
            </select>
          </div>

          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
          >
            <option value={0}>Score: All</option>
            <option value={52}>Score ≥ 52 (Elevated)</option>
            <option value={75}>Score ≥ 75 (Critical)</option>
          </select>
        </div>
      </div>

      {/* Alert Feed */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-slate-800 bg-[#0b111e] animate-pulse" />
          ))}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-[#0b111e] p-10 text-center">
          <p className="text-sm text-slate-400">No anomaly alerts match your active filters.</p>
          <button
            onClick={() => {
              setSelectedGame('All');
              setSelectedTag('All');
              setMinScore(0);
              setQuery('');
            }}
            className="mt-3 text-xs text-emerald-400 hover:underline cursor-pointer"
          >
            Reset all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredAlerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: AnomalyAlert }) {
  const pctChange = Math.round(alert.priceChange24h * 100);
  const isPositive = pctChange >= 0;
  const scoreColor = getScoreColor(alert.suspicionScore);

  return (
    <div className="group rounded-xl border border-slate-800/90 bg-[#0b111e] hover:border-slate-700 transition-all p-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Left: Match info & tags */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getGameBadgeClass(
                alert.game
              )}`}
            >
              {alert.game}
            </span>
            <span className="text-[11px] font-mono text-slate-500">{alert.tier}</span>
            {alert.tags.map((tag) => (
              <span
                key={tag}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getTagClass(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
              {alert.matchName}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">{alert.reasonSummary}</p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Flagged Outcome:</span>
            <span className="font-semibold text-slate-100 bg-slate-800/90 px-2 py-0.5 rounded">
              {alert.outcome}
            </span>
          </div>
        </div>

        {/* Middle: Odds & Volume */}
        <div className="lg:col-span-3 grid grid-cols-2 gap-3 border-t lg:border-t-0 lg:border-l border-slate-800/80 pt-3 lg:pt-0 lg:pl-4">
          <div>
            <div className="text-[11px] text-slate-500">Implied Odds</div>
            <div className="mt-0.5 flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-base font-bold text-white">
                {Math.round(alert.impliedOdds * 100)}%
              </span>
              <span className="text-xs text-slate-400">({alert.decimalOdds.toFixed(2)}x)</span>
            </div>
            <div
              className={`mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-mono ${
                isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isPositive ? `+${pctChange}%` : `${pctChange}%`} (24h)
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-500">24h Vol / Liq</div>
            <div className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-slate-100">
              {formatUsd(alert.volume24h)}
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              Liq: {formatUsd(alert.liquidity)}
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="lg:col-span-2 hidden sm:block h-14">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={alert.trend}>
              <Line
                type="monotone"
                dataKey="prob"
                stroke={scoreColor}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="text-[10px] text-center font-mono text-slate-500 -mt-1">24h Prob Trend</div>
        </div>

        {/* Right: Suspicion Score + Polymarket Link */}
        <div className="lg:col-span-2 flex items-center justify-between lg:flex-col lg:items-end gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Suspicion</div>
              <div
                className="text-xl font-bold font-mono tabular-nums leading-none"
                style={{ color: scoreColor }}
              >
                {alert.suspicionScore}
                <span className="text-xs font-normal text-slate-500">/100</span>
              </div>
            </div>
            <div className="w-12 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${alert.suspicionScore}%`, backgroundColor: scoreColor }}
              />
            </div>
          </div>

          <a
            href={alert.polymarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors"
          >
            Polymarket
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </a>
        </div>
      </div>
    </div>
  );
}
