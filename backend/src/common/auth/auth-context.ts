/** Identity of an authenticated request, derived only from a verified access token. */
export interface AuthContext {
  userId: string;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express request augmentation
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
