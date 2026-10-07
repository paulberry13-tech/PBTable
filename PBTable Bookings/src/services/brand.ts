// The platform brand. twoclear on every address, the same as the club site's own (site/index.html,
// BRAND): PBTable was retired as a name on 2026-10-07. It decides what shows when a club has not
// uploaded a logo, and the browser-tab icons. The twoclear files are served by the club site the
// app lives under (/brand/twoclear/...).
export const IS_TWOCLEAR = true;

export const PLATFORM_NAME = IS_TWOCLEAR ? 'twoclear' : 'PBTable';

/** The platform mark for a navy background. On twoclear it is the club site's own badge file,
 *  served from the same origin as the app, so the bundle carries no second copy of it. */
export const PLATFORM_LOGO_ON_DARK = IS_TWOCLEAR
  ? { uri: '/brand/twoclear/badge-dark.png' }
  : require('../../assets/images/pbtable-logo.png');

/** The browser-tab and home-screen icons. The exported page links /app/favicon.ico, the PBTable
 *  icon; on twoclear this repoints it to the club site's own twoclear files once the app starts.
 *  Web only, and a no-op everywhere that is not twoclear. */
export function applyPlatformIcons(): void {
  if (!IS_TWOCLEAR || typeof document === 'undefined') return;
  const set = (rel: string, href: string) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
  };
  set('icon', '/brand/twoclear/favicon-32.png');
  set('apple-touch-icon', '/brand/twoclear/apple-touch-icon.png');
}
