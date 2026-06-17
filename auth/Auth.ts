import type { SessionUser } from "../shared/contracts.ts";

export type LoginErrorCode = "INVALID_CREDENTIALS";

export interface Auth {
  init(): Promise<void>;
  login(input: {
    email: string;
    password: string;
  }): { ok: true; user: SessionUser } | { ok: false; code: LoginErrorCode };
  upsertGoogleUser?(input: {
    email: string;
    name: string;
    googleSub: string;
  }): Promise<SessionUser>;
  getUserById(userId: string): SessionUser | undefined;
}
