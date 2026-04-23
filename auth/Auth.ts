import type { SessionUser } from "../shared/contracts.ts";

export type LoginErrorCode = "INVALID_CREDENTIALS";

export interface Auth {
  init(): Promise<void>;
  login(input: {
    email: string;
    password: string;
  }): { ok: true; user: SessionUser } | { ok: false; code: LoginErrorCode };
  getUserById(userId: string): SessionUser | undefined;
}
