import { JsonFileStore } from "./json/JsonFileStore.ts";
import { PgStore } from "./pg/PgStore.ts";
import type { Store } from "./Store.ts";

interface CreateStoreOptions {
  dataFilePath?: string;
}

export function createStore(options: CreateStoreOptions = {}): Store {
  const driver = process.env.STORE_DRIVER;

  if (driver === "json") {
    return new JsonFileStore({
      dataFilePath: options.dataFilePath ?? "./data/store.json",
    });
  }

  if (driver === "postgres") {
    return new PgStore({
      dataFilePath: options.dataFilePath ?? "./data/store.json",
    });
  }

  return new JsonFileStore({
    dataFilePath: options.dataFilePath ?? "./data/store.json",
  });
}

export type { Store } from "./Store.ts";
