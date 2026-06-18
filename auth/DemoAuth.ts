import { mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { SessionUser, UserRole } from "../shared/contracts.ts";
import type { Auth } from "./Auth.ts";

interface StoredUser {
  id: string;
  email: string;
  name: string;
  password: string;
  googleSub?: string;
  role?: UserRole;
}

interface DataStore {
  users: StoredUser[];
  userIdCounter?: number;
  [key: string]: unknown;
}

interface DemoAuthOptions {
  dataFilePath: string;
}

function normalizeUserId(rawId: unknown): string {
  if (typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0) {
    return String(rawId).padStart(4, "0");
  }

  if (typeof rawId === "string" && rawId.trim() !== "") {
    const trimmed = rawId.trim();
    if (/^\d+$/.test(trimmed)) {
      return trimmed.padStart(4, "0");
    }
    return trimmed;
  }

  return "0001";
}

function normalizeRole(user: Partial<StoredUser>): UserRole {
  if (user.role === "merchant") {
    return "merchant";
  }

  return user.email === "amy@example.com" ? "merchant" : "customer";
}

function normalizeStoredUser(user: Partial<StoredUser>): StoredUser {
  return {
    id: normalizeUserId(user.id),
    email: user.email ?? "",
    name: user.name ?? "",
    password: user.password ?? "",
    googleSub: user.googleSub,
    role: normalizeRole(user),
  };
}

function toSessionUser(user: StoredUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? "customer",
  };
}

const defaultUsers: StoredUser[] = [
  {
    id: "0001",
    email: "demo@example.com",
    name: "示範使用者",
    password: "1234",
    role: "customer",
  },
  {
    id: "0002",
    email: "amy@example.com",
    name: "Amy",
    password: "1234",
    role: "merchant",
  },
];

export class DemoAuth implements Auth {
  private readonly dataFilePath: string;
  private users: StoredUser[] = [];
  private storeSnapshot: DataStore | null = null;

  constructor(options: DemoAuthOptions) {
    this.dataFilePath = options.dataFilePath;
  }

  async init(): Promise<void> {
    const file = Bun.file(this.dataFilePath);

    if (!(await file.exists())) {
      this.users = [...defaultUsers];
      this.storeSnapshot = { users: this.users, userIdCounter: this.users.length };
      return;
    }

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as Partial<DataStore>;

      this.users = Array.isArray(parsed.users)
        ? parsed.users.map((user) => normalizeStoredUser(user))
        : [...defaultUsers];
      this.storeSnapshot = {
        ...parsed,
        users: this.users,
        userIdCounter: parsed.userIdCounter,
      };
    } catch {
      this.users = [...defaultUsers];
      this.storeSnapshot = { users: this.users, userIdCounter: this.users.length };
    }
  }

  login(input: {
    email: string;
    password: string;
  }):
    | { ok: true; user: SessionUser }
    | { ok: false; code: "INVALID_CREDENTIALS" } {
    const matchedUser = this.users.find(
      (user) => user.email === input.email && user.password === input.password,
    );

    if (!matchedUser) {
      return { ok: false, code: "INVALID_CREDENTIALS" };
    }

    return {
      ok: true,
      user: toSessionUser(matchedUser),
    };
  }

  async upsertGoogleUser(input: {
    email: string;
    name: string;
    googleSub: string;
  }): Promise<SessionUser> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existingUser = this.users.find(
      (user) =>
        user.email.toLowerCase() === normalizedEmail ||
        user.googleSub === input.googleSub,
    );

    if (existingUser) {
      existingUser.email = normalizedEmail;
      existingUser.name = input.name || existingUser.name || normalizedEmail;
      existingUser.googleSub = input.googleSub;
      await this.persist();
      return toSessionUser(existingUser);
    }

    const nextId = this.getNextUserId();
    const newUser: StoredUser = {
      id: nextId,
      email: normalizedEmail,
      name: input.name || normalizedEmail,
      password: "",
      googleSub: input.googleSub,
      role: "customer",
    };

    this.users.push(newUser);
    await this.persist();
    return toSessionUser(newUser);
  }

  getUserById(userId: string): SessionUser | undefined {
    const user = this.users.find((targetUser) => targetUser.id === userId);
    if (!user) {
      return undefined;
    }

    return toSessionUser(user);
  }

  private getNextUserId(): string {
    const maxId = this.users.reduce((max, user) => {
      const parsed = Number.parseInt(user.id, 10);
      return Number.isInteger(parsed) ? Math.max(max, parsed) : max;
    }, this.storeSnapshot?.userIdCounter ?? 0);

    return String(maxId + 1).padStart(4, "0");
  }

  private async persist(): Promise<void> {
    const snapshot: DataStore = {
      ...(this.storeSnapshot ?? {}),
      users: this.users,
      userIdCounter: Math.max(
        this.users.length,
        ...this.users.map((user) => Number.parseInt(user.id, 10) || 0),
      ),
    };

    await mkdir(dirname(this.dataFilePath), { recursive: true });
    const tmpPath = `${this.dataFilePath}.auth-${crypto.randomUUID()}.tmp`;
    await Bun.write(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    await rename(tmpPath, this.dataFilePath);
    this.storeSnapshot = snapshot;
  }
}
