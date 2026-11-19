import { NextResponse } from 'next/server';
import { fetchDailySchedule } from '@/lib/schedule';

export const revalidate = 300;

export async function GET() {
  try {
    const data = await fetchDailySchedule();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('[API /schedule] Error:', error);
    return NextResponse.json({ error: 'Failed to load daily esports schedule' }, { status: 500 });
  }
}
