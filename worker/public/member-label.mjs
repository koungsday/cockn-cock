const genders = { '': '미기재', male: '남성', female: '여성', other: '기타' };

export function genderChoices() {
  return Object.entries(genders);
}

// 성별은 이름표 모양으로만 보인다(사용자 결정 2026-11-27, 색은 2026-11-28): 남성 회색 면·여성 진회색 테두리·기타 점선,
// 미기재는 이름만. 화면에는 이름만 있고, 읽기 프로그램은 이름 뒤에 성별을 듣는다(.sr-only).
export function memberNameTag(member, escape) {
  const gender = Object.hasOwn(genders, member.gender) ? member.gender : '';
  const label = gender ? `<span class="sr-only">, ${genders[gender]}</span>` : '';
  return `<strong class="member-label" data-gender="${gender}">${escape(member.name)}${label}</strong>`;
}
