'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  Brain,
  CheckCircle2,
  Cpu,
  DollarSign,
  ExternalLink,
  Flame,
  Gauge,
  HeartPulse,
  Layers,
  Map,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EsportsMatch,
  MatchAnalysis,
  PillarDetail,
  RiskLevel,
  VerdictBadge,
} from '@/types/esports';
import { runDeterministicAnalysis } from '@/lib/aiAnalyzerService';

interface BettingDrawerProps {
  match: EsportsMatch | null;
  onClose: () => void;
}

function formatUsd(val?: number): string {
  if (!val || val <= 0) return 'N/A';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${Math.round(val).toLocaleString()}`;
}

function getRiskStyles(risk: RiskLevel): string {
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

function getVerdictTheme(verdict: VerdictBadge) {
  switch (verdict) {
    case 'STRONG SERIES LOCK':
      return {
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',
        border: 'border-emerald-500/40',
        icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
      };
    case 'VALUE SERIES PLAY':
      return {
        badge: 'bg-sky-500/20 text-sky-300 border-sky-400/50',
        border: 'border-sky-500/40',
        icon: <CheckCircle2 className="h-4 w-4 text-sky-400" />,
      };
    case 'HIGH VARIANCE / SKIP':
      return {
        badge: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
        border: 'border-amber-500/40',
        icon: <ShieldAlert className="h-4 w-4 text-amber-400" />,
      };
    case 'TRAP MATCH / AVOID':
      return {
        badge: 'bg-rose-500/20 text-rose-300 border-rose-400/50',
        border: 'border-rose-500/45',
        icon: <AlertOctagon className="h-4 w-4 text-rose-400" />,
      };
  }
}

function getScoreTextColor(score: number): string {
  if (score >= 8) return 'text-emerald-400';
  if (score >= 6) return 'text-sky-400';
  if (score >= 4) return 'text-amber-400';
  return 'text-rose-400';
}

function getSegmentColor(seg: number, active: boolean): string {
  if (!active) return 'bg-slate-800/90';
  if (seg <= 3) return 'bg-rose-500';
  if (seg <= 5) return 'bg-amber-500';
  if (seg <= 7) return 'bg-sky-400';
  return 'bg-emerald-400';
}

export function BettingDrawer({ match, onClose }: BettingDrawerProps) {
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!match) {
      setAnalysis(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Static mode fallback');
        return (await res.json()) as MatchAnalysis;
      })
      .then((result) => {
        if (!cancelled) setAnalysis(result);
      })
      .catch(() => {
        if (!cancelled) {
          setAnalysis(runDeterministicAnalysis(match));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [match]);

  if (!match) return null;

  const pillarChartData = analysis
    ? [
        { name: '1. SoS & Form', score: analysis.pillars.sosAndTrueForm.score, color: '#10b981' },
        { name: '2. Series Depth', score: analysis.pillars.seriesDepth.score, color: '#38bdf8' },
        { name: '3. Style & H2H', score: analysis.pillars.stylisticH2H.score, color: '#a855f7' },
        { name: '4. Stakes/Ctx', score: analysis.pillars.stakesAndContext.score, color: '#f59e0b' },
        { name: '5. Narratives', score: analysis.pillars.narrativesAndCurses.score, color: '#fb7185' },
        { name: '6. Odds Check', score: analysis.pillars.oddsSanityCheck.score, color: '#34d399' },
      ]
    : [];

  const availableMarkets = match.markets || [];
  const verdictTheme = analysis ? getVerdictTheme(analysis.verdictBadge) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative z-10 w-full max-w-2xl bg-[#080d17] border-l border-[#263750] h-full overflow-y-auto shadow-2xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-[#263750] bg-[#080d17]/95 backdrop-blur px-6 py-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {match.game} · {match.format}
              </span>
              <span className="text-xs text-slate-400">{match.tournament}</span>
              {analysis && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                    analysis.engine === 'gemini'
                      ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {analysis.engine === 'gemini' ? (
                    <>
                      <Sparkles className="h-3 w-3" /> Gemini Series-First AI
                    </>
                  ) : (
                    <>
                      <Cpu className="h-3 w-3" /> 6-Pillar Quant Engine
                    </>
                  )}
                </span>
              )}
            </div>
            <h3 className="mt-1.5 text-lg font-bold text-white">
              {match.teamA.name} <span className="text-slate-500 font-normal">vs.</span>{' '}
              {match.teamB.name}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {match.polymarketUrl && (
              <a
                href={match.polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[#263750] bg-[#111c2d] hover:border-[#4bb5f7] px-2.5 py-1.5 text-xs font-medium text-[#90d5ff]"
              >
                Polymarket <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Close betting drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {loading || !analysis || !verdictTheme ? (
            <div className="space-y-4">
              <div className="h-36 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
              <div className="h-44 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
              <div className="h-44 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
            </div>
          ) : (
            <>
              {/* 1. VERDICT BADGE + MARKET RECOMMENDATION CARD */}
              <div className={`rounded-xl border ${verdictTheme.border} bg-[#111c2d] p-5 space-y-4`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${verdictTheme.badge}`}
                  >
                    {verdictTheme.icon}
                    {analysis.verdictBadge}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getRiskStyles(
                      analysis.riskLevel
                    )}`}
                  >
                    Risk: {analysis.riskLevel}
                  </span>
                </div>

                {/* Explicit Market Recommendation */}
                <div className="rounded-lg border border-[#263750] bg-[#0c1523] p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Institutional Action
                    </div>
                    <div className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                      <Target className="h-4 w-4 text-[#5ce6b6]" />
                      {analysis.marketRecommendation}
                    </div>
                  </div>
                  <div className="text-left sm:text-right font-mono">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Selection &amp; Price
                    </div>
                    <div className="text-sm font-bold text-[#eac382]">
                      {analysis.recommendedSide}
                      {analysis.recommendedSide !== 'NO BET (Skip)' &&
                        ` @ ${analysis.marketOddsDecimal.toFixed(2)}x`}
                    </div>
                  </div>
                </div>

                {/* True Win Probability vs. Market Implied Odds Comparison Bar */}
                <div className="rounded-lg border border-[#263750] bg-[#0c1523] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 text-[#4bb5f7]" />
                      True Series Win Prob vs. Market Implied
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        analysis.estimatedEdgePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      Edge: {analysis.estimatedEdgePct >= 0 ? '+' : ''}
                      {analysis.estimatedEdgePct.toFixed(1)}%
                    </span>
                  </div>

                  {/* True Prob Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-emerald-300">
                        Model True Series Prob (Pillars 1–5)
                      </span>
                      <span className="font-bold text-emerald-300">
                        {analysis.trueWinProbPct}% (Fair {analysis.fairOddsDecimal.toFixed(2)}x)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${analysis.trueWinProbPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Market Implied Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-sky-300">Bookmaker / Polymarket Implied</span>
                      <span className="font-bold text-sky-300">
                        {analysis.marketImpliedProbPct}% (Odds {analysis.marketOddsDecimal.toFixed(2)}x)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-400"
                        style={{ width: `${analysis.marketImpliedProbPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Why Series > Single Map Callout (Anti-Tilt Rule) */}
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3.5 space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Why Series &gt; Single Map (Anti-Tilt Rule)
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {analysis.whySeriesOverSingleMap}
                  </p>
                </div>

                {/* Key Risk / Invalidation Factors */}
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                    <AlertOctagon className="h-3.5 w-3.5" />
                    Key Risk &amp; Invalidation Factors
                  </div>
                  <ul className="space-y-1">
                    {analysis.invalidationFactors.map((factor, i) => (
                      <li key={i} className="text-xs text-rose-100/90 flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 1-10 Investability Scale + Stake & Liquidity Capacity */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Gauge className="h-3.5 w-3.5 text-[#5ce6b6]" /> Investability:
                      </span>
                      <span
                        className={`text-xl font-bold font-mono ${getScoreTextColor(
                          analysis.interestScore
                        )}`}
                      >
                        {analysis.interestScore}/10
                      </span>
                      <span className="text-xs text-slate-300">{analysis.investabilityLabel}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-10 gap-1">
                    {Array.from({ length: 10 }, (_, idx) => {
                      const seg = idx + 1;
                      return (
                        <div
                          key={seg}
                          className={`h-2 rounded-xs ${getSegmentColor(
                            seg,
                            seg <= analysis.interestScore
                          )}`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-lg border border-[#263750] bg-[#0c1523] p-2.5">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-[#5ce6b6]" /> 24h Volume
                    </div>
                    <div className="mt-1 text-sm font-bold font-mono text-[#72e4c2]">
                      {formatUsd(match.volume24h)}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#263750] bg-[#0c1523] p-2.5">
                    <div className="text-[10px] text-slate-400">Liquidity Depth</div>
                    <div className="mt-1 text-sm font-bold font-mono text-white">
                      {formatUsd(match.liquidity)}
                    </div>
                    <div className="text-[10px] text-slate-500">{analysis.liquidityTier} Book</div>
                  </div>

                  <div className="rounded-lg border border-[#263750] bg-[#0c1523] p-2.5">
                    <div className="text-[10px] text-slate-400">Max Safe Bet</div>
                    <div className="mt-1 text-sm font-bold font-mono text-[#eac382]">
                      {analysis.maxSafeStakeUsd > 0
                        ? `~$${analysis.maxSafeStakeUsd.toLocaleString()}`
                        : '$0 (Skip)'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#263750] bg-[#0c1523] p-2.5">
                    <div className="text-[10px] text-slate-400">Suggested Size</div>
                    <div className="mt-1 text-xs font-bold text-[#90d5ff] leading-tight">
                      {analysis.recommendedUnits}
                    </div>
                  </div>
                </div>
              </div>

              {/* LIVE INJURY & AVAILABILITY REPORT (ALWAYS SHOWN FOR FOOTBALL & NBA) */}
              {(match.game === 'NBA' || match.game === 'Football') && (
                <div className="rounded-xl border border-rose-500/35 bg-[#111c2d] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-300">
                      <HeartPulse className="h-4 w-4 text-rose-400" />
                      Live Injury &amp; Squad Availability Report ({match.game})
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Factored into Pillar 4 &amp; True Win Prob
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { team: match.teamA, sideLabel: 'Home / Team A' },
                      { team: match.teamB, sideLabel: 'Away / Team B' },
                    ].map(({ team }) => {
                      const list = team.injuries || [];
                      const outCount = list.filter(
                        (i) => i.status === 'Out' || i.status === 'Suspended'
                      ).length;
                      return (
                        <div
                          key={team.name}
                          className="rounded-lg border border-[#263750] bg-[#0c1523] p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-white">{team.name}</div>
                              {(team.seasonRecord || team.homeRecord || team.awayRecord) && (
                                <div className="text-[10px] font-mono text-slate-400">
                                  {team.seasonRecord ? `Rec: ${team.seasonRecord}` : ''}
                                  {team.homeRecord ? ` · H ${team.homeRecord}` : ''}
                                  {team.awayRecord ? ` · A ${team.awayRecord}` : ''}
                                </div>
                              )}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                outCount >= 3
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : outCount > 0
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {outCount > 0 ? `${outCount} OUT` : list.length > 0 ? `${list.length} DTD` : 'Healthy'}
                            </span>
                          </div>

                          {list.length === 0 ? (
                            <p className="text-[11px] text-emerald-300/80">
                              No major injuries or suspensions reported in live feeds.
                            </p>
                          ) : (
                            <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                              {list.map((inj, idx) => {
                                const isOut = inj.status === 'Out' || inj.status === 'Suspended';
                                return (
                                  <li
                                    key={`${inj.player}-${idx}`}
                                    className="rounded border border-slate-800/90 bg-slate-950/70 p-2 space-y-0.5"
                                  >
                                    <div className="flex items-center justify-between gap-1.5">
                                      <span className="text-[11px] font-semibold text-slate-100 truncate">
                                        {inj.player}
                                        {inj.position ? (
                                          <span className="ml-1 text-[10px] font-mono text-slate-500">
                                            ({inj.position})
                                          </span>
                                        ) : null}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold shrink-0 ${
                                          isOut
                                            ? 'bg-rose-500/20 text-rose-300'
                                            : 'bg-amber-500/20 text-amber-300'
                                        }`}
                                      >
                                        {inj.status.toUpperCase()}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 leading-snug">
                                      {inj.detail}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 6-Pillar Conviction Chart */}
              <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#a0b1cb] mb-3">
                  6-Pillar Multi-Factor Evaluation Matrix
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={pillarChartData}
                      layout="vertical"
                      margin={{ top: 0, right: 16, left: 10, bottom: 0 }}
                    >
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={96}
                        tick={{ fill: '#cbd5e1', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.06)' }}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(val) => [`${val}/100`, 'Pillar Score']}
                      />
                      <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={14}>
                        {pillarChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 6-Pillar Breakdown Cards */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-sky-400" />
                  Institutional 6-Pillar Breakdown (Evaluated Before Odds)
                </h4>

                <PillarCard
                  icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
                  pillar={analysis.pillars.sosAndTrueForm}
                  accent="emerald"
                />
                <PillarCard
                  icon={<Map className="h-4 w-4 text-sky-400" />}
                  pillar={analysis.pillars.seriesDepth}
                  accent="sky"
                />
                <PillarCard
                  icon={<Swords className="h-4 w-4 text-purple-400" />}
                  pillar={analysis.pillars.stylisticH2H}
                  accent="purple"
                />
                <PillarCard
                  icon={<Flame className="h-4 w-4 text-amber-400" />}
                  pillar={analysis.pillars.stakesAndContext}
                  accent="amber"
                />
                <PillarCard
                  icon={<ShieldAlert className="h-4 w-4 text-rose-400" />}
                  pillar={analysis.pillars.narrativesAndCurses}
                  accent="rose"
                />
                <PillarCard
                  icon={<Scale className="h-4 w-4 text-emerald-300" />}
                  pillar={analysis.pillars.oddsSanityCheck}
                  accent="emerald"
                />
              </div>

              {/* Available Markets Reference Board */}
              {availableMarkets.length > 0 && (
                <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#90d5ff]">
                      <Layers className="h-4 w-4 text-[#4bb5f7]" />
                      Market Lines Reference (Series-First Priority)
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {availableMarkets.length} markets
                    </span>
                  </div>

                  <div className="space-y-2">
                    {availableMarkets.map((m) => {
                      const isSingleMap =
                        m.category === 'Map Winner' || /map\s+[123]/i.test(m.question);
                      return (
                        <div
                          key={m.id}
                          className={`rounded-lg border p-3 space-y-2 ${
                            isSingleMap
                              ? 'border-amber-500/25 bg-[#0c1523]/60 opacity-80'
                              : 'border-[#263750] bg-[#0c1523]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-200 truncate">{m.question}</span>
                            <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
                              {isSingleMap ? (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">
                                  Single-Map (High Variance)
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                                  {m.category}
                                </span>
                              )}
                              {m.volume24h > 0 && (
                                <span className="text-[#72e4c2]">Vol {formatUsd(m.volume24h)}</span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="flex items-center justify-between rounded bg-[#111c2d] px-2.5 py-1.5 border border-[#263750]/80">
                              <span className="text-slate-200 truncate pr-2">{m.teamA}</span>
                              <span className="font-bold text-[#72e4c2] shrink-0">
                                {m.oddsA.toFixed(2)}x ({Math.round(m.probA * 100)}%)
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded bg-[#111c2d] px-2.5 py-1.5 border border-[#263750]/80">
                              <span className="text-slate-200 truncate pr-2">{m.teamB}</span>
                              <span className="font-bold text-[#90d5ff] shrink-0">
                                {m.oddsB.toFixed(2)}x ({Math.round(m.probB * 100)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function PillarCard({
  icon,
  pillar,
  accent,
}: {
  icon: React.ReactNode;
  pillar: PillarDetail;
  accent: 'emerald' | 'sky' | 'purple' | 'amber' | 'rose';
}) {
  const accentText =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'sky'
        ? 'text-sky-300'
        : accent === 'purple'
          ? 'text-purple-300'
          : accent === 'amber'
            ? 'text-amber-300'
            : 'text-rose-300';

  return (
    <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-sm text-white">
          {icon}
          <span>{pillar.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-medium ${accentText}`}>Lean: {pillar.lean}</span>
          <span className="font-mono text-slate-400 bg-[#0c1523] px-2 py-0.5 rounded border border-[#263750]">
            {pillar.score}/100
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed">{pillar.summary}</p>

      <ul className="space-y-1 pt-1">
        {pillar.bullets.map((b, i) => (
          <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 rounded-full bg-slate-500 shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
