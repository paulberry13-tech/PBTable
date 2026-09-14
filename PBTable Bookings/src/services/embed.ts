import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';

/** Embedded mode: the booking app shown inside the club site's side-panel layout.
 *
 *  The club site puts /app in a frame beside its side panel. There the panel does the job of
 *  this app's own brand header and bottom tab bar, so both hide, and anything that has to leave
 *  the app -- Stripe Checkout above all, which refuses to be shown inside a frame -- opens in
 *  the whole window instead.
 *
 *  Only a frame on the SAME origin counts. The club sites send X-Frame-Options: SAMEORIGIN, so
 *  nobody else can frame the app anyway; checking the top window's origin also means a stray
 *  cross-origin frame (a preview tool, say) still gets the full app. Opened at /app on its own,
 *  nothing changes. */
function detect(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.self !== window.top && window.top?.location.origin === window.location.origin;
  } catch {
    return false; // reading a cross-origin top window throws
  }
}

export const EMBEDDED = detect();

/** For components. The pages are pre-rendered as static HTML, where there is no window and so no
 *  frame: the first render must match that (not embedded), and the switch happens straight after
 *  hydration. Rendering the embedded tree first would make React reject the pre-rendered page. */
export function useEmbedded(): boolean {
  return useSyncExternalStore(noSubscribe, () => EMBEDDED, () => false);
}
const noSubscribe = () => () => {};

/** Set before leaving for Stripe from inside the layout; read when Stripe sends the member back
 *  to /app/wallet in the whole window, so they can be put back inside the layout. Kept in
 *  sessionStorage (this tab only), which a same-origin frame shares with its top window. */
const RETURN_KEY = 'pb.returnToLayout';
const RETURN_WINDOW_MS = 60 * 60 * 1000;

/** Open a page that must not be shown inside the frame. */
export async function openOutside(url: string): Promise<void> {
  if (EMBEDDED && typeof window !== 'undefined' && window.top) {
    try { window.sessionStorage.setItem(RETURN_KEY, String(Date.now())); } catch {}
    window.top.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

/** Where to send a member who has just come back from Stripe in the whole window, or null.
 *
 *  /app/wallet?topup=success&session_id=... becomes /#/booking/wallet?topup=success&session_id=...
 *  -- the club site opens its Booking > Wallet page with the same query, and the wallet confirms
 *  the payment inside the layout exactly as it would at /app/wallet. Honoured once, and only within
 *  an hour of leaving, so opening /app in the same tab later is not hijacked. */
export function layoutReturnTarget(loc: { pathname: string; search: string }, storage: Pick<Storage, 'getItem' | 'removeItem'>, now = Date.now()): string | null {
  let at: string | null = null;
  try { at = storage.getItem(RETURN_KEY); } catch { return null; }
  if (!at) return null;
  try { storage.removeItem(RETURN_KEY); } catch {}
  const t = Number(at);
  if (!Number.isFinite(t) || now - t > RETURN_WINDOW_MS || now < t) return null;
  const rest = loc.pathname.replace(/^\/app\/?/, '');
  if (!/^[a-z0-9/_-]*$/i.test(rest)) return null;
  return `/#/booking/${rest}${loc.search}`;
}

/** Tell the club site which booking page is showing, so its side panel highlights the right item. */
export function announceRoute(pathname: string): void {
  if (!EMBEDDED || typeof window === 'undefined' || !window.parent) return;
  try {
    window.parent.postMessage({ type: 'pb-booking-route', path: `/app${pathname === '/' ? '/' : pathname}` }, window.location.origin);
  } catch {}
}
