// Pure display formatters, ported from the no-build site. No DB access — the ones that need
// tournament data (entryName, gamesSummary, gamesWon) live on the PublicData resolver instead.
import type { EventRow, Tournament } from './types'

export function fmtDateRange(t: Tournament): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  const a = new Date(t.start_date + 'T00:00:00')
  if (!t.end_date || t.end_date === t.start_date) return a.toLocaleDateString('en-GB', opts)
  const b = new Date(t.end_date + 'T00:00:00')
  return a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' – ' + b.toLocaleDateString('en-GB', opts)
}

export function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// Same-day tournaments show just the time; multi-day prefix the weekday.
export function fmtSlot(ts: string, sameDay: boolean): string {
  const d = new Date(ts)
  return (sameDay ? '' : d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ') +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function fmtFormat(bestOf: number, to: number, winBy: number): string {
  const g = bestOf === 1 ? 'game' : `best of ${bestOf}`
  return `${g} to ${to}${winBy === 2 ? ' (win by 2)' : ''}`
}

export function categoryLabel(ev: EventRow): string {
  const cat = ({ mens: "Men's", womens: "Women's", mixed: 'Mixed', open: 'Open' } as Record<string, string>)[ev.category] || ev.category
  const disc = ev.discipline === 'singles' ? 'Singles' : 'Doubles'
  return `${cat} ${disc}`
}

export function roundLabel(round: number, maxRound: number): string {
  const back = maxRound - round
  if (back === 0) return 'Final'
  if (back === 1) return 'Semi-finals'
  if (back === 2) return 'Quarter-finals'
  if (back === 3) return 'Round of 16'
  return `Round ${round}`
}
