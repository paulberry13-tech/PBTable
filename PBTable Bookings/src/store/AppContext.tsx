import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { PICKLEBALL, SPORT_PROFILES } from '@/domain/sportProfile';
import * as auth from '@/services/auth';
import { DEMO_AUTOLOGIN } from '@/services/config';
import { Member, SportProfile } from '@/types';

/** In-app banner (stands in for push notifications — out of scope). */
export interface Banner {
  id: number;
  message: string;
  tone: 'success' | 'info' | 'warning';
}

interface AppContextValue {
  currentUser: Member | null;
  /** True until the initial session check completes (avoids a sign-in flash). */
  authLoading: boolean;
  /** Passwordless sign-in: email an 8-digit code, then verify it. */
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  sportProfile: SportProfile;
  setSport: (sport: string) => void;
  /** Bumps whenever any mutation happens — screens refetch on change. */
  dataVersion: number;
  refresh: () => void;
  banners: Banner[];
  showBanner: (message: string, tone?: Banner['tone']) => void;
  dismissBanner: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

let bannerSeq = 1;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  const [sportProfile, setSportProfile] = useState<SportProfile>(PICKLEBALL);
  const [dataVersion, setDataVersion] = useState(0);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (await auth.hasSession()) {
          setCurrentUser(await auth.getCurrentUser());
        } else if (DEMO_AUTOLOGIN) {
          // Demo build: silently sign in as the fixed demo member so /app/ opens
          // with no sign-in screen. Falls through to null (→ SignIn) if it fails.
          await auth.demoSignIn();
          setCurrentUser(await auth.getCurrentUser());
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  // Every session/player read is scoped to the signed-in member's club, so a fetch
  // that raced sign-in resolves to nothing and — with no dependency on the user —
  // would stay that way. Bump the data version whenever the signed-in member
  // changes so those reads re-run against the right club. Skips the first pass:
  // useAsyncData already fetches on mount.
  const lastUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = currentUser?.id ?? null;
    if (lastUserId.current !== undefined && lastUserId.current !== id) {
      setDataVersion((v) => v + 1);
    }
    lastUserId.current = id;
  }, [currentUser?.id]);

  const sendOtp = useCallback(async (email: string) => {
    await auth.sendOtp(email);
  }, []);

  const verifyOtp = useCallback(async (email: string, code: string) => {
    await auth.verifyOtp(email, code);
    setCurrentUser(await auth.getCurrentUser());
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setCurrentUser(null);
  }, []);

  const setSport = useCallback((sport: string) => {
    const profile = SPORT_PROFILES.find((p) => p.sport === sport);
    if (profile) setSportProfile(profile);
  }, []);

  const refresh = useCallback(() => setDataVersion((v) => v + 1), []);

  const dismissBanner = useCallback((id: number) => {
    setBanners((bs) => bs.filter((b) => b.id !== id));
  }, []);

  const showBanner = useCallback(
    (message: string, tone: Banner['tone'] = 'success') => {
      const id = bannerSeq++;
      setBanners((bs) => [...bs, { id, message, tone }]);
      setTimeout(() => dismissBanner(id), 5000);
    },
    [dismissBanner]
  );

  const value = useMemo(
    () => ({
      currentUser,
      authLoading,
      sendOtp,
      verifyOtp,
      signOut,
      sportProfile,
      setSport,
      dataVersion,
      refresh,
      banners,
      showBanner,
      dismissBanner,
    }),
    [currentUser, authLoading, sendOtp, verifyOtp, signOut, sportProfile, setSport, dataVersion, refresh, banners, showBanner, dismissBanner]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/**
 * Fetch-on-mount hook that also refetches whenever dataVersion bumps
 * (i.e. after any mutation anywhere in the app). Screens use this as if
 * talking to a real API.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, deps: React.DependencyList = []) {
  const { dataVersion } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, ...deps]);

  return { data, loading, error };
}
