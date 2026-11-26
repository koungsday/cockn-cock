// Organiser accounts (PLATFORM.md 인증), issued by the 총괄 in the console or by another organiser of the same club.
// scope is a club's API env (DB, CLUB_SCOPE, CLUB_AUTH_PEPPER), as worker/scope.mjs makes it.
import { ApiError, currentSeconds, makeMemberCredential, matchingCredentials, membersNamed, sql, temporaryPin } from './auth.mjs';

export function organizerName(value) {
  const name = typeof value === 'string' ? value.trim().normalize('NFC') : '';
  if (!name || name.length > 60 || name.includes('\0')) throw new ApiError(400, '운영진 성함을 60자 이내로 입력해 주세요.');
  return name;
}

// A six-digit temporary PIN no member of the same name already signs in with (auth.mjs refuses such a pair).
async function temporaryFor(scope, name) {
  const members = await membersNamed(scope, name);
  for (let attempt = 0; attempt < 6; attempt++) {
    const pin = temporaryPin();
    if (!(await matchingCredentials(scope, members, pin, true)).length) return pin;
  }
  throw new ApiError(409, '임시 번호를 만들지 못했어요. 다시 시도해 주세요.');
}

export async function listOrganizers(scope) {
  const { results } = await sql(scope.DB, `
    SELECT id, name, must_change FROM organizers WHERE club_id = ? AND active = 1 ORDER BY created_at, name
  `, scope.CLUB_SCOPE).all();
  return results.map(row => ({ id: row.id, name: row.name, mustChange: Boolean(row.must_change) }));
}

export async function issueOrganizer(scope, name) {
  const pin = await temporaryFor(scope, name);
  const { hash, salt, version } = await makeMemberCredential(scope, pin);
  const id = crypto.randomUUID();
  const added = await sql(scope.DB, `
    INSERT INTO organizers (id, club_id, name, credential_salt, credential_hash, credential_version, must_change, created_at)
    SELECT ?, ?, ?, ?, ?, ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM organizers WHERE club_id = ? AND name = ? AND active = 1)
  `, id, scope.CLUB_SCOPE, name, salt, hash, version, currentSeconds(), scope.CLUB_SCOPE, name).run();
  if (!added.meta.changes) throw new ApiError(409, '같은 이름의 운영진이 이미 있어요. 번호 재발급을 써 주세요.');
  return { id, name, pin };
}

// A new temporary PIN; their sessions and PIN-change attempts end at once.
export async function reissueOrganizer(scope, id) {
  const row = await sql(scope.DB, 'SELECT name FROM organizers WHERE id = ? AND club_id = ? AND active = 1', id, scope.CLUB_SCOPE).first();
  if (!row) throw new ApiError(404, '운영진을 찾을 수 없어요.');
  const pin = await temporaryFor(scope, row.name);
  const { hash, salt, version } = await makeMemberCredential(scope, pin);
  const [updated] = await scope.DB.batch([
    sql(scope.DB, `UPDATE organizers SET credential_salt = ?, credential_hash = ?, credential_version = ?, must_change = 1
      WHERE id = ? AND club_id = ? AND active = 1`, salt, hash, version, id, scope.CLUB_SCOPE),
    sql(scope.DB, 'DELETE FROM sessions WHERE organizer_id = ?', id),
    sql(scope.DB, 'DELETE FROM attempts WHERE key = ?', 'pin-organizer:' + id)
  ]);
  if (!updated.meta.changes) throw new ApiError(409, '운영진 정보가 바뀌었어요. 목록을 다시 열어 주세요.');
  return { id, name: row.name, pin };
}

export async function retireOrganizer(scope, id) {
  const [removed, , row] = await scope.DB.batch([
    sql(scope.DB, 'UPDATE organizers SET active = 0 WHERE id = ? AND club_id = ? AND active = 1', id, scope.CLUB_SCOPE),
    sql(scope.DB, 'DELETE FROM sessions WHERE organizer_id = ?', id),
    sql(scope.DB, 'SELECT name FROM organizers WHERE id = ? AND club_id = ?', id, scope.CLUB_SCOPE)
  ]);
  if (!removed.meta.changes) throw new ApiError(404, '운영진을 찾을 수 없어요.');
  return { id, name: row.results[0]?.name ?? '' };
}
