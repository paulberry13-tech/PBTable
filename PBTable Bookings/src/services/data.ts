// The data seam the screens import from. It forwards to either the in-memory
// mock (services/data.mock.ts) or the live Supabase backend
// (services/data.supabase.ts) based on the USE_SUPABASE flag. Screens never
// know which is behind it.

import { USE_SUPABASE } from '@/services/config';
import * as mock from '@/services/data.mock';
import * as supa from '@/services/data.supabase';

export { InsufficientBalanceError } from '@/services/contracts';
export type {
  CreateSessionInput,
  BookResult,
  MyBooking,
  LeaderboardEntry,
  ScoreEntry,
  RosterEntry,
  CancelSessionResult,
  RemoveBookingResult,
} from '@/services/data.mock';

// Both modules export the same function names; the Supabase one has a couple of
// looser signatures (it ignores args it doesn't need), hence the cast.
const impl: typeof mock = USE_SUPABASE ? (supa as unknown as typeof mock) : mock;

export const getSessions = impl.getSessions;
export const getSession = impl.getSession;
export const createSession = impl.createSession;
export const getSessionRoster = impl.getSessionRoster;
export const adminCancelSession = impl.adminCancelSession;
export const adminRemoveBooking = impl.adminRemoveBooking;
export const bookSession = impl.bookSession;
export const joinWaitlist = impl.joinWaitlist;
export const demoFillSession = impl.demoFillSession;
export const cancelBooking = impl.cancelBooking;
export const getCancellationWarning = impl.getCancellationWarning;
export const getMyBookings = impl.getMyBookings;
export const getBalance = impl.getBalance;
export const getLedger = impl.getLedger;
export const topUp = impl.topUp;
export const getMembers = impl.getMembers;
export const getMember = impl.getMember;
export const getLeaderboard = impl.getLeaderboard;
export const getMemberMatches = impl.getMemberMatches;
export const generateCourtSlips = impl.generateCourtSlips;
export const getCourtSlips = impl.getCourtSlips;
export const enterScores = impl.enterScores;
export const recalcRatings = impl.recalcRatings;
