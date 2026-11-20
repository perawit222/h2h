import { GameTitle, InjuryItem } from '@/types/esports';

export type InjuryMap = Map<string, InjuryItem[]>;

/**
 * Normalizes Football & NBA team names across Polymarket, ESPN, and FPL
 * (e.g. "Arsenal FC" / "Arsenal", "Atlanta Hawks" / "Hawks", "Paris Saint-Germain FC" / "PSG")
 */
export function normalizeInjuryTeamKey(name: string): string {
  const lower = name.toLowerCase();
  if (/\bpsg\b|paris saint-germain/i.test(lower)) return 'psg';
  if (/man(chester)?\s*city|\bmnc\b/i.test(lower)) return 'mancity';
  if (/man(chester)?\s*(utd|united)|\bmun\b/i.test(lower)) return 'manunited';
  if (/newcastle/i.test(lower)) return 'newcastle';
  if (/nottingham|nott'm/i.test(lower)) return 'nottinghamforest';
  if (/spurs|tottenham/i.test(lower) && !/san antonio/i.test(lower)) return 'tottenham';
  if (/wolves|wolverhampton/i.test(lower)) return 'wolves';
  if (/bayern/i.test(lower)) return 'bayern';
  if (/real madrid/i.test(lower)) return 'realmadrid';
  if (/barcelona/i.test(lower)) return 'barcelona';
  if (/atletico|atlético/i.test(lower)) return 'atleticomadrid';
  if (/inter\b|internazionale/i.test(lower)) return 'inter';
  if (/ac milan|\bmilan\b/i.test(lower)) return 'acmilan';
  if (/juventus/i.test(lower)) return 'juventus';
  if (/76ers|sixers/i.test(lower)) return '76ers';
  if (/trail blazers|blazers/i.test(lower)) return 'blazers';

  const stripped = lower
    .replace(
      /\b(fc|cf|ac|sc|afc|bfc|ssc|ogc|rc|sv|1\.|es|as|us|olympique|real|club|de|stade|los angeles|la|new york|golden state|san antonio|minnesota|memphis|milwaukee|portland|detroit|new orleans|washington|toronto|cleveland|houston|indiana|boston|miami|dallas|denver|phoenix|oklahoma city|chicago|atlanta|brooklyn|charlotte|orlando|philadelphia|sacramento|utah|united|city|albion|wanderers|hotspur|rovers|athletic)\b/g,
      ''
    )
    .replace(/[^a-z0-9]/g, '');

  return stripped || lower.replace(/[^a-z0-9]/g, '');
}

function pushInjury(map: InjuryMap, teamName: string, item: InjuryItem) {
  const key = normalizeInjuryTeamKey(teamName);
  if (!key) return;
  const list = map.get(key) || [];
  // Deduplicate by player name
  if (!list.some((x) => x.player.toLowerCase() === item.player.toLowerCase())) {
    list.push(item);
    map.set(key, list);
  }
}

function fetchInit(revalidateSec: number): RequestInit & { next?: { revalidate: number } } {
  const isBrowser = typeof window !== 'undefined';
  return isBrowser
    ? { signal: AbortSignal.timeout(7000) }
    : { next: { revalidate: revalidateSec }, signal: AbortSignal.timeout(6500) };
}

interface EspnNbaInjuryTeamRaw {
  displayName?: string;
  injuries?: {
    status?: string;
    shortComment?: string;
    details?: { type?: string; detail?: string };
    athlete?: {
      displayName?: string;
      position?: { abbreviation?: string };
    };
  }[];
}

/**
 * 1. NBA Live League-Wide Injury Report (ESPN Public API · CORS ACAO: * · Works in Browser & Server)
 */
async function fetchNbaInjuries(map: InjuryMap): Promise<void> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries',
      fetchInit(300)
    );
    if (!res.ok) return;
    const json = (await res.json()) as { injuries?: EspnNbaInjuryTeamRaw[] };

    for (const teamBlock of json.injuries || []) {
      const teamName = teamBlock.displayName;
      if (!teamName) continue;

      for (const inj of teamBlock.injuries || []) {
        const player = inj.athlete?.displayName;
        if (!player) continue;

        const rawStatus = (inj.status || '').toLowerCase();
        const status: InjuryItem['status'] = rawStatus.includes('out')
          ? 'Out'
          : rawStatus.includes('doubt')
            ? 'Doubtful'
            : rawStatus.includes('question')
              ? 'Questionable'
              : 'Day-To-Day';

        const detail =
          inj.shortComment?.trim() ||
          [inj.details?.type, inj.details?.detail].filter(Boolean).join(' — ') ||
          status;

        pushInjury(map, teamName, {
          player,
          position: inj.athlete?.position?.abbreviation,
          status,
          detail: detail.length > 130 ? `${detail.slice(0, 127)}…` : detail,
          source: 'ESPN Injuries',
        });
      }
    }
  } catch {
    // Non-fatal
  }
}

interface FplBootstrapRaw {
  teams?: { id: number; name: string }[];
  elements?: {
    team: number;
    web_name: string;
    status: string; // 'a', 'i', 'd', 's', 'u'
    news?: string;
    chance_of_playing_next_round?: number | null;
    element_type?: number; // 1=GKP, 2=DEF, 3=MID, 4=FWD
  }[];
}

/**
 * 2. Premier League Live Injury & Suspension Report (Official FPL Bootstrap API — Server-side)
 */
