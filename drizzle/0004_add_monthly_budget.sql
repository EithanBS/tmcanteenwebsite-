-- Adds a monthly_budget column to users for per-student budgeting (amount in base currency)
-- Safe to run multiple times if the column already exists in some environments.
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN monthly_budget numeric;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;
