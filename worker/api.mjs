import {
  ApiError, changePin, clientUser, currentSeconds, login, logout, makeMemberCredential,
  matchingCredentials, membersNamed, readSession, rosterOpenEvents, sql, temporaryPin
} from './auth.mjs';
import { audit, organizerActor } from './audit.mjs';
import { issueOrganizer, listOrganizers, organizerName, reissueOrganizer, retireOrganizer } from './organizers.mjs';

const identifier = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const publicPath = new RegExp(`^/api/public/(vote|notice)/(${identifier})$`);
const votePath = new RegExp(`^/api/votes/(${identifier})$`);
const memberPath = new RegExp(`^/api/admin/members/(${identifier})(/reset)?$`);
const organizerPath = new RegExp(`^/api/admin/organizers/(${identifier})(/reset)?$`);
const eventPath = new RegExp(`^/api/admin/events/(${identifier})(?:/(attendance|votes|guests|settlement)(?:/(${identifier}))?)?$`);
const noticePath = new RegExp(`^/api/admin/notices/(${identifier})$`);
const recordId = new RegExp(`^${identifier}$`);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const slots = ['early', 'late', 'no'];
// Members answer 선발 or 후발 only, as in the club's 카카오톡 투표; 불참 stays for organisers' own records.
const memberSlots = ['early', 'late'];
const markKinds = ['direct', 'substitute', 'approved'];
// 일정 종류 (worker/migrations/0008_pins_kinds.sql): 정기, 번개, 대회, 모임.
const eventKinds = ['regular', 'flash', 'match', 'social'];
// 상단 고정: at most this many events and this many notices per club (FLOW.md 9).
const pinLimit = 3;
const guestStates = ['pending', 'confirmed', 'arrived', 'cancelled'];
const bodyLimit = 24 * 1024;
const eventFields = 'id, title, date, time, end_time, place, deadline, deadline_at, early_time, late_time, notes, open, published, kind';
const noticeFields = 'id, title, body, date, published';
// pinned_at and cancelled_at are set only by pinning and cancelling (setPinned, setCancelled), never by the event or
// notice forms, so they stay out of the field lists above.
// 참석 현황 on the member screens: how many on the event's roster chose each slot and lunch, counted as the
// organisers count them (views.mjs countEvent), never who. `table` is the events alias of the query it joins.
const countColumns = table => [...slots.map(slot => [slot, `cv.slot = '${slot}'`]), ['lunch', 'cv.lunch = 1']]
  .map(([name, where]) => `(SELECT COUNT(*) FROM roster cr
  JOIN votes cv ON cv.event_id = cr.event_id AND cv.member_id = cr.member_id
  WHERE cr.event_id = ${table}.id AND ${where}) AS ${name}_count`).join(', ');
const readCounts = row => ({ early: row.early_count, late: row.late_count, no: row.no_count, lunch: row.lunch_count });

function json(body, status = 200, cookie) {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  if (cookie) headers.set('Set-Cookie', cookie);
  return Response.json(body, { status, headers });
}

function bad(message) {
  throw new ApiError(400, message);
}

function missing() {
  throw new ApiError(404, '해당 기록을 찾을 수 없어요.');
}

function methodNotAllowed() {
  throw new ApiError(405, '지원하지 않는 요청 방식이에요.');
}

function requireUser(user) {
  if (!user) throw new ApiError(401, '먼저 로그인해 주세요.');
  return user;
}

// The 운영 화면 and its API: a signed-in member with the 운영 권한 (ROLES.md).
function requireOrganizer(user) {
  if (!requireUser(user).organizer) throw new ApiError(403, '이 작업을 할 수 있는 권한이 없어요.');
  return user;
}

async function readBody(request, url) {
  if (request.headers.get('origin') !== url.origin) {
    throw new ApiError(403, '현재 모임 페이지에서 다시 시도해 주세요.');
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, '요청 형식을 확인해 주세요.');
  }
  if (!request.body || Number(request.headers.get('content-length')) > bodyLimit) {
    throw new ApiError(413, '요청이 너무 커요.');
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let input = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > bodyLimit) {
        await reader.cancel();
        throw new ApiError(413, '요청이 너무 커요.');
      }
      input += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(input + decoder.decode());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    bad('요청 형식을 확인해 주세요.');
  }
}

function text(value, label, max, optional = false) {
  if (typeof value !== 'string') bad(label + '을 확인해 주세요.');
  const trimmed = value.trim();
  if ((!optional && !trimmed) || trimmed.length > max || /\0/.test(trimmed)) {
    bad(label + '을 확인해 주세요.');
  }
  return trimmed;
}

function memberName(value) {
  return text(typeof value === 'string' ? value.normalize('NFC') : value, '회원 이름', 60);
}

function boolean(value, label) {
  if (typeof value !== 'boolean') bad(label + '을 확인해 주세요.');
  return value;
}

function number(value, label, max = 10000000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) bad(label + '을 확인해 주세요.');
  return value;
}

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
}

function kstToday() {
  return kstNow().slice(0, 10);
}

function validDate(value) {
  if (!datePattern.test(value)) return false;
  const utc = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(utc.valueOf()) && utc.toISOString().slice(0, 10) === value;
}

function dateOrThrow(value, label) {
  if (typeof value !== 'string' || !validDate(value)) bad(label + '을 확인해 주세요.');
  return value;
}

function timeOrThrow(value, label) {
  if (typeof value !== 'string' || !timePattern.test(value)) bad(label + '을 확인해 주세요.');
  return value;
}

function dateTimeOrThrow(value, label) {
  if (typeof value !== 'string' || value.length !== 16 || value[10] !== 'T') bad(label + '을 확인해 주세요.');
  dateOrThrow(value.slice(0, 10), label);
  timeOrThrow(value.slice(11), label);
  return value;
}

function toEpoch(value) {
  return Math.floor(Date.parse(value + ':00+09:00') / 1000);
}

function parseBirthday(value) {
  if (typeof value !== 'string') bad('생년월일을 확인해 주세요.');
  const raw = datePattern.test(value) ? value.replaceAll('-', '') : value;
  const candidates = /^\d{6}$/.test(raw) ? ['19' + raw, '20' + raw] : [raw];
  const today = kstToday();
  if (!candidates.some(digits => {
    if (!/^\d{8}$/.test(digits)) return false;
    const birthday = digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6, 8);
    return validDate(birthday) && birthday <= today;
  })) {
    bad('생년월일을 확인해 주세요.');
  }
  return raw.slice(-6);
}

function serializeEvent(row) {
  const open = Boolean(row.open);
  const published = Boolean(row.published);
  return {
    id: row.id, title: row.title, date: row.date, time: row.time, endTime: row.end_time,
    place: row.place, deadline: row.deadline, earlyTime: row.early_time, lateTime: row.late_time,
    notes: row.notes, open, published, canVote: open && published && row.deadline_at > currentSeconds(),
    kind: row.kind, pinnedAt: row.pinned_at ?? null, cancelled: Boolean(row.cancelled_at)
  };
}

function serializeNotice(row) {
  return { id: row.id, title: row.title, body: row.body, date: row.date, published: Boolean(row.published), pinnedAt: row.pinned_at ?? null };
}

function serializeMember(row) {
  return { id: row.id, name: row.name, active: Boolean(row.active) };
}

function serializeGuest(row) {
  return { id: row.id, name: row.name, level: row.level, invitedBy: row.invited_by, status: row.status, paid: Boolean(row.paid) };
}

