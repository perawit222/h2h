'use client';

import React, { useCallback, useState } from 'react';
import {
  Activity,
  CalendarClock,
  Layers,
  RefreshCw,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { EsportsMatch, RadarResponse, ScheduleResponse } from '@/types/esports';
import { AnomalyRadar } from './AnomalyRadar';
import { ScheduleHub } from './ScheduleHub';
import { DailyStepsHub } from './DailyStepsHub';
import { BettingDrawer } from './BettingDrawer';

interface TerminalShellProps {
  initialRadar: RadarResponse;
  initialSchedule: ScheduleResponse;
}

export function TerminalShell({ initialRadar, initialSchedule }: TerminalShellProps) {
  const [activeTab, setActiveTab] = useState<'radar' | 'schedule' | 'steps'>('radar');
  const [radarData, setRadarData] = useState<RadarResponse>(initialRadar);
  const [scheduleData, setScheduleData] = useState<ScheduleResponse>(initialSchedule);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<EsportsMatch | null>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [radarRes, schedRes] = await Promise.all([
        fetch('/api/radar', { cache: 'no-store' }),
        fetch('/api/schedule', { cache: 'no-store' }),
      ]);
      if (radarRes.ok) {
        setRadarData(await radarRes.json());
      }
      if (schedRes.ok) {
        setScheduleData(await schedRes.json());
      }
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Terminal Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#060911]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Terminal className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base">H2H</span>
                <span className="hidden sm:inline text-xs text-slate-400 font-normal">
                  Esports Edge &amp; Integrity Terminal
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                <Activity className="h-3 w-3 text-emerald-400" />
                <span>POLYMARKET GAMMA + OPENDOTA + 4-PILLAR QUANT</span>
              </div>
            </div>
          </div>

          {/* Module Tabs */}
          <nav className="flex items-center rounded-xl border border-slate-800 bg-[#0b111e] p-1">
            <button
              onClick={() => setActiveTab('radar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'radar'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Anomaly Radar</span>
              <span className="ml-0.5 rounded-full bg-rose-500/20 px-1.5 py-0.2 text-[10px] font-mono text-rose-300">
                {radarData.flaggedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'schedule'
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Schedule</span>
              <span className="ml-0.5 rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
                {scheduleData.matches.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('steps')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'steps'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Daily Steps</span>
              <span className="ml-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-mono text-amber-300">
                3
              </span>
            </button>
          </nav>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0b111e] hover:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'radar' ? (
          <AnomalyRadar data={radarData} isLoading={isRefreshing} />
        ) : activeTab === 'schedule' ? (
          <ScheduleHub
            data={scheduleData}
            isLoading={isRefreshing}
            onSelectMatch={(match) => setSelectedMatch(match)}
          />
        ) : (
          <DailyStepsHub
            parlays={scheduleData.parlays || []}
            onSelectMatch={(match) => setSelectedMatch(match)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-[11px] font-mono text-slate-600">
        H2H Esports Edge &amp; Integrity Terminal · Server-cached Polymarket (120s) &amp; Schedule (300s) · For Analytics &amp; Research Only
      </footer>

      {/* Betting Value & Risk Drawer */}
      <BettingDrawer match={selectedMatch} onClose={() => setSelectedMatch(null)} />
    </div>
  );
}
