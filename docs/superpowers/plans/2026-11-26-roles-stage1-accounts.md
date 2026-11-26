# ROLES.md 1단계: 계정 합치기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영진을 "회원 + 운영 권한"으로 합치고, 로그인 세션을 사람당 하나로 만들고, 운영 API는 그 권한으로 검사한다. 화면은 지금 두 페이지(회원 홈·운영 화면) 그대로 둔다.

**Architecture:** `members.organizer`(0/1) 칸을 더하고, 0010 마이그레이션이 활동 중인 운영진 행을 같은 id의 회원 행으로 옮긴다. 세션은 회원 쿠키 하나(`<모임>-member`)만 쓰고, 운영 권한은 요청마다 회원 행에서 읽는다. 운영진 발급·재발급·해지(`worker/organizers.mjs`)와 콘솔은 회원 표를 쓴다.

**Tech Stack:** Cloudflare Worker(ES 모듈), D1(SQLite), 테스트는 `node --test` + `node:sqlite` 메모리 DB(`npm run live:test`).

---

## 설계 다듬기 (ROLES.md 대비)

| ROLES.md | 이 계획 | 이유 |
| --- | --- | --- |
| 같은 이름 회원이 한 명이면 그 회원에게 권한을 켠다 | **자동으로 합치지 않는다.** 운영진마다 회원 행을 새로 만든다(id·번호 그대로) | 동명이인을 잘못 합치면 다른 사람의 기록과 로그인을 가져간다. 운영 DB는 같은 이름 짝이 0건(2026-11-26 읽기 전용 실측)이라 지금 결과는 같다 |
| 기존 회원에게 권한 켜기 | 2단계(화면)에서 회원 관리의 "운영 권한" 켜기로 | 1단계는 화면을 바꾸지 않는다 |

## 동작 규칙

- **로그인** `POST /api/login {name, credential, as}`: 활동 회원 중 성함·번호가 맞는 사람이 정확히 한 명이면 세션을 만든다. `as`는 화면이 보낸 페이지(`'admin'`·`'member'`). 응답 `user.role`은 `as === 'admin'`이고 운영 권한이 있으면 `'admin'`, 아니면 `'member'`.
- **세션 수명:** 운영 권한이 있으면 30일(지금 운영진과 같음), 없으면 12시간(지금 회원과 같음).
- **`GET /api/session`:** 로그인했으면 `role: 'member'`(운영진도 회원 화면을 쓴다).
- **`GET /api/admin/session`:** 운영 권한이 있으면 `role: 'admin'`, 없으면 `user: null`.
- **운영 API(`/api/admin/*`):** 운영 권한이 없으면 403. `must_change`면 `/api/admin/pin`만 열린다(지금과 같은 문).
- **번호 바꾸기:** `/api/pin`과 `/api/admin/pin` 둘 다 회원 번호(`changePin`)를 바꾼다.
- **로그아웃:** `/api/logout`·`/api/admin/logout` 둘 다 같은 세션을 지운다.
- **운영진 추가(운영 화면·콘솔):** 운영 권한을 켠 회원 행을 새로 만들고 임시 번호를 한 번 보여 준다. 같은 이름의 **운영 권한 회원**이 있으면 409(지금과 같은 뜻).
- **재발급:** 그 운영 권한 회원의 번호를 임시 번호로, 세션·번호 시도 기록을 지운다.
- **해지:** 운영 권한만 끈다(회원 행은 남는다). 세션을 지운다.
- **옛 비밀값 운영진(`CLUB_ADMIN_ID`/`PIN`):** 그 성함의 회원 행이 하나도 없을 때만, 그 번호로 로그인하면 운영 권한 회원 행을 만든다(지금 `organizers`에 만들던 것).
- **겹침 규칙:** `organizerUses`(운영진과 회원의 이름·번호 겹침 검사)는 운영진이 회원 표로 들어오면서 회원끼리의 겹침 검사와 같아지므로 지운다.

## 파일 지도

| 파일 | 하는 일 |
| --- | --- |
| `worker/migrations/0010_member_organizers.sql` (새) | `members.organizer`, 운영진 → 회원 행, 열린 일정 명단, 옛 운영 세션 지우기 |
| `worker/auth.mjs` | 세션 하나, 로그인, 번호 바꾸기, 옛 비밀값 운영진 |
| `worker/organizers.mjs` | 운영진 목록·발급·재발급·해지를 회원 표로 |
| `worker/api.mjs` | 경로별 권한 검사, 회원 추가·재설정의 겹침 검사 정리 |
| `worker/console.mjs` | 모임 만들기의 첫 운영진, 콘솔 운영진 목록·해지 확인을 회원 표로 |
| `worker/public/app.mjs` | 로그인 요청에 `as: authRole` 한 줄 |
| `worker/*.test.mjs` | 아래 테스트 |
| `PLATFORM.md`, `ROLES.md` | 인증 절·1단계 결과 |

## Task 1: 마이그레이션 0010

**Files:** Create `worker/migrations/0010_member_organizers.sql`, Modify `worker/migrations.test.mjs`

