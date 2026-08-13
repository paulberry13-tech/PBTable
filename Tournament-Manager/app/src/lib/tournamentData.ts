import { supabase } from './supabase'
import type {
  Tournament, TournamentSettings, EventRow, Player, Entry, EntryPlayer,
  Pool, PoolEntry, Match, Game, PoolStanding,
} from './types'

// PostgREST caps a response at 1000 rows and never signals it — a big best-of-3 event has
// >1000 games, so a plain select silently drops scores. This pages through every row, and
// chunks the id list too (a huge ?in=(...) overflows the URL). Every large read uses it.
export async function fetchAllIn<T>(
  table: string, selectCols: string, col: string, ids: string[], orderCol?: string,
): Promise<T[]> {
  const out: T[] = []
  const idChunks: string[][] = []
  for (let i = 0; i < ids.length; i += 200) idChunks.push(ids.slice(i, i + 200))
  for (const chunk of idChunks) {
    let from = 0
    for (;;) {
      const base = supabase.from(table).select(selectCols).in(col, chunk).range(from, from + 999)
      const { data, error } = await (orderCol ? base.order(orderCol) : base)
      if (error) throw error
      out.push(...((data ?? []) as unknown as T[]))
      if (!data || data.length < 1000) break
      from += 1000
    }
  }
  return out
}

// Everything the public page needs for one tournament, with names/scores resolved through
// tournament-wide maps loaded once (never from a stage-scoped list — the league "TBC" lesson).
export interface PublicData {
  tournament: Tournament
  settings: TournamentSettings | null
  events: EventRow[]
  playersById: Map<string, Player>
  entriesById: Map<string, Entry>
  entryPlayers: Map<string, string[]>
  poolsById: Map<string, Pool>
  poolEntries: Map<string, string[]>
  matches: Match[]
  gamesByMatch: Map<string, Game[]>
  standings: PoolStanding[]
  sameDay: boolean
  entryName(entryId: string | null): string | null
  gamesSummary(matchId: string): string | null
  gamesWon(matchId: string): { h: number; a: number; scored: number }
  entriesOfEvent(eventId: string): Entry[]
}

export async function loadPublicData(tournament: Tournament): Promise<PublicData> {
  const [settingsRes, eventsRes, playersRes] = await Promise.all([
    supabase.from('tournament_settings').select('*').eq('tournament_id', tournament.id).maybeSingle(),
    supabase.from('events').select('*').eq('tournament_id', tournament.id).order('display_order').order('name'),
    supabase.from('players').select('*').eq('tournament_id', tournament.id),
  ])
  for (const r of [settingsRes, eventsRes, playersRes]) if (r.error) throw r.error
  const settings = settingsRes.data as TournamentSettings | null
  const events = (eventsRes.data ?? []) as EventRow[]
  const players = (playersRes.data ?? []) as Player[]
  const playersById = new Map(players.map((p) => [p.id, p]))

  const eventIds = events.map((e) => e.id)
  let entries: Entry[] = [], pools: Pool[] = [], matches: Match[] = [], standings: PoolStanding[] = []
  if (eventIds.length) {
    [entries, pools, matches, standings] = await Promise.all([
      fetchAllIn<Entry>('entries', '*', 'event_id', eventIds),
      fetchAllIn<Pool>('pools', '*', 'event_id', eventIds, 'display_order'),
      fetchAllIn<Match>('matches', '*', 'event_id', eventIds),
      fetchAllIn<PoolStanding>('pool_standings', '*', 'event_id', eventIds),
    ])
  }
  const entriesById = new Map(entries.map((e) => [e.id, e]))
  const poolsById = new Map(pools.map((p) => [p.id, p]))

  const entryPlayers = new Map<string, string[]>()
  if (entries.length) {
    const eps = await fetchAllIn<EntryPlayer>('entry_players', '*', 'entry_id', entries.map((e) => e.id))
    for (const ep of eps) {
      const arr = entryPlayers.get(ep.entry_id) ?? []
      arr.push(ep.player_id); entryPlayers.set(ep.entry_id, arr)
    }
  }
  const poolEntries = new Map<string, string[]>()
  if (pools.length) {
    const pes = await fetchAllIn<PoolEntry>('pool_entries', '*', 'pool_id', pools.map((p) => p.id))
    for (const pe of pes) {
      const arr = poolEntries.get(pe.pool_id) ?? []
      arr.push(pe.entry_id); poolEntries.set(pe.pool_id, arr)
    }
  }
  const gamesByMatch = new Map<string, Game[]>()
  if (matches.length) {
    const gs = await fetchAllIn<Game>('games', '*', 'match_id', matches.map((m) => m.id), 'game_no')
    for (const g of gs) {
      const arr = gamesByMatch.get(g.match_id) ?? []
      arr.push(g); gamesByMatch.set(g.match_id, arr)
    }
  }

  const entryName = (entryId: string | null): string | null => {
    if (!entryId) return null
    const ids = entryPlayers.get(entryId) ?? []
    const names = ids.map((pid) => playersById.get(pid)?.name ?? '?')
    return names.length ? names.join(' & ') : 'Unnamed entry'
  }
  const gamesSummary = (matchId: string): string | null => {
    const games = (gamesByMatch.get(matchId) ?? []).filter((g) => g.home_score !== null)
    if (!games.length) return null
    return games.map((g) => `${g.home_score}-${g.away_score}`).join(', ')
  }
  const gamesWon = (matchId: string) => {
    const games = (gamesByMatch.get(matchId) ?? []).filter((g) => g.home_score !== null)
    let h = 0, a = 0
    for (const g of games) {
      const hs = g.home_score ?? 0, as = g.away_score ?? 0
      if (hs > as) h++; else if (as > hs) a++
    }
    return { h, a, scored: games.length }
  }
  const entriesOfEvent = (eventId: string): Entry[] =>
    entries.filter((e) => e.event_id === eventId && e.status !== 'withdrawn')

  const sameDay = !tournament.end_date || tournament.end_date === tournament.start_date

  return {
    tournament, settings, events, playersById, entriesById, entryPlayers,
    poolsById, poolEntries, matches, gamesByMatch, standings, sameDay,
    entryName, gamesSummary, gamesWon, entriesOfEvent,
  }
}
