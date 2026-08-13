import { Icon } from './Sprite'
import { Reveal } from './Reveal'
import { Empty } from './Empty'
import { fmtSlot } from '../lib/format'
import type { PublicData } from '../lib/tournamentData'

export function ScheduleSection({ data }: { data: PublicData }) {
  const scheduled = data.matches
    .filter((m) => m.scheduled_at)
    .sort((a, b) => (a.scheduled_at as string).localeCompare(b.scheduled_at as string)
      || String(a.court ?? '').localeCompare(String(b.court ?? ''), undefined, { numeric: true }))
  const evName = new Map(data.events.map((e) => [e.id, e.name]))
  let lastSlot: string | null = null

  return (
    <section id="schedule">
      <div className="wrap">
        <h2><span className="h2mark"><Icon name="i-court" viewBox="0 0 200 100" className="court" /></span>Schedule</h2>
        <p className="section-sub">Match order by time slot and court. Times are the organiser's plan, so check in early.</p>
        {scheduled.length === 0
          ? <Empty word="Pending" detail="The schedule follows the draw." />
          : (
            <Reveal className="card">
              <div className="table-scroll"><table>
                <thead><tr>
                  <th>Time</th><th>Court</th><th>Event</th><th>Match</th><th className="num">Result</th>
                </tr></thead>
                <tbody>
                  {scheduled.map((m) => {
                    const slot = fmtSlot(m.scheduled_at as string, data.sameDay)
                    const showSlot = slot !== lastSlot
                    lastSlot = slot
                    const sum = data.gamesSummary(m.id)
                    const hN = data.entryName(m.home_entry_id) || 'TBC'
                    const aN = data.entryName(m.away_entry_id) || 'TBC'
                    return (
                      <tr key={m.id}>
                        <td>{showSlot ? <span className="slot-time">{slot}</span> : ''}</td>
                        <td>{m.court ? m.court : <span className="pill">Pending</span>}</td>
                        <td>{evName.get(m.event_id) || ''}</td>
                        <td>{hN} v {aN}</td>
                        <td className="num">
                          {sum ? sum : (m.winner_entry_id ? '' : <span className="pill">Pending</span>)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            </Reveal>
          )}
      </div>
    </section>
  )
}
