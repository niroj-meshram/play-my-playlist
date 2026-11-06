/** Selectable avatars. The frontend maps each ID to artwork. */
export const AVATAR_IDS = [
  'avatar-01',
  'avatar-02',
  'avatar-03',
  'avatar-04',
  'avatar-05',
  'avatar-06',
  'avatar-07',
  'avatar-08',
  'avatar-09',
  'avatar-10',
  'avatar-11',
  'avatar-12',
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export const DISPLAY_NAME_LIMITS = { minLength: 1, maxLength: 24 } as const;

/**
 * Header the browser client must send on cookie-authenticated endpoints
 * (refresh, logout). Cross-site forms cannot set it, and cross-origin
 * scripts are stopped by the CORS preflight.
 */
export const CSRF_HEADER = 'x-pmp-csrf';

export interface PublicUserDto {
  id: string;
  displayName: string;
  avatarId: AvatarId;
}

export interface GuestSessionRequest {
  displayName: string;
  avatarId: AvatarId;
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarId?: AvatarId;
}

/** Returned by guest-session creation and refresh. The refresh token travels only in an httpOnly cookie. */
export interface AccessTokenResponse {
  accessToken: string;
  /** ISO-8601 expiry of the access token. */
  expiresAt: string;
  user: PublicUserDto;
}
