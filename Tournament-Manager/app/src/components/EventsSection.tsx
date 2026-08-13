import { Icon } from './Sprite'
import { Reveal } from './Reveal'
import { Empty } from './Empty'
import { categoryLabel, fmtFormat } from '../lib/format'
import type { PublicData } from '../lib/tournamentData'

export function EventsSection({ data }: { data: PublicData }) {
  return (
    <section id="events">
      <div className="wrap">
        <h2><span className="h2mark"><Icon name="i-doubles" /></span>Events</h2>
        <p className="section-sub">Every competition in this tournament: who can enter, and how it's scored.</p>
        {data.events.length === 0
          ? <Empty word="Pending" detail="Events will appear here once the organiser publishes them." />
          : (
            <div className="events-grid">
              {data.events.map((ev) => {
                const entries = data.entriesOfEvent(ev.id)
                const fmts = [
                  `Pools: ${fmtFormat(ev.pool_best_of, ev.pool_points_to, ev.pool_win_by)}`,
                  `Knockout: ${fmtFormat(ev.bracket_best_of, ev.bracket_points_to, ev.bracket_win_by)}`,
                  `Final: ${fmtFormat(ev.final_best_of, ev.final_points_to, ev.final_win_by)}`,
                ].join(' · ')
                return (
                  <Reveal key={ev.id} className="card event-card">
                    <div className="head">
                      <span className="mark">
                        <Icon name={ev.discipline === 'singles' ? 'i-paddle' : 'i-doubles'} />
                      </span>
                      <div>
                        <h3>{ev.name}</h3>
                        <div className="pills">
                          <span className="pill">{categoryLabel(ev)}</span>
                          {ev.band_label && <span className="pill gold">{ev.band_label}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="spacer" />
                    <div className="foot">
                      <div><span className="count">{entries.length}</span> {entries.length === 1 ? 'entry' : 'entries'}</div>
                      <div className="fmt">{fmts}</div>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          )}
      </div>
    </section>
  )
}
