import { NextRequest, NextResponse } from 'next/server';
import { analyzeMatch } from '@/lib/analyzer';
import { EsportsMatch } from '@/types/esports';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { match?: EsportsMatch };
    if (!body?.match?.id) {
      return NextResponse.json({ error: 'Missing match payload' }, { status: 400 });
    }
    const analysis = await analyzeMatch(body.match);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('[API /analyze] Error:', error);
    return NextResponse.json({ error: 'Failed to analyze match' }, { status: 500 });
  }
}
