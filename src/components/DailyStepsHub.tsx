'use client';

import React, { useState } from 'react';
import {
  ChevronRight,
  DollarSign,
  Flame,
  Gauge,
  Layers,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { DailyParlayTier, EsportsMatch } from '@/types/esports';

interface DailyStepsHubProps {
  parlays: DailyParlayTier[];
  onSelectMatch: (match: EsportsMatch) => void;
}

function getTierTheme(id: DailyParlayTier['id']) {
  if (id === 'safe') {
    return {
      border: 'border-emerald-500/40',
      bg: 'bg-[#0d1c1e]',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      accentText: 'text-emerald-400',
      icon: <ShieldCheck className="h-5 w-5 text-emerald-400" />,
      barFill: 'bg-emerald-400',
    };
  }
  if (id === 'medium') {
    return {
      border: 'border-sky-500/40',
      bg: 'bg-[#0d1626]',
      badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      accentText: 'text-sky-400',
      icon: <TrendingUp className="h-5 w-5 text-sky-400" />,
      barFill: 'bg-sky-400',
    };
  }
  return {
    border: 'border-amber-500/40',
    bg: 'bg-[#1c1510]',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    accentText: 'text-amber-400',
    icon: <Flame className="h-5 w-5 text-amber-400" />,
    barFill: 'bg-amber-400',
  };
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

export function DailyStepsHub({ parlays, onSelectMatch }: DailyStepsHubProps) {
  const [stakeUsd, setStakeUsd] = useState<number>(100);

  return (
    <div className="space-y-5">
      {/* Header + Stake Simulator */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              Daily 3-Tier Step Builder (Smart Parlays)
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              <Sparkles className="h-3 w-3" />
              Auto-Computed from Today&apos;s Live Markets
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            3 risk-calibrated daily step tickets built from Moneyline, Map Handicap (+1.5/-1.5), and Over/Under lines — max 1 leg per match to prevent correlation risk.
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

      {/* 3-Tier Cards Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {parlays.map((tier) => {
          const theme = getTierTheme(tier.id);
          const payout = Number((stakeUsd * tier.combinedOdds).toFixed(2));
          const profit = Number((payout - stakeUsd).toFixed(2));
          const formula =
            tier.legs.length > 0
              ? `${tier.legs.map((l) => l.oddsDecimal.toFixed(2)).join(' × ')} = ${tier.combinedOdds.toFixed(2)}x`
              : 'No qualifying legs';

          return (
            <div
              key={tier.id}
              className={`rounded-2xl border ${theme.border} ${theme.bg} p-5 flex flex-col justify-between space-y-4`}
            >
              <div className="space-y-4">
                {/* Tier Header */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${theme.badge}`}>
                      {tier.badge}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">{tier.targetOddsRange}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {theme.icon}
                    <h3 className="text-base font-bold text-white">{tier.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{tier.description}</p>
                </div>

                {/* Combined Odds & Payout Box */}
                <div className="rounded-xl border border-slate-800/90 bg-slate-950/75 p-3.5 space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Combined Multiplier
                      </div>
                      <div className={`text-2xl font-bold font-mono tabular-nums ${theme.accentText}`}>
                        {tier.combinedOdds.toFixed(2)}x
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Est. Payout (${stakeUsd})
                      </div>
                      <div className="text-lg font-bold font-mono tabular-nums text-white">
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

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-2">
                      <div className="text-[10px] text-slate-500">Score (1–10)</div>
                      <div className={`text-sm font-bold font-mono ${theme.accentText}`}>
                        {tier.investabilityScore}/10
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-2">
                      <div className="text-[10px] text-slate-500">Model Win %</div>
                      <div className="text-sm font-bold font-mono text-white">
                        {tier.combinedWinProbPct}%
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-2">
                      <div className="text-[10px] text-slate-500">Max Safe Bet</div>
                      <div className="text-sm font-bold font-mono text-[#eac382]">
                        ${tier.maxSafeStakeUsd.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legs List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <span>Selected Legs ({tier.legs.length})</span>
                    <span className="font-mono text-slate-500">Size: {tier.recommendedUnits}</span>
                  </div>

                  {tier.legs.length === 0 ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-center text-xs text-slate-500">
                      Not enough live qualifying markets for this tier right now.
                    </div>
                  ) : (
                    tier.legs.map((leg, idx) => (
                      <button
                        key={`${tier.id}-${leg.matchId}`}
                        type="button"
                        onClick={() => onSelectMatch(leg.match)}
                        className="w-full text-left group rounded-xl border border-slate-800/90 bg-slate-950/70 hover:border-[#4bb5f7]/60 p-3 space-y-1.5 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="h-4 w-4 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300 flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {leg.game}
                            </span>
                            <span className="text-[10px] font-mono text-[#90d5ff]">
                              {leg.marketCategory}
                            </span>
                          </div>
                          <span className={`font-mono text-xs font-bold ${theme.accentText}`}>
                            {leg.oddsDecimal.toFixed(2)}x
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white group-hover:text-[#90d5ff] truncate">
                            Pick: {leg.selection}
                          </span>
                          <span className="text-[11px] font-mono text-emerald-400 shrink-0">
                            {leg.modelWinProbPct}% win
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="truncate pr-2">{leg.matchName}</span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 shrink-0">
                            {formatLocalTime(leg.startTimeIso)}
                            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Footer Scale Bar */}
              <div className="pt-2 border-t border-slate-800/80 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" /> Investability Rating (1=Risky · 10=Best)
                  </span>
                  <span className="font-mono font-semibold text-slate-200">
                    EV: {tier.expectedValuePct >= 0 ? `+${tier.expectedValuePct}%` : `${tier.expectedValuePct}%`}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${theme.barFill}`}
                    style={{ width: `${tier.investabilityScore * 10}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
