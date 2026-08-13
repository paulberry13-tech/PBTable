import { Icon } from './Sprite'
import { fmtDateRange } from '../lib/format'
import type { Tournament } from '../lib/types'

export function Hero(
  { tournament, entryOpen, tournaments, onSelect }: {
    tournament: Tournament
    entryOpen: boolean
    tournaments: Tournament[]
    onSelect: (id: string) => void
  },
) {
  const enterHref = `enter.html?t=${encodeURIComponent(tournament.slug || tournament.id)}`
  return (
    <header className="hero">
      <div className="hero-bar">
        <img src="/pbtable-logo.png" alt="PBTable logo" />
        <span className="product">Tournament&nbsp;Manager</span>
        <nav className="mainnav">
          <a href="#events">Events</a>
          <a href="#draws">Draws</a>
          <a href="#schedule">Schedule</a>
          {entryOpen && (
            <a href={enterHref} className="enter-link" style={{ background: 'var(--gold)', color: 'var(--wine)' }}>
              Enter online
            </a>
          )}
        </nav>
      </div>
      <Icon name="i-court" viewBox="0 0 200 100" className="hero-court" />
      <Icon name="i-ball" className="hero-ball" fill="currentColor" />
      <div className="hero-body">
        {tournament.logo_url && (
          <img className="hero-logo hero-anim d1" src={tournament.logo_url} alt="" />
        )}
        <h1 className="tourn-name hero-anim d2">{tournament.name}</h1>
        <div className="hero-underline hero-anim d2" />
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
