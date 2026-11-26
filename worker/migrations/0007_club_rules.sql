-- 모임 규칙 (운영 화면): each club's own way of counting 줄서기 인정 and showing 콕 수령. Only columns are added, and
-- their defaults are exactly how the app counted before (a half in two 구간, three per 구간, every 인정 방식, 콕 수령
-- checked by hand), so nothing a club sees changes until its organisers change a rule.

-- How many 구간 a half is cut into: 1 (the whole half), 2 (three months each), 3 (two months each) or 6 (each month).
ALTER TABLE clubs ADD COLUMN rule_periods INTEGER NOT NULL DEFAULT 2 CHECK (rule_periods IN (1, 2, 3, 6));
-- 줄서기 인정 needed in each 구간.
ALTER TABLE clubs ADD COLUMN rule_goal INTEGER NOT NULL DEFAULT 3 CHECK (rule_goal BETWEEN 1 AND 20);
-- The 인정 방식 this club counts, comma-separated from 'direct', 'substitute', 'approved'.
ALTER TABLE clubs ADD COLUMN rule_kinds TEXT NOT NULL DEFAULT 'direct,substitute,approved';
-- 'manual': organisers decide 콕 수령 themselves. 'goal': a member who met the goal in every 구간 shows as 수령 대상
-- (organisers still record the 수령 itself).
ALTER TABLE clubs ADD COLUMN rule_reward TEXT NOT NULL DEFAULT 'manual' CHECK (rule_reward IN ('manual', 'goal'));
