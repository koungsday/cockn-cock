const genders = { '': '미기재', male: '남성', female: '여성', other: '기타' };

export function genderChoices() {
  return Object.entries(genders);
}

export function memberNameTag(member, escape) {
  const gender = Object.hasOwn(genders, member.gender) ? member.gender : '';
  const label = gender ? ` <span class="member-label-category">${genders[gender]}</span>` : '';
  return `<strong class="member-label" data-gender="${gender}">${escape(member.name)}${label}</strong>`;
}
