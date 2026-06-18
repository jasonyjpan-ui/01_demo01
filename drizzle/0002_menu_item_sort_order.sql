ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;
--> statement-breakpoint
UPDATE "menu_items"
SET "sort_order" = "id"
WHERE "sort_order" IS NULL OR "sort_order" = 0;
--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "sort_order" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_category_sort_idx" ON "menu_items" USING btree ("category","sort_order");
