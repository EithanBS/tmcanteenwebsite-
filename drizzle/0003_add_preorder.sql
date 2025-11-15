-- Add scheduled_for date to orders for pre-orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS scheduled_for date;

-- Optional: future enhancement could add a CHECK for scheduled_for >= CURRENT_DATE
-- and constrain to weekdays via application logic.
