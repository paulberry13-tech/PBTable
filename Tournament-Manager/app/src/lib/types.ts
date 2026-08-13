// Row types for the tables/views the public page reads. Typed on the fields actually used;
// unknown extras are tolerated. (A future step can auto-generate these from the DB.)

export interface Tournament {
  id: string
  name: string
  slug: string | null
  start_date: string
  end_date: string | null
  venue: string | null
  logo_url: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
}

export interface TournamentSettings {
  tournament_id: string
  self_service_entries: boolean | null
  courts_count: number | null
  slot_minutes: number | null
}

export interface EventRow {
  id: string
  tournament_id: string
  name: string
  discipline: 'singles' | 'doubles' | string
  category: 'mens' | 'womens' | 'mixed' | 'open' | string
  band_label: string | null
  display_order: number | null
  pool_best_of: number
  pool_points_to: number
  pool_win_by: number
  bracket_best_of: number
  bracket_points_to: number
  bracket_win_by: number
  final_best_of: number
  final_points_to: number
  final_win_by: number
}

export interface Player {
  id: string
  tournament_id: string
  name: string
}

export interface Entry {
  id: string
  event_id: string
  status: string
}

export interface EntryPlayer {
  entry_id: string
  player_id: string
}

export interface Pool {
  id: string
  event_id: string
  name: string
  display_order: number | null
}

export interface PoolEntry {
  pool_id: string
  entry_id: string
}

export interface Match {
  id: string
  event_id: string
  stage: 'pool' | 'bracket' | string
  pool_id: string | null
  bracket_kind: 'main' | 'consolation' | null
  round: number | null
  slot: number | null
  home_entry_id: string | null
  away_entry_id: string | null
  winner_entry_id: string | null
  court: string | null
  scheduled_at: string | null
  best_of: number | null
}

export interface Game {
  id: string
  match_id: string
  game_no: number
  home_score: number | null
  away_score: number | null
}

export interface PoolStanding {
  pool_id: string
  entry_id: string
  pool_rank: number
  played: number
  won: number
  games_won: number
  points_diff: number
}
