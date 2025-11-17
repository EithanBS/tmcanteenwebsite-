-- Fix decrement_stock to cast JSON text id to uuid
-- This prevents the Postgres error: operator does not exist: uuid = text
-- and ensures stock updates work with UUID primary keys.

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

    -- Cast item_id text to uuid to match menu_items.id type
    UPDATE menu_items
      SET stock = stock - qty
      WHERE id = (item_id)::uuid AND stock - qty >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock or item not found for id %', item_id;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION decrement_stock(jsonb) TO anon, authenticated;
