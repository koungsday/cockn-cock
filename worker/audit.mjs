// 변경 기록 (PLATFORM.md): one row per change an organiser or the 총괄 makes. Writing it never undoes or blocks the
// change it describes: a failure goes to the Worker log and the saved record stays as saved.
export const actionLabels = {
  'club.create': '모임 만들기', 'club.suspend': '모임 정지', 'club.resume': '모임 다시 열기',
  'organizer.add': '운영진 추가', 'organizer.reset': '운영진 번호 재발급', 'organizer.remove': '운영진 해지',
  'organizer.pin': '운영진 번호 변경', 'organizer.adopt': '기존 운영진 계정 옮김',
  'member.add': '회원 등록', 'member.update': '회원 수정', 'member.reset': '회원 접속 재설정',
  'event.add': '회차 만들기', 'event.update': '회차 수정', 'vote.override': '대신 응답', 'attendance.set': '출석 기록',
  'guest.add': '게스트 추가', 'guest.update': '게스트 수정', 'settlement.save': '마무리',
  'notice.add': '공지 작성', 'notice.update': '공지 수정', 'reward.set': '콕 수령 기록',
};

export const consoleActor = { kind: 'console', id: null, name: '총괄' };
export const organizerActor = user => ({ kind: 'organizer', id: user.id, name: user.name });

// describe: a function returning the summary, so looking up names for it cannot fail the request either.
export async function audit(db, club, actor, action, targetId, describe = () => '') {
  try {
    const summary = String(await describe()).slice(0, 200);
    await db.prepare(`
      INSERT INTO audit_log (club_id, at, actor, actor_id, actor_name, action, target_id, summary)
      VALUES (?, unixepoch(), ?, ?, ?, ?, ?, ?)
    `).bind(club, actor.kind, actor.id, actor.name, action, targetId ?? '', summary).run();
  } catch (error) {
    console.error(`변경 기록을 남기지 못했어요: ${action} (${error?.message ?? error})`);
  }
}

const kst = seconds => new Date((seconds + 9 * 60 * 60) * 1000).toISOString();

// "11월 26일 15:26" in KST; the year only when it is not this year.
export function auditTime(seconds, now = Math.floor(Date.now() / 1000)) {
  const at = kst(seconds);
  const [year, month, day] = at.slice(0, 10).split('-').map(Number);
  return `${year === Number(kst(now).slice(0, 4)) ? '' : year + '년 '}${month}월 ${day}일 ${at.slice(11, 16)}`;
}
