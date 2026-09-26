// The platform brand, from the address the app was opened on. Same rule as the club site's own
// (site/index.html, BRAND): *.twoclear.co.uk is twoclear, everything else -- pbtable.com, demo,
// localhost, native -- is PBTable. It only decides what shows when a club has not uploaded a logo.
import { Platform } from 'react-native';

const host =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

export const IS_TWOCLEAR = /(^|\.)twoclear\.co\.uk$/.test(host);

export const PLATFORM_NAME = IS_TWOCLEAR ? 'twoclear' : 'PBTable';

/** The platform mark for a navy background. On twoclear it is the club site's own badge file,
 *  served from the same origin as the app, so the bundle carries no second copy of it. */
export const PLATFORM_LOGO_ON_DARK = IS_TWOCLEAR
  ? { uri: '/brand/twoclear/badge-dark.png' }
  : require('../../assets/images/pbtable-logo.png');
