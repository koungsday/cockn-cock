(function () {
  'use strict';

  const today = '2026-11-24';
  const storageKey = 'badminton-club-design-v1';
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  function addDays(date, days) {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
  }

  function dateLabel(date) {
    const day = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) return '';
    return `${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일 (${weekdays[day.getUTCDay()]})`;
  }

  function seed() {
    // Fictional people and events for the design preview.
    const memberNames = [
      '김서윤', '이정민', '박지혜', '최현우', '윤은정', '정수빈',
      '한미정', '조영수', '배지현', '신혜진', '오준호', '문정희',
      '장유진', '서민수', '임지연', '강명숙', '송은경', '권성호',
      '홍유나', '곽민준', '황정아', '안소영', '류유정', '유나영', '차선우'
    ];
    const members = memberNames.map((name, index) => ({
      id: `m${index + 1}`,
      name,
      role: index < 2 ? '운영진' : '회원',
      status: index === 24 ? 'inactive' : 'active',
      joined: index === 23 ? '2026-11-22' : addDays('2026-02-07', index * 9),
      notes: ''
    }));
    const roster = members.filter(member => member.status === 'active').map(member => member.id);
    const pastRoster = members.filter(member => member.joined <= '2026-10-31').map(member => member.id);
    const repeat = {
      enabled: true,
      weekday: 6,
      time: '19:00',
      endTime: '21:00',
      place: '한빛체육관 2코트',
      title: '토요 정기 운동',
      deadlineDays: 1
    };

    function regularEvent(id, date, memberIds) {
      return {
        id,
        title: repeat.title,
        date,
        time: repeat.time,
        endTime: repeat.endTime,
        place: repeat.place,
        deadline: addDays(date, -repeat.deadlineDays),
        notes: '실내 운동화와 라켓을 챙겨 주세요.',
        pollOpen: false,
        finalized: false,
        roster: [...memberIds],
        votes: {},
        attendance: {}
      };
    }

    const featured = regularEvent('e-nov28', '2026-11-28', roster);
    featured.pollOpen = true;
    featured.votes = Object.fromEntries(
      roster.slice(0, 20).map((id, index) => [id, index < 16 ? 'yes' : 'no'])
    );

    const pastMeetings = [
      ['e-nov21', '2026-11-21', 17, 7],
      ['e-nov14', '2026-11-14', 20, 17],
      ['e-nov07', '2026-11-07', 16, 3],
      ['e-oct31', '2026-10-31', 18, 12]
    ];
    const pastEvents = pastMeetings.map(([id, date, present, startAt]) => {
      const event = regularEvent(id, date, pastRoster);
      const attendance = pastRoster.map((memberId, index) => {
        const slot = (index + startAt) % pastRoster.length;
        return [memberId, slot < present ? 'present' : 'absent'];
      });
      event.finalized = true;
      event.attendance = Object.fromEntries(attendance);
      event.votes = Object.fromEntries(
        pastRoster.slice(0, -1).map((memberId, index) => {
          const slot = (index + startAt + 2) % pastRoster.length;
          return [memberId, slot < present ? 'yes' : 'no'];
        })
      );
      return event;
    });
    const practice = regularEvent('e-nov23', '2026-11-23', roster);
    practice.title = '월요 연습 모임';
    practice.attendance = Object.fromEntries(
      roster.slice(0, -2).map((id, index) => [id, index < 16 ? 'present' : 'absent'])
    );

    return {
      members,
      events: [featured, practice, ...pastEvents],
      notices: [
        {
          id: 'n-schedule',
          title: '11월 정기 운동 안내',
          body: '11월 정기 운동은 매주 토요일 오후 7시부터 9시까지 한빛체육관 2코트에서 진행합니다. 각 일정에서 참석 여부를 알려 주세요.',
          date: '2026-11-20',
          pinned: true
        },
        {
          id: 'n-shuttle',
          title: '셔틀콕 공동구매 신청',
          body: '다음 달에 사용할 셔틀콕을 함께 주문합니다. 구매를 원하시면 11월 28일 운동 전에 운영진에게 필요한 수량을 알려 주세요.',
          date: '2026-11-18',
          pinned: false
        },
        {
          id: 'n-entry',
          title: '체육관 입장 안내',
          body: '체육관에 들어오기 전에 실내 운동화로 갈아 신어 주세요. 운동이 끝난 뒤 사용한 코트를 함께 정리합니다.',
          date: '2026-11-15',
          pinned: false
        }
      ],
      repeat
    };
  }

  function load() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey));
      if (saved && Array.isArray(saved.events) && Array.isArray(saved.members) && Array.isArray(saved.notices) && saved.repeat) {
        return saved;
      }
    } catch {
      // The preview is still usable in memory when browser storage is unavailable.
    }
    return seed();
  }

  function save(state) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function summarize(roster, records, positive, negative) {
    const summary = { [positive]: 0, [negative]: 0, pending: 0, total: roster.length };
    for (const id of roster) {
      const status = records[id];
      if (status === positive || status === negative) {
        summary[status]++;
      } else {
        summary.pending++;
      }
    }
    return summary;
  }

  function counts(event) {
    return summarize(event.roster, event.votes, 'yes', 'no');
  }

  function attendanceCounts(event) {
    return summarize(event.roster, event.attendance, 'present', 'absent');
  }

  function rate(present, total) {
    return total ? Math.round(100 * present / total) : 0;
  }

  function stats(state, month) {
    const events = state.events
      .filter(event => event.finalized && (!month || event.date.slice(0, 7) === month))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byEvent = events.map(event => {
      const { present, total } = attendanceCounts(event);
      return { event, present, total, rate: rate(present, total) };
    });

    const byMember = state.members
      .map(member => {
        const memberEvents = events.filter(event => event.roster.includes(member.id));
        const present = memberEvents.filter(event => event.attendance[member.id] === 'present').length;
        const total = memberEvents.length;
        return { member, present, total, rate: rate(present, total) };
      })
      .filter(row => row.total > 0)
      .sort((a, b) => b.present - a.present || a.member.name.localeCompare(b.member.name, 'ko'));

    const present = byEvent.reduce((sum, event) => sum + event.present, 0);
    const total = byEvent.reduce((sum, event) => sum + event.total, 0);
    return { sessions: events.length, present, total, rate: rate(present, total), byEvent, byMember };
  }

  window.clubModel = { load, save, counts, attendanceCounts, stats, dateLabel, addDays, today, storageKey };
})();
