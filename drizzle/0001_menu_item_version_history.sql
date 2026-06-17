ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "logical_id" integer;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "entity_id" text;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "is_current_version" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "supersedes" integer;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "change_reason" text;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "previous_price" integer;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "changed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "menu_items"
SET
  "logical_id" = COALESCE("logical_id", "id"),
  "entity_id" = COALESCE("entity_id", 'menu-' || "id"::text),
  "version" = COALESCE("version", 1),
  "is_current_version" = COALESCE("is_current_version", true),
  "created_at" = COALESCE("created_at", now());
--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "version" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "logical_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "entity_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "is_current_version" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_items_entity_version_idx" ON "menu_items" USING btree ("entity_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_items_logical_version_idx" ON "menu_items" USING btree ("logical_id","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_current_version_idx" ON "menu_items" USING btree ("is_current_version");
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
--> statement-breakpoint
UPDATE "order_items"
SET "version" = COALESCE("version", 1);
--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "version" SET NOT NULL;
