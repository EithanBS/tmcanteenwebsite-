-- Atomic stock decrement function and constraint to prevent negative stock
-- Run via Drizzle migration. Ensures menu_items.stock never becomes negative.

-- Optional: constraint (will fail updates inserting negative stock directly)
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_stock_nonnegative CHECK (stock >= 0);

-- Function: decrement_stock(jsonb[]) style input - but Supabase passes JSON, so we accept jsonb
CREATE OR REPLACE FUNCTION decrement_stock(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec jsonb;
  item_id text;
  qty int;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array of {id, quantity} objects';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    item_id := rec->>'id';
    qty := (rec->>'quantity')::int;
    IF qty IS NULL OR qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for item %', item_id;
    END IF;

    UPDATE menu_items
      SET stock = stock - qty
      WHERE id = item_id AND stock - qty >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock or item not found for id %', item_id;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute to anon (adjust if using RLS roles differently)
GRANT EXECUTE ON FUNCTION decrement_stock(jsonb) TO anon, authenticated;

-- Notes:
-- Frontend should call: supabase.rpc('decrement_stock', { p_items: itemsArray })
-- itemsArray example: [{ id: 'uuid-1', quantity: 2 }, { id: 'uuid-2', quantity: 1 }]