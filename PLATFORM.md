# 콕콕콕! 플랫폼 구조 — 총괄 관리자가 모임을 발급한다

이 문서는 모임을 늘리는 방식의 정본이다. 화면 값은 [DESIGN.md](DESIGN.md), 운영 절차는 [OPERATIONS.md](OPERATIONS.md)를 따른다.

## 결정

- **총괄 관리자(플랫폼 운영자 1인)가 모임마다 주소와 운영진 권한을 발급한다.** 공개 소개 홈에는 등록 모임 목록을 두지 않는다. (사용자 결정, 2026-11-26)
- **데이터는 D1 하나에 모은다.** 모임을 만들 때 코드 수정·D1 생성·배포가 필요 없게 한다. (사용자 승인, 2026-11-26)
- 참고한 구현: 사용자의 `ev-vw-k.com`(아파트 전기차 충전). `SUPER`·`SITE_ADMIN` 2단계 역할, 사이트별 관리자 계정, `admin_logs` 변경 기록, 주소가 바뀌어도 QR을 유지하는 `/go/[siteId]` 입구. `ston`은 브랜드 모노레포이고 서비스별 서브도메인 계획만 있다.

## 지금 구조

| 항목 | 지금 | 근거 |
| --- | --- | --- |
| 모임 등록 | `platform/clubs.mjs` 배열(썬콕19 하나) + 모임별 비밀값 3개(운영진 ID·번호, 인증 pepper) + D1 `clubs` 행 + 배포. 데이터는 모든 모임이 D1 하나를 함께 쓴다(2단계) | `platform/clubs.mjs`, `worker/index.mjs` `scopeEnv`, `worker/migrations/0003_one_database.sql` |
| 운영진 | 모임마다 환경 변수 계정 1개. 세션 이름은 '운영진' 고정 | `worker/auth.mjs` `adminSettings` |
| 총괄 화면 | `/console/` 로그인 + 모임별 숫자(활동 회원·운영진 계정·최근/다음 회차)와 설정 상태. 모임 만들기·초대는 아직 없다(5단계). 변경 기록은 4단계 | `worker/console.mjs` |
| 운영 D1 | `cockcockcock`(2026-11-26 전환). 옛 `suncok19`(표 12개, 160kB)는 2026-12-26까지 보관한 뒤 백업 파일과 함께 지운다 | `wrangler d1 info`, 아래 이전 기록 |
| 쿠키 | 모임 슬러그 + 역할(`__Host-suncok19-member` 등), `Path=/` | `worker/auth.mjs` `cookieName` |

## 역할

| 역할 | 누구 | 할 수 있는 일 | 하지 않는 일 |
| --- | --- | --- | --- |
| 총괄 | 플랫폼 운영자 1인 | 모임 만들기·정지, 운영진 초대·해지·임시 번호 재발급, 변경 기록 보기 | 회원 명단·응답·출석을 열람하지 않는다. 모임별 숫자(회원 수, 운영진 수, 최근 회차 날짜)만 본다 |
| 모임 운영진 | 모임마다 여러 명, 사람마다 계정 | 지금의 운영 화면 전부 | 다른 모임 접근 |
| 회원 | 모임 회원 | 지금과 같다 | — |

EV 앱에서 가져오지 않는 것:
- 모임을 만들 때 고정 번호 시험 계정을 자동으로 만드는 것. EV `createSite`는 `PIN 0000` 계정을 돌려준다.
- 운영진 비밀번호를 초대한 사람이 정하는 것. 콕콕콕은 임시 번호를 한 번 보여 주고 첫 로그인 때 본인이 바꾼다. 지금의 회원 접속 재설정과 같은 방식이다.
- 기능 권한 토글 12개. 필요해질 때 넣는다.
- 모임 삭제. 되돌릴 수 없으니 정지만 둔다.

## 주소

| 주소 | 화면 | 공개 |
| --- | --- | --- |
| `/` | 소개 홈. 모임 목록 없음. 이 기기에서 마지막으로 들어간 모임 하나만 '최근 모임'으로 보인다 | 공개, 60초 캐시 |
| `/clubs/<모임>/` · `/clubs/<모임>/admin/` | 회원·운영진 화면 (그대로) | 로그인 |
| `/console/` | 총괄 콘솔 | 공개 화면에서 링크하지 않음, `noindex` |
| `/go/<모임>` | 영구 입구. 지금 모임 주소로 넘긴다. 도메인이 바뀌어도 단체방 링크·홈 화면 앱이 유지된다 | 공개 |

