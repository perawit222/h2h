'use client';

import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronRight,
  Globe,
  Monitor,
  Radio,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { EsportsMatch, GameTitle, MatchFormat, ScheduleResponse } from '@/types/esports';

interface ScheduleHubProps {
  data: ScheduleResponse;
  isLoading: boolean;
  onSelectMatch: (match: EsportsMatch) => void;
}

const GAMES: ('All' | GameTitle)[] = [
  'All',
  'CS2',
  'Valorant',
  'LoL',
  'Dota 2',
  'Football',
  'NBA',
  'Tennis',
];
const FORMATS: ('All' | MatchFormat)[] = ['All', 'Bo1', 'Bo3', 'Bo5', '90m', '4Q', 'Sets'];

function formatLocalTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return 'TBD';
  }
}

function getGameAccent(game: GameTitle): string {
  switch (game) {
    case 'CS2':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'Valorant':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'LoL':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'Dota 2':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'Football':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'NBA':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'Tennis':
      return 'bg-lime-500/15 text-lime-300 border-lime-500/30';
  }
}

export function ScheduleHub({ data, isLoading, onSelectMatch }: ScheduleHubProps) {
  const [selectedGame, setSelectedGame] = useState<'All' | GameTitle>('All');
  const [selectedFormat, setSelectedFormat] = useState<'All' | MatchFormat>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'upcoming'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'time'>('score');

  const localTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'Local Time';
    }
  }, []);

  const filteredMatches = useMemo(() => {
    const list = data.matches.filter((m) => {
      if (selectedGame !== 'All' && m.game !== selectedGame) return false;
      if (selectedFormat !== 'All' && m.format !== selectedFormat) return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'score') {
        const sA = a.quickScore?.interestScore ?? 5;
        const sB = b.quickScore?.interestScore ?? 5;
        if (sB !== sA) return sB - sA;
      }
      if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
      return new Date(a.startTimeIso).getTime() - new Date(b.startTimeIso).getTime();
    });
  }, [data.matches, selectedGame, selectedFormat, statusFilter, sortBy]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-sky-400" />
              Daily Esports Schedule &amp; AI Betting Analyzer
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
              <Sparkles className="h-3 w-3" />
              4-Pillar Quant Drawer
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Click any matchup to open the Opportunity vs. Risk Meter &amp; 4-Pillar Breakdown. Times displayed in{' '}
            <span className="font-mono text-slate-300">{localTz}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data.sourcesUsed.map((src) => (
            <span
              key={src}
              className="rounded-md border border-slate-800 bg-slate-900/90 px-2 py-1 text-[11px] font-mono text-slate-400"
            >
              {src}
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-800/80 bg-[#0b111e] p-3.5 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {GAMES.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGame(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectedGame === g
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
            {(['all', 'live', 'upcoming'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors cursor-pointer ${
                  statusFilter === s
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as 'All' | MatchFormat)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-sky-500/50"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f === 'All' ? 'All Formats' : f}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'score' | 'time')}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-sky-500/50"
          >
            <option value="score">Sort: Best 1–10 Score</option>
            <option value="time">Sort: Start Time</option>
          </select>
        </div>
      </div>

      {/* Match List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-xl border border-slate-800 bg-[#0b111e] animate-pulse" />
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-[#0b111e] p-10 text-center text-sm text-slate-400">
          No matches found for the selected filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
          {filteredMatches.map((match) => (
            <MatchCard key={match.id} match={match} onClick={() => onSelectMatch(match)} />
          ))}
        </div>
      )}
    </div>
  );
}

function getQuickScoreStyle(score: number): string {
  if (score >= 8) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
  if (score >= 6) return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
  if (score >= 4) return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
  return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
}

function MatchCard({ match, onClick }: { match: EsportsMatch; onClick: () => void }) {
  const isLive = match.status === 'live';
  const markets = match.markets || [];
  const hcpMarket = markets.find((m) => /handicap/i.test(m.question));
  const ouMarket = markets.find((m) => /o\/u|over\/under|total/i.test(m.question));
  const qs = match.quickScore;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left group rounded-xl border border-slate-800/90 bg-[#0b111e] hover:border-sky-500/50 hover:bg-[#0d1526] transition-all p-4 space-y-3.5 cursor-pointer"
    >
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getGameAccent(match.game)}`}>
            {match.game}
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
            {match.format}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Trophy className="h-3 w-3 text-slate-500" />
            {match.tournament}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {qs && (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border ${getQuickScoreStyle(
                qs.interestScore
              )}`}
              title="1 = Extremely Risky / Avoid · 10 = High Conviction / Best to Invest"
            >
              {qs.interestScore}/10 · {qs.riskLevel} Risk
            </span>
          )}
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-[11px] font-mono text-slate-400">
              {formatLocalTime(match.startTimeIso)}
            </span>
          )}
        </div>
      </div>

      {/* Teams & Moneyline Odds */}
      <div className="grid grid-cols-11 items-center gap-2">
        {/* Team A */}
        <div className="col-span-5 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-bold text-white truncate">{match.teamA.name}</span>
            <span className="text-[10px] font-mono text-slate-500">#{match.teamA.ranking}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {match.teamA.recentForm.map((r, i) => (
                <span
                  key={i}
                  className={`h-4 w-4 rounded text-[9px] font-bold flex items-center justify-center ${
                    r === 'W'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
            <div className="text-right font-mono tabular-nums">
              <span className="text-sm font-bold text-emerald-400">
                {match.teamA.oddsDecimal.toFixed(2)}
              </span>
              <span className="ml-1 text-[10px] text-slate-500">
                ({Math.round(match.teamA.impliedProb * 100)}%)
              </span>
            </div>
          </div>
        </div>

        {/* VS */}
        <div className="col-span-1 text-center text-[11px] font-mono font-bold text-slate-600">
          VS
        </div>

        {/* Team B */}
        <div className="col-span-5 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-bold text-white truncate">{match.teamB.name}</span>
            <span className="text-[10px] font-mono text-slate-500">#{match.teamB.ranking}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {match.teamB.recentForm.map((r, i) => (
                <span
                  key={i}
                  className={`h-4 w-4 rounded text-[9px] font-bold flex items-center justify-center ${
                    r === 'W'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
            <div className="text-right font-mono tabular-nums">
              <span className="text-sm font-bold text-sky-400">
                {match.teamB.oddsDecimal.toFixed(2)}
              </span>
              <span className="ml-1 text-[10px] text-slate-500">
                ({Math.round(match.teamB.impliedProb * 100)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Extra Markets Strip (Handicap & Over/Under preview) */}
      {(hcpMarket || ouMarket) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
          {hcpMarket && (
            <div className="flex items-center justify-between rounded-md border border-slate-800/90 bg-slate-950/70 px-2.5 py-1.5">
              <span className="text-slate-400 truncate pr-2">HCP · {hcpMarket.teamA}</span>
              <span className="text-amber-300 font-semibold shrink-0">
                {hcpMarket.oddsA.toFixed(2)}x / {hcpMarket.oddsB.toFixed(2)}x
              </span>
            </div>
          )}
          {ouMarket && (
            <div className="flex items-center justify-between rounded-md border border-slate-800/90 bg-slate-950/70 px-2.5 py-1.5">
              <span className="text-slate-400 truncate pr-2">{ouMarket.question.replace('Games Total: ', 'Total ')}</span>
              <span className="text-sky-300 font-semibold shrink-0">
                O {ouMarket.oddsA.toFixed(2)}x · U {ouMarket.oddsB.toFixed(2)}x
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer Row */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800/70 text-[11px]">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="inline-flex items-center gap-1">
            {match.isLan ? (
              <>
                <Globe className="h-3 w-3 text-emerald-400" /> LAN
              </>
            ) : (
              <>
                <Monitor className="h-3 w-3 text-slate-500" /> Online
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-emerald-300/90">
            <Radio className="h-3 w-3" /> {match.source}
          </span>
          {typeof match.volume24h === 'number' && match.volume24h > 0 && (
            <span className="hidden sm:inline font-mono text-[#72e4c2]">
              24h Vol: ${Math.round(match.volume24h).toLocaleString()}
            </span>
          )}
        </div>

        <span className="inline-flex items-center gap-1 font-medium text-sky-400 group-hover:text-sky-300 transition-colors">
          Analyze Edge
          <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </button>
  );
}
