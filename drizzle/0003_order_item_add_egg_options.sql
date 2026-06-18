ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "option_key" text DEFAULT 'plain';
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "add_egg" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_price" integer;
--> statement-breakpoint
UPDATE "order_items"
SET
  "option_key" = COALESCE("option_key", 'plain'),
  "add_egg" = COALESCE("add_egg", false),
  "unit_price" = COALESCE("unit_price", "price");
--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "option_key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "add_egg" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "order_items_order_item_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_items_order_item_idx" ON "order_items" USING btree ("order_id","item_id","option_key");
