const DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금' };
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

const el = {
  activityName: document.getElementById('activityName'),
  linkRow: document.getElementById('linkRow'),
  activityLink: document.getElementById('activityLink'),
  todayDesc: document.getElementById('todayDesc'),
  weekendMsg: document.getElementById('weekendMsg'),
  scheduleList: document.getElementById('scheduleList'),
  participantsGrid: document.getElementById('participantsGrid'),
  progressText: document.getElementById('progressText'),
  dateFooter: document.getElementById('dateFooter'),
  teacherFab: document.getElementById('teacherFab'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalClose: document.getElementById('modalClose'),
  loginView: document.getElementById('loginView'),
  editView: document.getElementById('editView'),
  passwordInput: document.getElementById('passwordInput'),
  loginError: document.getElementById('loginError'),
  loginBtn: document.getElementById('loginBtn'),
  dayTabs: document.getElementById('dayTabs'),
  editActivityName: document.getElementById('editActivityName'),
  editLink: document.getElementById('editLink'),
  editDescription: document.getElementById('editDescription'),
  saveDayBtn: document.getElementById('saveDayBtn'),
  saveMsg: document.getElementById('saveMsg'),
  resetBtn: document.getElementById('resetBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
};

let latestState = null;
let editingDay = null;
let teacherToken = localStorage.getItem('teacherToken') || null;

async function fetchState() {
  const res = await fetch('/api/state');
  const data = await res.json();
  latestState = data;
  render(data);
}

function render(data) {
  if (data.isWeekend) {
    el.activityName.textContent = '없음';
    el.linkRow.hidden = true;
    el.todayDesc.hidden = true;
    el.weekendMsg.hidden = false;
  } else {
    el.weekendMsg.hidden = true;
    el.activityName.textContent = `"${data.today.activityName || '미정'}"`;
    if (data.today.link) {
      el.linkRow.hidden = false;
      el.activityLink.href = data.today.link;
      el.activityLink.textContent = data.today.link;
    } else {
      el.linkRow.hidden = true;
    }
    if (data.today.description) {
      el.todayDesc.hidden = false;
      el.todayDesc.textContent = data.today.description;
    } else {
      el.todayDesc.hidden = true;
    }
  }

  el.scheduleList.innerHTML = '';
  WEEKDAY_KEYS.forEach((day) => {
    const li = document.createElement('li');
    const item = data.schedule[day];
    li.innerHTML = `<strong>${DAY_LABELS[day]}:</strong> ${item.activityName || '미정'}`;
    if (day === data.dayKey) li.classList.add('today-highlight');
    el.scheduleList.appendChild(li);
  });

  el.participantsGrid.innerHTML = '';
  let doneCount = 0;
  data.participants.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'participant-btn' + (p.done ? ' done' : '');
    btn.textContent = p.done ? '✓' : p.no;
    btn.title = p.done ? `${p.no}번 완료` : `${p.no}번 클릭해서 완료 표시`;
    btn.addEventListener('click', () => toggleParticipant(p.no));
    el.participantsGrid.appendChild(btn);
    if (p.done) doneCount += 1;
  });
  el.progressText.textContent = `${doneCount} / ${data.participants.length}명 완료`;

  const label = data.isWeekend ? `${data.dayLabel}요일` : `${data.dayLabel}요일`;
  el.dateFooter.textContent = `${data.date} (${label}, KST 기준)`;
}

async function toggleParticipant(no) {
  const p = latestState.participants.find((x) => x.no === no);
  if (p) {
    p.done = !p.done;
    render(latestState);
  }
  try {
    const res = await fetch(`/api/participants/${no}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.participants) {
      latestState.participants = data.participants;
      render(latestState);
    }
  } catch (e) {
    fetchState();
  }
}

// ---- 교사 모드 ----

function openModal() {
  el.modalOverlay.hidden = false;
  if (teacherToken) {
    showEditView();
  } else {
    showLoginView();
  }
}

function closeModal() {
  el.modalOverlay.hidden = true;
}

function showLoginView() {
  el.loginView.hidden = false;
  el.editView.hidden = true;
  el.loginError.hidden = true;
  el.passwordInput.value = '';
}

function showEditView() {
  el.loginView.hidden = true;
  el.editView.hidden = false;
  buildDayTabs();
  selectDay(editingDay || latestState?.dayKey || 'mon');
}

function buildDayTabs() {
  el.dayTabs.innerHTML = '';
  WEEKDAY_KEYS.forEach((day) => {
    const btn = document.createElement('button');
    btn.className = 'day-tab';
    btn.textContent = DAY_LABELS[day];
    btn.addEventListener('click', () => selectDay(day));
    el.dayTabs.appendChild(btn);
  });
}

function selectDay(day) {
  editingDay = day;
  [...el.dayTabs.children].forEach((tab, i) => {
    tab.classList.toggle('active', WEEKDAY_KEYS[i] === day);
  });
  const item = latestState.schedule[day];
  el.editActivityName.value = item.activityName || '';
  el.editLink.value = item.link || '';
  el.editDescription.value = item.description || '';
  el.saveMsg.hidden = true;
}

async function login() {
  el.loginError.hidden = true;
  try {
    const res = await fetch('/api/teacher/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: el.passwordInput.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      el.loginError.textContent = data.error || '로그인에 실패했습니다.';
      el.loginError.hidden = false;
      return;
    }
    teacherToken = data.token;
    localStorage.setItem('teacherToken', teacherToken);
    showEditView();
  } catch (e) {
    el.loginError.textContent = '서버와 통신할 수 없습니다.';
    el.loginError.hidden = false;
  }
}

async function saveDay() {
  el.saveMsg.hidden = true;
  try {
    const res = await fetch(`/api/teacher/schedule/${editingDay}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-teacher-token': teacherToken,
      },
      body: JSON.stringify({
        activityName: el.editActivityName.value,
        link: el.editLink.value,
        description: el.editDescription.value,
      }),
    });
    if (res.status === 401) {
      teacherToken = null;
      localStorage.removeItem('teacherToken');
      showLoginView();
      return;
    }
    const data = await res.json();
    latestState.schedule = data.schedule;
    render(latestState);
    el.saveMsg.textContent = '저장되었습니다!';
    el.saveMsg.hidden = false;
  } catch (e) {
    el.saveMsg.textContent = '저장에 실패했습니다.';
    el.saveMsg.hidden = false;
  }
}

async function resetToday() {
  if (!confirm('오늘의 참여 현황을 모두 초기화할까요?')) return;
  try {
    const res = await fetch('/api/teacher/reset', {
      method: 'POST',
      headers: { 'x-teacher-token': teacherToken },
    });
    if (res.status === 401) {
      teacherToken = null;
      localStorage.removeItem('teacherToken');
      showLoginView();
      return;
    }
    const data = await res.json();
    latestState.participants = data.participants;
    render(latestState);
  } catch (e) {
    alert('초기화에 실패했습니다.');
  }
}

function logout() {
  teacherToken = null;
  localStorage.removeItem('teacherToken');
  closeModal();
}

el.teacherFab.addEventListener('click', openModal);
el.modalClose.addEventListener('click', closeModal);
el.modalOverlay.addEventListener('click', (e) => {
  if (e.target === el.modalOverlay) closeModal();
});
el.loginBtn.addEventListener('click', login);
el.passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});
el.saveDayBtn.addEventListener('click', saveDay);
el.resetBtn.addEventListener('click', resetToday);
el.logoutBtn.addEventListener('click', logout);

fetchState();
setInterval(fetchState, 30000);