'최근 모임'은 Worker가 모임 화면을 내줄 때 남기는 쿠키 `cockcockcock-recent`(모임 슬러그·이름·화면 종류, 180일)를 소개 홈 스크립트가 읽어 보여 준다. 개인정보는 없고, 공개 목록도 아니다.

도메인: 지금은 `cockcockcock.pages.dev`를 유지한다. 모임별 서브도메인은 사용할 도메인을 정하고 Cloudflare에 연결한 뒤 `club_hosts`(호스트 → 모임)로 붙인다. 연결 방식과 비용은 아직 확인하지 않았다.

## 데이터 (D1 하나)

- **모임 id는 슬러그다.** 쿠키 이름·공유 링크·운영진 앱 시작 주소가 이미 슬러그를 쓰므로 바꾸지 않는다. 서버는 URL의 모임을 `CLUB_SCOPE`로 넘기고, 모든 조회와 저장을 그 모임으로 한정한다.
- **플랫폼 표**: `clubs`는 2단계에서 id만 둔다. 이름·부제·요일·기본 장소·상태·pepper 출처·만든 시각은 5단계에서 `platform/clubs.mjs`에서 옮겨 온다. 총괄 로그인 세션은 `console_sessions`(3단계)에 둔다. `organizers`(모임, 성함, 번호 해시, 임시 번호 여부, 활동 여부)와 `audit_log`는 4단계, `club_hosts`는 6단계에 만든다.
- **모임 표**: 뿌리 표 `members`·`sessions`·`events`·`notices`에 `club_id`(기본값 없음, `clubs` 외래키)를 넣는다. 빠뜨리면 저장이 실패한다. 하위 표 `roster`·`votes`·`attendance`·`guests`·`settlements`는 회차 id로, `rewards`는 회원 id로만 닿는다. 회차·회원·공지·게스트 id는 무작위 UUID라 모임 사이에 겹치지 않는다.
- **규칙**: 서버의 목록 조회는 모두 `club_id` 조건을 붙인다. id 조회는 `(id, club_id)`를 함께 확인한다. 하위 표는 뿌리 표와 이어서 확인한다(예: 출석·대신 응답은 회차의 `club_id`까지 본다). `worker/tenancy.test.mjs`가 두 모임을 한 DB에 두고, 다른 모임의 회원·회차·공지·출석·응답·게스트·마무리·콕 수령을 id로 읽거나 바꾸면 404인지 확인한다.
- **유일성**: 이름 중복 검사는 같은 모임 안에서만 한다. 다른 모임에 같은 이름·생년월일 회원이 있어도 등록과 번호 변경이 된다. `members.code_hash`는 읽는 곳이 없어 0003에서 뺐다. 인덱스는 `(club_id, …)`로 시작한다.
- **인증 pepper**: 2단계는 모임별 비밀값(`CLUB_AUTH_PEPPER`)을 그대로 쓴다. 회원 번호와 로그인 세션이 이전 뒤에도 유지된다. 5단계에서 새 모임을 만들 때는 플랫폼 비밀값 `PLATFORM_AUTH_PEPPER`에서 모임 id로 파생한다(HMAC). 썬콕19는 기존 값을 계속 쓴다(`clubs.pepper_binding`).

## 인증

- 회원: 그대로(성함 + 6자리).
- 모임 운영진: 같은 로그인 화면에서 성함 + 6자리로 들어오고, `organizers` 표에서 확인한다.
  - 지금의 환경 변수 운영진(`CLUB_ADMIN_ID`·`CLUB_ADMIN_PIN`)은 이전할 때 첫 운영진 한 명으로 옮긴다.
  - 초대는 총괄이나 기존 운영진이 임시 번호를 받아 개인 메시지로 전달하고, 받은 사람이 첫 로그인 때 바꾼다.
