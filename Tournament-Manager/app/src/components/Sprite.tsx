// The inline SVG sprite, ported from the no-build site. Rendered once near the app root;
// every mark is reused via <use href="#i-..."/>. Marks inherit currentColor.
export function Sprite() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {/* Pickleball paddle: a broad angular face, throat, chunky grip, flared butt cap. */}
        <symbol id="i-paddle" viewBox="0 0 24 24">
          <rect x="6.7" y="1.1" width="10.6" height="13.8" rx="3.1" />
          <path d="M8.8 14.2c.3 1.6 1 2.4 1.3 3.1h3.8c.3-.7 1-1.5 1.3-3.1z" />
          <rect x="10.1" y="16.6" width="3.8" height="5.4" rx="1" />
          <rect x="9.4" y="21.2" width="5.2" height="1.8" rx=".9" />
        </symbol>
        {/* Perforated ball: holes punched with evenodd. */}
        <symbol id="i-ball" viewBox="0 0 24 24">
          <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z
            M12 6.1a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7z
            M7.6 9.2a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7z
            M16.4 9.2a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7z
            M12 11.9a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7z
            M9.2 15.3a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7z
            M14.8 15.3a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7z" />
        </symbol>
        {/* Doubles: the same paddle twice, angled apart, the back one dimmed for depth. */}
        <symbol id="i-doubles" viewBox="0 0 24 24">
          <g opacity=".45" transform="rotate(-17 8 12)">
            <rect x="3.5" y="2.6" width="7.6" height="9.9" rx="2.3" />
            <path d="M5 11.9c.2 1.1.7 1.7.9 2.2h2.7c.2-.5.7-1.1.9-2.2z" />
            <rect x="6.1" y="13.6" width="2.7" height="4.1" rx=".8" />
            <rect x="5.6" y="17.1" width="3.7" height="1.4" rx=".7" />
          </g>
          <g transform="rotate(17 16 13)">
            <rect x="12.9" y="4.1" width="7.6" height="9.9" rx="2.3" />
            <path d="M14.4 13.4c.2 1.1.7 1.7.9 2.2h2.7c.2-.5.7-1.1.9-2.2z" />
            <rect x="15.5" y="15.1" width="2.7" height="4.1" rx=".8" />
            <rect x="15" y="18.6" width="3.7" height="1.4" rx=".7" />
          </g>
        </symbol>
        {/* True-proportion pickleball court, 44ft x 20ft, 7ft non-volley zone, net centred. */}
        <symbol id="i-court" viewBox="0 0 200 100">
          <g fill="none" stroke="currentColor" strokeWidth="2.4">
            <rect x="2" y="2" width="196" height="96" rx="1" />
            <line x1="100" y1="0" x2="100" y2="100" strokeWidth="3.4" />
            <line x1="68" y1="2" x2="68" y2="98" />
            <line x1="132" y1="2" x2="132" y2="98" />
            <line x1="2" y1="50" x2="68" y2="50" />
            <line x1="132" y1="50" x2="198" y2="50" />
          </g>
        </symbol>
        {/* Trophy, for champions. */}
        <symbol id="i-trophy" viewBox="0 0 24 24">
          <path d="M7 3h10v2.2h3.2v2.4c0 2.6-1.8 4.6-4.2 5.1a4.9 4.9 0 0 1-2.6 1.9v2.6h3.1V19H7.5v-1.8h3.1v-2.6a4.9 4.9 0 0 1-2.6-1.9C5.6 12.2 3.8 10.2 3.8 7.6V5.2H7V3zm-1.3 4.4v.2c0 1.4.8 2.5 2 3V7.4H5.7zm12.6 0h-2v3.2c1.2-.5 2-1.6 2-3v-.2zM6.6 20.4h10.8V22H6.6z" />
        </symbol>
      </defs>
    </svg>
  )
}

// Small helper: an <svg><use/></svg> referencing a sprite symbol.
export function Icon(
  { name, viewBox = '0 0 24 24', className, fill }:
  { name: string; viewBox?: string; className?: string; fill?: string },
) {
  return (
    <svg viewBox={viewBox} className={className} fill={fill} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  )
}
