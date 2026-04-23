import { DemoAuth } from "./DemoAuth.ts";
import type { Auth } from "./Auth.ts";

interface CreateAuthOptions {
  dataFilePath?: string;
}

export function createAuth(options: CreateAuthOptions = {}): Auth {
  return new DemoAuth({
    dataFilePath: options.dataFilePath ?? "./data/store.json",
  });
}

export type { Auth } from "./Auth.ts";
