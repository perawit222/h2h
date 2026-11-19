'use client';

import React, { useEffect, useState } from 'react';
import {
  Brain,
  Cpu,
  DollarSign,
  ExternalLink,
  Flame,
  Gauge,
  Layers,
  Map,
  ShieldAlert,
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
import { EsportsMatch, MatchAnalysis, PillarDetail, RiskLevel } from '@/types/esports';
import { runDeterministicAnalysis } from '@/lib/analyzer';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!match) {
      setAnalysis(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

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
        // On GitHub Pages static export, run deterministic quant analyzer directly in-browser
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
        { name: 'Recent Form', score: analysis.pillars.recentForm.score, color: '#10b981' },
        { name: 'H2H Record', score: analysis.pillars.headToHead.score, color: '#38bdf8' },
        { name: 'Map / Draft', score: analysis.pillars.statsAndDraft.score, color: '#a855f7' },
        { name: 'Narratives', score: analysis.pillars.narrativesAndCurses.score, color: '#f59e0b' },
      ]
    : [];

  const availableMarkets = match.markets || [];

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
                      <Sparkles className="h-3 w-3" /> Gemini AI Engine
                    </>
                  ) : (
                    <>
                      <Cpu className="h-3 w-3" /> Quant Engine
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
          {loading ? (
            <div className="space-y-4">
              <div className="h-36 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
              <div className="h-44 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
              <div className="h-44 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              {error}
            </div>
          ) : analysis ? (
            <>
              {/* 1–10 Investability & Risk Meter */}
              <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#90d5ff]">
                    <Gauge className="h-4 w-4 text-[#5ce6b6]" />
                    Investability &amp; Risk Rating (1 = Risky · 10 = Best to Invest)
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getRiskStyles(
                      analysis.riskLevel
                    )}`}
                  >
                    Risk: {analysis.riskLevel}
                  </span>
                </div>

                {/* Big 1-10 Score + 10-Segment Visual Scale */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-3xl font-bold font-mono tabular-nums ${getScoreTextColor(
                          analysis.interestScore
                        )}`}
                      >
                        {analysis.interestScore}
                        <span className="text-sm font-normal text-slate-500">/10</span>
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {analysis.investabilityLabel}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 font-semibold">
                      Est. Edge: +{analysis.estimatedEdgePct.toFixed(1)}%
                    </span>
                  </div>

                  {/* 10-Segment Gauge */}
                  <div className="grid grid-cols-10 gap-1">
                    {Array.from({ length: 10 }, (_, idx) => {
                      const seg = idx + 1;
                      return (
                        <div
                          key={seg}
                          className={`h-2.5 rounded-xs transition-all ${getSegmentColor(
                            seg,
                            seg <= analysis.interestScore
                          )}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>1 · Extreme Risk / Avoid</span>
                    <span>5 · Speculative</span>
                    <span>10 · Prime Value / High Conviction</span>
                  </div>
                </div>

                <p className="text-xs text-[#72e4c2] font-medium pt-1">{analysis.verdictHeadline}</p>

                {/* Volume & Max Bettable Capacity Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
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
                      ~${analysis.maxSafeStakeUsd.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500">Pre-slippage cap</div>
                  </div>

                  <div className="rounded-lg border border-[#263750] bg-[#0c1523] p-2.5">
                    <div className="text-[10px] text-slate-400">Suggested Size</div>
                    <div className="mt-1 text-xs font-bold text-[#90d5ff] leading-tight">
                      {analysis.recommendedUnits}
                    </div>
                  </div>
                </div>

                {/* Narrative Tags */}
                {analysis.narrativeTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.narrativeTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md border border-[#263750] bg-[#0c1523] px-2 py-0.5 text-[11px] text-slate-300"
                      >
                        <Flame className="h-3 w-3 text-amber-400" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Best Market Angle + Multi-Market Lines (Moneyline, Handicap, O/U, Map Winners) */}
              <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#90d5ff]">
                    <Layers className="h-4 w-4 text-[#4bb5f7]" />
                    Available Markets (Moneyline · Handicap · Over/Under · Maps)
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {availableMarkets.length} markets
                  </span>
                </div>

                {/* Best Market Angle Callout */}
                <div className="rounded-lg border border-[#5ce6b6]/35 bg-[#5ce6b6]/10 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#72e4c2]">
                      <Target className="h-3.5 w-3.5" />
                      Best Market Angle: {analysis.recommendedMarket.category}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#eac382]">
                      {analysis.recommendedMarket.selection} @ {analysis.recommendedMarket.oddsDecimal.toFixed(2)}x
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">{analysis.recommendedMarket.edgeNote}</p>
                </div>

                {/* Full Multi-Market Table */}
                {availableMarkets.length > 0 && (
                  <div className="space-y-2">
                    {availableMarkets.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-lg border border-[#263750] bg-[#0c1523] p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-200 truncate">{m.question}</span>
                          <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
                            <span className="px-1.5 py-0.5 rounded bg-[#111c2d] border border-[#263750] text-[#90d5ff]">
                              {m.category}
                            </span>
                            {m.volume24h > 0 && (
                              <span className="text-[#72e4c2]">Vol {formatUsd(m.volume24h)}</span>
                            )}
                            {m.liquidity > 0 && (
                              <span className="text-slate-400">Liq {formatUsd(m.liquidity)}</span>
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
                    ))}
                  </div>
                )}
              </div>

              {/* 4-Pillar Conviction Chart */}
              <div className="rounded-xl border border-[#263750] bg-[#111c2d] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#a0b1cb] mb-3">
                  4-Pillar Edge Conviction Profile
                </div>
                <div className="h-36 w-full">
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
                        width={85}
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
                        formatter={(val) => [`${val}/100`, 'Conviction']}
                      />
                      <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16}>
                        {pillarChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 4-Pillar Breakdown Cards */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-sky-400" />
                  4-Pillar Matchup Breakdown
                </h4>

                <PillarCard
                  icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
                  pillar={analysis.pillars.recentForm}
                  accent="emerald"
                />
                <PillarCard
                  icon={<Swords className="h-4 w-4 text-sky-400" />}
                  pillar={analysis.pillars.headToHead}
                  accent="sky"
                />
                <PillarCard
                  icon={<Map className="h-4 w-4 text-purple-400" />}
                  pillar={analysis.pillars.statsAndDraft}
                  accent="purple"
                />
                <PillarCard
                  icon={<ShieldAlert className="h-4 w-4 text-amber-400" />}
                  pillar={analysis.pillars.narrativesAndCurses}
                  accent="amber"
                />
              </div>

              <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 text-[11px] text-slate-500">
                {analysis.engine === 'deterministic' ? (
                  <span>
                    Running built-in <strong className="text-slate-300">Quant Analyzer</strong> (no API key required).
                    Add <code className="text-slate-300">GEMINI_API_KEY</code> to{' '}
                    <code className="text-slate-300">.env.local</code> to auto-upgrade to Gemini AI narratives.
                  </span>
                ) : (
                  <span>Powered by live Gemini AI quantitative analysis. For informational &amp; integrity research only.</span>
                )}
              </div>
            </>
          ) : null}
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
  accent: 'emerald' | 'sky' | 'purple' | 'amber';
}) {
  const accentText =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'sky'
        ? 'text-sky-300'
        : accent === 'purple'
          ? 'text-purple-300'
          : 'text-amber-300';

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
