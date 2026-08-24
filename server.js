const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'teacher1234';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_PATH = path.join(DATA_DIR, 'state.json');
const STUDENT_COUNT = 26;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

function defaultState() {
  return {
    date: null,
    schedule: {
      mon: { activityName: '바른 글씨 연습하기', link: '', description: '' },
      tue: { activityName: '영어 단어 랭킹 게임', link: '', description: '' },
      wed: { activityName: 'AI에게 과학 질문하기', link: '', description: '' },
      thu: { activityName: '수학 문제 랭킹 게임', link: '', description: '' },
      fri: { activityName: '영어 단어 랭킹 게임', link: '', description: '' },
    },
    participants: Array.from({ length: STUDENT_COUNT }, (_, i) => ({ no: i + 1, done: false })),
  };
}

function normalizeState(parsed) {
  const fallback = defaultState();
  if (!parsed) return fallback;
  return {
    date: parsed.date ?? fallback.date,
    schedule: { ...fallback.schedule, ...(parsed.schedule || {}) },
    participants:
      Array.isArray(parsed.participants) && parsed.participants.length === STUDENT_COUNT
        ? parsed.participants
        : fallback.participants,
  };
}

// Render 같은 무료 호스팅은 서버가 쉬었다 깨어날 때 로컬 파일이 초기화될 수 있으므로,
// SUPABASE_URL/SUPABASE_SERVICE_KEY가 설정되어 있으면 Supabase(DB)에 영구 저장하고,
// 없으면(로컬 개발) 기존처럼 파일에 저장한다.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

let supabase = null;
if (useSupabase) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function loadState() {
  if (useSupabase) {
    const { data, error } = await supabase.from('app_state').select('data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    if (!data) {
      const initial = defaultState();
      await supabase.from('app_state').upsert({ id: 'main', data: initial });
      return initial;
    }
    return normalizeState(data.data);
  }

  if (!fs.existsSync(DATA_PATH)) {
    const initial = defaultState();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    return normalizeState(JSON.parse(raw));
  } catch {
    const initial = defaultState();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function saveState(state) {
  if (useSupabase) {
    const { error } = await supabase.from('app_state').upsert({ id: 'main', data: state });
    if (error) throw error;
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));
}

// 서버의 시간대와 무관하게 항상 한국 표준시(KST, UTC+9) 기준으로 계산한다.
function getKstNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 9 * 60 * 60000);
}

function kstDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

let state = defaultState();
let stateReady = loadState().then((loaded) => {
  state = loaded;
});

// 날짜(KST)가 바뀌면 참여 현황을 자동으로 초기화한다.
async function ensureDailyReset() {
  await stateReady;
  const kstNow = getKstNow();
  const today = kstDateString(kstNow);
  if (state.date !== today) {
    state.date = today;
    state.participants.forEach((p) => (p.done = false));
    await saveState(state);
  }
  return kstNow;
}

const teacherTokens = new Set();

function requireTeacher(req, res, next) {
  const token = req.headers['x-teacher-token'];
  if (token && teacherTokens.has(token)) return next();
  return res.status(401).json({ error: '교사 인증이 필요합니다.' });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', async (req, res, next) => {
  try {
    const kstNow = await ensureDailyReset();
    const dayKey = DAY_KEYS[kstNow.getDay()];
    const isWeekend = !WEEKDAY_KEYS.includes(dayKey);
    const today = isWeekend ? null : state.schedule[dayKey];

    res.json({
      date: state.date,
      dayKey,
      dayLabel: DAY_LABELS[dayKey],
      isWeekend,
      today,
      schedule: state.schedule,
      participants: state.participants,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/participants/:no/toggle', async (req, res, next) => {
  try {
    await ensureDailyReset();
    const no = Number(req.params.no);
    const participant = state.participants.find((p) => p.no === no);
    if (!participant) {
      return res.status(404).json({ error: '존재하지 않는 번호입니다.' });
    }
    participant.done = !participant.done;
    await saveState(state);
    res.json({ participants: state.participants });
  } catch (err) {
    next(err);
  }
});

app.post('/api/teacher/login', (req, res) => {
  const { password } = req.body || {};
  const provided = Buffer.from(String(password || ''));
  const expected = Buffer.from(TEACHER_PASSWORD);
  const isValid =
    provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  if (!isValid) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  teacherTokens.add(token);
  res.json({ token });
});

app.post('/api/teacher/logout', requireTeacher, (req, res) => {
  teacherTokens.delete(req.headers['x-teacher-token']);
  res.json({ ok: true });
});

app.put('/api/teacher/schedule/:day', requireTeacher, async (req, res, next) => {
  try {
    await stateReady;
    const day = req.params.day;
    if (!state.schedule[day]) {
      return res.status(400).json({ error: '잘못된 요일입니다.' });
    }
    const { activityName, link, description } = req.body || {};
    if (typeof activityName === 'string') state.schedule[day].activityName = activityName.trim();
    if (typeof link === 'string') state.schedule[day].link = link.trim();
    if (typeof description === 'string') state.schedule[day].description = description.trim();
    await saveState(state);
    res.json({ schedule: state.schedule });
  } catch (err) {
    next(err);
  }
});

app.post('/api/teacher/reset', requireTeacher, async (req, res, next) => {
  try {
    await stateReady;
    state.participants.forEach((p) => (p.done = false));
    await saveState(state);
    res.json({ participants: state.participants });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다. (저장 방식: ${useSupabase ? 'Supabase' : '로컬 파일'})`);
});
