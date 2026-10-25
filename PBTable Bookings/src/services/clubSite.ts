// Links out to the club's own public website — the leaderboard and the Social page.
//
// WHY THIS EXISTS. The app deliberately does not compute or display ratings: the
// Leaderboard and Players tabs were removed on 2026-08-27 because they read a SECOND
// implementation of the rating engine that disagreed with the website's own figures
// by up to 0.015 for eight of Swindon's ninety-eight players. The browser's
// replayAllSessions is the public-facing calculation and the only one that counts.
//
// That was fine while the app was EMBEDDED in the club's site at /app: the header's
// "‹ Club site" link put the leaderboard one tap away. On native there is no
// surrounding site and that link is web-only, so a member with the app installed had
// no route to the leaderboard at all — the "climb" half of book → play → rate → climb
// was simply missing.
//
// So the app links out rather than rebuilding. One rating calculation, no drift, no
// migration. On native it opens in an in-app browser (SFSafariViewController on iOS,
// Custom Tabs on Android) so it still feels like part of the app.

import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { colors } from '@/theme';
import { getClubSlug } from './backend';

export type ClubPage = 'leaderboard' | 'social';

/** Paths on the club's site. The dashboard is a hash-routed single page: the default
 *  view IS the leaderboard, and '#/social' is the Social page.
 *
 *  Note for a future social-only club: that tier forces the whole public page to the
 *  Social view and ignores any other hash, so 'leaderboard' would land on Social
 *  rather than break. Every club is 'full' today; if that changes, hide the
 *  Leaderboard link rather than let it quietly go somewhere else. */
const PATHS: Record<ClubPage, string> = {
  leaderboard: '/',
  social: '/#/social',
};

export const CLUB_PAGE_LABELS: Record<ClubPage, string> = {
  leaderboard: 'Leaderboard',
  social: 'Social',
};

/** The absolute URL, or null when no club is resolved yet (native, pre-picker). */
export function clubPageUrl(page: ClubPage): string | null {
  const slug = getClubSlug();
  if (!slug) return null;
  return `https://${slug}.pbtable.com${PATHS[page]}`;
}

export async function openClubPage(page: ClubPage): Promise<void> {
  // WEB: the app is served FROM the club's own site at /app, so navigate within the
  // same origin. Building an absolute pbtable.com URL here would break localhost and
  // the Netlify previews, which are the same origin but not that hostname.
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.assign(PATHS[page]);
    return;
  }

  const url = clubPageUrl(page);
  if (!url) return;
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors.navy,
      controlsColor: colors.coral,
      dismissButtonStyle: 'close',
      enableBarCollapsing: true,
      // ANDROID: without this the custom tab opens in its OWN task, and closing it
      // drops the member on the HOME SCREEN rather than back into the app — measured
      // on the emulator, with the app still running. Keeping it in the app's task is
      // what makes the ✕ return where it should. No effect on iOS, where
      // SFSafariViewController is already modal over the app.
      createTask: false,
    });
  } catch {
    // Opening a browser is never worth crashing a screen over; the member simply
    // stays where they were.
  }
}