function serializeSettlement(row) {
  return row ? {
    priorSingles: row.prior_singles, priorTubes: row.prior_tubes, remainingSingles: row.remaining_singles,
    courtDonation: row.court_donation, confirmed: Boolean(row.confirmed)
  } : null;
}

function serializeVote(row) {
  return row ? { slot: row.slot, lunch: Boolean(row.lunch) } : null;
}

function validateVote(body, allowClear = false, allowed = slots) {
  if (!allowed.includes(body.slot) && !(allowClear && body.slot === null)) bad('참석 선택을 확인해 주세요.');
  const lunch = boolean(body.lunch, '점심 선택');
  if (body.slot === null && lunch) bad('응답을 지울 때는 점심 선택도 해제해 주세요.');
  return { slot: body.slot, lunch };
}

function validateEvent(input) {
  const fields = {
    title: text(input.title, '일정 제목', 120),
    date: dateOrThrow(input.date, '날짜'),
    time: timeOrThrow(input.time, '시작 시간'),
    endTime: timeOrThrow(input.endTime, '종료 시간'),
    place: text(input.place, '장소', 120),
    deadline: dateTimeOrThrow(input.deadline, '투표 마감 시간'),
    earlyTime: timeOrThrow(input.earlyTime, '선발 집합 시간'),
    lateTime: timeOrThrow(input.lateTime, '후발 집합 시간'),
    notes: text(input.notes ?? '', '공개 안내', 3000, true),
    open: boolean(input.open ?? false, '투표 열림 상태'),
    published: boolean(input.published ?? false, '공개 상태'),
    kind: input.kind ?? 'regular'
  };
  if (!eventKinds.includes(fields.kind)) bad('일정 종류를 확인해 주세요.');
  if (fields.endTime <= fields.time || fields.lateTime <= fields.earlyTime) {
    bad('시간과 선발·후발 순서를 확인해 주세요.');
  }
  if (fields.deadline > fields.date + 'T' + fields.time) bad('투표 마감 시간은 시작 시간보다 늦을 수 없어요.');
  return fields;
}

function eventParams(event) {
  return [event.title, event.date, event.time, event.endTime, event.place, event.deadline, toEpoch(event.deadline),
    event.earlyTime, event.lateTime, event.notes, +event.open, +event.published, event.kind];
}

async function fetchEvent(db, club, id) {
  const row = await sql(db, `SELECT ${eventFields}, pinned_at, cancelled_at FROM events WHERE id = ? AND club_id = ?`, id, club).first();
  if (!row) missing();
  return serializeEvent(row);
}

// 로그인 없이 보기 (사용자 결정, 2026-11-26): anyone with the link sees when an event is, its deadline, state and
// counts, and a notice's title, date and the start of its body; the place, the event notes and the whole notice
// wait for sign-in. Answering always needs sign-in (/api/votes).
async function fetchPublic(db, club, kind, id, signedIn) {
  if (kind === 'vote') {
    const row = await sql(db, `SELECT ${eventFields}, cancelled_at, ${countColumns('events')} FROM events WHERE id = ? AND club_id = ? AND published = 1`, id, club).first();
    if (!row) missing();
    const event = { ...serializeEvent(row), counts: readCounts(row) };
    return { event: signedIn ? event : { ...event, place: null, notes: null } };
  }
  const row = await sql(db, `SELECT ${noticeFields} FROM notices WHERE id = ? AND club_id = ? AND published = 1`, id, club).first();
  if (!row) missing();
  const notice = serializeNotice(row);
  return { notice: signedIn ? notice : { ...notice, body: null, preview: noticePreview(row.body) } };
}

// 공지 미리보기: the start of the body on one line, as the notice page before sign-in and the KakaoTalk preview show it.
export function noticePreview(body) {
  const characters = [...String(body).replace(/\s+/g, ' ').trim()];
  return characters.length > 60 ? characters.slice(0, 60).join('').trimEnd() + '…' : characters.join('');
}

