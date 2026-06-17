import { and, eq, sql } from "drizzle-orm";
import type { MenuItem } from "../../shared/contracts.ts";
import { getDb } from "../../db/client.ts";
import { menuItemsTable } from "../../db/schema.ts";

function toMenuItem(row: typeof menuItemsTable.$inferSelect): MenuItem {
  return {
    id: row.id,
    logicalId: row.logicalId,
    entityId: row.entityId,
    name: row.name,
    price: row.price,
    category: row.category,
    description: row.description,
    image_url: row.imageUrl,
    version: row.version,
    isCurrentVersion: row.isCurrentVersion,
    supersedes: row.supersedes || undefined,
    changeReason: row.changeReason || undefined,
    previousPrice: row.previousPrice || undefined,
    createdAt: row.createdAt?.toISOString(),
    changedAt: row.changedAt?.toISOString(),
  };
}

export class MenuRepository {
  async createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }): Promise<MenuItem> {
    const result = await getDb().execute<{ id: number }>(
      sql`select nextval('menu_items_id_seq')::int as id`,
    );
    const nextId = result.rows[0]?.id;
    if (!nextId) {
      throw new Error("Failed to allocate menu item id");
    }

    const [inserted] = await getDb()
      .insert(menuItemsTable)
      .values({
        id: nextId,
        logicalId: nextId,
        entityId: crypto.randomUUID(),
        name: input.name,
        price: input.price,
        category: input.category,
        description: input.description,
        imageUrl: input.image_url,
        version: 1,
        isCurrentVersion: true,
        changeReason: "Initial creation",
        createdAt: new Date(),
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert menu item");
    }

    return toMenuItem(inserted);
  }

  async updateMenuItem(
    menuId: number,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      description?: string;
      image_url?: string;
      version?: number;
      changeReason?: string;
    },
  ): Promise<MenuItem | null> {
    return await getDb().transaction(async (tx) => {
      const [original] = await tx
        .select()
        .from(menuItemsTable)
        .where(
          and(
            eq(menuItemsTable.id, menuId),
            eq(menuItemsTable.isCurrentVersion, true),
          ),
        );

      if (!original) {
        return null;
      }

      if (patch.version !== undefined && patch.version !== original.version) {
        return null;
      }

      const changedAt = new Date();

      await tx
        .update(menuItemsTable)
        .set({ isCurrentVersion: false, changedAt })
        .where(eq(menuItemsTable.id, menuId));

      const [inserted] = await tx
        .insert(menuItemsTable)
        .values({
          logicalId: original.logicalId,
          entityId: original.entityId,
          name: patch.name ?? original.name,
          price: patch.price ?? original.price,
          category: patch.category ?? original.category,
          description: patch.description ?? original.description,
          imageUrl: patch.image_url ?? original.imageUrl,
          version: original.version + 1,
          isCurrentVersion: true,
          supersedes: original.id,
          changeReason: patch.changeReason,
          previousPrice:
            patch.price !== undefined && patch.price !== original.price
              ? original.price
              : original.previousPrice,
          createdAt: changedAt,
          changedAt,
        })
        .returning();

      return inserted ? toMenuItem(inserted) : null;
    });
  }

  async deleteMenuItem(menuId: number): Promise<MenuItem | null> {
    const [removed] = await getDb()
      .update(menuItemsTable)
      .set({ isCurrentVersion: false, changedAt: new Date() })
      .where(
        and(
          eq(menuItemsTable.id, menuId),
          eq(menuItemsTable.isCurrentVersion, true),
        ),
      )
      .returning();

    return removed ? toMenuItem(removed) : null;
  }

  async restoreMenuItem(
    menuId: number,
    input: { changeReason?: string } = {},
  ): Promise<MenuItem | null> {
    return await getDb().transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(menuItemsTable)
        .where(eq(menuItemsTable.id, menuId));

      if (!source) {
        return null;
      }

      const versions = await tx
        .select()
        .from(menuItemsTable)
        .where(eq(menuItemsTable.logicalId, source.logicalId));

      const current = versions.find((item) => item.isCurrentVersion);
      const latestVersion = Math.max(...versions.map((item) => item.version));
      const changedAt = new Date();

      if (current) {
        await tx
          .update(menuItemsTable)
          .set({ isCurrentVersion: false, changedAt })
          .where(eq(menuItemsTable.id, current.id));
      }

      const [inserted] = await tx
        .insert(menuItemsTable)
        .values({
          logicalId: source.logicalId,
          entityId: source.entityId,
          name: source.name,
          price: source.price,
          category: source.category,
          description: source.description,
          imageUrl: source.imageUrl,
          version: latestVersion + 1,
          isCurrentVersion: true,
          supersedes: current?.id ?? source.id,
          changeReason:
            input.changeReason ?? `Restore from version ${source.version}`,
          previousPrice:
            current && current.price !== source.price
              ? current.price
              : source.previousPrice,
          createdAt: changedAt,
          changedAt,
        })
        .returning();

      return inserted ? toMenuItem(inserted) : null;
    });
  }

  async getArchivedMenuItems(): Promise<MenuItem[]> {
    const rows = await getDb().select().from(menuItemsTable);
    const byLogicalId = new Map<number, typeof rows>();

    for (const row of rows) {
      byLogicalId.set(row.logicalId, [
        ...(byLogicalId.get(row.logicalId) ?? []),
        row,
      ]);
    }

    return [...byLogicalId.values()]
      .filter((versions) => versions.every((row) => !row.isCurrentVersion))
      .map((versions) =>
        versions.reduce((latest, row) =>
          row.version > latest.version ? row : latest,
        ),
      )
      .map(toMenuItem)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }
}
