import { eq, sql } from "drizzle-orm";
import type { MenuItem } from "../../shared/contracts.ts";
import { getDb } from "../../db/client.ts";
import { menuItemsTable } from "../../db/schema.ts";

export class MenuRepository {
  async createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }): Promise<MenuItem> {
    const [inserted] = await getDb()
      .insert(menuItemsTable)
      .values({
        name: input.name,
        price: input.price,
        category: input.category,
        description: input.description,
        imageUrl: input.image_url,
        version: 1,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert menu item");
    }

    return {
      id: inserted.id,
      name: inserted.name,
      price: inserted.price,
      category: inserted.category,
      description: inserted.description,
      image_url: inserted.imageUrl,
      version: inserted.version,
    };
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
    // 先查詢原始菜單項目以獲得舊價格
    const [original] = await getDb()
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, menuId));

    if (!original) {
      return null;
    }

    const updates: Record<string, unknown> = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.price !== undefined ? { price: patch.price } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.image_url !== undefined ? { imageUrl: patch.image_url } : {}),
      ...(patch.changeReason !== undefined ? { changeReason: patch.changeReason } : {}),
      changedAt: new Date(),
    };

    // 記錄前一個價格
    if (patch.price !== undefined && patch.price !== original.price) {
      updates.previousPrice = original.price;
    }

    if (patch.version !== undefined) {
      updates.version = patch.version + 1;
    } else {
      updates.version = sql`version + 1`;
    }

    let query = getDb().update(menuItemsTable).set(updates).where(eq(menuItemsTable.id, menuId));
    if (patch.version !== undefined) {
      query = query.where(eq(menuItemsTable.version, patch.version));
    }

    const [updated] = await query.returning();
    if (!updated) {
      return null;
    }

    return {
      id: updated.id,
      name: updated.name,
      price: updated.price,
      category: updated.category,
      description: updated.description,
      image_url: updated.imageUrl,
      version: updated.version,
      changeReason: updated.changeReason || undefined,
      previousPrice: updated.previousPrice || undefined,
      changedAt: updated.changedAt?.toISOString(),
    };
  }

  async deleteMenuItem(menuId: number): Promise<MenuItem | null> {
    const [removed] = await getDb()
      .delete(menuItemsTable)
      .where(eq(menuItemsTable.id, menuId))
      .returning();

    if (!removed) {
      return null;
    }

    return {
      id: removed.id,
      name: removed.name,
      price: removed.price,
      category: removed.category,
      description: removed.description,
      image_url: removed.imageUrl,
      version: removed.version,
    };
  }
}
