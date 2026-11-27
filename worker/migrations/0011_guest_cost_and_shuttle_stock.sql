ALTER TABLE guests ADD COLUMN transfer_won INTEGER CHECK (transfer_won >= 0);
ALTER TABLE guests ADD COLUMN received_shuttles INTEGER CHECK (received_shuttles >= 0);

-- Null opening stock identifies the original settlement format.
ALTER TABLE settlements ADD COLUMN opening_shuttles INTEGER CHECK (opening_shuttles >= 0);
ALTER TABLE settlements ADD COLUMN added_shuttles INTEGER CHECK (added_shuttles >= 0);
ALTER TABLE settlements ADD COLUMN used_shuttles INTEGER CHECK (used_shuttles >= 0);