async function fetchPremierLeagueFplInjuries(map: InjuryMap): Promise<void> {
  // FPL API does not set CORS ACAO: *, so run on server/build only (embedded in snapshot!)
  if (typeof window !== 'undefined') return;
  try {
    const res = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(6500),
      headers: { 'User-Agent': 'H2H-Terminal/1.0' },
    });
    if (!res.ok) return;
    const json = (await res.json()) as FplBootstrapRaw;
    const teamById = new Map((json.teams || []).map((t) => [t.id, t.name]));
    const posMap: Record<number, string> = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

    for (const p of json.elements || []) {
      if (p.status === 'a' || !p.news?.trim()) continue;
      // Exclude transfers/loans — keep ONLY genuine injuries, illnesses, and suspensions
      if (/(joined|loan|transferred|left the club|released|contract)/i.test(p.news)) continue;

      const teamName = teamById.get(p.team);
      if (!teamName) continue;

      const status: InjuryItem['status'] =
        p.status === 's'
          ? 'Suspended'
          : p.status === 'i' || p.chance_of_playing_next_round === 0
            ? 'Out'
            : 'Doubtful';

      pushInjury(map, teamName, {
        player: p.web_name,
        position: p.element_type ? posMap[p.element_type] : undefined,
        status,
        detail: p.news.trim(),
        source: 'FPL Official',
      });
    }
  } catch {
    // Non-fatal
  }
}

interface EspnNewsArticleRaw {
  headline?: string;
  description?: string;
  categories?: { description?: string; type?: string }[];
}

const INJURY_NEWS_REGEX =
  /\b(injur(?:y|ed)|ruled out|sidelined|hamstring|knee|ankle|acl|groin|muscle|calf|thigh|suspend(?:ed|sion)|red card|surgery|fracture|tear|out for|doubtful|setback)\b/i;

/**
 * 3. Top 5 Football Leagues Breaking Injury News Scanner (ESPN Public API · CORS ACAO: *)
 */
async function fetchFootballNewsInjuries(map: InjuryMap): Promise<void> {
  const leagues = ['eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1'];
  await Promise.all(
    leagues.map(async (lg) => {
      try {
        const res = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/news?limit=25`,
          fetchInit(300)
        );
        if (!res.ok) return;
        const json = (await res.json()) as { articles?: EspnNewsArticleRaw[] };
        for (const art of json.articles || []) {
          const text = `${art.headline || ''} ${art.description || ''}`;
          if (!INJURY_NEWS_REGEX.test(text)) continue;

          const teamCats = (art.categories || []).filter((c) => c.type === 'team' && c.description);
          const athleteCats = (art.categories || []).filter(
            (c) => c.type === 'athlete' && c.description
          );
          const playerName = athleteCats[0]?.description || 'Squad Injury Update';

          for (const tc of teamCats) {
            const isOut = /(surgery|acl|ruled out|sidelined|suspend|fracture|tear)/i.test(text);
            pushInjury(map, tc.description!, {
              player: playerName,
              status: isOut ? 'Out' : 'News',
              detail: (art.headline || art.description || '').slice(0, 125),
              source: 'ESPN News',
            });
          }
        }
      } catch {
        // Non-fatal
      }
    })
  );
}

export async function fetchAllLiveInjuries(): Promise<{
  nba: InjuryMap;
  football: InjuryMap;
}> {
  const nba: InjuryMap = new Map();
  const football: InjuryMap = new Map();

  await Promise.all([
    fetchNbaInjuries(nba),
    fetchPremierLeagueFplInjuries(football),
    fetchFootballNewsInjuries(football),
  ]);

  return { nba, football };
}

export function lookupTeamInjuries(
  game: GameTitle,
  teamName: string,
  maps: { nba: InjuryMap; football: InjuryMap }
): InjuryItem[] {
  if (game !== 'NBA' && game !== 'Football') return [];
  const targetMap = game === 'NBA' ? maps.nba : maps.football;
  const key = normalizeInjuryTeamKey(teamName);
  const items = targetMap.get(key) || [];
  // Sort: Out & Suspended first, then Doubtful/Questionable/Day-To-Day
  const rank = (s: InjuryItem['status']) =>
    s === 'Out' || s === 'Suspended' ? 0 : s === 'Doubtful' ? 1 : 2;
  return [...items].sort((a, b) => rank(a.status) - rank(b.status)).slice(0, 8);
}

export function summarizeMatchInjuries(
  teamATag: string,
  injA: InjuryItem[] | undefined,
  teamBTag: string,
  injB: InjuryItem[] | undefined
): string | undefined {
  const outA = (injA || []).filter((i) => i.status === 'Out' || i.status === 'Suspended');
  const outB = (injB || []).filter((i) => i.status === 'Out' || i.status === 'Suspended');
  const dtdA = (injA || []).filter((i) => i.status !== 'Out' && i.status !== 'Suspended');
  const dtdB = (injB || []).filter((i) => i.status !== 'Out' && i.status !== 'Suspended');

  if (outA.length + outB.length + dtdA.length + dtdB.length === 0) return undefined;

  const partA =
    outA.length > 0
      ? `${teamATag}: ${outA.length} Out (${outA
          .slice(0, 2)
          .map((x) => x.player)
          .join(', ')})`
      : dtdA.length > 0
        ? `${teamATag}: ${dtdA.length} DTD`
        : `${teamATag}: Healthy`;

  const partB =
    outB.length > 0
      ? `${teamBTag}: ${outB.length} Out (${outB
          .slice(0, 2)
          .map((x) => x.player)
          .join(', ')})`
      : dtdB.length > 0
        ? `${teamBTag}: ${dtdB.length} DTD`
        : `${teamBTag}: Healthy`;

  return `${partA} · ${partB}`;
}
