-- Add device metadata columns
ALTER TABLE devices ADD COLUMN device_name TEXT;
ALTER TABLE devices ADD COLUMN platform TEXT;
ALTER TABLE devices ADD COLUMN app_version TEXT;
ALTER TABLE devices ADD COLUMN updated_at INTEGER;
