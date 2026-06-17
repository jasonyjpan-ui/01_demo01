import { describe, expect, it, afterEach } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { JsonFileStore } from "./JsonFileStore.ts";
import path from "node:path";

const tmpRoot = path.join(process.cwd(), "tmp", "json-store-tests");
let currentStoreDir: string | undefined;

async function createStore(): Promise<JsonFileStore> {
  const storeDir = path.join(tmpRoot, crypto.randomUUID());
  currentStoreDir = storeDir;
  await mkdir(storeDir, { recursive: true });
  const storeFile = path.join(storeDir, "store.json");
  const store = new JsonFileStore({ dataFilePath: storeFile });
  await store.init();
  return store;
}

async function cleanup() {
  if (!currentStoreDir) return;
  await rm(currentStoreDir, { recursive: true, force: true });
  currentStoreDir = undefined;
}

afterEach(async () => {
  await cleanup();
});

describe("JsonFileStore versioned menu behavior", () => {
  it("creates menu items with version 1", async () => {
    const store = await createStore();
    const created = await store.createMenuItem({
      name: "Test Item",
      price: 100,
      category: "Test",
      description: "Versioned test item",
      image_url: "/imgs/test.png",
    });

    expect(created.version).toBe(1);
  });

  it("increments version on successful menu update", async () => {
    const store = await createStore();
    const menu = store.getMenu();
    const original = menu[0];
    const originalVersion = original.version;

    const updated = await store.updateMenuItem(original.id, {
      name: "Updated Name",
      version: originalVersion,
    });

    expect(updated).not.toBeNull();
    expect(updated?.version).toBe(originalVersion + 1);
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.id).not.toBe(original.id);
    expect(updated?.logicalId).toBe(original.logicalId);
    expect(updated?.supersedes).toBe(original.id);

    const currentMenu = store.getMenu();
    expect(currentMenu.find((item) => item.id === original.id)).toBeUndefined();
    expect(currentMenu.find((item) => item.id === updated?.id)).toBeDefined();
  });

  it("keeps full menu version history", async () => {
    const store = await createStore();
    const original = store.getMenu()[0];

    const updated = await store.updateMenuItem(original.id, {
      price: original.price + 10,
      version: original.version,
      changeReason: "Price adjustment",
    });

    expect(updated).not.toBeNull();

    const history = await store.getMenuItemHistory!(updated!.id);
    expect(history).toHaveLength(2);
    expect(history[0].version).toBe(2);
    expect(history[0].isCurrentVersion).toBe(true);
    expect(history[0].previousPrice).toBe(original.price);
    expect(history[0].changeReason).toBe("Price adjustment");
    expect(history[1].version).toBe(1);
    expect(history[1].isCurrentVersion).toBe(false);
  });

  it("rejects menu update when version mismatches", async () => {
    const store = await createStore();
    const menu = store.getMenu();
    const original = menu[0];

    const result = await store.updateMenuItem(original.id, {
      name: "Wrong Version",
      version: original.version + 1,
    });

    expect(result).toBeNull();
    const reloaded = store.getMenu().find((item) => item.id === original.id);
    expect(reloaded?.name).toBe(original.name);
    expect(reloaded?.version).toBe(original.version);
  });

  it("fails submitOrder when order item is stale after menu update", async () => {
    const store = await createStore();
    const currentUserId = "0001";
    const currentOrder = await store.createOrder({ userId: currentUserId });

    const menuItem = store.getMenu()[0];
    const updateOrderResult = await store.updateOrderItem(currentOrder.id, {
      userId: currentUserId,
      itemId: menuItem.id,
      qty: 1,
    });

    expect(updateOrderResult.ok).toBe(true);

    const currentMenuVersion = menuItem.version;
    const updatedMenuItem = await store.updateMenuItem(menuItem.id, {
      name: "Stale Item",
      version: currentMenuVersion,
    });

    expect(updatedMenuItem).not.toBeNull();
    expect(updatedMenuItem?.version).toBe(currentMenuVersion + 1);

    const submitResult = await store.submitOrder(currentOrder.id, {
      userId: currentUserId,
    });

    expect(submitResult.ok).toBe(false);
    expect(submitResult.code).toBe("MENU_VERSION_MISMATCH");
  });
});
