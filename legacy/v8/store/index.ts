import { PgStoreV8 } from "./PgStoreV8.ts";
import type { StoreV8 } from "./StoreV8.ts";

export function createStoreV8(): StoreV8 {
  return new PgStoreV8();
}
