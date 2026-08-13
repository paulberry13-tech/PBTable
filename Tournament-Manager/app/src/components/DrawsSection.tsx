import { useState } from 'react'
import { Icon } from './Sprite'
import { Reveal } from './Reveal'
import { Empty } from './Empty'
import { roundLabel, fmtSlot } from '../lib/format'
import type { PublicData } from '../lib/tournamentData'
import type { Match, Pool } from '../lib/types'

export function DrawsSection({ data }: { data: PublicData }) {
  const [activeEventId, setActiveEventId] = useState<string | null>(data.events[0]?.id ?? null)

  return (
    <section id="draws">
      <div className="wrap">
        <h2><span className="h2mark"><Icon name="i-trophy" /></span>Draws &amp; results</h2>
        <p className="section-sub">Pool standings and knockout brackets, updated live as scores go in.</p>
        {data.events.length === 0
          ? <Empty word="Pending" detail="Draws are published once entries close." />
          : (
            <>
              <div className="chiprow">
                {data.events.map((ev) => (
                  <button
                    key={ev.id}
                    className={`chip${ev.id === activeEventId ? ' active' : ''}`}
                    onClick={() => setActiveEventId(ev.id)}
                  >
                    {ev.name}
                  </button>
                ))}
              </div>
              <EventDraw data={data} eventId={activeEventId} />
            </>
          )}
      </div>
    </section>
  )
}

function EventDraw({ data, eventId }: { data: PublicData; eventId: string | null }) {
  const ev = data.events.find((e) => e.id === eventId)
  if (!ev) return null
  const pools = [...data.poolsById.values()].filter((p) => p.event_id === eventId)
  const bracket = data.matches.filter((m) => m.event_id === eventId && m.stage === 'bracket')
  if (!pools.length && !bracket.length) {
    return <Empty word="Pending" detail="The draw for this event has not been published yet." />
  }
  return (
    <>
      {pools.length > 0 && (
        <div className="pools-grid">
          {pools.map((p) => <PoolCard key={p.id} data={data} pool={p} />)}
        </div>
      )}
      {bracket.length > 0 && <Bracket data={data} matches={bracket} />}
    </>
  )
}

function PoolCard({ data, pool }: { data: PublicData; pool: Pool }) {
  const rows = data.standings
    .filter((r) => r.pool_id === pool.id)
    .sort((a, b) => a.pool_rank - b.pool_rank
      || (data.entryName(a.entry_id) || '').localeCompare(data.entryName(b.entry_id) || ''))
  const poolMatches = data.matches
    .filter((m) => m.pool_id === pool.id)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
  return (
    <Reveal className="card pool-card">
      <h3>{pool.name}</h3>
      {rows.length === 0
        ? <div className="empty" style={{ padding: '14px' }}>Pending</div>
        : (
          <div className="table-scroll"><table>
            <thead><tr>
              <th>#</th><th>Entry</th><th className="num">P</th><th className="num">W</th>
              <th className="num">GW</th><th className="num">+/−</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entry_id}>
                  <td className="num">{r.played > 0 ? r.pool_rank : '–'}</td>
                  <td>{data.entryName(r.entry_id)}</td>
                  <td className="num">{r.played}</td>
                  <td className="num">{r.won}</td>
                  <td className="num">{r.games_won}</td>
                  <td className="num">{r.points_diff > 0 ? '+' : ''}{r.points_diff}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      {poolMatches.length > 0 && (
        <>
          <div className="block-head">Match results
            <span className="hint">Ranked on matches won, then games won, then points difference.</span>
          </div>
          <div className="table-scroll"><table><tbody>
            {poolMatches.map((m) => {
              const sum = data.gamesSummary(m.id)
              const hN = data.entryName(m.home_entry_id) || 'TBC'
              const aN = data.entryName(m.away_entry_id) || 'TBC'
              const hWin = !!m.winner_entry_id && m.winner_entry_id === m.home_entry_id
              const aWin = !!m.winner_entry_id && m.winner_entry_id === m.away_entry_id
              return (
                <tr key={m.id}>
                  <td>
                    {hWin ? <strong>{hN}</strong> : hN}{' '}v{' '}{aWin ? <strong>{aN}</strong> : aN}
                  </td>
                  <td className="num">{sum ? sum : <span className="pill">Pending</span>}</td>
                </tr>
              )
            })}
          </tbody></table></div>
        </>
      )}
    </Reveal>
  )
}

function Bracket({ data, matches }: { data: PublicData; matches: Match[] }) {
  const main = matches.filter((m) => m.bracket_kind === 'main')
  const cons = matches.filter((m) => m.bracket_kind === 'consolation')
  // Champions banner — only once the final is decided.
  let champ: string | null = null
  if (main.length) {
    const maxRound = Math.max(...main.map((m) => m.round ?? 0))
    const final = main.find((m) => (m.round ?? 0) === maxRound && m.winner_entry_id)
    champ = final ? data.entryName(final.winner_entry_id) : null
  }
  return (
    <>
      {champ && (
        <div className="champion-banner">
          <Icon name="i-trophy" />
          <div><div className="lbl">Champions</div><div className="who">{champ}</div></div>
        </div>
      )}
      <div className="block-head">Knockout bracket
        <span className="hint">Winners advance to the right. Bold gold marks the match winner.</span>
      </div>
      <BracketKind data={data} matches={main} />
      {cons.length > 0 && (
        <>
          <div className="block-head">Consolation draw</div>
          <BracketKind data={data} matches={cons} />
        </>
      )}
    </>
  )
}

function BracketKind({ data, matches }: { data: PublicData; matches: Match[] }) {
  if (!matches.length) return null
  const rounds = [...new Set(matches.map((m) => m.round ?? 0))].sort((a, b) => a - b)
  const maxRound = rounds[rounds.length - 1]
  return (
    <div className="bracket-scroll"><div className="bracket">
      {rounds.map((r) => {
        const rm = matches.filter((m) => (m.round ?? 0) === r).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
        return (
          <div className="bracket-round" key={r}>
            <h4>{roundLabel(r, maxRound)}</h4>
            {rm.map((m) => <BracketMatch key={m.id} data={data} m={m} isFinal={r === maxRound} />)}
          </div>
        )
      })}
    </div></div>
  )
}

function BracketMatch({ data, m, isFinal }: { data: PublicData; m: Match; isFinal: boolean }) {
  const w = data.gamesWon(m.id)
  const side = (entryId: string | null, games: number) => {
    const name = data.entryName(entryId)
    const win = !!m.winner_entry_id && m.winner_entry_id === entryId
    return (
      <div className={`side${win ? ' winner' : ''}`}>
        <span className="n">{name ? name : <span className="tbc">TBC</span>}</span>
        <span className="s">{w.scored ? games : ''}</span>
      </div>
    )
  }
  const sum = data.gamesSummary(m.id)
  const meta = [
    m.scheduled_at ? fmtSlot(m.scheduled_at, data.sameDay) : null,
    m.court ? `Court ${m.court}` : null,
    sum,
  ].filter(Boolean).join(' · ')
  return (
    <Reveal className={`bmatch${isFinal ? ' final-match' : ''}`}>
      {side(m.home_entry_id, w.h)}
      {side(m.away_entry_id, w.a)}
      {meta && <div className="meta">{meta}</div>}
    </Reveal>
  )
}