const weekdayWords = ['일', '월', '화', '수', '목', '금', '토'];
function koreanDate(date) {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${weekdayWords[new Date(date + 'T00:00:00Z').getUTCDay()]})`;
}

// 카톡 미리보기 (worker/index.mjs shareTags): what anyone with the link may see, the same as the pages before sign-in.
// A draft or a missing record gives nothing, so the preview stays generic.
export async function shareSummary(db, club, kind, id) {
  if (kind === 'vote') {
    const row = await sql(db, 'SELECT title, date, time, deadline, cancelled_at FROM events WHERE id = ? AND club_id = ? AND published = 1', id, club).first();
    return row && {
      title: row.title,
      description: `${koreanDate(row.date)} ${row.time} · ${row.cancelled_at ? '취소된 일정이에요.'
        : `${koreanDate(row.deadline.slice(0, 10))} ${row.deadline.slice(11, 16)} 투표 마감`}`
    };
  }
  const row = await sql(db, 'SELECT title, date, body FROM notices WHERE id = ? AND club_id = ? AND published = 1', id, club).first();
  return row && { title: row.title, description: `${koreanDate(row.date)} · ${noticePreview(row.body)}` };
}

// The member home: published upcoming events with this member's own place on the roster and answer
// (never anyone else's; others only as counts), so the home can show 투표하기 / 응답 완료 without one request per
// event, and 내 기록: this member's row of this half's 반기 집계. Every pinned event, today's events and every open vote
// come (FLOW.md 6); only the rest are cut to the next 12. The screen orders them (flow.mjs memberOrder).
// memberId is null before sign-in: no place, no own answer and no 내 기록 (fetchPublic says what stays open).
async function listPublic(db, club, memberId) {
  const now = kstNow();
  const date = now.slice(0, 10);
  const time = now.slice(11, 16);
  const seconds = currentSeconds();
  const columns = `e.id, e.title, e.date, e.time, e.end_time, e.place, e.deadline, e.deadline_at, e.open, e.kind, e.pinned_at, e.cancelled_at,
        e.early_time, e.late_time, r.member_id IS NOT NULL AS eligible, v.slot AS my_slot, ${countColumns('e')}`;
  const upcoming = `FROM events e
      LEFT JOIN roster r ON r.event_id = e.id AND r.member_id = ?
      LEFT JOIN votes v ON v.event_id = e.id AND v.member_id = ?
      WHERE e.club_id = ? AND e.date >= ? AND e.published = 1 AND (e.date > ? OR e.end_time > ?)`;
  const flowing = '(e.pinned_at IS NOT NULL OR e.date = ? OR (e.open = 1 AND e.deadline_at > ?))';
  const binds = [memberId, memberId, club, date, date, time];
  const [current, later, notices] = await db.batch([
    sql(db, `SELECT ${columns} ${upcoming} AND ${flowing}`, ...binds, date, seconds),
    sql(db, `SELECT ${columns} ${upcoming} AND NOT ${flowing} ORDER BY e.date, e.time, e.id LIMIT 12`, ...binds, date, seconds),
    // Pinned notices first, in the order they were pinned (상단 고정), then the newest.
    sql(db, `
      SELECT id, title, date, pinned_at FROM notices
      WHERE club_id = ? AND date <= ? AND published = 1
      ORDER BY pinned_at IS NULL, pinned_at, date DESC, rowid DESC LIMIT 8
    `, club, date)
  ]);
  const rows = [...current.results, ...later.results]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  return {
    events: rows.map(row => ({
      id: row.id, title: row.title, date: row.date, time: row.time, endTime: row.end_time,
      place: memberId ? row.place : null, deadline: row.deadline, earlyTime: row.early_time, lateTime: row.late_time,
      canVote: Boolean(row.open) && row.deadline_at > seconds, kind: row.kind, pinnedAt: row.pinned_at ?? null, cancelled: Boolean(row.cancelled_at),
      open: Boolean(row.open), eligible: Boolean(row.eligible), mySlot: row.my_slot ?? null, counts: readCounts(row)
    })),
    notices: notices.results.map(row => ({ id: row.id, title: row.title, date: row.date, pinnedAt: row.pinned_at ?? null })),
    record: memberId ? await memberRecord(db, club, memberId, date) : null
  };
}

// 출석 in 내 기록: present at an event of this club whose 마무리 is confirmed and whose 일정 종류 the club counts (모임
// 규칙), as the organisers' 출석 체크 recorded it, the same closing rule as 줄서기 인정 (recognisedMarks).
// Binds club, member, each counted 일정 종류.
const attendedMarks = eventKinds => `FROM attendance a JOIN events e ON a.event_id = e.id
      JOIN settlements s ON s.event_id = e.id AND s.confirmed = 1
      WHERE e.club_id = ? AND a.member_id = ? AND a.present = 1 AND e.kind IN (${eventKinds.map(() => '?').join(', ')})`;

// 내 기록: this member's 줄서기 인정 in this half by 구간, each with its date and kind like the club's 출석완료자 명단
// sheet, counted exactly as the organisers' 반기 집계 (progress) counts them under the 모임 규칙; and their 출석, by
// month this year and in all.
async function memberRecord(db, club, memberId, date) {
  const year = Number(date.slice(0, 4));
  const half = Number(date.slice(5, 7)) <= 6 ? 1 : 2;
  const rules = await readRules(db, club);
  const { start, end } = halfRange(year, half);
  const [marks, reward, months, total] = await db.batch([
    sql(db, `SELECT e.date, a.recognition ${recognisedMarks(rules)} AND a.member_id = ? ORDER BY e.date, e.time, e.id`,
      club, ...rules.kinds, ...rules.eventKinds, start, end, memberId),
    sql(db, 'SELECT 1 FROM rewards WHERE year = ? AND half = ? AND member_id = ?', year, half, memberId),
    sql(db, `SELECT CAST(substr(e.date, 6, 2) AS INTEGER) AS month, COUNT(*) AS count ${attendedMarks(rules.eventKinds)}
      AND e.date >= ? AND e.date < ? GROUP BY month`, club, memberId, ...rules.eventKinds, year + '-01-01', (year + 1) + '-01-01'),
    sql(db, `SELECT COUNT(*) AS total ${attendedMarks(rules.eventKinds)}`, club, memberId, ...rules.eventKinds)
  ]);
  const periods = Array.from({ length: rules.periods }, () => []);
  for (const row of marks.results) periods[periodOf(row.date, half, rules)].push({ date: row.date, kind: row.recognition });
  const byMonth = Array(12).fill(0);
  for (const row of months.results) byMonth[row.month - 1] = row.count;
  return {
    year, half, periods, goal: rules.goal, reward: rules.reward,
    rewarded: reward.results.length > 0,
    eligible: rules.reward === 'goal' && periods.every(list => list.length >= rules.goal),
    attendance: { months: byMonth, total: total.results[0].total }
  };
}

async function memberVote(db, club, method, id, user, body = {}) {
  const roster = await sql(db, `
    SELECT e.open, e.deadline_at
    FROM events e JOIN roster r ON r.event_id = e.id
    WHERE e.id = ? AND e.club_id = ? AND e.published = 1 AND r.member_id = ?
  `, id, club, user.id).first();
  if (!roster) missing();

  if (method === 'GET') {
    const row = await sql(db, 'SELECT slot, lunch FROM votes WHERE event_id = ? AND member_id = ?', id, user.id).first();
    return { vote: serializeVote(row) };
  }
  if (method !== 'PUT') methodNotAllowed();
  // slot null is 응답 취소: the answer is removed under the same conditions that let it be saved.
  const { slot, lunch } = validateVote(body, true, memberSlots);
  const canAnswer = `FROM roster r JOIN events e ON r.event_id = e.id JOIN members m ON m.id = r.member_id
    WHERE r.event_id = ? AND r.member_id = ? AND m.active = 1 AND e.club_id = ?
      AND m.credential_version = ? AND e.published = 1 AND e.open = 1 AND e.deadline_at > unixepoch()`;
  const result = slot === null
    ? await sql(db, `DELETE FROM votes WHERE event_id = ? AND member_id = ? AND EXISTS (SELECT 1 ${canAnswer})`,
      id, user.id, id, user.id, club, user.version).run()
    : await sql(db, `
    INSERT INTO votes (event_id, member_id, slot, lunch)
    SELECT r.event_id, r.member_id, ?, ?
    ${canAnswer}
    ON CONFLICT (event_id, member_id) DO UPDATE SET slot = excluded.slot, lunch = excluded.lunch
  `, slot, +lunch, id, user.id, club, user.version).run();
  // Nothing removed is fine when there was no answer to remove; an answer still there means the vote is closed.
  const blocked = slot === null
    ? await sql(db, 'SELECT 1 FROM votes WHERE event_id = ? AND member_id = ?', id, user.id).first()
    : !result.meta.changes;
  if (blocked) throw new ApiError(409, '투표가 마감되었거나 회원 정보가 바뀌었어요. 새로고침해 주세요.');
  const counts = await sql(db, `SELECT ${countColumns('events')} FROM events WHERE id = ? AND club_id = ?`, id, club).first();
  return { vote: slot === null ? null : { slot, lunch }, counts: readCounts(counts) };
}

async function listAdmin(db, club) {
  const [members, events, notices] = await db.batch([
    sql(db, 'SELECT id, name, active FROM members WHERE club_id = ? ORDER BY active DESC, name, id', club),
    // settled and waiting are for the organisers' screens only (the session picker, the 운영 홈 일정 흐름 of FLOW.md):
    // waiting counts active members on the roster without an answer, as the 운영 홈 counts 미응답. serializeEvent
    // stays shared with the member screens.
    sql(db, `SELECT ${eventFields}, pinned_at, cancelled_at, EXISTS (SELECT 1 FROM settlements s WHERE s.event_id = events.id AND s.confirmed = 1) AS settled,
      (SELECT COUNT(*) FROM roster r JOIN members m ON m.id = r.member_id
        LEFT JOIN votes v ON v.event_id = r.event_id AND v.member_id = r.member_id
        WHERE r.event_id = events.id AND m.active = 1 AND v.member_id IS NULL) AS waiting
      FROM events WHERE club_id = ? ORDER BY date DESC, time DESC, id`, club),
    // Pinned notices first, in the order they were pinned (상단 고정), then the newest.
    sql(db, `SELECT ${noticeFields}, pinned_at FROM notices WHERE club_id = ?
      ORDER BY pinned_at IS NULL, pinned_at, date DESC, rowid DESC`, club)
  ]);
  return {
    members: members.results.map(serializeMember),
    events: events.results.map(row => ({ ...serializeEvent(row), settled: Boolean(row.settled), waiting: row.waiting })),
    notices: notices.results.map(serializeNotice),
    rules: await readRules(db, club)
  };
}

async function addMember(env, body) {
  const { DB: db, CLUB_SCOPE: club } = env;
  const name = memberName(body.name);
  const birthday = parseBirthday(body.birthday);
  const candidates = await membersNamed(env, name);
  // Organisers are members too, so this also keeps a new member from an organiser's login (ROLES.md).
  if ((await matchingCredentials(env, candidates, birthday, true)).length) {
    throw new ApiError(409, '같은 이름과 로그인 번호를 사용하는 회원이 있어요. 회원 목록을 확인해 주세요.');
  }
  const { hash, salt, version } = await makeMemberCredential(env, birthday);
  const id = crypto.randomUUID();
  const [insert] = await db.batch([
    sql(db, `
      INSERT INTO members (id, club_id, name, credential_salt, credential_hash, credential_version)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM members WHERE club_id = ? AND name IN (?, ?)
          AND credential_version NOT IN (SELECT value FROM json_each(?))
      )
    `, id, club, name, salt, hash, version, club, name, name.normalize('NFD'),
    JSON.stringify(candidates.map(row => row.credential_version))),
    rosterOpenEvents(db, club, id)
  ]);
  if (!insert.meta.changes) throw new ApiError(409, '같은 이름의 회원 정보가 바뀌었어요. 다시 등록해 주세요.');
  return { member: { id, name, active: true } };
}

async function updateMember(env, id, body) {
  const { DB: db, CLUB_SCOPE: club } = env;
  const name = body.name === undefined ? null : memberName(body.name);
  const active = body.active === undefined ? null : +boolean(body.active, '활동 상태');
  // PINs are stored hashed, so a rename cannot be compared with them; a name and credential shared by two members
  // is refused at sign-in instead (auth.mjs login).
  const statements = [sql(db, `
    UPDATE members SET name = COALESCE(?,name), active = COALESCE(?,active) WHERE id = ? AND club_id = ?
  `, name, active, id, club)];
  if (active === 0) statements.push(sql(db, `
    DELETE FROM sessions WHERE member_id = ?
      AND EXISTS (SELECT 1 FROM members WHERE id = ? AND club_id = ? AND active = 0)
  `, id, id, club));
  if (active === 1) statements.push(rosterOpenEvents(db, club, id));
  statements.push(sql(db, 'SELECT id, name, active FROM members WHERE id = ? AND club_id = ?', id, club));
  const results = await db.batch(statements);
  const row = results.at(-1).results[0];
  if (!row) missing();
  if (!results[0].meta.changes) throw new ApiError(409, '회원 정보가 변경됐어요. 다시 시도해 주세요.');
  return { member: serializeMember(row) };
}

async function resetMember(env, id) {
  const { DB: db, CLUB_SCOPE: club } = env;
  const target = await sql(db, 'SELECT name, credential_version FROM members WHERE id = ? AND club_id = ?', id, club).first();
  if (!target) missing();
  const name = target.name.normalize('NFC');
  const candidates = await membersNamed(env, name, target.name);
  let temporary;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = temporaryPin();
    if (!(await matchingCredentials(env, candidates, code, true)).length) {
      temporary = code;
      break;
    }
  }
  if (!temporary) throw new ApiError(409, '임시 번호를 만들지 못했어요. 다시 시도해 주세요.');
  const { hash, salt, version } = await makeMemberCredential(env, temporary);
  const [updated] = await db.batch([
    sql(db, `
      UPDATE members SET credential_salt = ?, credential_hash = ?,
        credential_version = ?, must_change = 1
      WHERE id = ? AND club_id = ? AND name = ? AND credential_version = ?
        AND NOT EXISTS (
          SELECT 1 FROM members WHERE club_id = ? AND name IN (?, ?, ?)
            AND credential_version NOT IN (SELECT value FROM json_each(?))
        )
    `, salt, hash, version, id, club, target.name, target.credential_version, club, name, name.normalize('NFD'), target.name,
    JSON.stringify(candidates.map(row => row.credential_version))),
    sql(db, `
      DELETE FROM sessions WHERE role = 'member' AND member_id = ?
        AND EXISTS (SELECT 1 FROM members WHERE id = ? AND credential_version = ?)
    `, id, id, version),
    sql(db, `
      DELETE FROM attempts WHERE key = ?
        AND EXISTS (SELECT 1 FROM members WHERE id = ? AND credential_version = ?)
    `, 'pin-member:' + id, id, version)
  ]);
  if (!updated.meta.changes) throw new ApiError(409, '회원 정보가 변경됐어요. 다시 시도해 주세요.');
  return { temporaryPin: temporary };
}

async function addEvent(db, club, body) {
  const data = validateEvent(body);
  const id = crypto.randomUUID();
  await db.batch([
    sql(db, `
      INSERT INTO events (club_id, ${eventFields})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, club, id, ...eventParams(data)),
    sql(db, 'INSERT INTO roster (event_id, member_id) SELECT ?, id FROM members WHERE club_id = ? AND active = 1', id, club)
  ]);
  return { event: await fetchEvent(db, club, id) };
}

