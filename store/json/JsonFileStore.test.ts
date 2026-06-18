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

  it("removes stale order items after their menu version changes", async () => {
    const store = await createStore();
    const currentUserId = "0001";
    const currentOrder = await store.createOrder({ userId: currentUserId });
    const menuItem = store.getMenu()[0];

    const addResult = await store.updateOrderItem(currentOrder.id, {
      userId: currentUserId,
      itemId: menuItem.id,
      qty: 1,
    });

    expect(addResult.ok).toBe(true);

    const updatedMenuItem = await store.updateMenuItem(menuItem.id, {
      price: menuItem.price + 5,
      version: menuItem.version,
      changeReason: "Price changed before cart clear",
    });

    expect(updatedMenuItem).not.toBeNull();
    expect(store.getMenu().find((item) => item.id === menuItem.id)).toBeUndefined();

    const removeResult = await store.updateOrderItem(currentOrder.id, {
      userId: currentUserId,
      itemId: menuItem.id,
      qty: 0,
    });

    expect(removeResult.ok).toBe(true);
    if (removeResult.ok) {
      expect(removeResult.order.items).toHaveLength(0);
      expect(removeResult.order.total).toBe(0);
    }
  });

  it("restores an archived menu item as a new current version", async () => {
    const store = await createStore();
    const original = store.getMenu()[0];

    const removed = await store.deleteMenuItem(original.id);
    expect(removed).not.toBeNull();
    expect(store.getMenu().find((item) => item.id === original.id)).toBeUndefined();

    const archived = await store.getArchivedMenuItems();
    expect(archived.some((item) => item.logicalId === original.logicalId)).toBe(true);

    const restored = await store.restoreMenuItem(original.id, {
      changeReason: "Restore test",
    });

    expect(restored).not.toBeNull();
    expect(restored?.id).not.toBe(original.id);
    expect(restored?.logicalId).toBe(original.logicalId);
    expect(restored?.version).toBe(original.version + 1);
    expect(restored?.isCurrentVersion).toBe(true);
    expect(restored?.supersedes).toBe(original.id);
    expect(restored?.changeReason).toBe("Restore test");
    expect(store.getMenu().find((item) => item.id === restored?.id)).toBeDefined();

    const archivedAfterRestore = await store.getArchivedMenuItems();
    expect(
      archivedAfterRestore.some((item) => item.logicalId === original.logicalId),
    ).toBe(false);
  });

  it("moves submitted orders through merchant workflow statuses", async () => {
    const store = await createStore();
    const userId = "0001";
    const order = await store.createOrder({ userId });
    const menuItem = store.getMenu()[0];

    const addResult = await store.updateOrderItem(order.id, {
      userId,
      itemId: menuItem.id,
      qty: 2,
    });
    expect(addResult.ok).toBe(true);

    const submitResult = await store.submitOrder(order.id, { userId });
    expect(submitResult.ok).toBe(true);

    const preparingResult = await store.updateOrderStatus!(order.id, {
      status: "preparing",
    });
    expect(preparingResult.ok).toBe(true);
    if (preparingResult.ok) {
      expect(preparingResult.order.status).toBe("preparing");
    }

    const readyResult = await store.updateOrderStatus!(order.id, {
      status: "ready",
    });
    expect(readyResult.ok).toBe(true);

    const completedResult = await store.updateOrderStatus!(order.id, {
      status: "completed",
    });
    expect(completedResult.ok).toBe(true);

    const reopenResult = await store.updateOrderStatus!(order.id, {
      status: "preparing",
    });
    expect(reopenResult.ok).toBe(false);
    expect(reopenResult.code).toBe("INVALID_STATUS_TRANSITION");
  });
});