- [ ] **Step 1: 실패하는 테스트** — `migrations.test.mjs`에 0009까지 적용한 DB에 운영진 2명(활동 1, 해지 1), 운영 세션 1개, 회원 세션 1개, 마감 전 일정 1개를 넣고 0010을 적용한 뒤:
  - 활동 운영진 id로 회원 행이 생기고 `organizer = 1`, 번호 칸 네 개(`credential_salt/hash/version`, `must_change`)가 운영진 행과 같다.
  - 해지한 운영진은 회원 행이 생기지 않는다.
  - 운영 세션은 없고 회원 세션은 남는다.
  - 새 회원 행이 마감 전 일정 명단(`roster`)에 있다.
- [ ] **Step 2: 실패 확인** — `node --test worker/migrations.test.mjs` → FAIL(0010 없음)
- [ ] **Step 3: 마이그레이션**

```sql
-- ROLES.md 1단계: 운영진 = 회원 + 운영 권한. 사람마다 계정 하나, 세션 하나.
ALTER TABLE members ADD COLUMN organizer INTEGER NOT NULL DEFAULT 0 CHECK (organizer IN (0, 1));

-- 활동 중인 운영진마다 같은 id의 회원 행을 만든다. 번호는 그대로 옮겨 지금 번호로 계속 로그인한다(ROLES.md 결정 6).
-- 같은 이름의 회원과 자동으로 합치지 않는다(동명이인). 운영진 표는 되돌릴 길로 한 단계 더 둔다.
INSERT INTO members (id, club_id, name, active, credential_salt, credential_hash, credential_version, must_change, organizer)
  SELECT id, club_id, name, 1, credential_salt, credential_hash, credential_version, must_change, 1
  FROM organizers WHERE active = 1;

-- 회원 추가와 같이, 마무리 전이고 마감 전인 일정 명단에 넣는다.
INSERT INTO roster (event_id, member_id)
  SELECT e.id, o.id FROM organizers o JOIN events e ON e.club_id = o.club_id
  WHERE o.active = 1 AND e.deadline_at > unixepoch()
    AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.event_id = e.id AND s.confirmed = 1)
  ON CONFLICT (event_id, member_id) DO NOTHING;

-- 운영 세션은 운영진 id를 가리킨다. 지우고 한 번 다시 로그인하게 한다.
DELETE FROM sessions WHERE role = 'admin';
```

- [ ] **Step 4: 통과 확인** — `node --test worker/migrations.test.mjs` → PASS
- [ ] **Step 5: 커밋**

## Task 2: 세션 하나 (auth.mjs)

**Files:** Modify `worker/auth.mjs`, Test `worker/api.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
  - 운영 권한 회원이 `as: 'admin'`으로 로그인 → `role: 'admin'`, 쿠키는 `<모임>-member` 하나, `Max-Age=2592000`.
  - 같은 사람이 `as: 'member'`로 로그인 → `role: 'member'`, 같은 쿠키. 그 쿠키로 `/api/public`(회원 홈)과 `/api/admin`(운영) 둘 다 200.
  - 권한 없는 회원 쿠키로 `/api/admin` → 403, `/api/admin/session` → `user: null`.
  - 권한을 끈 뒤(해지) 같은 쿠키의 다음 운영 요청 → 401(세션 삭제).
  - `must_change` 운영 권한 회원: `/api/admin` 403, `/api/admin/pin` 200, 바꾼 뒤 200.
- [ ] **Step 2: 실패 확인** — `npm run live:test` → 위 테스트 FAIL
- [ ] **Step 3: 구현** — `readSession(request, env)`가 회원 쿠키만 읽고 `{ id, name, organizer, mustChange, tokenHash, version }`를 돌려준다. `sessionInsert`는 `role = 'member'` 행만 만들고 수명은 `organizer`로 정한다. `sessionCookie`는 회원 쿠키 이름 하나, `Max-Age`는 운영 권한일 때만. `login`은 회원 표만 보고(`organizersNamed`·`matchingOrganizers`·`organizerUses` 삭제), 운영 권한 후보가 있으면 지금의 "운영 번호 전체 한도 20"을 그대로 건다. `changeOrganizerPin` 삭제, `changePin`이 둘을 맡는다. 옛 비밀값 운영진은 `adoptLegacyAdmin`이 회원 행(`organizer = 1`, `must_change = 0`)을 만든다.
- [ ] **Step 4: 통과 확인** — `npm run live:test` → PASS
- [ ] **Step 5: 커밋**

## Task 3: 경로 권한 (api.mjs)

**Files:** Modify `worker/api.mjs`, Test `worker/api.test.mjs`, `worker/tenancy.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
  - 다른 모임의 운영 권한 회원 쿠키로 이 모임 `/api/admin` → 401(세션은 모임마다).
  - 운영진이 회원 투표 `PUT /api/votes/<id>` → 200(운영진도 투표한다).
  - 회원 추가: 같은 이름·같은 생년월일의 운영 권한 회원이 있으면 409(회원끼리 겹침 규칙으로).
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — `route()`에서 세션을 한 번 읽는다. `requireUser(user)`(로그인만)와 `requireOrganizer(user)`(운영 권한)로 나눈다. `/api/session`·`/api/admin/session` 응답은 "동작 규칙"대로. 운영 경로의 `must_change` 문은 그대로. `addMember`·`resetMember`의 `organizerUses` 호출을 지운다(운영진이 회원 표에 있어 `membersNamed` 겹침 검사가 맡는다). `/api/admin` 응답의 `organizers`는 `listOrganizers`(Task 4)가 회원 표에서 읽는다.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋**

