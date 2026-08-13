import { useEffect, useRef } from 'react'
import type { ReactNode, CSSProperties } from 'react'

// Rise-in-on-scroll wrapper. Renders the styled element ITSELF (no extra wrapper div, so it
// stays a grid/flex item) with data-reveal, then adds .in when it enters the viewport.
// Content can never be stranded: reduced-motion / no-IntersectionObserver show immediately,
// and a 4s safety reveals anything the observer never fired for. The hiding itself lives in
// CSS under html.reveal-ready (added by Public only when IntersectionObserver exists).
export function Reveal(
  { className, children, style }: { className?: string; children: ReactNode; style?: CSSProperties },
) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!('IntersectionObserver' in window) || reduce) { el.classList.add('in'); return }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { el.classList.add('in'); io.disconnect() }
    }, { rootMargin: '0px', threshold: 0.01 })
    io.observe(el)
    const t = window.setTimeout(() => el.classList.add('in'), 4000)
    return () => { io.disconnect(); window.clearTimeout(t) }
  }, [])
  return <div ref={ref} data-reveal className={className} style={style}>{children}</div>
}
