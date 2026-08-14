// Sticky translucent glass nav — the one place glass belongs (chrome, not content).
export function Nav({ entryHref, entryOpen }: { entryHref: string; entryOpen: boolean }) {
  return (
    <nav className="nav">
      <img src="/pbtable-logo.png" alt="PBTable logo" />
      <span className="product">Tournament Manager</span>
      <div className="nav-links">
        <a href="#events">Events</a>
        <a href="#draws">Draws</a>
        <a href="#schedule">Schedule</a>
        {entryOpen && <a href={entryHref} className="enter-link">Enter online</a>}
      </div>
    </nav>
  )
}