- 총괄: `/console/` 전용 로그인이다(3단계, `worker/console.mjs`). 모임 로그인과 화면·쿠키·세션 표가 모두 따로다.
  - 아이디는 `PLATFORM_ADMIN_ID`, 비밀번호는 원문 대신 PBKDF2 값만 `PLATFORM_ADMIN_PASSWORD_HASH`에 둔다(둘 다 Worker 비밀값).
  - 설정은 원래 폴더 터미널에서 `npm run console:password`를 실행하고 아이디와 12자 이상 비밀번호를 입력한다. 입력한 글자는 보이지 않고, 비밀번호는 파일이나 명령 인자에 남지 않는다. 바꾸면 모든 총괄 로그인이 끊긴다.
  - 시도 제한: 한 곳에서 10번, 전체 20번 틀리면 15분 잠긴다(운영 번호와 같은 방식).
  - 쿠키는 `__Host-console`(`SameSite=Strict`, 12시간)이고, 로그아웃하면 서버 세션도 지운다.
  - 폼 제출만 쓰고 스크립트는 없다. 다른 출처의 제출은 거절한다. 이 때문에 총괄 화면만 `Referrer-Policy: same-origin`이다. `no-referrer` 페이지의 폼 제출은 Origin이 `null`로 와서 정상 제출까지 막혔다(Chromium에서 확인).

## 변경 기록 (`audit_log`)

- 남기는 일:
  - 모임: 만들기·정지
  - 운영진: 초대·해지·번호 재발급
  - 회원: 등록·수정·비활성·접속 재설정
  - 회차: 만들기·수정·공개·투표 열고 닫기
  - 출석과 응답: 운영진 대신 응답, 출석 변경, 마무리 확정·해제, 콕 수령 기록
- 형식: 누가(운영진 id·성함 또는 총괄), 어느 모임, 무엇, 대상 id, 짧은 상세, 시각. 생년월일·번호·연락처는 남기지 않는다.
- 기록이 실패해도 본래 저장은 그대로 둔다. 실패는 Worker 로그에 남긴다.

## 단계

