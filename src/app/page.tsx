import { fetchPolymarketEsportsRadar } from '@/lib/polymarket';
import { fetchDailySchedule } from '@/lib/schedule';
import { TerminalShell } from '@/components/TerminalShell';

export default async function HomePage() {
  const [initialRadar, initialSchedule] = await Promise.all([
    fetchPolymarketEsportsRadar(),
    fetchDailySchedule(),
  ]);

  return <TerminalShell initialRadar={initialRadar} initialSchedule={initialSchedule} />;
}
