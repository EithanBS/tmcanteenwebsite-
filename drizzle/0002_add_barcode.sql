-- Add barcode columns to menu_items for barcode image URL and encoded value
ALTER TABLE menu_items ADD COLUMN barcode_image_url text;
ALTER TABLE menu_items ADD COLUMN barcode_value text;

-- Optional index for faster lookup by barcode value (syntax depends on dialect)
-- For SQLite/Turso:
CREATE INDEX IF NOT EXISTS idx_menu_items_barcode_value ON menu_items (barcode_value);