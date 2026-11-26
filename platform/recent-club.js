// 소개 홈의 '최근 들어간 모임' (PLATFORM.md 주소): 이 기기에서 마지막으로 연 모임 화면 하나만 보여 준다.
// Worker가 모임 화면을 내줄 때 남긴 cockcockcock-recent 쿠키를 읽는다. 공개 모임 목록이 아니다.
(() => {
  const slot = document.getElementById('recent-club');
  const cookie = document.cookie.split('; ').find(part => part.startsWith('cockcockcock-recent='));
  if (!slot || !cookie) return;
  let recent;
  try {
    recent = new URLSearchParams(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)));
  } catch {
    return;
  }
  const slug = recent.get('s') ?? '';
  const name = (recent.get('n') ?? '').trim().slice(0, 60);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !name) return;
  const admin = recent.get('v') === 'admin';
  const link = slot.querySelector('a');
  link.href = `${slot.dataset.base}clubs/${slug}/${admin ? 'admin/' : ''}`;
  link.textContent = admin ? `${name} 운영 화면` : name;
  slot.hidden = false;
})();
