import { fmtDateRange } from '../lib/format'
import type { Tournament } from '../lib/types'

// Light, typographic hero — content leads. The nav lives separately as sticky glass chrome.
export function Hero(
  { tournament, tournaments, onSelect }: {
    tournament: Tournament
    tournaments: Tournament[]
    onSelect: (id: string) => void
  },
) {
  return (
    <header className="hero">
      <div className="hero-body">
        {tournament.logo_url && (
          <img className="hero-logo hero-anim d1" src={tournament.logo_url} alt="" />
        )}
        <h1 className="tourn-name hero-anim d2">{tournament.name}</h1>
        <div className="hero-meta hero-anim d3">
          <span><strong>{fmtDateRange(tournament)}</strong></span>
          {tournament.venue && <span>{tournament.venue}</span>}
        </div>
        {tournaments.length > 1 && (
          <div className="tourn-picker hero-anim d4">
            <select
              aria-label="Choose tournament"
              value={tournament.id}
              onChange={(e) => onSelect(e.target.value)}
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {fmtDateRange(t)}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </header>
  )
}
