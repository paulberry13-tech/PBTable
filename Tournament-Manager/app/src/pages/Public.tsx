import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadPublicData } from '../lib/tournamentData'
import type { PublicData } from '../lib/tournamentData'
import type { Tournament } from '../lib/types'
import { Sprite } from '../components/Sprite'
import { Nav } from '../components/Nav'
import { Hero } from '../components/Hero'
import { EventsSection } from '../components/EventsSection'
import { DrawsSection } from '../components/DrawsSection'
import { ScheduleSection } from '../components/ScheduleSection'

const Footer = () => (
  <footer>
    <span className="gold">PBTable · Tournament Manager</span>{'  ·  '}entries, draws, live scores.
  </footer>
)

export default function Public() {
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [data, setData] = useState<PublicData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Hide-until-scroll CSS applies only once this is set, and only where IntersectionObserver
  // exists — so no-JS / old browsers render everything immediately.
  useEffect(() => {
    if ('IntersectionObserver' in window) document.documentElement.classList.add('reveal-ready')
  }, [])

  // Load all tournaments once; pick the ?t= one (slug or id), else the newest.
  useEffect(() => {
    supabase.from('tournaments').select('*').order('start_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setError(error.message); return }
        const list = (data ?? []) as Tournament[]
        setTournaments(list)
        if (!list.length) return
        const wanted = (new URLSearchParams(location.search).get('t') || '').trim()
        const pick = list.find((t) => t.slug === wanted || t.id === wanted) || list[0]
        setActiveId(pick.id)
      })
  }, [])

  // Load the active tournament's data, and keep the address bar on the canonical ?t=<slug>.
  useEffect(() => {
    if (!activeId || !tournaments) return
    const t = tournaments.find((x) => x.id === activeId)
    if (!t) return
    setData(null)
    loadPublicData(t).then(setData).catch((e) => setError(e?.message || String(e)))
    const url = new URL(location.href)
    url.searchParams.set('t', t.slug || t.id)
    history.replaceState({}, '', url)
  }, [activeId, tournaments])

  if (error) {
    return (<><Sprite /><div className="banner error">Could not load tournament data: {error}</div><Footer /></>)
  }
  if (!tournaments) {
    return (<><Sprite /><div className="banner">Loading…</div></>)
  }
  if (!tournaments.length) {
    return (<><Sprite /><div className="banner">No tournament has been published yet.</div><Footer /></>)
  }

  const active = tournaments.find((t) => t.id === activeId) ?? tournaments[0]
  const nowIso = new Date().toISOString()
  const entryOpen = !!(data?.settings?.self_service_entries
    && (!active.registration_opens_at || active.registration_opens_at <= nowIso)
    && (!active.registration_closes_at || active.registration_closes_at >= nowIso))
  const enterHref = `enter.html?t=${encodeURIComponent(active.slug || active.id)}`

  return (
    <>
      <Sprite />
      <Nav entryHref={enterHref} entryOpen={entryOpen} />
      <Hero tournament={active} tournaments={tournaments} onSelect={setActiveId} />
      {data && (
        <>
          <EventsSection data={data} />
          <DrawsSection data={data} />
          <ScheduleSection data={data} />
        </>
      )}
      <Footer />
    </>
  )
}
