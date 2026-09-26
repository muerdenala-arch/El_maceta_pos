ALTER TABLE "detalle_transferencia" ADD COLUMN "lotes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "transferencias" ADD COLUMN "nota" text;--> statement-breakpoint
CREATE INDEX "lotes_producto_ubicacion_idx" ON "lotes" USING btree ("producto_id","ubicacion_id");