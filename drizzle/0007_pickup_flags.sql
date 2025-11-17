-- Add pickup confirmation flags and optional completed_at timestamp to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS student_picked_up boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_picked_up boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Helpful index for querying ready-but-not-completed
CREATE INDEX IF NOT EXISTS idx_orders_ready_pickup ON orders(status, student_picked_up, owner_picked_up) WHERE status = 'ready';
