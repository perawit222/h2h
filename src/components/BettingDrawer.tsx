'use client';

import React, { useEffect, useState } from 'react';
import {
  Brain,
  Cpu,
  Flame,
  Gauge,
  Map,
  ShieldAlert,
  Sparkles,
  Swords,
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

interface BettingDrawerProps {
  match: EsportsMatch | null;
  onClose: () => void;
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
        if (!res.ok) throw new Error('Analysis request failed');
        return (await res.json()) as MatchAnalysis;
      })
      .then((result) => {
        if (!cancelled) setAnalysis(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to analyze match');
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside className="relative z-10 w-full max-w-2xl bg-[#080d17] border-l border-slate-800 h-full overflow-y-auto shadow-2xl">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-800 bg-[#080d17]/95 backdrop-blur px-6 py-4">
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
                      <Cpu className="h-3 w-3" /> Deterministic Quant Engine
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

          <button
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white hover:border-slate-700 cursor-pointer"
            aria-label="Close betting drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="space-y-4">
              <div className="h-32 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
              <div className="h-44 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
              <div className="h-44 rounded-xl bg-slate-900/80 border border-slate-800 animate-pulse" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              {error}
            </div>
          ) : analysis ? (
            <>
              {/* Opportunity vs. Risk Meter */}
              <div className="rounded-xl border border-slate-800 bg-[#0c1322] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Gauge className="h-4 w-4 text-emerald-400" />
                    Opportunity vs. Risk Meter
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getRiskStyles(
                      analysis.riskLevel
                    )}`}
                  >
                    Risk: {analysis.riskLevel}
                  </span>
                </div>

                <p className="text-sm font-medium text-emerald-300">{analysis.verdictHeadline}</p>

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="text-[11px] text-slate-500">Interest Score</div>
                    <div className="mt-1 flex items-baseline gap-1 font-mono tabular-nums">
                      <span className="text-2xl font-bold text-white">
                        {analysis.interestScore}
                      </span>
                      <span className="text-xs text-slate-500">/10</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${analysis.interestScore * 10}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="text-[11px] text-slate-500">Estimated Edge</div>
                    <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-400">
                      +{analysis.estimatedEdgePct.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 truncate">
                      Lean: {analysis.recommendedSide}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="text-[11px] text-slate-500">Market vs Fair</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-white">
                      {analysis.marketOddsDecimal.toFixed(2)}{' '}
                      <span className="text-xs font-normal text-slate-500">vs</span>{' '}
                      <span className="text-sky-400">{analysis.fairOddsDecimal.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Decimal Moneyline</div>
                  </div>
                </div>

                {/* Narrative Tags */}
                {analysis.narrativeTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {analysis.narrativeTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-300"
                      >
                        <Flame className="h-3 w-3 text-amber-400" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 4-Pillar Conviction Chart */}
              <div className="rounded-xl border border-slate-800 bg-[#0c1322] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
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

              {/* Disclaimer / Gemini Hint */}
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 text-[11px] text-slate-500">
                {analysis.engine === 'deterministic' ? (
                  <span>
                    Running built-in <strong className="text-slate-300">Deterministic Quant Analyzer</strong>{' '}
                    (no API key required). Add <code className="text-slate-300">GEMINI_API_KEY</code> to{' '}
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
    <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-sm text-white">
          {icon}
          <span>{pillar.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-medium ${accentText}`}>Lean: {pillar.lean}</span>
          <span className="font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
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
