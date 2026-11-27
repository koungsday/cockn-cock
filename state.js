(function () {
  'use strict';

  const today = '2026-11-24';
  const demoNow = `${today}T12:00`;
  const storageKey = 'badminton-club-design-v1';
  const flowExamples = ['e-nov26-flash', 'e-dec20-social'];
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
    const members = Array.from({length: 25}, (_, index) => ({
      id: `m${index + 1}`,
      name: `예시 회원 ${String(index + 1).padStart(2, '0')}`,
      role: index < 2 ? '운영진' : '회원',
      status: index === 24 ? 'inactive' : 'active',
      joined: index === 23 ? '2026-11-22' : addDays('2026-02-07', index * 9),
      notes: ''
    }));
    const roster = members.filter(member => member.status === 'active').map(member => member.id);
    const pastRoster = members.filter(member => member.joined <= '2026-10-31').map(member => member.id);
    const repeat = {
      enabled: true,
      weekday: 0,
      time: '10:00',
      endTime: '13:00',
      earlyTime: '09:30',
      lateTime: '09:50',
      place: '예시 체육관',
      title: '일요 정기 운동',
      deadlineDays: 1,
      deadlineTime: '15:30'
    };

    function regularEvent(id, date, memberIds) {
      return {
        id,
        title: repeat.title,
        date,
        time: repeat.time,
        endTime: repeat.endTime,
        earlyTime: repeat.earlyTime,
        lateTime: repeat.lateTime,
        place: repeat.place,
        deadline: addDays(date, -repeat.deadlineDays),
        deadlineTime: repeat.deadlineTime,
        notes: '실내 운동화와 라켓을 챙겨 주세요.',
        pollOpen: false,
        finalized: false,
        // 일정 흐름 (FLOW.md): 일정 종류, 상단 고정 시각, 취소 여부.
        kind: 'regular',
        pinnedAt: null,
        cancelled: false,
        roster: [...memberIds],
        votes: {},
        lunch: {},
        attendance: {},
        recognized: {},
        guests: [],
        settlement: {}
      };
    }

    const featured = regularEvent('e-nov28', '2026-11-29', roster);
    featured.pollOpen = true;
    featured.votes = Object.fromEntries(
      roster.slice(0, 20).map((id, index) => [id, index < 10 ? 'early' : index < 16 ? 'late' : 'no'])
    );
    featured.lunch = Object.fromEntries(roster.slice(3, 8).map(id => [id, true]));

    const pastMeetings = [
      ['e-nov21', '2026-11-22', 17, 7],
      ['e-nov14', '2026-11-15', 20, 17],
      ['e-nov07', '2026-11-08', 16, 3],
      ['e-oct31', '2026-11-01', 18, 12],
      ['e-sep27', '2026-09-27', 18, 12],
      ['e-sep13', '2026-09-13', 14, 7],
      ['e-aug30', '2026-08-30', 20, 17]
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
          return [memberId, slot < present ? (slot % 3 === 0 ? 'late' : 'early') : 'no'];
        })
      );
      event.recognized = Object.fromEntries(
        attendance.filter(([id, status]) => status === 'present' && event.votes[id] === 'early')
          .map(([id]) => [id, 'direct'])
      );
      return event;
    });
    const practice = regularEvent('e-nov23', '2026-11-23', roster);
    practice.title = '연습 모임 · 마무리 예시';
    practice.attendance = Object.fromEntries(
      roster.slice(0, -2).map((id, index) => [id, index < 16 ? 'present' : 'absent'])
    );
    practice.guests = [
      {id: 'g1', name: '예시 게스트 01', arrived: true, paid: true},
      {id: 'g2', name: '예시 게스트 02', arrived: false, paid: false}
    ];
    practice.settlement = {priorSingles: 21, priorTubes: 4, remainingSingles: 6, courtDonation: 3000};

    // 여러 일정이 한 주에 겹치는 흐름 (FLOW.md 7): 마감이 하루 안에 다가오는 평일 번개와, 아직 투표를 열지 않은 송년 모임.
    const flash = regularEvent('e-nov26-flash', '2026-11-26', roster);
    Object.assign(flash, {title: '수요 번개', kind: 'flash', time: '19:00', endTime: '21:00', earlyTime: '18:50', lateTime: '19:30',
      deadline: '2026-11-25', deadlineTime: '10:00', notes: '평일 저녁 번개예요. 오실 수 있는 분만 응답해 주세요.', pollOpen: true});
    flash.votes = Object.fromEntries(roster.slice(0, 6).map((id, index) => [id, index < 4 ? 'early' : 'late']));
    const yearEnd = regularEvent('e-dec20-social', '2026-12-20', roster);
    Object.assign(yearEnd, {title: '송년 모임', kind: 'social', time: '18:00', endTime: '21:00', earlyTime: '17:50', lateTime: '18:30',
      place: '예시 식당', deadline: '2026-12-13', deadlineTime: '15:30', notes: '운동 없이 저녁만 함께해요.'});

    return {
      members,
      events: [featured, flash, yearEnd, practice, ...pastEvents],
      flowDemo: true,
      notices: [
        {
          id: 'n-schedule',
          title: '일요모임 이용 안내',
          body: '일요 정기 운동과 참석 투표를 체험해 보세요. 선발·후발을 고르고 점심 여부를 따로 알려 주세요.',
          date: '2026-11-20',
          pinnedAt: 1
        },
        {
          id: 'n-shuttle',
          title: '줄서기 인정 안내 · 예시',
          body: '당일 출석과 줄서기 인정은 별도로 기록합니다. 직접 참여, 대타, 별도 인정 여부는 운영진이 확인합니다.',
          date: '2026-11-18',
          pinnedAt: null
        },
        {
          id: 'n-entry',
          title: '게임판 운영 안내 · 예시',
          body: '진행자는 참석 인원, 게임 횟수, 대기 시간, 실력 등을 고려해 편성합니다. 순서나 편성에 의견이 있으면 진행자에게 말씀해 주세요.',
          date: '2026-11-15',
          pinnedAt: null
        }
      ],
      repeat
    };
  }

  function updateSaved(saved) {
    const template = seed();
    const seededEvents = new Map(template.events.map(event => [event.id, event]));
    const pastFixtures = new Set(['e-nov21', 'e-nov14', 'e-nov07', 'e-oct31']);
    if (saved.repeat.weekday === 6 && saved.repeat.title === '토요 정기 운동' &&
        saved.repeat.place === '한빛체육관 2코트' && saved.repeat.time === '19:00' &&
        saved.repeat.endTime === '21:00' && saved.repeat.deadlineDays === 1) {
      const {enabled} = saved.repeat;
      saved.repeat = {...template.repeat, enabled};
    }
    for (const event of saved.events) {
      const sample = seededEvents.get(event.id);
      const oldDate = sample && addDays(sample.date, -1);
      if ((event.id === 'e-nov28' || pastFixtures.has(event.id)) && event.date === oldDate &&
          event.title === '토요 정기 운동' && event.place === '한빛체육관 2코트' &&
          event.time === '19:00' && event.endTime === '21:00' &&
          event.deadline === addDays(oldDate, -1)) {
        Object.assign(event, {title: sample.title, date: sample.date, place: sample.place,
          time: sample.time, endTime: sample.endTime, deadline: sample.deadline});
      }
    }
    const notice = saved.notices.find(item => item.id === 'n-schedule');
    const previousBody = '11월 정기 운동은 매주 토요일 오후 7시부터 9시까지 한빛체육관 2코트에서 진행합니다. 각 일정에서 참석 여부를 알려 주세요.';
    if (notice?.title === '11월 정기 운동 안내' && notice.body === previousBody) {
      const {title, body} = template.notices[0];
      Object.assign(notice, {title, body});
    }
    return saved;
  }

  function addDefaults(state) {
    const slots = {earlyTime:'09:30', lateTime:'09:50', deadlineTime:'15:30'};
    state.repeat = {...slots, ...state.repeat};
    state.events = state.events.map(event => ({
      ...slots, lunch:{}, recognized:{}, guests:[], settlement:{}, kind:'regular', pinnedAt:null, cancelled:false, ...event
    }));
    // 상단 고정 by time (FLOW.md): a notice pinned with the old check box keeps its place.
    state.notices = state.notices.map(({pinned, ...notice}) => ({pinnedAt: pinned ? 1 : null, ...notice}));
    // The 일정 흐름 examples join a browser's saved demo once; whatever the visitor changed stays.
    if (!state.flowDemo) {
      const ids = new Set(state.events.map(event => event.id));
      state.events.push(...seed().events.filter(event => flowExamples.includes(event.id) && !ids.has(event.id)));
      state.flowDemo = true;
    }
    return state;
  }

  function load() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey));
      if (saved && Array.isArray(saved.events) && Array.isArray(saved.members) && Array.isArray(saved.notices) && saved.repeat) {
        return addDefaults(saved.version === 2 ? saved : updateSaved(saved));
      }
    } catch {
      // The preview is still usable in memory when browser storage is unavailable.
    }
    return seed();
  }

  function save(state) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({...state, version: 2}));
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

  const participates = slot => ['early', 'late', 'yes'].includes(slot);
  const signupOrder = event => event.signupOrder ?? Object.keys(event.votes).filter(id => participates(event.votes[id]));
  function waitingPosition(event, id) {
    return event.capacity ? Math.max(0, signupOrder(event).indexOf(id) + 1 - event.capacity) : 0;
  }
  function saveResponse(event, id, slot) {
    const order = signupOrder(event);
    if (participates(slot) && !participates(event.votes[id])) order.push(id);
    event.signupOrder = participates(slot) ? order : order.filter(member => member !== id);
    if (slot) event.votes[id] = slot;
    else delete event.votes[id];
  }

  function counts(event) {
    const report = {early: 0, late: 0, yes: 0, no: 0, pending: 0, total: event.roster.length, lunch: 0, waiting: 0};
    for (const id of event.roster) {
      const response = event.votes[id];
      if (waitingPosition(event, id)) { report.waiting++; continue; }
      if (response === 'early' || response === 'late') report[response]++;
      if (response === 'early' || response === 'late' || response === 'yes') report.yes++;
      else if (response === 'no') report.no++;
      else report.pending++;
      if (event.lunch?.[id]) report.lunch++;
    }
    return report;
  }

  function attendanceCounts(event) {
    return summarize(event.roster, event.attendance, 'present', 'absent');
  }

  function deadlinePassed(event) {
    return Boolean(event.deadline && `${event.deadline}T${event.deadlineTime || '23:59'}` <= demoNow);
  }

  function settlement(event) {
    const {priorSingles = 0, priorTubes = 0, remainingSingles = 0, openingShuttles, addedShuttles = 0, usedShuttles = 0, courtDonation = 0} = event.settlement || {};
    const legacy = openingShuttles == null;
    const recorded = (legacy ? ['priorSingles', 'priorTubes', 'remainingSingles', 'courtDonation']
      : ['openingShuttles', 'addedShuttles', 'usedShuttles', 'courtDonation'])
      .every(key => Number.isSafeInteger(event.settlement?.[key]));
    const guests = event.guests || [];
    const paid = guests.filter(guest => guest.paid);
    const members = attendanceCounts(event).present;
    const arrivals = guests.filter(guest => guest.arrived).length;
    return {members, arrivals, total: members + arrivals, recorded, guestPaid: paid.length,
      transferWon: paid.reduce((sum, guest) => sum + (guest.transferWon ?? 0), 0),
      receivedShuttles: paid.reduce((sum, guest) => sum + (guest.receivedShuttles ?? 0), 0),
      legacy, priorSingles, priorTubes, remainingSingles, courtDonation, singles: priorSingles + remainingSingles,
      openingShuttles, addedShuttles, usedShuttles,
      closingShuttles: legacy ? priorSingles + priorTubes * 12 + remainingSingles : openingShuttles + addedShuttles - usedShuttles};
  }

  function qualification(state, day = today) {
    const year = Number(day.slice(0, 4));
    const laterHalf = Number(day.slice(5, 7)) > 6;
    const boundaries = laterHalf
      ? [`${year}-07-01`, `${year}-10-01`, `${year + 1}-01-01`]
      : [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`];
    const events = state.events.filter(event => event.finalized && event.date >= boundaries[0] && event.date < boundaries[2]);
    const byMember = state.members.filter(member => member.status === 'active').map(member => {
      const halves = [0, 0];
      for (const event of events) {
        if (event.recognized?.[member.id]) halves[event.date >= boundaries[1] ? 1 : 0]++;
      }
      return {member, first:halves[0], second:halves[1], met:halves[0] >= 3 && halves[1] >= 3};
    });
    return {period: `${year}년 ${laterHalf ? '하반기' : '상반기'}`, ranges: laterHalf ? ['7–9월','10–12월'] : ['1–3월','4–6월'], byMember};
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

  window.clubModel = {load, save, counts, waitingPosition, saveResponse, attendanceCounts, stats, settlement, qualification, deadlinePassed,
    dateLabel, addDays, today, demoNow, storageKey};
})();