async function updateEvent(db, club, id, body) {
  const previous = await fetchEvent(db, club, id);
  const data = validateEvent({ ...previous, ...body });
  if (data.open && previous.cancelled) throw new ApiError(409, '취소한 일정은 투표를 열 수 없어요. 먼저 취소를 풀어 주세요.');
  const updates = await sql(db, `
    UPDATE events SET title=?, date=?, time=?, end_time=?, place=?, deadline=?, deadline_at=?,
      early_time=?, late_time=?, notes=?, open=?, published=?, kind=?
    WHERE id=? AND club_id=?
      AND title=? AND date=? AND time=? AND end_time=? AND place=? AND deadline=? AND deadline_at=?
      AND early_time=? AND late_time=? AND notes=? AND open=? AND published=? AND kind=?
      AND (
        (date=? AND ?=0) OR NOT EXISTS (SELECT 1 FROM settlements WHERE event_id=? AND confirmed=1)
      )
      AND (?=0 OR cancelled_at IS NULL)
  `, ...eventParams(data), id, club, ...eventParams(previous), data.date, +data.open, id, +data.open).run();
  if (!updates.meta.changes) {
    throw new ApiError(409, '다른 곳에서 일정이 바뀌었거나 마무리가 확정됐어요. 새로고침한 뒤 확인해 주세요.');
  }
  return { event: await fetchEvent(db, club, id) };
}

async function eventDetails(db, club, id) {
  const [event, roster, guests, settlement] = await db.batch([
    sql(db, `SELECT ${eventFields}, pinned_at, cancelled_at FROM events WHERE id = ? AND club_id = ?`, id, club),
    sql(db, `
      SELECT m.id, m.name, m.active, v.slot, v.lunch, a.present, a.recognition
      FROM roster r JOIN members m ON r.member_id = m.id
      LEFT JOIN votes v ON v.event_id = r.event_id AND v.member_id = r.member_id
      LEFT JOIN attendance a ON a.event_id = r.event_id AND a.member_id = r.member_id
      WHERE r.event_id = ? ORDER BY m.name, m.id
    `, id),
    sql(db, 'SELECT id, name, level, invited_by, status, paid FROM guests WHERE event_id = ? ORDER BY rowid', id),
    sql(db, 'SELECT prior_singles, prior_tubes, remaining_singles, court_donation, confirmed FROM settlements WHERE event_id = ?', id)
  ]);
  if (!event.results[0]) missing();
  return {
    event: serializeEvent(event.results[0]),
    roster: roster.results.map(row => ({
      id: row.id, name: row.name, active: Boolean(row.active), slot: row.slot, lunch: Boolean(row.lunch),
      present: row.present === null ? null : Boolean(row.present), recognition: row.recognition
    })),
    guests: guests.results.map(serializeGuest),
    settlement: serializeSettlement(settlement.results[0])
  };
}

async function ensureRoster(db, club, eventId, memberId) {
  if (!await sql(db, `
    SELECT r.member_id FROM roster r JOIN events e ON e.id = r.event_id
    WHERE r.event_id = ? AND r.member_id = ? AND e.club_id = ?
  `, eventId, memberId, club).first()) missing();
}

