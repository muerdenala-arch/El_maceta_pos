ALTER TABLE "detalle_venta" ADD COLUMN "costo_unitario" numeric(12, 2);--> statement-breakpoint
-- Ventas anteriores: el costo actual del producto es la mejor aproximación disponible.
UPDATE "detalle_venta" d SET "costo_unitario" = p."precio_costo" FROM "productos" p WHERE p."id" = d."producto_id" AND d."costo_unitario" IS NULL;
