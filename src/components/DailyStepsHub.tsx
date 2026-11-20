'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  ChevronRight,
  DollarSign,
  Flame,
  HeartPulse,
  Layers,
  ShieldCheck,
  Sparkles,
  Square,
  TrendingUp,
} from 'lucide-react';
import {
  DailyParlayTier,
  EsportsMatch,
  GameTitle,
  RiskLevel,
  VerdictBadge,
} from '@/types/esports';

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

function getScoreBadgeClass(score: number): string {
  if (score >= 9) return 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60';
  if (score >= 7) return 'bg-sky-500/20 text-sky-300 border-sky-400/50';
  if (score >= 6) return 'bg-amber-500/20 text-amber-300 border-amber-400/50';
  return 'bg-rose-500/20 text-rose-300 border-rose-400/50';
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

  // Order strictly vertically: Tier 1 (Safe) -> Tier 2 (Medium Core) -> Tier 3 (Worth the Risk)
  const orderedTiers = useMemo(() => {
    const order: DailyParlayTier['id'][] = ['safe', 'medium', 'value_risk'];
    return order
      .map((id) => parlays.find((p) => p.id === id))
      .filter((t): t is DailyParlayTier => Boolean(t));
  }, [parlays]);

  return (
    <div className="space-y-6">
      {/* Top Header + Global Stake Simulator */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              Daily Steps — 3-Tier Vertical Board (Ranked by 1–10 Score)
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              <Sparkles className="h-3 w-3" />
              {isSyncing
                ? 'Syncing Live Today Slate...'
                : `Live Today (${fetchedAt ? formatLocalTime(fetchedAt) : 'Auto-Sync'}) · 100% Real Odds`}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Each tier lists 5–15 high-conviction picks sorted strictly from highest Investability Score (10 → 6). Zero trap matches, zero single-map gambles, 1 best pick per match.
          </p>
        </div>

        {/* Interactive Stake Calculator */}
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-[#263750] bg-[#111c2d] p-2.5 shrink-0">
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

      {/* VERTICAL 3-TIER STACK */}
      <div className="flex flex-col gap-6">
        {orderedTiers.map((tier) => (
          <TierVerticalSection
            key={tier.id}
            tier={tier}
            stakeUsd={stakeUsd}
            onSelectMatch={onSelectMatch}
          />
        ))}
      </div>
    </div>
  );
}

function TierVerticalSection({
  tier,
  stakeUsd,
  onSelectMatch,
}: {
  tier: DailyParlayTier;
  stakeUsd: number;
  onSelectMatch: (match: EsportsMatch) => void;
}) {
  const defaultIds = useMemo(() => tier.legs.slice(0, 3).map((l) => l.matchId), [tier.legs]);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultIds);

  useEffect(() => {
    const valid = new Set(tier.legs.map((l) => l.matchId));
    setSelectedIds((prev) => {
      const kept = prev.filter((id) => valid.has(id));
      return kept.length > 0 ? kept : tier.legs.slice(0, 3).map((l) => l.matchId);
    });
  }, [tier.legs]);

  const activeLegs = useMemo(
    () => tier.legs.filter((l) => selectedIds.includes(l.matchId)),
    [tier.legs, selectedIds]
  );

  const combinedOdds = useMemo(
    () =>
      activeLegs.length > 0
        ? Number(activeLegs.reduce((acc, l) => acc * l.oddsDecimal, 1).toFixed(2))
        : 1.0,
    [activeLegs]
  );

  const combinedWinPct = useMemo(
    () =>
      activeLegs.length > 0
        ? Math.round(activeLegs.reduce((acc, l) => acc * (l.trueWinProbPct / 100), 1) * 100)
        : 0,
    [activeLegs]
  );

  const payout = Number((stakeUsd * combinedOdds).toFixed(2));
  const profit = Number((payout - stakeUsd).toFixed(2));

  const toggleLeg = (matchId: string) => {
    setSelectedIds((prev) =>
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId]
    );
  };

  const theme =
    tier.id === 'safe'
      ? {
          container: 'border-emerald-500/40 bg-[#0b191c]',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          accent: 'text-emerald-400',
          checkedCard: 'border-emerald-400/60 bg-[#10292d]',
          checkbox: 'text-emerald-400',
          calcBorder: 'border-emerald-500/30',
          icon: <ShieldCheck className="h-5 w-5 text-emerald-400" />,
        }
      : tier.id === 'medium'
        ? {
            container: 'border-sky-500/40 bg-[#0c1525]',
            badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
            accent: 'text-sky-400',
            checkedCard: 'border-sky-400/60 bg-[#11223a]',
            checkbox: 'text-sky-400',
            calcBorder: 'border-sky-500/30',
            icon: <TrendingUp className="h-5 w-5 text-sky-400" />,
          }
        : {
            container: 'border-amber-500/40 bg-[#1a140f]',
            badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
            accent: 'text-amber-400',
            checkedCard: 'border-amber-400/60 bg-[#281e14]',
            checkbox: 'text-amber-400',
            calcBorder: 'border-amber-500/30',
            icon: <Flame className="h-5 w-5 text-amber-400" />,
          };

  return (
    <section className={`rounded-2xl border ${theme.container} p-5 space-y-4`}>
      {/* Section Header + Live Step Calculator */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${theme.badge}`}>
              {tier.badge}
            </span>
            <span className="text-xs font-mono text-slate-300 bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded">
              {tier.legs.length} Sure Picks Today (Target 5–15)
            </span>
            <span className="text-xs font-mono text-slate-400">{tier.targetOddsRange}</span>
            <span className="text-[11px] font-mono text-slate-500">· Size: {tier.recommendedUnits}</span>
          </div>

          <div className="flex items-center gap-2">
            {theme.icon}
            <h3 className="text-base font-bold text-white">{tier.title}</h3>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl">{tier.description}</p>
        </div>

        {/* Live Selected Multiplier Box + Quick Select Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <div className={`rounded-xl border ${theme.calcBorder} bg-slate-950/85 px-4 py-2.5 flex items-center gap-4`}>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Selected ({activeLegs.length} legs)
              </div>
              <div className={`text-xl font-bold font-mono tabular-nums ${theme.accent}`}>
                {activeLegs.length > 0 ? `${combinedOdds.toFixed(2)}x` : '—'}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Win Prob: {combinedWinPct}%
              </div>
            </div>
            <div className="border-l border-slate-800 pl-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Payout (${stakeUsd})
              </div>
              <div className="text-base font-bold font-mono text-white">
                {activeLegs.length > 0 ? `$${payout.toLocaleString()}` : '$0'}
              </div>
              <div className="text-[11px] font-mono text-emerald-400">
                {activeLegs.length > 0 ? `+$${profit.toLocaleString()} net` : 'Select legs'}
              </div>
            </div>
          </div>

          {tier.legs.length > 0 && (
            <div className="flex sm:flex-col gap-1.5 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setSelectedIds(tier.legs.slice(0, 3).map((l) => l.matchId))}
                className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900 hover:border-slate-500 text-slate-200 cursor-pointer"
              >
                Top 3
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(tier.legs.slice(0, 5).map((l) => l.matchId))}
                className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900 hover:border-slate-500 text-slate-200 cursor-pointer"
              >
                Top 5
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1 rounded-md border border-slate-800 bg-slate-950 hover:text-white text-slate-400 cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Picks List (Sorted strictly by highest 1–10 Investability Score) */}
      {tier.legs.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
          No high-conviction today-only real-odds matches currently meet the strict certainty filter for this tier.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {tier.legs.map((leg, idx) => {
            const checked = selectedIds.includes(leg.matchId);
            return (
              <div
                key={`${tier.id}-${leg.matchId}`}
                className={`rounded-xl border p-3.5 transition-all ${
                  checked
                    ? theme.checkedCard
                    : 'border-slate-800/90 bg-slate-950/70 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleLeg(leg.matchId)}
                    className={`mt-0.5 cursor-pointer shrink-0 ${theme.checkbox}`}
                    title="Include/exclude in step ticket"
                  >
                    {checked ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-600" />
                    )}
                  </button>

                  {/* Body */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Row 1: Rank, 1–10 Score, Game, Verdict, Odds */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-mono font-bold text-slate-400">
                          #{idx + 1}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${getScoreBadgeClass(
                            leg.investabilityScore
                          )}`}
                          title="Investability Score: 10 = Highest Conviction · 1 = Extreme Risk"
                        >
                          {leg.investabilityScore}/10
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getGamePill(
                            leg.game
                          )}`}
                        >
                          {leg.game}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getVerdictStyle(
                            leg.verdictBadge
                          )}`}
                        >
                          {leg.verdictBadge}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getRiskBadgeClass(
                            leg.riskLevel
                          )}`}
                        >
                          {leg.riskLevel} Risk
                        </span>
                        <span className={`font-mono text-sm font-bold ${theme.accent}`}>
                          {leg.oddsDecimal.toFixed(2)}x
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Pick + Match + True vs Mkt Prob */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectMatch(leg.match)}
                        className="text-left text-xs font-bold text-white hover:text-[#90d5ff] truncate cursor-pointer"
                      >
                        Pick: {leg.selection}{' '}
                        <span className="font-normal text-slate-400">({leg.matchName})</span>
                      </button>
                      <span className="text-[11px] font-mono text-emerald-400 shrink-0">
                        True {leg.trueWinProbPct}% vs Mkt {leg.marketImpliedProbPct}%
                      </span>
                    </div>

                    {/* Row 3: Market Type + Real Odds Source + Start Time */}
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[#90d5ff]">{leg.marketCategory}</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-emerald-300">
                          {leg.oddsSource}
                        </span>
                        <span className="text-slate-500 truncate max-w-[160px]">
                          {leg.tournament}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectMatch(leg.match)}
                        className="inline-flex items-center gap-0.5 text-sky-400 hover:underline shrink-0 cursor-pointer"
                      >
                        {formatLocalTime(leg.startTimeIso)}
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Live Injury Strip (NBA & Football) */}
                    {leg.injurySummary && (
                      <div className="flex items-center gap-1.5 text-[10px] text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded px-2 py-1 truncate">
                        <HeartPulse className="h-3 w-3 text-rose-400 shrink-0" />
                        <span className="truncate">{leg.injurySummary}</span>
                      </div>
                    )}

                    {/* Risk Note */}
                    <div className="flex items-center gap-1 text-[10px] text-amber-300/85 truncate">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{leg.riskNote}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