async function overrideVote(db, club, id, memberId, body) {
  await ensureRoster(db, club, id, memberId);
  const { slot, lunch } = validateVote(body, true);
  if (slot === null) {
    await sql(db, 'DELETE FROM votes WHERE event_id = ? AND member_id = ?', id, memberId).run();
  } else {
    await sql(db, `
      INSERT INTO votes (event_id, member_id, slot, lunch) VALUES (?, ?, ?, ?)
      ON CONFLICT (event_id, member_id) DO UPDATE SET slot=excluded.slot, lunch=excluded.lunch
    `, id, memberId, slot, +lunch).run();
  }
  return { vote: slot === null ? null : { slot, lunch } };
}

function lockedSettlement() {
  throw new ApiError(409, '마무리 확정을 해제한 뒤 기록을 바꿔 주세요.');
}

async function setAttendance(db, club, id, memberId, body) {
  const { present, recognition } = body;
  if ((present !== null && typeof present !== 'boolean') ||
    (recognition !== null && !markKinds.includes(recognition))) {
    bad('출석과 별도 인정 상태를 확인해 주세요.');
  }
  if ((recognition === 'direct' || recognition === 'substitute') && present !== true) {
    bad('직접·대타 인정은 당일 출석으로 표시한 뒤 선택해 주세요.');
  }
  await ensureRoster(db, club, id, memberId);
  const result = await sql(db, `
    INSERT INTO attendance (event_id, member_id, present, recognition)
    SELECT ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM settlements WHERE event_id = ? AND confirmed = 1)
    ON CONFLICT (event_id, member_id)
    DO UPDATE SET present=excluded.present, recognition=excluded.recognition
  `, id, memberId, present === null ? null : +present, recognition, id).run();
  if (!result.meta.changes) lockedSettlement();
  return { attendance: { present, recognition } };
}

async function setGuest(db, club, eventId, body) {
  await fetchEvent(db, club, eventId);
  const id = body.id ?? crypto.randomUUID();
  if (typeof id !== 'string' || !recordId.test(id)) bad('게스트 기록을 확인해 주세요.');
  const params = [
    text(body.name, '게스트 이름', 60),
    text(body.level ?? '', '게스트 급수', 30, true),
    text(body.invitedBy ?? '', '초대 회원', 60, true),
    body.status,
    +boolean(body.paid, '납부 상태')
  ];
  if (!guestStates.includes(body.status)) bad('게스트 참가 상태를 확인해 주세요.');
  if (body.id && !await sql(db, 'SELECT id FROM guests WHERE id = ? AND event_id = ?', id, eventId).first()) missing();
  const statement = body.id
    ? sql(db, `
      UPDATE guests SET name=?, level=?, invited_by=?, status=?, paid=? WHERE id=? AND event_id=?
      AND NOT EXISTS (SELECT 1 FROM settlements WHERE event_id=? AND confirmed=1)
    `, ...params, id, eventId, eventId)
    : sql(db, `
      INSERT INTO guests (id, event_id, name, level, invited_by, status, paid)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM settlements WHERE event_id=? AND confirmed=1)
    `, id, eventId, ...params, eventId);
  if (!(await statement.run()).meta.changes) lockedSettlement();
  return { guest: serializeGuest(await sql(db, 'SELECT id, name, level, invited_by, status, paid FROM guests WHERE id = ?', id).first()) };
}

async function setSettlement(db, club, id, body) {
  const values = [
    number(body.priorSingles, '이전 콕 낱개 수'),
    number(body.priorTubes, '이전 콕 타 수'),
    number(body.remainingSingles, '당일 콕 낱개 수'),
    number(body.courtDonation, '코트 찬조금'),
    +boolean(body.confirmed, '마무리 확정 상태')
  ];
  const event = await fetchEvent(db, club, id);
  const today = kstToday();
  if (body.confirmed && event.date > today) bad('일정 당일이 되면 마무리를 확정할 수 있어요.');
  if (body.confirmed && event.cancelled) throw new ApiError(409, '취소한 일정은 마무리할 수 없어요. 먼저 취소를 풀어 주세요.');
  const statements = [sql(db, `
    INSERT INTO settlements (event_id, prior_singles, prior_tubes, remaining_singles, court_donation, confirmed)
    SELECT id, ?, ?, ?, ?, ? FROM events WHERE id = ? AND club_id = ? AND (? = 0 OR (date <= ? AND cancelled_at IS NULL))
    ON CONFLICT (event_id)
    DO UPDATE SET prior_singles=excluded.prior_singles, prior_tubes=excluded.prior_tubes,
      remaining_singles=excluded.remaining_singles, court_donation=excluded.court_donation, confirmed=excluded.confirmed
  `, ...values, id, club, +body.confirmed, today)];
  if (body.confirmed) {
    // A confirmed 마무리 ends the event's flow (FLOW.md): its vote closes and it lets go of its 상단 고정 place.
    statements.push(sql(db, `
      UPDATE events SET open=0, pinned_at=NULL WHERE id=? AND club_id=? AND EXISTS (
        SELECT 1 FROM settlements WHERE event_id=? AND confirmed=1
      )
    `, id, club, id));
  }
  statements.push(sql(db, 'SELECT * FROM settlements WHERE event_id = ?', id));
  const results = await db.batch(statements);
  if (!results[0].meta.changes) {
    throw new ApiError(409, '모임 날짜가 바뀌었어요. 새로고침한 뒤 확인해 주세요.');
  }
  return { settlement: serializeSettlement(results.at(-1).results[0]) };
}

async function saveNotice(db, club, body) {
  const title = text(body.title, '공지 제목', 120);
  const content = text(body.body, '공지 내용', 4000);
  const published = +boolean(body.published ?? false, '공개 상태');
  const id = body.id ?? crypto.randomUUID();
  if (typeof id !== 'string' || !recordId.test(id)) bad('공지 기록을 확인해 주세요.');

  const statement = body.id
    ? sql(db, 'UPDATE notices SET title=?, body=?, published=? WHERE id=? AND club_id=?', title, content, published, id, club)
    : sql(db, `INSERT INTO notices (club_id, ${noticeFields}) VALUES (?, ?, ?, ?, ?, ?)`, club, id, title, content, kstToday(), published);
  if (!(await statement.run()).meta.changes) missing();
  return { notice: serializeNotice(await sql(db, `SELECT ${noticeFields}, pinned_at FROM notices WHERE id=? AND club_id=?`, id, club).first()) };
}

function parsePeriod(year, half) {
  const fullYear = Number(year);
  const period = Number(half);
  if (!Number.isInteger(fullYear) || fullYear < 1900 || fullYear > 9998 || ![1, 2].includes(period)) {
    bad('연도와 반기를 확인해 주세요.');
  }
  return { year: fullYear, half: period };
}

// A half runs from start to end; the 모임 규칙 cut it into 1, 2, 3 or 6 구간 of equal months.
function halfRange(year, half) {
  return {
    start: year + (half === 1 ? '-01-01' : '-07-01'),
    end: half === 1 ? year + '-07-01' : (year + 1) + '-01-01'
  };
}

// Which 구간 of its half a date falls in, 0-based.
function periodOf(date, half, rules) {
  return Math.floor((Number(date.slice(5, 7)) - (half === 1 ? 1 : 7)) / (6 / rules.periods));
}

