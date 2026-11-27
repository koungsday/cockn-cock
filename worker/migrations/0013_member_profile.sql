ALTER TABLE members ADD COLUMN gender TEXT NOT NULL DEFAULT '' CHECK (gender IN ('', 'male', 'female', 'other'));
ALTER TABLE members ADD COLUMN memo TEXT NOT NULL DEFAULT '' CHECK (length(memo) <= 500);
