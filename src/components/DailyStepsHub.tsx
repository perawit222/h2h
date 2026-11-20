'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  ChevronRight,
  DollarSign,
  Flame,
  Gauge,
  HeartPulse,
  Layers,
  ShieldCheck,
  Sparkles,
  Square,
  TrendingUp,
} from 'lucide-react';
import { DailyParlayTier, EsportsMatch, GameTitle, RiskLevel, VerdictBadge } from '@/types/esports';

interface DailyStepsHubProps {
  parlays: DailyParlayTier[];
  fetchedAt?: string;
  isSyncing?: boolean;
  onSelectMatch: (match: EsportsMatch) => void;
}

function getVerdictStyle(verdict: VerdictBadge): string {
  switch (verdict) {
    case 'STRONG SERIES LOCK':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50';
    case 'VALUE SERIES PLAY':
      return 'bg-sky-500/20 text-sky-300 border-sky-400/50';
    case 'HIGH VARIANCE / SKIP':
      return 'bg-amber-500/20 text-amber-300 border-amber-400/50';
    case 'TRAP MATCH / AVOID':
      return 'bg-rose-500/20 text-rose-300 border-rose-400/50';
  }
}

function getRiskBadgeClass(risk: RiskLevel): string {
  switch (risk) {
    case 'Low':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'Medium':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'High':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'Extreme':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
}

function getGamePill(game: GameTitle): string {
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

function formatLocalTime(iso: string): string {
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

export function DailyStepsHub({
  parlays,
  fetchedAt,
  isSyncing,
  onSelectMatch,
}: DailyStepsHubProps) {
  const [stakeUsd, setStakeUsd] = useState<number>(100);

  const safeTier = parlays.find((p) => p.id === 'safe');
  const mediumTier = parlays.find((p) => p.id === 'medium');
  const valueTier = parlays.find((p) => p.id === 'value_risk');

  // Allow user to check/uncheck picks from the Top 10 Core (1.35–1.65x) list to build custom multiplier
  const defaultSelectedIds = useMemo(
    () => (mediumTier?.legs || []).slice(0, 3).map((l) => l.matchId),
    [mediumTier]
  );
  const [selectedCoreIds, setSelectedCoreIds] = useState<string[]>(defaultSelectedIds);

  // Automatically re-sync selected legs whenever live daily data refreshes to a new day
  useEffect(() => {
    const validIds = new Set((mediumTier?.legs || []).map((l) => l.matchId));
    setSelectedCoreIds((prev) => {
      const stillValid = prev.filter((id) => validIds.has(id));
      return stillValid.length > 0 ? stillValid : defaultSelectedIds;
    });
  }, [mediumTier, defaultSelectedIds]);

  const activeCoreLegs = useMemo(() => {
    const legs = mediumTier?.legs || [];
    const chosen = legs.filter((l) => selectedCoreIds.includes(l.matchId));
    return chosen.length > 0 ? chosen : legs.slice(0, 3);
  }, [mediumTier, selectedCoreIds]);

  const coreCombinedOdds = useMemo(
    () =>
      activeCoreLegs.length > 0
        ? Number(activeCoreLegs.reduce((acc, l) => acc * l.oddsDecimal, 1).toFixed(2))
        : 1.0,
    [activeCoreLegs]
  );

  const coreCombinedWinPct = useMemo(
    () =>
      activeCoreLegs.length > 0
        ? Math.round(activeCoreLegs.reduce((acc, l) => acc * (l.modelWinProbPct / 100), 1) * 100)
        : 0,
    [activeCoreLegs]
  );

  const toggleCoreLeg = (matchId: string) => {
    setSelectedCoreIds((prev) =>
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header + Stake Simulator */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              Daily 3-Tier Step Builder &amp; Top 10 Core Picks
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              <Sparkles className="h-3 w-3" />
              {isSyncing
                ? 'Syncing Live Today Slate...'
                : `Live Today (${fetchedAt ? formatLocalTime(fetchedAt) : 'Auto-Sync'}) · 100% Real Odds`}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Strictly today&apos;s live/upcoming matches (next 24h) priced with real Polymarket &amp; DraftKings odds. Each match appears at most once with its single best angle — zero conflicting picks.
          </p>
        </div>

        {/* Interactive Stake Calculator */}
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-[#263750] bg-[#111c2d] p-2.5">
          <span className="text-xs text-slate-400 flex items-center gap-1 pl-1">
            <DollarSign className="h-3.5 w-3.5 text-[#5ce6b6]" /> Stake:
          </span>
          {[25, 100, 250, 500].map((amt) => (
            <button
              key={amt}
              onClick={() => setStakeUsd(amt)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                stakeUsd === amt
                  ? 'bg-[#4bb5f7]/25 text-[#90d5ff] border border-[#4bb5f7]/50 font-bold'
                  : 'bg-[#0c1523] text-slate-400 border border-[#263750] hover:text-white'
              }`}
            >
              ${amt}
            </button>
          ))}
          <input
            type="number"
            min={5}
            max={100000}
            value={stakeUsd}
            onChange={(e) => setStakeUsd(Math.max(1, Number(e.target.value) || 0))}
            className="w-20 rounded-md border border-[#263750] bg-[#0c1523] px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-[#4bb5f7]"
            aria-label="Custom stake USD"
          />
        </div>
      </div>

      {/* FEATURED: Tier 2 · TOP 10 VETTED CORE PICKS (1.40x – 1.55x) */}
      {mediumTier && (
        <div className="rounded-2xl border border-sky-500/40 bg-[#0d1626] p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-sky-500/20 text-sky-300 border-sky-500/40">
                  {mediumTier.badge}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {mediumTier.legs.length} Vetted Picks Today · Target {mediumTier.targetOddsRange}
                </span>
              </div>
              <h3 className="mt-1.5 text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-sky-400" />
                {mediumTier.title}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{mediumTier.description}</p>
            </div>

            {/* Live Selected Step Calculator */}
            <div className="rounded-xl border border-sky-500/30 bg-slate-950/80 px-4 py-3 flex items-center gap-5 shrink-0">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Selected ({activeCoreLegs.length} legs)
                </div>
                <div className="text-xl font-bold font-mono text-sky-400">
                  {coreCombinedOdds.toFixed(2)}x
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  Win Prob: {coreCombinedWinPct}%
                </div>
              </div>
              <div className="border-l border-slate-800 pl-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Est. Payout (${stakeUsd})
                </div>
                <div className="text-lg font-bold font-mono text-white">
                  ${(stakeUsd * coreCombinedOdds).toFixed(2)}
                </div>
                <div className="text-[11px] font-mono text-emerald-400">
                  +${(stakeUsd * coreCombinedOdds - stakeUsd).toFixed(2)} profit
                </div>
              </div>
            </div>
          </div>

          {/* 10 Vetted Picks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {mediumTier.legs.map((leg, idx) => {
              const checked = selectedCoreIds.includes(leg.matchId);
              return (
                <div
                  key={`core-${leg.matchId}`}
                  className={`rounded-xl border p-3 transition-all ${
                    checked
                      ? 'border-sky-400/60 bg-[#11223a]'
                      : 'border-slate-800/90 bg-slate-950/70 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Checkbox to include/exclude in custom step */}
                    <button
                      type="button"
                      onClick={() => toggleCoreLeg(leg.matchId)}
                      className="mt-0.5 text-sky-400 hover:text-sky-300 cursor-pointer shrink-0"
                      title="Include/exclude in Step Multiplier"
                    >
                      {checked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-slate-600" />}
                    </button>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getGamePill(leg.game)}`}>
                            {leg.game}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getVerdictStyle(leg.verdictBadge)}`}>
                            {leg.verdictBadge}
                          </span>
                          <span className="text-[10px] font-mono text-sky-300">{leg.marketCategory}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300">
                            {leg.oddsSource}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${getRiskBadgeClass(
                              leg.riskLevel
                            )}`}
                          >
                            {leg.investabilityScore}/10
                          </span>
                          <span className="font-mono text-xs font-bold text-[#eac382]">
                            {leg.oddsDecimal.toFixed(2)}x
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectMatch(leg.match)}
                          className="text-left text-xs font-bold text-white hover:text-sky-300 truncate cursor-pointer"
                        >
                          Pick: {leg.selection}{' '}
                          <span className="font-normal text-slate-400">({leg.matchName})</span>
                        </button>
                        <span className="text-[11px] font-mono text-emerald-400 shrink-0">
                          True {leg.trueWinProbPct}% vs Mkt {leg.marketImpliedProbPct}%
                        </span>
                      </div>

                      {leg.injurySummary && (
                        <div className="flex items-center gap-1 text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded px-2 py-0.5 truncate">
                          <HeartPulse className="h-3 w-3 shrink-0" />
                          <span className="truncate">{leg.injurySummary}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1 text-amber-300/90 truncate">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {leg.riskNote}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectMatch(leg.match)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-sky-400 hover:underline shrink-0 cursor-pointer"
                        >
                          {formatLocalTime(leg.startTimeIso)}
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tier 1 (Safe) & Tier 3 (Worth the Risk) Side-by-Side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[safeTier, valueTier].filter(Boolean).map((tier) => {
          if (!tier) return null;
          const isSafe = tier.id === 'safe';
          const payout = Number((stakeUsd * tier.combinedOdds).toFixed(2));
          const profit = Number((payout - stakeUsd).toFixed(2));
          const formula =
            tier.legs.length > 0
              ? `${tier.legs.map((l) => l.oddsDecimal.toFixed(2)).join(' × ')} = ${tier.combinedOdds.toFixed(2)}x`
              : 'No qualifying legs';

          return (
            <div
              key={tier.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between space-y-4 ${
                isSafe ? 'border-emerald-500/40 bg-[#0d1c1e]' : 'border-amber-500/40 bg-[#1c1510]'
              }`}
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isSafe
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {tier.badge}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">{tier.targetOddsRange}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {isSafe ? (
                      <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Flame className="h-5 w-5 text-amber-400" />
                    )}
                    <h3 className="text-base font-bold text-white">{tier.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400">{tier.description}</p>
                </div>

                {/* Multiplier & Payout */}
                <div className="rounded-xl border border-slate-800/90 bg-slate-950/75 p-3.5 space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Combined Multiplier
                      </div>
                      <div
                        className={`text-2xl font-bold font-mono tabular-nums ${
                          isSafe ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {tier.combinedOdds.toFixed(2)}x
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Est. Payout (${stakeUsd})
                      </div>
                      <div className="text-lg font-bold font-mono text-white">
                        ${payout.toLocaleString()}
                        <span className="ml-1 text-xs font-normal text-emerald-400">
                          (+${profit.toLocaleString()})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 bg-slate-900/90 rounded px-2.5 py-1 border border-slate-800/80 truncate">
                    {formula}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-2">
                      <div className="text-[10px] text-slate-500">Score (1–10)</div>
                      <div className={`text-sm font-bold font-mono ${isSafe ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {tier.investabilityScore}/10
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-2">
                      <div className="text-[10px] text-slate-500">Model Win %</div>
                      <div className="text-sm font-bold font-mono text-white">{tier.combinedWinProbPct}%</div>
                    </div>
                    <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-2">
                      <div className="text-[10px] text-slate-500">Max Safe Bet</div>
                      <div className="text-sm font-bold font-mono text-[#eac382]">
                        ${tier.maxSafeStakeUsd.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legs */}
                <div className="space-y-2">
                  {tier.legs.map((leg, idx) => (
                    <button
                      key={`${tier.id}-${leg.matchId}`}
                      type="button"
                      onClick={() => onSelectMatch(leg.match)}
                      className="w-full text-left group rounded-xl border border-slate-800/90 bg-slate-950/70 hover:border-[#4bb5f7]/60 p-3 space-y-1 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getGamePill(leg.game)}`}>
                            {leg.game}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getVerdictStyle(leg.verdictBadge)}`}>
                            {leg.verdictBadge}
                          </span>
                          <span className="text-[10px] font-mono text-[#90d5ff]">{leg.marketCategory}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300">
                            {leg.oddsSource}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getRiskBadgeClass(leg.riskLevel)}`}>
                            {leg.investabilityScore}/10
                          </span>
                        </div>
                        <span className={`font-mono text-xs font-bold ${isSafe ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {leg.oddsDecimal.toFixed(2)}x
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white group-hover:text-[#90d5ff] truncate">
                          Pick: {leg.selection} <span className="font-normal text-slate-400">({leg.matchName})</span>
                        </span>
                        <span className="text-[11px] font-mono text-emerald-400 shrink-0">
                          True {leg.trueWinProbPct}% vs Mkt {leg.marketImpliedProbPct}%
                        </span>
                      </div>

                      {leg.injurySummary && (
                        <div className="flex items-center gap-1 text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded px-2 py-0.5 truncate">
                          <HeartPulse className="h-3 w-3 shrink-0" />
                          <span className="truncate">{leg.injurySummary}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate pr-2 text-amber-300/80">{leg.riskNote}</span>
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 shrink-0">
                          {formatLocalTime(leg.startTimeIso)}
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Gauge className="h-3.5 w-3.5" /> Size: {tier.recommendedUnits}
                </span>
                <span className="font-mono text-slate-200">
                  EV: {tier.expectedValuePct >= 0 ? `+${tier.expectedValuePct}%` : `${tier.expectedValuePct}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
