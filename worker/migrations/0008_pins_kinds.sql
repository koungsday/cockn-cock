-- 일정 흐름 2단계 (FLOW.md): 상단 고정 and 일정 종류. Only columns are added, and their defaults keep every screen and
-- count as it was: nothing is pinned, every existing event is 정기, and a club counts 정기·번개·대회, so all its events
-- still count until its organisers change the 모임 규칙.

-- When an organiser pinned this event or notice, in seconds; NULL is not pinned. The time is the order: pinned first,
-- in the order they were pinned. The server keeps each club to three of each.
ALTER TABLE events ADD COLUMN pinned_at INTEGER;
ALTER TABLE notices ADD COLUMN pinned_at INTEGER;

-- 일정 종류: regular 정기, flash 번개, match 대회, social 모임.
ALTER TABLE events ADD COLUMN kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'flash', 'match', 'social'));

-- The 일정 종류 whose events count towards 줄서기 인정, the 반기 집계 and 출석 in 내 기록, comma-separated.
ALTER TABLE clubs ADD COLUMN rule_event_kinds TEXT NOT NULL DEFAULT 'regular,flash,match';
