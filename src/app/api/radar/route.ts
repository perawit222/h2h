import { NextResponse } from 'next/server';
import { fetchPolymarketEsportsRadar } from '@/lib/polymarket';

export const revalidate = 120;

export async function GET() {
  try {
    const data = await fetchPolymarketEsportsRadar();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('[API /radar] Error:', error);
    return NextResponse.json({ error: 'Failed to load anomaly radar' }, { status: 500 });
  }
}
