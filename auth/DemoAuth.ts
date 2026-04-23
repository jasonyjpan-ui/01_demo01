import type { SessionUser } from "../shared/contracts.ts";
import type { Auth } from "./Auth.ts";

interface StoredUser {
  id: string;
  email: string;
  name: string;
  password: string;
}

interface DataStore {
  users: StoredUser[];
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

function normalizeStoredUser(user: Partial<StoredUser>): StoredUser {
  return {
    id: normalizeUserId(user.id),
    email: user.email ?? "",
    name: user.name ?? "",
    password: user.password ?? "",
  };
}

function toSessionUser(user: StoredUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

const defaultUsers: StoredUser[] = [
  {
    id: "0001",
    email: "demo@example.com",
    name: "示範使用者",
    password: "1234",
  },
  {
    id: "0002",
    email: "amy@example.com",
    name: "Amy",
    password: "1234",
  },
];

export class DemoAuth implements Auth {
  private readonly dataFilePath: string;
  private users: StoredUser[] = [];

  constructor(options: DemoAuthOptions) {
    this.dataFilePath = options.dataFilePath;
  }

  async init(): Promise<void> {
    const file = Bun.file(this.dataFilePath);

    if (!(await file.exists())) {
      this.users = [...defaultUsers];
      return;
    }

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as Partial<DataStore>;

      this.users = Array.isArray(parsed.users)
        ? parsed.users.map((user) => normalizeStoredUser(user))
        : [...defaultUsers];
    } catch {
      this.users = [...defaultUsers];
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

  getUserById(userId: string): SessionUser | undefined {
    const user = this.users.find((targetUser) => targetUser.id === userId);
    if (!user) {
      return undefined;
    }

    return toSessionUser(user);
  }
}