// What counts as 줄서기 인정, shared by the 반기 집계 and the member's 내 기록: a recognition of a kind this club counts
// (모임 규칙) recorded at an event of an 일정 종류 it counts, of this club, whose 마무리 is confirmed, dated within
// [start, end). Binds club, each 인정 방식, each 일정 종류, start, end.
const recognisedMarks = ({ kinds, eventKinds }) => `FROM attendance a JOIN events e ON a.event_id = e.id
      JOIN settlements s ON s.event_id = e.id AND s.confirmed = 1
      WHERE e.club_id = ? AND a.recognition IN (${kinds.map(() => '?').join(', ')})
        AND e.kind IN (${eventKinds.map(() => '?').join(', ')}) AND e.date >= ? AND e.date < ?`;

async function progress(db, club, year, half) {
  const rules = await readRules(db, club);
  const { start, end } = halfRange(year, half);
  const [members, marks] = await db.batch([
    sql(db, `
      SELECT m.id, m.name, (r.member_id IS NOT NULL) AS rewarded
      FROM members m LEFT JOIN rewards r ON r.member_id = m.id AND r.year = ? AND r.half = ?
      WHERE m.club_id = ? AND (m.active = 1 OR r.member_id IS NOT NULL
        OR EXISTS (SELECT 1 ${recognisedMarks(rules)} AND a.member_id = m.id))
      ORDER BY m.name, m.id
    `, year, half, club, club, ...rules.kinds, ...rules.eventKinds, start, end),
    sql(db, `SELECT a.member_id, e.date ${recognisedMarks(rules)}`, club, ...rules.kinds, ...rules.eventKinds, start, end)
  ]);
  const counts = new Map();
  for (const row of marks.results) {
    const periods = counts.get(row.member_id) ?? Array(rules.periods).fill(0);
    periods[periodOf(row.date, half, rules)] += 1;
    counts.set(row.member_id, periods);
  }
  return {
    rules,
    members: members.results.map(row => {
      const periods = counts.get(row.id) ?? Array(rules.periods).fill(0);
      return {
        id: row.id, name: row.name, periods, rewarded: Boolean(row.rewarded),
        eligible: rules.reward === 'goal' && periods.every(count => count >= rules.goal)
      };
    })
  };
}

// 모임 규칙 (worker/migrations/0007_club_rules.sql): how this club counts 줄서기 인정 and shows 콕 수령.
const rulePeriods = [1, 2, 3, 6];
const rewardRules = ['manual', 'goal'];

async function readRules(db, club) {
  const row = await sql(db, 'SELECT rule_periods, rule_goal, rule_kinds, rule_reward, rule_event_kinds FROM clubs WHERE id = ?', club).first();
  return {
    periods: row.rule_periods, goal: row.rule_goal,
    kinds: markKinds.filter(kind => row.rule_kinds.split(',').includes(kind)), reward: row.rule_reward,
    eventKinds: eventKinds.filter(kind => row.rule_event_kinds.split(',').includes(kind))
  };
}

async function saveRules(db, club, body) {
  const periods = Number(body.periods);
  const goal = Number(body.goal);
  if (!rulePeriods.includes(periods)) bad('집계 구간을 확인해 주세요.');
  if (!Number.isInteger(goal) || goal < 1 || goal > 20) bad('구간 목표는 1회에서 20회 사이로 정해 주세요.');
  if (!Array.isArray(body.kinds) || !body.kinds.length || body.kinds.some(kind => !markKinds.includes(kind))) {
    bad('인정 방식을 하나 이상 골라 주세요.');
  }
  if (!rewardRules.includes(body.reward)) bad('콕 수령 방식을 확인해 주세요.');
  if (!Array.isArray(body.eventKinds) || !body.eventKinds.length || body.eventKinds.some(kind => !eventKinds.includes(kind))) {
    bad('세는 일정 종류를 하나 이상 골라 주세요.');
  }
  const kinds = markKinds.filter(kind => body.kinds.includes(kind));
  const counted = eventKinds.filter(kind => body.eventKinds.includes(kind));
  await sql(db, 'UPDATE clubs SET rule_periods = ?, rule_goal = ?, rule_kinds = ?, rule_reward = ?, rule_event_kinds = ? WHERE id = ?',
    periods, goal, kinds.join(','), body.reward, counted.join(','), club).run();
  return { rules: { periods, goal, kinds, reward: body.reward, eventKinds: counted } };
}

// 일정 취소 (worker/migrations/0009_event_cancel.sql): the event stays with its answers and shows to members as
// 취소됐어요; its vote closes and it lets go of its 상단 고정 place. Cancelling again or restoring a live event changes
// nothing. An event whose 마무리 is confirmed has happened and cannot be cancelled; restoring leaves the vote closed
// for the organisers to open again.
async function setCancelled(db, club, id, body) {
  const cancelled = boolean(body.cancelled, '일정 취소');
  const event = await fetchEvent(db, club, id);
  if (cancelled && !event.cancelled) {
    const result = await sql(db, `UPDATE events SET cancelled_at = ?, open = 0, pinned_at = NULL
      WHERE id = ? AND club_id = ? AND cancelled_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM settlements WHERE event_id = ? AND confirmed = 1)`, currentSeconds(), id, club, id).run();
    if (!result.meta.changes) throw new ApiError(409, '마무리를 확정한 일정은 취소할 수 없어요.');
  }
  if (!cancelled && event.cancelled) {
    await sql(db, 'UPDATE events SET cancelled_at = NULL WHERE id = ? AND club_id = ?', id, club).run();
  }
  return { event: await fetchEvent(db, club, id) };
}

// 상단 고정 (FLOW.md 4·5): pinned events and notices come first, in the order they were pinned. A club keeps at most
// pinLimit of each; pinning one more asks first (the screens do) and then, with replaceOldest, lets go of the
// longest-pinned one in the same batch. An event whose 마무리 is confirmed, or that was cancelled, has left the 진행 중인
// 일정, so it cannot be pinned and does not take a place.
async function setPinned(db, club, table, id, body) {
  const pinned = boolean(body.pinned, '상단 고정');
  const replaceOldest = boolean(body.replaceOldest ?? false, '고정 교체');
  const live = table === 'events'
    ? 'AND cancelled_at IS NULL AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.event_id = events.id AND s.confirmed = 1)' : '';
  const row = await sql(db, `SELECT id, title, pinned_at FROM ${table} WHERE id = ? AND club_id = ? ${live}`, id, club).first();
  if (!row) {
    const gone = table === 'events' && await sql(db, 'SELECT cancelled_at FROM events WHERE id = ? AND club_id = ?', id, club).first();
    if (gone && !pinned) return { pinnedAt: null, released: null };
    if (gone) throw new ApiError(409, gone.cancelled_at ? '취소한 일정은 고정할 수 없어요.' : '마무리를 확정한 일정은 고정할 수 없어요.');
    missing();
  }
  if (!pinned) {
    await sql(db, `UPDATE ${table} SET pinned_at = NULL WHERE id = ? AND club_id = ?`, id, club).run();
    return { pinnedAt: null, released: null };
  }
  if (row.pinned_at !== null) return { pinnedAt: row.pinned_at, released: null };
  const pinnedNow = async () => (await sql(db, `SELECT id, title FROM ${table} WHERE club_id = ? AND pinned_at IS NOT NULL ${live}
    ORDER BY pinned_at, rowid`, club).all()).results;
  const others = await pinnedNow();
  if (others.length >= pinLimit && !replaceOldest) {
    throw new ApiError(409, `상단 고정은 ${pinLimit}개까지예요. 가장 오래 고정한 "${others[0].title}"의 고정을 풀고 다시 시도해 주세요.`);
  }
  // Pin first, then let go of whatever is over the limit, oldest first, in the same batch: when the pin does not
  // happen (another organiser changed the pins in between), nothing is let go either. The new pin comes strictly after
  // every other one, so two pins in the same second keep the order they were made in, and the newest is never let go.
  const count = `(SELECT COUNT(*) FROM ${table} WHERE club_id = ? AND pinned_at IS NOT NULL ${live})`;
  const statements = [sql(db, `UPDATE ${table} SET pinned_at = MAX(?, COALESCE((SELECT MAX(pinned_at) FROM ${table} WHERE club_id = ?), 0) + 1)
      WHERE id = ? AND club_id = ? AND pinned_at IS NULL ${live} AND (? = 1 OR ${count} < ?)`,
  currentSeconds(), club, id, club, +replaceOldest, club, pinLimit)];
  if (replaceOldest) {
    statements.push(sql(db, `UPDATE ${table} SET pinned_at = NULL WHERE club_id = ? AND id IN (
        SELECT id FROM ${table} WHERE club_id = ? AND pinned_at IS NOT NULL ${live} ORDER BY pinned_at, rowid
        LIMIT MAX(0, ${count} - ?))`, club, club, club, pinLimit));
  }
  const [pin] = await db.batch(statements);
  const saved = await sql(db, `SELECT pinned_at FROM ${table} WHERE id = ? AND club_id = ?`, id, club).first();
  // Someone else pinned this one first: it is pinned, as asked.
  if (!pin.meta.changes && !saved?.pinned_at) {
    throw new ApiError(409, '다른 곳에서 고정이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.');
  }
  const kept = new Set((await pinnedNow()).map(item => item.id));
  const released = pin.meta.changes ? others.find(other => !kept.has(other.id)) : null;
  return { pinnedAt: saved.pinned_at, released: released ? { id: released.id, title: released.title } : null };
}