## Task 4: 운영진 발급을 회원 표로 (organizers.mjs, console.mjs)

**Files:** Modify `worker/organizers.mjs`, `worker/console.mjs`, Test `worker/console.test.mjs`, `worker/api.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
  - 운영 화면 운영진 추가 → 회원 표에 `organizer = 1`, `must_change = 1` 행, 임시 번호로 `as: 'admin'` 로그인 → `mustChange: true`.
  - 같은 이름 운영 권한 회원이 있으면 409. 같은 이름의 **권한 없는** 회원이 있어도 추가된다(동명이인, 번호가 다르다).
  - 재발급 → 그 사람 세션 끊김, 새 임시 번호로 로그인.
  - 해지 → `organizer = 0`, 세션 끊김, 같은 번호로 `as: 'member'` 로그인은 된다.
  - 콘솔 모임 만들기 → 첫 운영진이 회원 표에 운영 권한으로 생긴다. 콘솔 목록·해지 확인 화면이 그 사람을 보여 준다.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**
  - `listOrganizers`: `SELECT id, name, must_change FROM members WHERE club_id = ? AND active = 1 AND organizer = 1 ORDER BY name, id`.
  - `issueOrganizer`: 임시 번호로 `members`에 `organizer = 1, must_change = 1` 행을 넣되 같은 이름 운영 권한 회원이 있으면 넣지 않음(409). 같은 배치에서 열린 일정 명단 넣기(Task 1과 같은 조건).
  - `reissueOrganizer`: `UPDATE members SET credential_* = …, must_change = 1 WHERE id = ? AND club_id = ? AND active = 1 AND organizer = 1`, `DELETE FROM sessions WHERE member_id = ? AND club_id = ?`, 번호 시도 기록 `pin-member:<id>` 지우기.
  - `retireOrganizer`: `UPDATE members SET organizer = 0 WHERE id = ? AND club_id = ? AND organizer = 1`, 세션 지우기.
  - `console.mjs`: 모임 만들기의 `INSERT INTO organizers`를 `INSERT INTO members (…, must_change, organizer) VALUES (…, 1, 1)`로, 콘솔 목록 `SELECT … FROM organizers`를 `SELECT id, club_id, name, active, must_change FROM members WHERE organizer = 1`로, 해지 확인의 이름 조회를 회원 표로.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋**

## Task 5: 화면 한 줄 (app.mjs)

**Files:** Modify `worker/public/app.mjs:891-893`

- [ ] **Step 1:** 로그인 요청 본문에 `as: authRole`을 더한다.
- [ ] **Step 2:** 로컬 실사용(휴대폰 375px 터치)에서 확인
  - 운영 권한 회원: 운영 화면 로그인 → 운영 홈. 카톡 투표 링크(회원 페이지)에서 로그인 → 그 투표 화면에 머물고 응답 저장.
  - 권한 없는 회원: 운영 화면에서 로그인 → 회원 홈으로 넘어감(지금과 같음).
  - 운영 권한 회원이 회원 홈을 열면 회원 홈이 보인다(지금은 운영 화면으로 넘어갔다).
- [ ] **Step 3:** 커밋

## Task 6: 문서와 배포

- [ ] PLATFORM.md 인증 절: 운영진 = 회원 + 운영 권한, 세션 하나, 겹침 규칙 삭제. ROLES.md 1단계 결과.
- [ ] `npm run live:test`·`build`·`verify`·`live:build` 통과, PR, 검사 통과 확인.
- [ ] **운영 D1에 0010을 먼저 적용**(배포 스크립트가 남은 마이그레이션이 있으면 멈춘다): `npx wrangler d1 migrations apply cockcockcock --remote --config worker/wrangler.jsonc`.
  - 적용 뒤에도 옛 코드는 운영진 표로 로그인한다(0010은 운영진 표를 지우지 않는다). 운영 세션만 지워져 한 번 다시 로그인한다.
  - 적용과 배포 사이에 옛 코드로 새 운영진을 추가하면 회원 표에 없다. 그 틈을 줄이려고 적용 → 머지 → `npm run deploy`를 이어서 한다.
- [ ] 머지 → `npm run deploy` → 운영 확인(읽기 전용): 회원 행 `organizer = 1` 1건, 운영 세션 0건, `live:verify`.
- [ ] 사용자에게: 운영진은 배포 뒤 **한 번 다시 로그인**한다.

## 되돌리기

- 코드: GitHub Revert + `npx wrangler rollback`.
- 데이터: 0010은 행을 지우지 않는다(운영진 표 그대로). 옛 코드로 돌아가면 운영진은 운영진 표로 다시 로그인하고, 0010이 만든 회원 행은 회원 명단에 남는다(필요하면 비활성으로).