| 단계 | 내용 | DB 변경 | 상태 |
| --- | --- | --- | --- |
| 1 | 소개 홈에서 등록 모임 목록을 빼고 '최근 모임'을 둔다 | 없음 | 완료(#16) |
| 2 | D1 하나로 전환. 동작은 그대로 두고 저장 위치만 바꾼다 | 새 D1 `cockcockcock` + 썬콕19 데이터 이전(`0003_one_database.sql`) | 완료(#17, 2026-11-26) |
| 3 | 총괄 로그인 + 모임 숫자 목록(`/console/`) | `console_sessions`(`0004_console_sessions.sql`) | 진행 |
| 4 | 운영진 개인 계정 + 변경 기록 | `organizers`, `audit_log` | 대기 |
| 5 | 콘솔에서 모임 만들기·운영진 초대·정지·기록 보기 | `clubs` 열 추가 | 대기 |
| 6 | `/go/` 입구, 도메인 연결 | `club_hosts` | 도메인 결정 뒤 |

순서를 바꿨다(2026-11-26, 사용자 승인). 총괄이 "모임을 발급한다"를 먼저 손에 잡히게 하려고, 총괄 로그인과 모임 목록을 운영진 계정보다 앞에 둔다.

### 2단계 운영 데이터 이전

**실행 직전에 사용자 확인을 받는다.** PR은 이전과 함께 머지한다. 먼저 머지하면 다른 배포가 막힌다(`npm run deploy`는 운영 D1에 적용하지 않은 마이그레이션이 있으면 멈춘다).

변환은 마이그레이션 `0003_one_database.sql` 하나다. 옛 DB를 통째로 복사한 새 DB에 이것을 적용한다. 옛 DB는 건드리지 않는다.
- `worker/migrations.test.mjs`: 모든 표에 행을 넣은 옛 구조에 0003을 적용해, 행·rowid가 그대로이고 외래키 위반이 없는지 확인한다.
- 같은 순서를 로컬 D1 두 개로 연습했다(2026-11-26). 내보낸 파일에 마이그레이션 기록이 들어 있어 새 DB에서는 0003만 적용 대기로 남았다. 표 11개의 행 수가 같았고 공지·게스트 순서도 유지됐다.
- 운영 이전 기록(2026-11-26 14:37–14:50 KST)
  - 옛 DB: 회원 1, 세션 3, 나머지 표 0행이었다. 회차·투표가 없어 단체방 공지 없이 진행했다.
  - 진행 순서: 배포 잠금 → 내보내기(`~/cockcockcock-backup`, 권한 700) → `cockcockcock` 생성 → 넣기 → 0003 적용.
  - 결과: 표 11개 행 수 같음, `club_id` 모두 `suncok19`, 외래키 위반 0. 이어서 #17 머지와 `npm run deploy`를 했다.
  - 운영 주소 확인: 가상 이름 로그인이 401이었고, 새 DB의 시도 기록이 늘었다.
  - 원래 폴더와 작업 폴더들의 `worker/wrangler.production.local.json`을 모두 새 DB로 바꿨다. 옛 설정은 백업 폴더에 있다.
- 겪은 함정: 운영 설정의 `migrations_dir`는 그 설정 파일이 있는 체크아웃 기준이다. 0003이 없는 원래 폴더(`main`)의 설정으로 확인하면 "No migrations to apply"로 보였다. 0003이 있는 작업 폴더의 설정으로 적용했다.

1. 쓰기가 적은 시간을 정해 단체방에 알린다. 내보내는 동안 옛 DB 요청이 막히고, 내보낸 뒤 이전이 끝날 때까지 들어온 저장은 새 DB에 없다.
2. 옛 DB를 내보내고 행 수를 적는다. 운영 설정은 아직 `suncok19`를 가리킨다. 내보낸 파일에는 회원 성함과 인증 검증값이 있으니 저장소 밖 권한 제한 폴더에 두고, 옛 DB와 함께 30일 뒤 지운다.
3. 새 DB를 만들고(`npx wrangler d1 create cockcockcock --location apac`), 운영 설정 `worker/wrangler.production.local.json`의 `database_name`·`database_id`를 새 값으로 바꾼다.
4. 새 DB에 내보낸 파일을 넣는다. 적용 대기가 `0003_one_database.sql` 하나인지 확인하고 적용한다.
5. 새 DB의 행 수를 2번과 비교한다. 표 11개가 모두 같아야 한다.
6. `npm run deploy`로 배포한다.
7. 실제 주소에서 회원 로그인·투표, 운영 홈·출석을 확인한다.

```sh
P=worker/wrangler.production.local.json
COUNTS="SELECT (SELECT COUNT(*) FROM members) AS members, (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM attempts) AS attempts, (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM roster) AS roster, (SELECT COUNT(*) FROM votes) AS votes, (SELECT COUNT(*) FROM attendance) AS attendance, (SELECT COUNT(*) FROM guests) AS guests, (SELECT COUNT(*) FROM settlements) AS settlements, (SELECT COUNT(*) FROM notices) AS notices, (SELECT COUNT(*) FROM rewards) AS rewards"
npx wrangler d1 export DB --remote --config $P --output <백업 폴더>/suncok19.sql   # 2
npx wrangler d1 execute DB --remote --config $P --json --command "$COUNTS"       # 2
npx wrangler d1 execute DB --remote --config $P --file <백업 폴더>/suncok19.sql  # 4 (설정을 새 DB로 바꾼 뒤)
npx wrangler d1 migrations list DB --remote --config $P                           # 4
npx wrangler d1 migrations apply DB --remote --config $P                          # 4
npx wrangler d1 execute DB --remote --config $P --json --command "$COUNTS"       # 5
```

D1은 `UNION ALL`을 길게 잇는 질의를 거절한다("too many terms in compound SELECT"). 그래서 행 수는 한 줄 질의로 센다.

되돌리기는 두 가지를 함께 한다.
- `npx wrangler rollback --config worker/wrangler.production.local.json`: 이전 Worker 버전과 옛 DB 연결로 돌아간다.
- 운영 설정의 `database_name`·`database_id`도 `suncok19`로 되돌린다. 그대로 두면 다음 배포가 옛 코드를 새 구조에 올린다.

전환 뒤 새로 쓴 기록은 옛 DB에 없으니, 되돌리면 그 기록은 사라진다.

## 정할 것

- 사용할 도메인과 모임별 서브도메인 여부
- 새 모임 도입 문의를 받을 연락 방법(소개 홈에 둘 것)
- 변경 기록 보관 기간