async function setReward(db, club, body) {
  const { year, half } = parsePeriod(body.year, body.half);
  const { memberId } = body;
  if (typeof memberId !== 'string' || !recordId.test(memberId)) bad('회원 정보를 확인해 주세요.');
  const rewarded = boolean(body.rewarded, '콕 수령 상태');
  if (!await sql(db, 'SELECT id FROM members WHERE id=? AND club_id=?', memberId, club).first()) missing();
  if (rewarded) {
    await sql(db, 'INSERT INTO rewards (year, half, member_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', year, half, memberId).run();
  } else {
    await sql(db, 'DELETE FROM rewards WHERE year=? AND half=? AND member_id=?', year, half, memberId).run();
  }
  return { rewarded };
}

// 변경 기록 summaries (worker/audit.mjs): names, dates and states only, never birthdays or PINs.
const slotWords = { early: '선발', late: '후발', no: '불참' };
const markWords = { direct: '직접', substitute: '대타', approved: '별도 승인' };
const guestWords = { pending: '신청', confirmed: '확정', arrived: '도착', cancelled: '취소' };
const eventWords = {
  title: '제목', date: '날짜', time: '시간', endTime: '시간', place: '장소', deadline: '투표 마감',
  earlyTime: '집합 시간', lateTime: '집합 시간', notes: '안내', kind: '종류'
};
const eventKindWords = { regular: '정기', flash: '번개', match: '대회', social: '모임' };

function eventLine(event) {
  return `${Number(event.date.slice(5, 7))}월 ${Number(event.date.slice(8, 10))}일 ${event.title}`;
}

async function eventLabel(db, club, id) {
  const event = await sql(db, 'SELECT date, title FROM events WHERE id = ? AND club_id = ?', id, club).first();
  return event ? eventLine(event) : '';
}

async function memberLabel(db, club, id) {
  return (await sql(db, 'SELECT name FROM members WHERE id = ? AND club_id = ?', id, club).first())?.name ?? '';
}

function eventChanges(body) {
  const words = [...new Set(Object.keys(body).map(key => eventWords[key]).filter(Boolean))];
  if (body.published !== undefined) words.push(body.published ? '공개' : '비공개');
  if (body.open !== undefined) words.push(body.open ? '투표 열기' : '투표 닫기');
  return words.join(', ');
}

