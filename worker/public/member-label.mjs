const genders = { '': '미기재', male: '남성', female: '여성', other: '기타' };

export function genderChoices() {
  return Object.entries(genders);
}

// 성별은 알약 색으로만 보인다(사용자 결정 2026-11-27): 남성 파랑·여성 분홍·기타 라벤더, 미기재 회색. 화면에는 이름만
// 있고, 읽기 프로그램은 이름 뒤에 성별을 듣는다(.sr-only).
export function memberNameTag(member, escape) {
  const gender = Object.hasOwn(genders, member.gender) ? member.gender : '';
  const label = gender ? `<span class="sr-only">, ${genders[gender]}</span>` : '';
  return `<strong class="member-label" data-gender="${gender}">${escape(member.name)}${label}</strong>`;
}
