import type { AccessTokenResponse, PublicUserDto } from '@pmp/shared';
import { create } from 'zustand';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

interface SessionState {
  status: SessionStatus;
  user: PublicUserDto | null;
  /** Kept in memory only; the refresh token lives in an httpOnly cookie. */
  accessToken: string | null;
  expiresAt: number;
  setSession: (response: AccessTokenResponse) => void;
  setAnonymous: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  expiresAt: 0,
  setSession: (response) =>
    set({
      status: 'authenticated',
      user: response.user,
      accessToken: response.accessToken,
      expiresAt: Date.parse(response.expiresAt),
    }),
  setAnonymous: () => set({ status: 'anonymous', user: null, accessToken: null, expiresAt: 0 }),
}));