async function routeAdmin(db, env, url, method, body, user) {
  const path = url.pathname;
  const club = env.CLUB_SCOPE;
  const record = (action, target, describe) => audit(db, club, organizerActor(user), action, target, describe);
  if (path === '/api/admin' && method === 'GET') return json({ ...await listAdmin(db, club), organizers: await listOrganizers(env) });
  // 운영진 초대 (PLATFORM.md 인증): an organiser issues, reissues or retires the others; their own PIN is 번호 바꾸기.
  if (path === '/api/admin/organizers' && method === 'POST') {
    const issued = await issueOrganizer(env, organizerName(body.name));
    await record('organizer.add', issued.id, () => issued.name);
    return json({ organizer: { id: issued.id, name: issued.name, mustChange: true }, temporaryPin: issued.pin }, 201);
  }
  const organizer = organizerPath.exec(path);
  if (organizer) {
    if (organizer[1] === user.id) throw new ApiError(409, '내 계정은 메뉴의 번호 바꾸기를 써 주세요.');
    if (method === 'POST' && organizer[2]) {
      const issued = await reissueOrganizer(env, organizer[1]);
      await record('organizer.reset', issued.id, () => issued.name);
      return json({ temporaryPin: issued.pin });
    }
    if (method === 'PATCH' && !organizer[2]) {
      if (body.active !== false) bad('운영진 상태를 확인해 주세요.');
      const retired = await retireOrganizer(env, organizer[1]);
      await record('organizer.remove', retired.id, () => retired.name);
      return json({ organizer: { id: retired.id, name: retired.name, active: false } });
    }
    methodNotAllowed();
  }
  if (path === '/api/admin/members' && method === 'POST') {
    const result = await addMember(env, body);
    await record('member.add', result.member.id, () => result.member.name);
    return json(result, 201);
  }
  if (path === '/api/admin/events' && method === 'POST') {
    const result = await addEvent(db, club, body);
    await record('event.add', result.event.id, () => eventLine(result.event));
    return json(result, 201);
  }
  if (path === '/api/admin/notices' && method === 'POST') {
    const result = await saveNotice(db, club, body);
    await record(body.id ? 'notice.update' : 'notice.add', result.notice.id,
      () => `${result.notice.title} · ${result.notice.published ? '공개' : '비공개'}`);
    return json(result, body.id ? 200 : 201);
  }
  const notice = noticePath.exec(path);
  if (notice) {
    if (method !== 'PATCH') methodNotAllowed();
    if (Object.keys(body).some(key => key !== 'pinned' && key !== 'replaceOldest')) bad('공지 수정은 공지 저장으로 해 주세요.');
    const result = await setPinned(db, club, 'notices', notice[1], body);
    await record('notice.pin', notice[1], async () => `${
      (await sql(db, 'SELECT title FROM notices WHERE id = ? AND club_id = ?', notice[1], club).first())?.title ?? ''} · ${
      result.pinnedAt ? '고정' : '고정 해제'}${result.released ? ` (${result.released.title} 고정 해제)` : ''}`);
    return json(result);
  }
  if (path === '/api/admin/rules') {
    if (method === 'GET') return json({ rules: await readRules(db, club) });
    if (method === 'PUT') {
      const result = await saveRules(db, club, body);
      const { periods, goal, kinds, reward, eventKinds: counted } = result.rules;
      await record('rules.update', club, () => `${periods === 1 ? '반기 통째로' : periods === 6 ? '매달' : `반기 ${periods}구간`} · 구간 ${goal}회 · ${
        kinds.map(kind => markWords[kind]).join('·')} · ${counted.map(kind => eventKindWords[kind]).join('·')} 일정 · 콕 수령 ${
        reward === 'goal' ? '목표 채우면 대상 표시' : '운영진이 직접'}`);
      return json(result);
    }
    methodNotAllowed();
  }
  if (path === '/api/admin/progress') {
    if (method === 'GET') {
      const { year, half } = parsePeriod(url.searchParams.get('year'), url.searchParams.get('half'));
      return json(await progress(db, club, year, half));
    }
    if (method === 'PUT') {
      const result = await setReward(db, club, body);
      await record('reward.set', body.memberId, async () =>
        `${Number(body.year)}년 ${Number(body.half)}반기 · ${await memberLabel(db, club, body.memberId)} · ${result.rewarded ? '수령' : '취소'}`);
      return json(result);
    }
  }
  const member = memberPath.exec(path);
  if (member) {
    if (method === 'PATCH' && !member[2]) {
      const result = await updateMember(env, member[1], body);
      const change = [body.name !== undefined && '이름', body.active !== undefined && (body.active ? '다시 활동' : '활동 중지')].filter(Boolean);
      await record('member.update', member[1], () => `${result.member.name}${change.length ? ' · ' + change.join(', ') : ''}`);
      return json(result);
    }
    if (method === 'POST' && member[2]) {
      const result = await resetMember(env, member[1]);
      await record('member.reset', member[1], () => memberLabel(db, club, member[1]));
      return json(result);
    }
    methodNotAllowed();
  }
  const event = eventPath.exec(path);
  if (!event) missing();
  const [, id, resource, memberId] = event;
  if (!resource && method === 'GET') return json(await eventDetails(db, club, id));
  if (!resource && method === 'PATCH' && body.cancelled !== undefined) {
    if (Object.keys(body).length !== 1) bad('일정 취소는 따로 저장해 주세요.');
    const result = await setCancelled(db, club, id, body);
    await record('event.cancel', id, () => `${eventLine(result.event)} · ${result.event.cancelled ? '취소' : '취소 풀기'}`);
    return json(result);
  }
  if (!resource && method === 'PATCH' && body.pinned !== undefined) {
    if (Object.keys(body).some(key => key !== 'pinned' && key !== 'replaceOldest')) bad('상단 고정은 따로 저장해 주세요.');
    const result = await setPinned(db, club, 'events', id, body);
    await record('event.pin', id, async () => `${await eventLabel(db, club, id)} · ${result.pinnedAt ? '고정' : '고정 해제'}${
      result.released ? ` (${result.released.title} 고정 해제)` : ''}`);
    return json(result);
  }
  if (!resource && method === 'PATCH') {
    const result = await updateEvent(db, club, id, body);
    await record('event.update', id, () => `${eventLine(result.event)} · ${eventChanges(body)}`);
    return json(result);
  }
  if (resource === 'attendance' && memberId && method === 'PUT') {
    const result = await setAttendance(db, club, id, memberId, body);
    const { present, recognition } = result.attendance;
    await record('attendance.set', memberId, async () => `${await eventLabel(db, club, id)} · ${await memberLabel(db, club, memberId)} · ${
      present === true ? '출석' : present === false ? '불참' : '미확인'}${recognition ? ` (${markWords[recognition]} 인정)` : ''}`);
    return json(result);
  }
  if (resource === 'votes' && memberId && method === 'PUT') {
    const result = await overrideVote(db, club, id, memberId, body);
    await record('vote.override', memberId, async () => `${await eventLabel(db, club, id)} · ${await memberLabel(db, club, memberId)} · ${
      result.vote ? `${slotWords[result.vote.slot]}${result.vote.lunch ? ', 점심' : ''}` : '응답 지움'}`);
    return json(result);
  }
  if (resource === 'guests' && !memberId && method === 'POST') {
    const result = await setGuest(db, club, id, body);
    await record(body.id ? 'guest.update' : 'guest.add', result.guest.id, async () => `${await eventLabel(db, club, id)} · ${
      result.guest.name} · ${guestWords[result.guest.status]}${result.guest.paid ? ', 납부' : ''}`);
    return json(result, body.id ? 200 : 201);
  }
  if (resource === 'settlement' && !memberId && method === 'PUT') {
    const result = await setSettlement(db, club, id, body);
    await record('settlement.save', id, async () => `${await eventLabel(db, club, id)} · ${result.settlement.confirmed ? '확정' : '확정 전 저장'}`);
    return json(result);
  }
  methodNotAllowed();
}

async function route(request, env) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new ApiError(403, '보안 연결로 다시 접속해 주세요.');
  }
  const { pathname: path } = url;
  const method = request.method;
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH'].includes(method)) methodNotAllowed();
  const adminRoute = path === '/api/admin' || path.startsWith('/api/admin/');
  const exposed = publicPath.exec(path);
  if (path === '/api/public' || exposed) {
    if (method !== 'GET' && method !== 'HEAD') methodNotAllowed();
    // Open without sign-in (사용자 결정, 2026-11-26); a signed-in person adds what fetchPublic keeps for members.
    // Organisers are members too (ROLES.md 1단계), so every session counts.
    const member = await readSession(request, env);
    const publicData = exposed
      ? await fetchPublic(env.DB, env.CLUB_SCOPE, exposed[1], exposed[2], Boolean(member))
      : await listPublic(env.DB, env.CLUB_SCOPE, member ? member.id : null);
    return json(publicData);
  }

  const body = method !== 'GET' && method !== 'HEAD' ? await readBody(request, url) : null;
  const authPath = adminRoute ? '/api/admin' : '/api';
  if (path === '/api/admin/login') missing();
  if (path === '/api/login') {
    if (method !== 'POST') methodNotAllowed();
    const session = await login(request, env, body);
    return json({ user: session.user }, 200, session.cookie);
  }
  // One session per person (ROLES.md): signing out of either screen signs out of both.
  if (path === authPath + '/logout') {
    if (method !== 'POST') methodNotAllowed();
    return json({ user: null }, 200, await logout(request, env));
  }

  const user = await readSession(request, env);
  if (path === authPath + '/session') {
    if (method !== 'GET') methodNotAllowed();
    // The 운영 화면 sees only someone with the 운영 권한; the member screens see everyone signed in.
    return json({ user: adminRoute ? (user?.organizer ? clientUser(user, 'admin') : null) : clientUser(user) });
  }
  if (path === '/api/pin' && method === 'POST') {
    const session = await changePin(request, env, requireUser(user), body);
    return json({ user: session.user }, 200, session.cookie);
  }
  if (adminRoute) {
    requireOrganizer(user);
    if (path === '/api/admin/pin') {
      if (method !== 'POST') methodNotAllowed();
      const session = await changePin(request, env, user, body, 'admin');
      await audit(env.DB, env.CLUB_SCOPE, organizerActor(user), 'organizer.pin', user.id, () => user.name);
      return json({ user: session.user }, 200, session.cookie);
    }
    // A temporary PIN from the console opens only the PIN change (PLATFORM.md 인증).
    if (user.mustChange) throw new ApiError(403, '먼저 임시 번호를 내 번호로 바꿔 주세요.');
    return routeAdmin(env.DB, env, url, method, body, user);
  }
  const vote = votePath.exec(path);
  if (vote) return json(await memberVote(env.DB, env.CLUB_SCOPE, method, vote[1], requireUser(user), body));
  missing();
}

export async function handleApi(request, env) {
  let response;
  try {
    response = await route(request, env);
  } catch (error) {
    // Avoid printing request bodies, credentials or database-specific errors.
    response = error instanceof ApiError ? json({ error: error.message }, error.status)
      : json({ error: '기록을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, 500);
  }
  return request.method === 'HEAD'
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}
