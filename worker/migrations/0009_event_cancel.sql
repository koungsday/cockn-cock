-- 일정 취소 (FLOW.md 10): when an organiser cancelled this event, in seconds; NULL is not cancelled. A cancelled event
-- keeps its answers and shows to members as 취소됐어요; it leaves the 진행 중인 일정 and cannot be wrapped up, so it never
-- counts towards 줄서기 인정 or 출석. Only a column is added: nothing is cancelled until an organiser cancels it.
ALTER TABLE events ADD COLUMN cancelled_at INTEGER;
