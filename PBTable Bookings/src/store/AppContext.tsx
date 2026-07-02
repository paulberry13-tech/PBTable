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
import { Member, Role, SportProfile } from '@/types';

/** In-app banner (stands in for push notifications — out of scope). */
export interface Banner {
  id: number;
  message: string;
  tone: 'success' | 'info' | 'warning';
}

interface AppContextValue {
  currentUser: Member | null;
  role: Role;
  switchRole: (role: Role) => void;
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
  const [role, setRoleState] = useState<Role>('member');
  const [sportProfile, setSportProfile] = useState<SportProfile>(PICKLEBALL);
  const [dataVersion, setDataVersion] = useState(0);
  const [banners, setBanners] = useState<Banner[]>([]);

  useEffect(() => {
    auth.getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    auth.getRole().then(setRoleState).catch(() => undefined);
  }, []);

  const switchRole = useCallback((next: Role) => {
    setRoleState(next);
    void auth.setRole(next);
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
      role,
      switchRole,
      sportProfile,
      setSport,
      dataVersion,
      refresh,
      banners,
      showBanner,
      dismissBanner,
    }),
    [currentUser, role, switchRole, sportProfile, setSport, dataVersion, refresh, banners, showBanner, dismissBanner]
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
