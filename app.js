/* 문장장 스튜디오 v3 — 스페인어 전용 PWA
   오늘(SRS) · 연습(받아쓰기/말하기/드릴/롤플레이) · 읽기(주간 시사 팩) · 쓰기(일기 + Claude 첨삭) · 기록 */
'use strict';
const APP_VERSION = '3.3.0';
const LS_KEY = 'estudio_v3';
const LEVELS = ['B1', 'B2', 'C1'];
const INTERVALS = [0, 1, 3, 7, 16, 35, 80];
const MODES = ['study', 'dict', 'speak', 'write'];
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
const $ = id => document.getElementById(id);
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function jsq(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function toast(msg, ms) { const t = $('toast'); t.innerHTML = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2200); }
function fmtDate(iso) { const d = new Date(iso); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }

/* ── 상태 ─────────────────────────────────── */
function normState(st) {
  st = st || {};
  st.prog = st.prog || {};
  if (!st.levels || Array.isArray(st.levels)) st.levels = {};
  // v2 백업(키가 'es-B2' 형태)도 수용
  LEVELS.forEach(lv => { if (!(lv in st.levels)) st.levels[lv] = ('es-' + lv in st.levels) ? !!st.levels['es-' + lv] : (lv === 'B2'); });
  Object.keys(st.levels).forEach(k => { if (!LEVELS.includes(k)) delete st.levels[k]; });
  st.newLimit = st.newLimit || 10; st.reviewLimit = st.reviewLimit || 20;
  const s = st.stats = st.stats || {};
  s.streak = s.streak || 0; s.lastDay = s.lastDay || 0; s.daily = s.daily || {};
  s.tags = s.tags || {}; s.missWords = s.missWords || {}; s.upDay = s.upDay || {}; s.lastBackup = s.lastBackup || 0;
  s.dialogsDone = s.dialogsDone || 0; s.quizRight = s.quizRight || 0; s.quizTotal = s.quizTotal || 0;
  s.writeErr = s.writeErr || {}; s.mission = s.mission || {};
  st.mine = Array.isArray(st.mine) ? st.mine : [];
  st.journal = Array.isArray(st.journal) ? st.journal : [];
  st.read = st.read || {};
  st.draft = st.draft || null;
  st.hl = Array.isArray(st.hl) ? st.hl : []; st.hlLabels = st.hlLabels || {};
  for (const id in st.prog) { const p = st.prog[id]; p.hist = p.hist || {}; MODES.forEach(m => { if (!p.hist[m]) p.hist[m] = []; }); }
  st.ver = 3; return st;
}
function load() { try { const v = localStorage.getItem(LS_KEY); if (v) return normState(JSON.parse(v)); } catch (e) { } return normState({}); }
let S = load();
let saveFailWarned = false;
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); }
  catch (e) { if (!saveFailWarned) { saveFailWarned = true; alert('저장 공간이 부족해 기록을 저장하지 못했어요. 기록 탭에서 백업을 먼저 받아주세요.'); } }
}
if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => { }); }

/* ── 데이터 ─────────────────────────────────── */
const SENTENCES = window.SENTENCES || [];
const DIALOGS = window.DIALOGS || [];
SENTENCES.forEach(d => { d.id = d.lang + '-' + d.level + '-' + d.n; });
let BY_ID = {};
function rebuildIndex() { BY_ID = {}; SENTENCES.forEach(d => BY_ID[d.id] = d); S.mine.forEach(d => BY_ID[d.id] = d); }
rebuildIndex();
const DIALOGS_BY_ID = {}; DIALOGS.forEach(d => DIALOGS_BY_ID[d.id] = d);
function activeCards() { return S.mine.concat(SENTENCES.filter(d => S.levels[d.level])); }
function mkMine(text, ko, point, ctx, gram) {
  return { id: 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), lang: 'es', level: '내 문장', n: 0, text, ko: ko || '', vocab: point || '', grammar: gram || point || '', ctx: ctx || '내 글', region: '', key: [], variants: [], created: new Date().toISOString() };
}
function addMine(cards) {
  const have = new Set(S.mine.map(m => m.text.trim().toLowerCase()).concat(SENTENCES.map(s => s.text.trim().toLowerCase())));
  let n = 0;
  cards.forEach(c => { const k = c.text.trim().toLowerCase(); if (!k || have.has(k)) return; have.add(k); S.mine.push(c); n++; });
  rebuildIndex(); save(); return n;
}

/* ── TTS ─────────────────────────────────── */
let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices(); }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
let ttsRate = 0.92;
function pickVoice() {
  const es = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith('es'));
  const pref = es.filter(v => /es-es/i.test(v.lang.replace('_', '-')));
  const pool = pref.length ? pref : es;
  return pool.find(v => /premium|enhanced|mejorada/i.test(v.name)) || pool.find(v => /m[oó]nica|jorge|marisol/i.test(v.name)) || pool[0];
}
function speak(text, onend) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(); if (v) u.voice = v;
  u.lang = 'es-ES'; u.rate = ttsRate;
  if (onend) u.onend = onend;
  speechSynthesis.speak(u);
}
function speakId(id) { const c = BY_ID[id]; if (c) speak(c.text); }
let seqActive = false;
function speakSeq(arr, i) { i = i || 0; if (i === 0) seqActive = true; if (!seqActive || i >= arr.length) { seqActive = false; return; } speak(arr[i], () => setTimeout(() => speakSeq(arr, i + 1), 350)); }
function stopSpeak() { seqActive = false; if ('speechSynthesis' in window) speechSynthesis.cancel(); }
function rateRow() { return `<div class="rate-row">🐢 <input type="range" min="0.5" max="1.2" step="0.05" value="${ttsRate}" oninput="ttsRate=parseFloat(this.value)"> 🐇</div>`; }

/* ── SRS ─────────────────────────────────── */
function getProg(id) { const p = S.prog[id]; if (p) return p; return { box: 0, due: 0, seen: 0, lapse: 0, hist: { study: [], dict: [], speak: [], write: [] } }; }
function pushHist(p, mode, score) { p.hist = p.hist || {}; p.hist[mode] = p.hist[mode] || []; p.hist[mode].push({ d: today(), s: Math.round(score) }); if (p.hist[mode].length > 10) p.hist[mode].shift(); }
const GRAM_RULES = [
  [/접속법|subjuntivo/i, '접속법'], [/가정|조건/i, '가정·조건'], [/불완료|단순과거|대과거|과거|완료/i, '과거시제'],
  [/미래/i, '미래시제'], [/재귀|무의지 se|대명동사/i, '재귀·대명동사'], [/gustar형|간접목적|직접목적|대명사|중성/i, '대명사'],
  [/명령/i, '명령법'], [/관계/i, '관계사'], [/속담|격언/i, '속담'], [/관용/i, '관용구'], [/비교|최상급/i, '비교'],
  [/ser.*estar|estar.*ser/i, 'ser/estar'], [/por.*para|para.*por/i, 'por/para'], [/전치사/i, '전치사'],
  [/격식|공손|이메일/i, '격식체'], [/무인칭|비인칭/i, '무인칭'], [/gerundio|현재분사|진행/i, '진행·분사'],
  [/수동/i, '수동태'], [/담화|연결|접속사/i, '연결어'], [/의문/i, '의문문'],
];
function gramCat(c) { const s = (c.grammar || '') + ' ' + (c.vocab || ''); for (const r of GRAM_RULES) if (r[0].test(s)) return r[1]; return '기타 표현'; }
function logTag(c, bad) { const cat = gramCat(c); const t = S.stats.tags; t[cat] = t[cat] || { ok: 0, bad: 0 }; if (bad) t[cat].bad++; else t[cat].ok++; }
function dayRec(t) { const dk = String(t); if (!S.stats.daily[dk]) S.stats.daily[dk] = { rev: 0, new: 0, ids: [] }; if (!S.stats.daily[dk].ids) S.stats.daily[dk].ids = []; return S.stats.daily[dk]; }
function touchStreak() { const t = today(); if (S.stats.lastDay !== t) { S.stats.streak = (S.stats.lastDay === t - 1) ? S.stats.streak + 1 : 1; S.stats.lastDay = t; } }
function recordPractice(c, mode, pct, missed) {
  const p = getProg(c.id); const t = today();
  pushHist(p, mode, pct);
  const key = c.id + '|' + mode; const upToday = (S.stats.upDay[key] === t);
  if (pct < 50) { p.box = Math.max(1, p.box - 1); p.due = t; }
  else if (pct >= 70 && !upToday) { if (pct >= 90) p.box = Math.min(INTERVALS.length - 1, p.box + 1); p.due = Math.max(p.due || t, t + INTERVALS[p.box]); S.stats.upDay[key] = t; }
  S.prog[c.id] = p; logTag(c, pct < 70);
  (missed || []).forEach(w => { const k = 'es:' + w; S.stats.missWords[k] = (S.stats.missWords[k] || 0) + 1; });
  const d = dayRec(t); d.prac = (d.prac || 0) + 1; touchStreak();
  save();
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function buildQueue() {
  const t = today(); const cards = activeCards();
  const fresh = cards.filter(d => !S.prog[d.id] || S.prog[d.id].seen === 0);
  const usedNew = (S.stats.daily[String(t)] && S.stats.daily[String(t)].new) || 0;
  const newCards = fresh.slice(0, Math.max(0, S.newLimit - usedNew));   // '내 문장'이 앞에 오므로 우선 출제
  const dueCards = cards.filter(d => { const p = S.prog[d.id]; return p && p.seen > 0 && (p.due || 0) <= t; })
    .sort((a, b) => (S.prog[a.id].due || 0) - (S.prog[b.id].due || 0)).slice(0, S.reviewLimit);
  return shuffle(dueCards.concat(newCards));
}
function dueCount() { const t = today(); return activeCards().filter(d => { const p = S.prog[d.id]; return p && p.seen > 0 && (p.due || 0) <= t; }).length; }
let queue = [], qi = 0, flipped = false, queueBuilt = false;
function grade(g) {
  const c = queue[qi]; if (!c) return;
  const p = getProg(c.id); const t = today();
  p.seen++; const isNew = p.seen === 1;
  if (g === 1) { p.box = 1; p.lapse++; } else if (g === 2) { p.box = Math.max(1, p.box); }
  else if (g === 3) { p.box = Math.min(INTERVALS.length - 1, p.box + 1); } else { p.box = Math.min(INTERVALS.length - 1, p.box + 2); }
  p.due = t + INTERVALS[p.box];
  pushHist(p, 'study', { 1: 25, 2: 55, 3: 80, 4: 100 }[g]); logTag(c, g <= 2);
  S.prog[c.id] = p;
  const d = dayRec(t); if (!d.ids.includes(c.id)) d.ids.push(c.id); d.rev++; if (isNew) d.new++;
  touchStreak(); save();
  if (g === 1) queue.push(c);
  qi++; flipped = false; renderToday();
}
function flipCard() { if (!flipped && queue[qi]) { flipped = true; renderToday(); speak(queue[qi].text); } }

/* ── 오늘 ─────────────────────────────────── */
function weekKey() { const packs = PACKS.index; return packs && packs.length ? packs[0].id : null; }
function readThisWeek() { const p = PACKS.latest; if (!p) return { done: 0, total: 0 }; const total = p.articles.length; const done = p.articles.filter(a => S.read[a.id] && S.read[a.id].done).length; return { done, total }; }
function wroteToday() { const t = today(); return S.journal.some(j => j.day === t); }
function renderToday() {
  const el = $('panel-today');
  if (!queueBuilt) { queue = buildQueue(); qi = 0; flipped = false; queueBuilt = true; }
  const t = today(); const d = S.stats.daily[String(t)] || { rev: 0 };
  const rw = readThisWeek(); const wt = wroteToday();
  let h = '';
  const hasData = Object.keys(S.prog).length || S.journal.length;
  if (hasData && t - (S.stats.lastBackup || 0) >= 7) {
    h += `<div class="banner">💾 마지막 백업 후 ${S.stats.lastBackup ? (t - S.stats.lastBackup) + '일' : '아직 백업 전'}이에요. 일기와 학습 기록은 이 폰에만 저장되니 가끔 백업해두세요. <button class="ghost sm" onclick="doExport()">지금 백업</button></div>`;
  }
  h += `<div class="routine">
    <div class="${qi >= queue.length && queue.length ? 'done' : ''}" onclick="document.getElementById('studyCard').scrollIntoView({behavior:'smooth'})"><div class="n">${d.rev || 0}</div><div class="l">오늘 복습</div></div>
    <div class="${rw.total && rw.done >= rw.total ? 'done' : ''}" onclick="goTab('read')"><div class="n">${rw.done}/${rw.total || '–'}</div><div class="l">이번 주 기사</div></div>
    <div class="${wt ? 'done' : ''}" onclick="goTab('write')"><div class="n">${wt ? '✓' : '–'}</div><div class="l">오늘 글쓰기</div></div>
  </div>`;
  h += `<div class="progress-line"><span id="studyProgress"></span><span>🔥 연속 ${S.stats.streak}일</span></div><div class="card" id="studyCard"></div>`;
  el.innerHTML = h;
  renderStudyCard();
}
function renderStudyCard() {
  const holder = $('studyCard');
  if (qi >= queue.length) {
    $('studyProgress').textContent = '';
    holder.innerHTML = `<div class="empty">🎉 오늘 카드 끝!<br>이제 <b>읽기</b>나 <b>쓰기</b>로 넘어가 볼까요?<br><br>
      <button class="ghost" onclick="S.newLimit+=10;save();queue=buildQueue();qi=0;renderToday()">+ 새 문장 10개 더</button>
      <button class="ghost" onclick="goTab('write')">✍️ 오늘 일기 쓰기</button></div>`;
    return;
  }
  const c = queue[qi]; const p = getProg(c.id);
  $('studyProgress').textContent = '남은 카드 ' + (queue.length - qi) + '장';
  let h = `<div class="meta-row"><span class="tag red">${esc(c.level)}</span><span class="tag">${esc(c.ctx)}</span><span class="tag">${p.seen === 0 ? '✨ 새 문장' : '복습 ' + p.seen + '회차'}</span></div>`;
  h += `<div class="ko-big">${esc(c.ko || '(뜻 없음)')}</div><div class="hint">스페인어로 말해보세요.</div>`;
  if (flipped) {
    h += `<div class="answer-block"><div class="target-big">${esc(c.text)} <button class="speak-btn" onclick="speakId('${c.id}')">🔊</button></div>
      <div class="detail">${c.vocab ? '<b>핵심:</b> ' + esc(c.vocab) + '<br>' : ''}${c.grammar && c.grammar !== c.vocab ? '<b>문법:</b> ' + esc(c.grammar) + '<br>' : ''}${c.region ? '<b>지역:</b> ' + esc(c.region) : ''}</div>${rateRow()}
      <div class="btn-row"><button class="big g1" onclick="grade(1)">다시</button><button class="big g2" onclick="grade(2)">어려움</button><button class="big g3" onclick="grade(3)">알맞음</button><button class="big g4" onclick="grade(4)">쉬움</button></div></div>`;
  } else {
    h += `<button class="flip" onclick="flipCard()">정답 확인</button>`;
  }
  holder.innerHTML = h;
}

/* ── 연습: 공통 ─────────────────────────────── */
function studiedAll() { return activeCards().filter(d => { const p = S.prog[d.id]; return p && p.seen > 0; }); }
function studiedToday() { const ids = new Set((S.stats.daily[String(today())] || {}).ids || []); return activeCards().filter(d => ids.has(d.id)); }
let poolMode = 'all', lastPickId = null, practiceSub = 'dict';
function pickRandom() {
  const pool = poolMode === 'today' ? studiedToday() : studiedAll();
  if (!pool.length) return null;
  let c = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && c.id === lastPickId) c = pool[Math.floor(Math.random() * pool.length)];
  lastPickId = c.id; return c;
}
function poolToggle(fn) {
  return `<div class="pill-group" style="margin-bottom:12px"><span class="pill ${poolMode === 'today' ? 'on' : ''}" onclick="poolMode='today';${fn}(true)">오늘 학습분 (${studiedToday().length})</span><span class="pill ${poolMode === 'all' ? 'on' : ''}" onclick="poolMode='all';${fn}(true)">누적 (${studiedAll().length})</span></div>`;
}
function emptyPracticeMsg(fn) {
  const a = studiedAll().length;
  if (poolMode === 'today' && a > 0) return `<div class="empty">오늘 익힌 문장이 아직 없어요.<br><br><button class="ghost" onclick="poolMode='all';${fn}(true)">누적 학습분으로 연습 (${a})</button></div>`;
  return `<div class="empty">아직 학습한 문장이 없어요.<br>'오늘' 탭에서 문장을 익히면 여기 연습 풀에 쌓여요.</div>`;
}
function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s']/gi, ' ').replace(/\s+/g, ' ').trim(); }
function wordDiff(target, answer) {
  const tw = norm(target).split(' '), aw = norm(answer).split(' '); const aset = new Set(aw); let hit = 0;
  const marked = target.split(/\s+/).map(w => { const nw = norm(w); if (nw === '' || aset.has(nw)) { if (nw !== '') hit++; return `<span class="good">${esc(w)}</span>`; } return `<span class="bad">${esc(w)}</span>`; }).join(' ');
  const total = tw.filter(w => w).length; const missed = tw.filter(w => w && !aset.has(w));
  return { marked, missed, pct: total ? Math.round(hit / total * 100) : 0 };
}
const STOP = new Set('el la los las un una unos unas de del a al en y o que se me te le les lo nos os su sus mi tu por para con sin es esta estar ser muy mas ya no si'.split(' '));
function contentWords(text) { return norm(text).split(' ').filter(w => w && !STOP.has(w)); }
function tokMatch(a, b) { return a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)); }
function keyUsed(uNorm, keyForms) {
  if (!keyForms || !keyForms.length) return null;
  const ut = uNorm.split(' ').filter(Boolean);
  for (const k of keyForms) { const kt = norm(k).split(' ').filter(Boolean); if (kt.length && kt.every(t => ut.some(u => tokMatch(t, u)))) return true; }
  return false;
}
function scoreFlexible(card, userText, mode) {
  const cands = [card.text].concat(card.variants || []);
  const uNorm = norm(userText); const uWords = new Set(uNorm.split(' ').filter(Boolean));
  let a2 = 0, a3 = 0, best = card.text, bestMissed = [];
  for (const cand of cands) {
    const cw = contentWords(cand); const hit = cw.filter(w => uWords.has(w)).length; const cov = cw.length ? hit / cw.length : 0;
    const fm = wordDiff(cand, userText).pct / 100;
    if (cov > a2 || (cov === a2 && fm > a3)) { a2 = cov; a3 = fm; best = cand; bestMissed = cw.filter(w => !uWords.has(w)); }
  }
  const used = keyUsed(uNorm, card.key);
  let total;
  if (used === null) total = a2 * (2 / 3) + a3 * (1 / 3);
  else if (mode === 'comm') total = a2 * 0.75 + a3 * 0.25;
  else total = (used ? 1 : 0) * 0.4 + a2 * 0.4 + a3 * 0.2;
  return { pct: Math.round(total * 100), a1: used === null ? null : (used ? 100 : 0), a2: Math.round(a2 * 100), a3: Math.round(a3 * 100), best, missed: bestMissed, usedTarget: used };
}
function variantsBlock(c) {
  if (!c.variants || !c.variants.length) return '';
  return `<div class="detail" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)"><b>이렇게도 말할 수 있어요</b><br>` +
    c.variants.map((v, i) => `• ${esc(v)} <button class="speak-btn" onclick="speak(BY_ID['${c.id}'].variants[${i}])">🔊</button>`).join('<br>') + `</div>`;
}
function answerBlock(c) {
  return `<div class="answer-block"><div class="target-big">${esc(c.text)} <button class="speak-btn" onclick="speakId('${c.id}')">🔊</button></div>
  <div class="detail">${c.vocab ? '<b>핵심:</b> ' + esc(c.vocab) + '<br>' : ''}${c.grammar ? '<b>문법:</b> ' + esc(c.grammar) : ''}</div>${rateRow()}</div>`;
}
function scoreColor(p, hi, lo) { return p >= hi ? 'var(--ok)' : p >= lo ? 'var(--warn)' : 'var(--bad)'; }
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(onText, onFail) {
  if (!SR) { alert('이 브라우저는 음성인식을 지원하지 않아요. 타이핑으로 해보세요.'); return null; }
  const r = new SR(); r.lang = 'es-ES'; r.interimResults = false; r.maxAlternatives = 3; let got = false;
  r.onresult = e => { got = true; onText(Array.from(e.results[0]).map(a => a.transcript)); };
  r.onerror = () => { if (!got) { got = true; onFail('마이크 오류 또는 인식 실패 — 마이크 권한을 확인하세요'); } };
  r.onend = () => { if (!got) { got = true; onFail('음성이 감지되지 않았어요'); } };
  try { r.start(); } catch (e) { onFail('음성인식을 시작하지 못했어요'); }
  return r;
}
function renderPractice(fresh) {
  document.querySelectorAll('#practiceSeg button').forEach(b => b.classList.toggle('on', b.dataset.sub === practiceSub));
  if (practiceSub === 'dict') renderDict(fresh); else if (practiceSub === 'speak') renderSpeak(fresh);
  else if (practiceSub === 'drill') renderDrill(fresh); else renderDialog();
}
document.querySelectorAll('#practiceSeg button').forEach(b => b.onclick = () => { stopSpeak(); practiceSub = b.dataset.sub; renderPractice(false); });

/* ── 받아쓰기 ─────────────────────────────── */
let dictCard = null, dictRevealed = false, dictAns = '';
function renderDict(fresh) {
  if (fresh || !dictCard) { dictCard = pickRandom(); dictRevealed = false; dictAns = ''; }
  const holder = $('practiceCard'); $('practiceProgress').textContent = '듣고 받아쓰기 — 학습한 문장에서 출제';
  if (!dictCard) { holder.innerHTML = poolToggle('renderDict') + emptyPracticeMsg('renderDict'); return; }
  const c = dictCard;
  let h = poolToggle('renderDict') + `<div class="meta-row"><span class="tag red">${esc(c.level)}</span><span class="tag">${esc(c.ctx)}</span></div>
  <div style="text-align:center;margin:16px 0"><button class="ghost" style="font-size:18px;padding:16px 28px" onclick="speakId('${c.id}')">🔊 문장 듣기</button></div>${rateRow()}
  <input type="text" id="dictInput" placeholder="들리는 대로 입력" autocomplete="off" autocapitalize="off" spellcheck="false" ${dictRevealed ? 'disabled' : ''} value="${esc(dictAns)}">`;
  if (dictRevealed) {
    const d = wordDiff(c.text, dictAns);
    h += `<div class="score-big" style="color:${scoreColor(d.pct, 80, 50)}">${d.pct}%</div><div class="diff-out">${d.marked} <button class="speak-btn" onclick="speakId('${c.id}')">🔊</button></div>
    <div class="detail"><b>뜻:</b> ${esc(c.ko)}<br><b>핵심:</b> ${esc(c.vocab)}</div><div class="btn-row"><button class="big g3" onclick="renderDict(true)">다음 문장 →</button></div>`;
  } else h += `<div class="btn-row"><button class="big g4" onclick="checkDict()">채점하기</button><button class="ghost" onclick="renderDict(true)">건너뛰기</button></div>`;
  holder.innerHTML = h;
  const inp = $('dictInput'); if (inp && !dictRevealed) inp.onkeydown = e => { if (e.key === 'Enter') checkDict(); };
}
function checkDict() { dictAns = $('dictInput').value; const d = wordDiff(dictCard.text, dictAns); recordPractice(dictCard, 'dict', d.pct, d.missed); dictRevealed = true; renderDict(false); }

/* ── 말하기 ─────────────────────────────── */
let spkCard = null, spkResult = null, recognizing = false, spkMode = 'expr';
function renderSpeak(fresh) {
  if (fresh || !spkCard) { spkCard = pickRandom(); spkResult = null; }
  const holder = $('practiceCard'); $('practiceProgress').textContent = '한국어를 보고 소리 내어 말하기';
  if (!spkCard) { holder.innerHTML = poolToggle('renderSpeak') + emptyPracticeMsg('renderSpeak'); return; }
  const c = spkCard;
  let h = poolToggle('renderSpeak') + `<div class="pill-group" style="margin-bottom:10px"><span class="pill ${spkMode === 'expr' ? 'on' : ''}" onclick="spkMode='expr';renderSpeak(false)">표현 연습</span><span class="pill ${spkMode === 'comm' ? 'on' : ''}" onclick="spkMode='comm';renderSpeak(false)">뜻만 통하면 OK</span></div>
  <div class="meta-row"><span class="tag red">${esc(c.level)}</span><span class="tag">${esc(c.ctx)}</span></div><div class="ko-big">${esc(c.ko)}</div>`;
  if (!SR) {
    h += `<div class="detail">⚠️ 이 브라우저는 음성인식을 지원하지 않아요. 정답을 보고 따라 말하기(섀도잉)로 연습하세요.</div>`;
    if (spkResult) h += answerBlock(c) + variantsBlock(c);
    h += `<div class="btn-row"><button class="big g4" onclick="spkResult={pct:-1};renderSpeak(false)">정답 보기</button><button class="ghost" onclick="renderSpeak(true)">다음</button></div>`;
  } else if (recognizing) {
    h += `<div class="empty"><span class="rec-dot"></span>듣고 있어요… 말해보세요!</div>`;
  } else if (spkResult) {
    if (spkResult.pct >= 0) {
      const tgt = (spkResult.usedTarget === false && spkMode === 'expr') ? `<div class="detail" style="color:var(--warn)">💡 뜻은 통했어요! 목표 표현 <b>${esc(c.vocab)}</b>도 써보세요.</div>` : '';
      h += `<div class="score-big" style="color:${scoreColor(spkResult.pct, 80, 50)}">${spkResult.pct}%</div><div class="detail"><b>내 발화:</b> ${esc(spkResult.heard || '(인식 없음)')}</div>
      <div class="detail" style="font-size:12px">타깃표현 ${spkResult.a1 == null ? '—' : spkResult.a1 + '%'} · 의미전달 ${spkResult.a2}% · 형태일치 ${spkResult.a3}%</div>${tgt}`;
    } else if (spkResult.heard) h += `<div class="detail">${esc(spkResult.heard)}</div>`;
    h += answerBlock(c) + variantsBlock(c) + `<div class="btn-row"><button class="big g2" onclick="startRec()">🎙️ 다시</button><button class="big g3" onclick="renderSpeak(true)">다음 →</button></div>`;
  } else {
    h += `<div class="btn-row"><button class="big gA" onclick="startRec()">🎙️ 말하기 시작</button><button class="ghost" onclick="spkResult={pct:-1};renderSpeak(false)">정답 먼저</button><button class="ghost" onclick="renderSpeak(true)">건너뛰기</button></div>`;
  }
  holder.innerHTML = h;
}
function startRec() {
  recognizing = true; spkResult = null; renderSpeak(false);
  listen(alts => {
    recognizing = false; let best = { pct: -2, heard: '' };
    alts.forEach(t => { const sc = scoreFlexible(spkCard, t, spkMode); if (sc.pct > best.pct) best = Object.assign(sc, { heard: t }); });
    if (best.pct >= 0) recordPractice(spkCard, 'speak', best.pct, best.missed || []);
    spkResult = best; renderSpeak(false);
  }, msg => { recognizing = false; spkResult = { pct: -1, heard: '(' + msg + ')' }; renderSpeak(false); });
}

/* ── 변형 드릴 ─────────────────────────────── */
let drillCard = null, drillObj = null, drillRevealed = false, drillAns = '';
function scoreDrill(answers, userText) {
  const uWords = new Set(norm(userText).split(' ').filter(Boolean)); let best = 0, ba = answers[0] || '', miss = [];
  for (const a of answers) { const cw = contentWords(a); const hit = cw.filter(w => uWords.has(w)).length; const cov = cw.length ? hit / cw.length : 0; const sc = cov * 0.65 + (wordDiff(a, userText).pct / 100) * 0.35; if (sc > best) { best = sc; ba = a; miss = cw.filter(w => !uWords.has(w)); } }
  return { pct: Math.round(best * 100), best: ba, missed: miss };
}
function pickDrill() {
  let pool = (poolMode === 'today' ? studiedToday() : studiedAll()).filter(d => d.drills && d.drills.length);
  if (!pool.length) pool = activeCards().filter(d => d.drills && d.drills.length);
  if (!pool.length) { drillCard = null; drillObj = null; return; }
  drillCard = pool[Math.floor(Math.random() * pool.length)]; drillObj = drillCard.drills[Math.floor(Math.random() * drillCard.drills.length)];
}
function renderDrill(fresh) {
  if (fresh || !drillCard) { pickDrill(); drillRevealed = false; drillAns = ''; }
  const holder = $('practiceCard'); $('practiceProgress').textContent = '변형 드릴 — 지시대로 바꿔 쓰거나 말하기';
  if (!drillCard) { holder.innerHTML = poolToggle('renderDrill') + '<div class="empty">드릴을 풀 문장이 없어요.</div>'; return; }
  const c = drillCard, dr = drillObj;
  let h = poolToggle('renderDrill') + `<div class="meta-row"><span class="tag red">${esc(c.level)}</span><span class="tag">${esc(c.ctx)}</span></div>
   <div class="sub">원래 문장</div><div style="font-size:18px;font-weight:700;margin:4px 0">${esc(c.text)} <button class="speak-btn" onclick="speakId('${c.id}')">🔊</button></div>
   <div class="hint">👉 <b>${esc(dr.inst)}</b> 로 바꿔보세요.</div>
   <input type="text" id="drillInput" placeholder="바꾼 문장 입력 또는 🎙️" autocomplete="off" autocapitalize="off" ${drillRevealed ? 'disabled' : ''} value="${esc(drillAns)}">`;
  if (drillRevealed) {
    const d = scoreDrill(dr.answers, drillAns);
    h += `<div class="score-big" style="color:${scoreColor(d.pct, 75, 50)}">${d.pct}%</div><div class="detail"><b>정답 예시</b><br>` + dr.answers.map((a, i) => `• ${esc(a)} <button class="speak-btn" onclick="speak(drillObj.answers[${i}])">🔊</button>`).join('<br>') + `</div>
     <div class="btn-row"><button class="big g3" onclick="renderDrill(true)">다음 드릴 →</button></div>`;
  } else h += `<div class="btn-row"><button class="big g4" onclick="checkDrill()">채점</button><button class="big gA" onclick="drillRec()">🎙️ 말하기</button><button class="ghost" onclick="renderDrill(true)">건너뛰기</button></div>`;
  holder.innerHTML = h;
  const inp = $('drillInput'); if (inp && !drillRevealed) inp.onkeydown = e => { if (e.key === 'Enter') checkDrill(); };
}
function checkDrill() { drillAns = $('drillInput').value; const d = scoreDrill(drillObj.answers, drillAns); recordPractice(drillCard, 'write', d.pct, d.missed); drillRevealed = true; renderDrill(false); }
function drillRec() { toast('🎙️ 듣고 있어요…', 4000); listen(alts => { let bt = '', bp = -1; alts.forEach(t => { const sc = scoreDrill(drillObj.answers, t); if (sc.pct > bp) { bp = sc.pct; bt = t; } }); drillAns = bt; const d = scoreDrill(drillObj.answers, bt); recordPractice(drillCard, 'speak', d.pct, d.missed); drillRevealed = true; renderDrill(false); }, msg => toast(msg)); }

/* ── 롤플레이 ─────────────────────────────── */
let dlgActive = null, dlgTurn = 0, dlgResult = null, dlgShowText = true;
function startDialog(id) { dlgActive = DIALOGS_BY_ID[id]; dlgActive._done = false; dlgTurn = 0; dlgResult = null; renderDialog(); }
function nextTurn() { dlgTurn++; dlgResult = null; if (dlgTurn >= dlgActive.turns.length && !dlgActive._done) { dlgActive._done = true; S.stats.dialogsDone++; save(); } renderDialog(); }
function checkDlg() { const v = ($('dlgInput') || {}).value || ''; const t = dlgActive.turns[dlgTurn]; dlgResult = { pct: scoreDrill(t.answers || [t.text], v).pct, typed: v }; renderDialog(); }
function dlgRec() { const t = dlgActive.turns[dlgTurn]; toast('🎙️ 듣고 있어요…', 4000); listen(alts => { let bt = '', bp = -1; alts.forEach(x => { const sc = scoreDrill(t.answers || [t.text], x); if (sc.pct > bp) { bp = sc.pct; bt = x; } }); dlgResult = { pct: bp, heard: bt }; renderDialog(); }, msg => toast(msg)); }
function renderDialog() {
  const holder = $('practiceCard'); $('practiceProgress').textContent = '롤플레이 — 앱이 상대역, 나는 내 차례를 말하기';
  if (!dlgActive) {
    const list = DIALOGS.filter(d => S.levels[d.level]);
    if (!list.length) { holder.innerHTML = '<div class="empty">선택한 레벨의 대화가 없어요. 기록 탭에서 레벨을 켜보세요.</div>'; return; }
    holder.innerHTML = '<div class="sub" style="margin-bottom:10px">대화를 골라 역할극을 시작하세요.</div>' + list.map(d => `<div class="list-item" onclick="startDialog('${d.id}')"><span class="tag red">${d.level}</span> <span class="t">${esc(d.title)}</span><div class="sub">${esc(d.scene)}</div></div>`).join('');
    return;
  }
  const d = dlgActive;
  if (dlgTurn >= d.turns.length) { holder.innerHTML = `<div class="empty">🎉 대화 완료!<br><br><button class="ghost" onclick="dlgActive=null;renderDialog()">목록으로</button> <button class="ghost" onclick="startDialog('${d.id}')">다시</button></div>`; return; }
  const t = d.turns[dlgTurn]; const prog = `(${dlgTurn + 1}/${d.turns.length})`;
  let h = `<div class="pill-group" style="margin-bottom:10px"><span class="pill ${dlgShowText ? 'on' : ''}" onclick="dlgShowText=!dlgShowText;renderDialog()">상대 자막 ${dlgShowText ? 'ON' : 'OFF'}</span><button class="ghost sm" onclick="dlgActive=null;renderDialog()">목록으로</button></div><div class="sub">${d.level} · ${esc(d.title)}</div>`;
  if (t.role === 'npc') {
    h += `<div style="background:#f1ede8;border-radius:14px;padding:14px;margin-top:12px;line-height:1.6">🗣️ 상대 ${prog} <button class="speak-btn" onclick="speak(dlgActive.turns[${dlgTurn}].text)">🔊</button><br>${dlgShowText ? '<b>' + esc(t.text) + '</b><br>' : ''}<span class="sub">${esc(t.ko)}</span></div><div class="btn-row"><button class="big g3" onclick="nextTurn()">다음 ▶</button></div>`;
  } else {
    h += `<div class="detail">🙋 내 차례 ${prog}</div><div class="ko-big" style="font-size:18px">${esc(t.ko)}</div>`;
    if (dlgResult) {
      const ans = t.answers || [t.text];
      h += `<div class="score-big" style="color:${scoreColor(dlgResult.pct, 70, 45)}">${dlgResult.pct}%</div><div class="detail"><b>내 답:</b> ${esc(dlgResult.heard || dlgResult.typed || '(없음)')}</div>
       <div class="detail"><b>모범 답안</b><br>` + ans.map((a, i) => `• ${esc(a)} <button class="speak-btn" onclick="speak((dlgActive.turns[${dlgTurn}].answers||[])[${i}])">🔊</button>`).join('<br>') + `</div><div class="btn-row"><button class="big g3" onclick="nextTurn()">다음 ▶</button></div>`;
    } else h += `<input type="text" id="dlgInput" placeholder="대답 입력 또는 🎙️" autocomplete="off" autocapitalize="off"><div class="btn-row"><button class="big g4" onclick="checkDlg()">채점</button><button class="big gA" onclick="dlgRec()">🎙️ 말하기</button><button class="ghost" onclick="nextTurn()">건너뛰기</button></div>`;
  }
  holder.innerHTML = h;
  if (t.role === 'npc') speak(t.text);
  const inp = $('dlgInput'); if (inp) inp.onkeydown = e => { if (e.key === 'Enter') checkDlg(); };
}

/* ── 읽기: 주간 시사 팩 ─────────────────────── */
const PACKS = { index: null, cache: {}, latest: null, error: null };
async function fetchJSON(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function loadPackIndex() {
  try {
    const idx = await fetchJSON('packs/index.json');
    PACKS.index = (idx.packs || []).slice().sort((a, b) => b.id.localeCompare(a.id));
    if (PACKS.index.length) PACKS.latest = await loadPack(PACKS.index[0].id);
    PACKS.error = null;
  } catch (e) { PACKS.error = '기사 팩을 불러오지 못했어요. 인터넷 연결을 확인해주세요.'; }
  if (currentTab === 'read') renderRead(); if (currentTab === 'today') renderToday();
}
async function loadPack(id) {
  if (PACKS.cache[id]) return PACKS.cache[id];
  const meta = (PACKS.index || []).find(p => p.id === id); if (!meta) return null;
  const p = await fetchJSON('packs/' + meta.file); PACKS.cache[id] = p; return p;
}
let rdView = { pack: null, art: null, phase: 'read', showKo: false, quiz: {} };
function findArticle(id) { for (const k in PACKS.cache) { const a = PACKS.cache[k].articles.find(x => x.id === id); if (a) return { pack: PACKS.cache[k], art: a }; } return null; }
async function openPack(id) { try { rdView.pack = await loadPack(id); rdView.art = null; renderRead(); } catch (e) { toast('팩을 불러오지 못했어요'); } }
function openArticle(id) { const f = findArticle(id); if (!f) return; rdView.pack = f.pack; rdView.art = f.art; rdView.phase = 'read'; rdView.showKo = false; rdView.quiz = {}; renderRead(); window.scrollTo(0, 0); }
function markGlossary(text, glossary) {
  let out = esc(text);
  (glossary || []).forEach((g, i) => {
    const w = esc(g.w); if (!w) return;
    const re = new RegExp('(^|[^\\p{L}])(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=[^\\p{L}]|$)', 'iu');
    out = out.replace(re, (m, pre, word) => `${pre}<span class="gl" onclick="glossTip(${i})">${word}</span>`);
  });
  return out;
}
function glossTip(i) { const g = rdView.art.glossary[i]; toast(`<b>${esc(g.w)}</b> — ${esc(g.ko)}${g.ex ? '<br><span style="opacity:.8">' + esc(g.ex) + '</span>' : ''}`, 4000); }
function renderRead() {
  const el = $('panel-read');
  if (!PACKS.index) { el.innerHTML = PACKS.error ? `<div class="card empty">${PACKS.error}<br><br><button class="ghost" onclick="loadPackIndex()">다시 시도</button></div>` : '<div class="card empty">기사 팩 불러오는 중…</div>'; return; }
  if (rdView.hlList) { renderHLList(el); hlBarUpdate(); return; }
  if (rdView.art) return renderArticle(el);
  const pack = rdView.pack || PACKS.latest;
  if (!pack) { el.innerHTML = '<div class="card empty">아직 기사 팩이 없어요.</div>'; return; }
  let h = `<div class="pill-group" style="justify-content:flex-end"><button class="ghost sm" onclick="rdView.hlList=true;renderRead()">🖍️ 형광펜 모음 (${S.hl.length})</button></div><h2 class="sec">📰 ${esc(pack.title)}</h2><div class="sub" style="margin:0 4px 12px">${esc(pack.intro || '')}</div>`;
  h += pack.articles.map(a => {
    const r = S.read[a.id] || {};
    return `<div class="list-item" onclick="openArticle('${a.id}')"><div class="meta-row" style="margin-bottom:6px"><span class="tag red">${esc(a.topic)}</span><span class="tag">${esc(a.level || 'B2')}</span>${r.done ? '<span class="tag green">✓ 읽음' + (r.quiz != null ? ' · ' + r.quiz + '%' : '') + '</span>' : ''}${r.wrote ? '<span class="tag green">✍️ 씀</span>' : ''}</div>
      <div class="t">${esc(a.title)}</div><div class="sub">${esc(a.title_ko || '')}</div></div>`;
  }).join('');
  if (PACKS.index.length > 1) {
    h += `<h2 class="sec">지난 팩</h2>` + PACKS.index.map(p => `<div class="list-item" onclick="openPack('${p.id}')"><span class="t">${esc(p.title)}</span>${pack.id === p.id ? ' <span class="tag">보는 중</span>' : ''}</div>`).join('');
  }
  el.innerHTML = h;
  hlBarUpdate();
}
function renderArticle(el) {
  const a = rdView.art; const r = S.read[a.id] || {};
  let h = `<div class="pill-group" style="margin-bottom:10px"><button class="ghost sm" onclick="stopSpeak();rdView.art=null;renderRead()">← 목록</button>
    <button class="ghost sm" onclick="speakSeq(rdView.art.paragraphs)">▶ 전체 듣기</button><button class="ghost sm" onclick="stopSpeak()">■ 정지</button>
    <span class="pill ${rdView.showKo ? 'on' : ''}" onclick="rdView.showKo=!rdView.showKo;renderRead()">한국어 요약</span></div>`;
  h += `<div class="card article"><div class="meta-row"><span class="tag red">${esc(a.topic)}</span><span class="tag">${esc(a.level || 'B2')}</span>${a.words ? '<span class="tag">' + a.words + '단어</span>' : ''}</div>
    <h3>${esc(a.title)}</h3><div class="src">출처: <a href="${esc(a.source.url)}" target="_blank" rel="noopener">${esc(a.source.name)} · ${esc(a.source.date)}</a> 원문을 B2 수준으로 다시 쓴 학습용 글이에요.</div>`;
  if (rdView.showKo && a.summary_ko) h += `<div class="task-box" style="margin-top:12px">${esc(a.summary_ko)}</div>`;
  h += `<div style="margin-top:16px" id="artBody">` + a.paragraphs.map((p, i) => `<p class="para"><span class="ptext" data-p="${i}">${renderParaHTML(a, i)}</span> <button class="speak-btn" onclick="speak(rdView.art.paragraphs[${i}])">🔊</button></p>`).join('') + `</div>${rateRow()}</div>`;
  if (a.glossary && a.glossary.length) h += `<div class="card"><b>어휘</b> <span class="sub">(본문 밑줄 단어를 눌러도 보여요)</span><div class="detail">` + a.glossary.map(g => `<b>${esc(g.w)}</b> — ${esc(g.ko)}`).join('<br>') + `</div></div>`;
  if (a.expressions && a.expressions.length) {
    h += `<div class="card"><b>가져갈 표현</b> <span class="sub">카드로 만들면 '오늘' 복습에 나와요</span>` + a.expressions.map((x, i) => {
      const have = S.mine.some(m => m.text === x.es);
      return `<div class="expr"><div><b>${esc(x.es)}</b> <button class="speak-btn" onclick="speak(rdView.art.expressions[${i}].es)">🔊</button><div class="sub">${esc(x.ko)}${x.note ? ' · ' + esc(x.note) : ''}</div></div><button class="ghost sm" ${have ? 'disabled' : ''} onclick="addExpr(${i})">${have ? '추가됨' : '+ 카드'}</button></div>`;
    }).join('') + `<div class="btn-row"><button class="ghost" onclick="addAllExpr()">표현 전부 카드로</button></div></div>`;
  }
  // 퀴즈
  if (a.questions && a.questions.length) {
    h += `<div class="card"><b>이해 확인</b>`;
    a.questions.forEach((q, qi2) => {
      const pick = rdView.quiz[qi2];
      h += `<div style="margin-top:14px;font-weight:700;line-height:1.5">${qi2 + 1}. ${esc(q.q)}</div>` + q.options.map((o, oi) => {
        let cls = ''; if (pick != null) { if (oi === q.answer) cls = 'right'; else if (oi === pick) cls = 'wrong'; }
        return `<button class="ghost quiz-opt ${cls}" ${pick != null ? 'disabled' : ''} onclick="answerQ(${qi2},${oi})">${esc(o)}</button>`;
      }).join('') + (pick != null && q.explain ? `<div class="detail">💡 ${esc(q.explain)}</div>` : '');
    });
    h += `</div>`;
  }
  if (a.discuss && a.discuss.length) h += `<div class="card"><b>생각해볼 질문</b> <span class="sub">소리 내어 답해보거나 일기 소재로</span><div class="detail">` + a.discuss.map((d, i) => `• ${esc(d.es)} <button class="speak-btn" onclick="speak(rdView.art.discuss[${i}].es)">🔊</button><br><span style="font-size:13px">${esc(d.ko)}</span>`).join('<br>') + `</div></div>`;
  if (a.writing) h += `<div class="card"><b>✍️ 이 기사로 쓰기</b> <span class="sub">DELE B2 작문형 · ${esc(a.writing.words || '150–180')}단어</span><div class="task-box" style="margin-top:10px"><div class="es">${esc(a.writing.task_es)}</div>${esc(a.writing.task_ko)}</div>
    <div class="btn-row"><button class="big gA" onclick="startWriting('opinion','${a.id}')">이 주제로 의견문 쓰기</button></div></div>`;
  h += `<div class="btn-row" style="margin-bottom:10px">${r.done ? '<span class="tag green" style="padding:10px 14px">✓ 읽기 완료</span>' : `<button class="big g3" onclick="markRead()">다 읽었어요</button>`}</div>`;
  el.innerHTML = h;
  $('artBody').addEventListener('click', hlArticleClick);
  hlBarUpdate();
}
function answerQ(qi2, oi) {
  rdView.quiz[qi2] = oi; const a = rdView.art;
  const answered = Object.keys(rdView.quiz).length;
  if (answered === a.questions.length) {
    const right = a.questions.filter((q, i) => rdView.quiz[i] === q.answer).length;
    const r = S.read[a.id] = S.read[a.id] || {};
    if (r.quiz == null) { S.stats.quizRight += right; S.stats.quizTotal += a.questions.length; }
    r.quiz = Math.round(right / a.questions.length * 100); r.done = true; r.day = r.day || today(); touchStreak(); save();
    toast(`정답 ${right}/${a.questions.length}`);
  }
  renderRead();
}
function markRead() { const r = S.read[rdView.art.id] = S.read[rdView.art.id] || {}; r.done = true; r.day = today(); touchStreak(); save(); renderRead(); toast('📖 읽기 완료!'); }
function exprCard(x, a) { return mkMine(x.es, x.ko, x.note || '', '기사 · ' + a.title.slice(0, 30), x.note || ''); }
function addExpr(i) { const a = rdView.art; const n = addMine([exprCard(a.expressions[i], a)]); toast(n ? '카드 추가! 오늘 탭 새 문장에 나와요' : '이미 있는 문장이에요'); queueBuilt = false; renderRead(); }
function addAllExpr() { const a = rdView.art; const n = addMine(a.expressions.map(x => exprCard(x, a))); toast(n + '개 카드 추가'); queueBuilt = false; renderRead(); }

/* ── 형광펜 ─────────────────────────────────
   저장: S.hl = [{id, art, p(문단), s, e(문자 위치), c(색), text, note, created}]
   칠하기: ① 색 고르고 문장 탭 → 문장 전체  ② 길게 눌러 선택 → 색 탭 → 선택 부분 */
const HL_COLORS = [
  { id: 'y', label: '모르겠는 문장', emoji: '🟨', bg: '#ffe680' },
  { id: 'g', label: '핵심 문장', emoji: '🟩', bg: '#b6ecb9' },
  { id: 'b', label: '써먹을 표현', emoji: '🟦', bg: '#b3dcfb' },
  { id: 'p', label: '문법 궁금', emoji: '🟪', bg: '#e6c8f5' },
  { id: 'o', label: '내 생각·반론', emoji: '🟧', bg: '#ffd0a6' },
];
const HL_BY = {}; HL_COLORS.forEach(c => HL_BY[c.id] = c);
function hlLabel(c) { return (S.hlLabels && S.hlLabels[c]) || HL_BY[c].label; }
let hlPen = null;          // 문장 탭 모드에서 쓸 색 (null이면 꺼짐)
let hlPending = null;      // 직접 선택한 범위 {p, s, e}
function hlForArt(artId) { return S.hl.filter(h => h.art === artId); }
function renderParaHTML(a, i) {
  const text = a.paragraphs[i];
  const hs = S.hl.filter(h => h.art === a.id && h.p === i && h.s < h.e && h.e <= text.length).sort((x, y) => x.s - y.s);
  let out = '', pos = 0;
  for (const h of hs) {
    if (h.s < pos) continue; // 겹침 방어
    out += markGlossary(text.slice(pos, h.s), a.glossary);
    out += `<mark class="hl hl-${h.c}" data-h="${h.id}">${esc(text.slice(h.s, h.e))}${h.note ? '<sup>✎</sup>' : ''}</mark>`;
    pos = h.e;
  }
  return out + markGlossary(text.slice(pos), a.glossary);
}
function hlOffset(container, node, off) { const r = document.createRange(); r.setStart(container, 0); r.setEnd(node, off); return r.toString().length; }
function hlContainer(node) { const el = node && (node.nodeType === 1 ? node : node.parentElement); return el && el.closest ? el.closest('.ptext') : null; }
function isWordCh(ch) { return !!ch && /[\p{L}\p{N}'’-]/u.test(ch); }
function snapWord(text, s, e) {
  while (s > 0 && isWordCh(text[s - 1])) s--;
  while (e < text.length && isWordCh(text[e])) e++;
  while (s < e && /\s/.test(text[s])) s++; while (e > s && /\s/.test(text[e - 1])) e--;
  return [s, e];
}
function sentenceAt(text, off) {
  const re = /[.!?…]["»”]?\s+/g; let m, s = 0, e = text.length;
  while ((m = re.exec(text))) { const end = m.index + m[0].length; if (end <= off) s = end; else { e = m.index + m[0].trimEnd().length; break; } }
  return [s, e];
}
function addHL(p, s, e, c) {
  const a = rdView.art; const text = a.paragraphs[p];
  if (e - s < 1) return null;
  S.hl = S.hl.filter(h => !(h.art === a.id && h.p === p && h.s < e && s < h.e)); // 겹치는 기존 형광펜은 교체
  const h = { id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), art: a.id, p, s, e, c, text: text.slice(s, e), note: '', created: new Date().toISOString(), title: a.title };
  S.hl.push(h); save(); return h;
}
function hlRerender() { const y = window.scrollY; renderRead(); window.scrollTo(0, y); }
// 직접 선택 감지
document.addEventListener('selectionchange', () => {
  if (currentTab !== 'read' || !rdView.art) return;
  const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return;
  if (sel.isCollapsed) { if (hlPending) { clearTimeout(hlPending._t); hlPending._t = setTimeout(() => { const s2 = window.getSelection(); if (s2 && s2.isCollapsed) { hlPending = null; hlBarUpdate(); } }, 600); } return; }
  const r = sel.getRangeAt(0); const c1 = hlContainer(r.startContainer); if (!c1) return;
  const p = +c1.dataset.p; const text = rdView.art.paragraphs[p];
  let s = hlOffset(c1, r.startContainer, r.startOffset);
  const c2 = hlContainer(r.endContainer);
  let e = (c2 === c1) ? hlOffset(c1, r.endContainer, r.endOffset) : text.length; // 문단을 넘기면 첫 문단 끝까지
  [s, e] = snapWord(text, Math.max(0, s), Math.min(text.length, e));
  if (e > s) { hlPending = { p, s, e }; hlBarUpdate(); }
});
function hlArticleClick(ev) {
  const mk = ev.target.closest('mark.hl');
  if (mk) { ev.preventDefault(); openHL(mk.dataset.h); return; }
  if (!hlPen) return;
  const c = hlContainer(ev.target); if (!c) return;
  const sel = window.getSelection(); if (sel && !sel.isCollapsed) return; // 드래그 선택 중이면 무시
  let off = null;
  if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(ev.clientX, ev.clientY); if (r && c.contains(r.startContainer)) off = hlOffset(c, r.startContainer, r.startOffset); }
  else if (document.caretPositionFromPoint) { const r = document.caretPositionFromPoint(ev.clientX, ev.clientY); if (r && c.contains(r.offsetNode)) off = hlOffset(c, r.offsetNode, r.offset); }
  if (off == null) return;
  const p = +c.dataset.p; const [s, e] = sentenceAt(rdView.art.paragraphs[p], off);
  if (addHL(p, s, e, hlPen)) { if (navigator.vibrate) navigator.vibrate(10); hlRerender(); }
}
function hlBarUpdate() {
  const bar = $('hlBar'); if (!bar) return;
  const on = currentTab === 'read' && rdView.art && !rdView.hlList;
  bar.classList.toggle('show', !!on); document.body.classList.toggle('hl-on', !!on);
  if (!on) { hlPen = null; hlPending = null; return; }
  const hint = hlPending ? '선택한 부분을 칠할 색을 누르세요' : hlPen ? `${HL_BY[hlPen].emoji} ${esc(hlLabel(hlPen))} — 문장을 탭하면 칠해져요` : '🖍️ 색을 고르고 문장을 탭하거나, 길게 눌러 선택하세요';
  bar.innerHTML = `<div class="hl-hint">${hint}</div><div class="hl-row">` + HL_COLORS.map(c => `<button class="hl-sw ${hlPen === c.id ? 'on' : ''}" style="background:${c.bg}" onmousedown="event.preventDefault()" ontouchstart="" onclick="hlColorTap('${c.id}')"><span>${esc(hlLabel(c.id))}</span></button>`).join('') +
    (hlPen ? `<button class="hl-sw done" onclick="hlPen=null;hlBarUpdate()">끄기</button>` : '') + `</div>`;
}
function hlColorTap(c) {
  if (hlPending) {
    const { p, s, e } = hlPending; hlPending = null;
    const h = addHL(p, s, e, c); try { window.getSelection().removeAllRanges(); } catch (_) { }
    if (h) { hlRerender(); toast(`${HL_BY[c].emoji} 칠했어요 · 누르면 메모·질문`); }
    return;
  }
  hlPen = hlPen === c ? null : c; hlBarUpdate();
}
function hlById(id) { return S.hl.find(h => h.id === id); }
function openHL(id) {
  const h = hlById(id); if (!h) return; const col = HL_BY[h.c];
  openOverlay(`<div style="border-left:5px solid ${col.bg};padding:6px 12px;background:${col.bg}55;border-radius:0 10px 10px 0;font-size:17px;line-height:1.7;font-family:'Iowan Old Style',Georgia,serif">${esc(h.text)} <button class="speak-btn" onclick="speak(hlById('${h.id}').text)">🔊</button></div>
    <div class="sub" style="margin-top:6px">${esc(h.title || '')}</div>
    <div class="pill-group" style="margin-top:12px">${HL_COLORS.map(c => `<span class="pill" style="background:${c.bg};border-color:${h.c === c.id ? 'var(--ink)' : c.bg};color:var(--ink);${h.c === c.id ? 'box-shadow:0 0 0 2px var(--ink)' : ''}" onclick="hlSetColor('${h.id}','${c.id}')">${esc(hlLabel(c.id))}</span>`).join('')}</div>
    <textarea id="hlNote" rows="3" placeholder="메모: 뜻, 궁금한 점, 내 생각…">${esc(h.note || '')}</textarea>
    <div class="btn-row" style="margin-top:12px"><button class="big gK" onclick="askClaudeHL('${h.id}')">🤔 Claude에게 물어보기</button></div>
    <div class="btn-row" style="margin-top:8px"><button class="ghost" onclick="hlToCard('${h.id}')">+ 복습 카드</button><button class="ghost" onclick="copyText(hlById('${h.id}').text).then(()=>toast('복사했어요'))">복사</button><button class="ghost" style="color:var(--bad)" onclick="hlDelete('${h.id}')">지우기</button></div>
    <button class="flip" onclick="hlSaveNote('${h.id}');closeOverlay()">닫기</button>`);
  const ta = $('hlNote'); ta.oninput = () => { clearTimeout(ta._t); ta._t = setTimeout(() => hlSaveNote(h.id, true), 500); };
}
function hlSaveNote(id, quiet) { const h = hlById(id); const ta = $('hlNote'); if (!h || !ta) return; const changed = h.note !== ta.value; h.note = ta.value; save(); if (changed && !quiet && currentTab === 'read') hlRerender(); }
function hlSetColor(id, c) { hlSaveNote(id, true); const h = hlById(id); h.c = c; save(); openHL(id); if (currentTab === 'read') hlRerender(); }
function hlDelete(id) { S.hl = S.hl.filter(h => h.id !== id); save(); closeOverlay(); if (currentTab === 'read') hlRerender(); toast('지웠어요'); }
function hlToCard(id) {
  hlSaveNote(id, true); const h = hlById(id);
  if (!h.note.trim()) { toast('메모에 뜻을 먼저 적어주세요. 카드 앞면에 나와요'); $('hlNote').focus(); return; }
  const n = addMine([mkMine(h.text, h.note.trim(), '', '형광펜 · ' + (h.title || '').slice(0, 30), '')]); queueBuilt = false;
  toast(n ? '카드 추가! 앞면에 내 메모, 뒷면에 문장' : '이미 있는 문장이에요');
}
function hlPrompt(h) {
  const f = findArticle(h.art); const para = f ? f.art.paragraphs[h.p] : '';
  const ask = {
    y: '1) 자연스러운 한국어 번역\n2) 문장 구조 분해 (주절·종속절, 주어·동사가 어디인지, 대명사가 가리키는 것)\n3) 이해를 막는 핵심 단어·표현 풀이\n4) 이 문장을 더 쉬운 스페인어로 바꿔 말하면?',
    g: '1) 자연스러운 한국어 번역\n2) 이 문장이 글 전체에서 하는 역할 (주장/근거/전환 등)\n3) 같은 뜻을 내 말로 바꿔 쓴 스페인어 문장 2개 (B2 수준, 의견문에 쓸 수 있게)',
    b: '1) 이 표현의 뜻과 뉘앙스\n2) 어떤 상황·문체(구어/문어)에서 쓰는지\n3) 내가 일기나 의견문에 쓸 수 있는 예문 3개 (한국어 뜻 포함)\n4) 비슷한 표현과의 차이',
    p: '1) 자연스러운 한국어 번역\n2) 여기 쓰인 문법 구조를 자세히 설명 (왜 이 시제·법·구조인지, 다른 걸 쓰면 뜻이 어떻게 달라지는지)\n3) 같은 구조로 만든 쉬운 예문 3개',
    o: '1) 이 문장의 주장을 한 줄로 요약\n2) 이에 대한 반론이나 다른 관점 2가지 (한국어 설명 + 스페인어 한 문장씩)\n3) 내가 의견문에서 이 주장에 동의하거나 반박할 때 쓸 수 있는 스페인어 문장 틀 3개',
  }[h.c];
  return `나는 스페인어 B2(DELE B2 준비) 학습자야. 시사 기사를 읽다가 이 부분에 형광펜을 칠했어. 설명은 한국어로, 예문은 스페인어로 해줘.

[칠한 부분]
${h.text}

[문맥 (그 문단)]
${para}
${h.note ? '\n[내 메모]\n' + h.note + '\n' : ''}
[알고 싶은 것]
${ask}`;
}
function askClaudeHL(id) { hlSaveNote(id, true); openClaudeWith(hlPrompt(hlById(id))); }
// 형광펜 모음
let hlFilter = null;
function renderHLList(el) {
  const list = S.hl.filter(h => !hlFilter || h.c === hlFilter).slice().reverse();
  let h = `<div class="pill-group" style="margin-bottom:10px"><button class="ghost sm" onclick="rdView.hlList=false;renderRead()">← 기사 목록</button><button class="ghost sm" onclick="editHLLabels()">색 이름 바꾸기</button></div>
    <h2 class="sec">🖍️ 형광펜 모음 (${S.hl.length})</h2><div class="pill-group" style="margin-bottom:12px"><span class="pill ${!hlFilter ? 'on' : ''}" onclick="hlFilter=null;renderRead()">전체</span>` +
    HL_COLORS.map(c => { const n = S.hl.filter(x => x.c === c.id).length; return `<span class="pill" style="background:${c.bg};border-color:${hlFilter === c.id ? 'var(--ink)' : c.bg};color:var(--ink);${hlFilter === c.id ? 'box-shadow:0 0 0 2px var(--ink)' : ''}" onclick="hlFilter='${c.id}';renderRead()">${esc(hlLabel(c.id))} ${n}</span>`; }).join('') + `</div>`;
  if (!list.length) h += `<div class="card empty">아직 칠한 문장이 없어요.<br>기사를 읽으면서 아래 형광펜 막대로 칠해보세요.</div>`;
  h += list.map(x => `<div class="list-item" style="border-left:5px solid ${HL_BY[x.c].bg}" onclick="openHL('${x.id}')"><div style="font-size:15px;line-height:1.6">${esc(x.text)}</div>${x.note ? `<div class="sub" style="margin-top:4px">✎ ${esc(x.note)}</div>` : ''}<div class="sub" style="margin-top:4px;font-size:12px">${esc(hlLabel(x.c))} · ${esc((x.title || '').slice(0, 40))} <a href="#" onclick="event.stopPropagation();event.preventDefault();gotoHL('${x.id}')">기사에서 보기 →</a></div></div>`).join('');
  el.innerHTML = h;
}
async function gotoHL(id) {
  const h = hlById(id); if (!h) return;
  if (!findArticle(h.art)) { const pid = h.art.replace(/-\d+$/, ''); try { await loadPack(pid); } catch (e) { toast('기사를 불러오지 못했어요'); return; } }
  rdView.hlList = false; openArticle(h.art);
  setTimeout(() => { const m = document.querySelector(`mark[data-h="${id}"]`); if (m) { m.scrollIntoView({ behavior: 'smooth', block: 'center' }); m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1600); } }, 80);
}
function editHLLabels() {
  openOverlay(`<h2>색 이름 바꾸기</h2><p>내 방식대로 색의 의미를 정하세요.</p>` + HL_COLORS.map(c => `<div style="display:flex;align-items:center;gap:8px;margin-top:8px"><span style="width:26px;height:26px;border-radius:7px;background:${c.bg};flex:none"></span><input type="text" id="hlLab_${c.id}" value="${esc(hlLabel(c.id))}" style="margin-top:0"></div>`).join('') +
    `<button class="flip" onclick="saveHLLabels()">저장</button><button class="ghost" style="width:100%;margin-top:8px" onclick="S.hlLabels={};save();closeOverlay();renderRead()">기본값으로</button>`);
}
function saveHLLabels() { S.hlLabels = {}; HL_COLORS.forEach(c => { const v = $('hlLab_' + c.id).value.trim(); if (v && v !== c.label) S.hlLabels[c.id] = v.slice(0, 12); }); save(); closeOverlay(); renderRead(); }
function hlRefBox(articleId) {
  const hs = hlForArt(articleId).slice().sort((a, b) => a.p - b.p || a.s - b.s);
  if (!hs.length) return '';
  return `<details class="card" ${hs.length <= 6 ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">🖍️ 이 기사에서 칠한 문장 ${hs.length}개</summary><div class="sub" style="margin:6px 0">그대로 옮기지 말고 내 말로 바꿔 쓰는 재료로 쓰세요.</div>` +
    hs.map(x => `<div style="border-left:4px solid ${HL_BY[x.c].bg};padding:6px 10px;margin-top:8px;font-size:14px;line-height:1.6;background:${HL_BY[x.c].bg}33;border-radius:0 8px 8px 0">${esc(x.text)} <button class="speak-btn" style="font-size:16px" onclick="speak(hlById('${x.id}').text)">🔊</button>${x.note ? `<div class="sub">✎ ${esc(x.note)}</div>` : ''}</div>`).join('') + `</details>`;
}

/* ── 쓰기: 일기 + Claude 첨삭 ─────────────────── */
const DIARY_PROMPTS = [
  { es: '¿Qué ha salido hoy de forma distinta a lo que esperabas?', ko: '오늘 예상과 다르게 흘러간 일', focus: 'Si hubiera sabido… / no esperaba que + 접속법 과거' },
  { es: 'Describe a alguien que te ha llamado la atención esta semana.', ko: '이번 주 눈에 띈 사람 묘사하기', focus: 'ser/estar, parecer que, me da la impresión de que' },
  { es: '¿Qué harías si tuvieras un mes libre sin obligaciones?', ko: '의무 없는 한 달이 생긴다면?', focus: 'si + 접속법 과거, 조건법' },
  { es: 'Cuenta algo que hayas aprendido recientemente y por qué te importa.', ko: '최근 배운 것과 그게 중요한 이유', focus: 'lo que más me sorprendió fue…, me di cuenta de que' },
  { es: '¿Qué hábito te gustaría cambiar? ¿Qué te lo impide?', ko: '바꾸고 싶은 습관과 걸림돌', focus: 'me gustaría que + 접속법, lo que me impide es…' },
  { es: 'Escribe sobre una conversación que no se te va de la cabeza.', ko: '머릿속에서 떠나지 않는 대화', focus: '간접화법: me dijo que…, me preguntó si…' },
  { es: 'Recomienda un libro, una serie o un lugar y convénceme.', ko: '책·드라마·장소 하나 추천하고 설득하기', focus: 'te recomiendo que + 접속법, vale la pena' },
  { es: '¿Cómo era tu vida hace cinco años? ¿Qué ha cambiado?', ko: '5년 전의 나와 지금', focus: '불완료과거 vs 현재완료, solía + 부정사' },
  { es: 'Escribe una queja educada sobre algo que te molesta de tu ciudad.', ko: '내 도시의 불편한 점, 정중하게 불평하기', focus: 'me molesta que + 접속법, sería conveniente que' },
  { es: '¿Qué significa para ti «tener éxito»?', ko: '나에게 "성공"이란', focus: 'para mí, lo importante no es… sino…' },
  { es: 'Narra un pequeño momento feliz de esta semana con detalles.', ko: '이번 주 작은 행복의 순간을 자세히', focus: '단순과거 + 불완료과거 묘사, de repente' },
  { es: 'Escríbele una carta a tu yo de dentro de diez años.', ko: '10년 뒤의 나에게 편지', focus: 'espero que + 접속법, cuando + 접속법(미래)' },
  { es: '¿Estás de acuerdo con que «el trabajo duro siempre se recompensa»?', ko: '"노력은 반드시 보상받는다"에 동의?', focus: 'no creo que + 접속법, sin embargo, en cambio' },
  { es: 'Describe tu rutina ideal de un domingo.', ko: '이상적인 일요일 루틴', focus: 'me encantaría…, primero / luego / al final' },
  { es: '¿Qué te preocupa últimamente y qué podrías hacer al respecto?', ko: '요즘의 걱정과 할 수 있는 일', focus: 'me preocupa que + 접속법, a lo mejor, quizás + 접속법' },
  { es: 'Compara cómo se vive en Corea y en un país hispanohablante.', ko: '한국과 스페인어권의 생활 비교', focus: 'mientras que, a diferencia de, tanto… como' },
];
function pickTargets(n) {
  // 최근 3일 안에 학습한 문장의 핵심 표현 → 없으면 레벨 문장에서 무작위
  const t = today(); let ids = [];
  for (let k = 0; k < 4; k++) ids = ids.concat((S.stats.daily[String(t - k)] || {}).ids || []);
  let pool = [...new Set(ids)].map(id => BY_ID[id]).filter(Boolean);
  if (pool.length < n) pool = pool.concat(shuffle(SENTENCES.filter(d => S.levels[d.level])).slice(0, 20));
  const out = []; const seen = new Set();
  for (const c of shuffle(pool.slice())) {
    let expr = (c.key && c.key[0]) || '';
    if (!expr && c.vocab) expr = c.vocab.split(/[,·]/)[0].replace(/[ㄱ-힝()]/g, '').trim();
    expr = expr.replace(/\s+/g, ' ').trim();
    if (!expr || expr.length > 40 || seen.has(expr)) continue;
    seen.add(expr); out.push({ es: expr, from: c.text, ko: c.ko });
    if (out.length >= n) break;
  }
  return out;
}
/* ── B2 문법 미션: DELE B2 작문에서 '자유자재로' 써야 하는 구조 ── */
const GRAM_CATS = [
  { id: '접속법', desc: '감정·의심·가치판단·목적·미래 시간절 뒤에서 쓰는 법(法). B2 문법의 기둥' },
  { id: '가정문', desc: '현재·과거 사실과 반대되는 가정. 후회·비판·제안에 필수' },
  { id: '추측 표현', desc: '미래·조건법으로 "~겠지, ~였나 봐"를 말하기. 원어민은 매일 쓰는데 학습자는 거의 안 씀' },
  { id: '과거 시제', desc: '대과거로 시간 순서를, 불완료로 배경을 깔기' },
  { id: '간접화법', desc: '남의 말을 전할 때 시제가 하나씩 뒤로 밀림. DELE 편지·이메일 과제 단골' },
  { id: '변화 동사', desc: '"~해지다/~가 되다"를 변화의 성격에 따라 다른 동사로. 한국인 최대 약점' },
  { id: '동사 우언법', desc: '동사+동사로 기간·반복·시작·중단의 뉘앙스를 정밀하게' },
  { id: '대명사·lo', desc: '비의지 se, 목적어 중복, 중성 lo — 원어민 냄새가 나는 구조' },
  { id: '관계사', desc: '짧은 문장 나열을 한 문장으로 엮는 고급 관계사' },
  { id: '무인칭·축약', desc: '수동·무인칭으로 객관적 톤, 부정사·분사로 문장 압축' },
  { id: '비교·강조', desc: '비례 비교, 결과절, 강조 구문, 의미가 바뀌는 ser/estar' },
  { id: '연결어', desc: 'pero/porque/entonces를 벗어나 글의 층위를 올리는 담화 표지' },
];
const GRAM_B2 = [
  // 접속법
  { id: 'emo', cat: '접속법', name: '감정 + que + 접속법', pat: 'Me alegra / Me molesta / Me sorprende que + subj.', ko: '감정·반응 뒤 que절은 접속법', ex: 'Me molesta que la gente no respete los turnos.', exko: '사람들이 순서를 안 지키는 게 거슬린다.' },
  { id: 'emo_past', cat: '접속법', name: '감정(과거) + 접속법 과거', pat: 'Me sorprendió que + imperf. subj.', ko: '주절이 과거면 접속법 과거로 시제 일치', ex: 'Me sorprendió que nadie dijera nada.', exko: '아무도 아무 말 안 한 게 놀라웠다.' },
  { id: 'duda', cat: '접속법', name: '부정·의심 + 접속법', pat: 'No creo que / Dudo que / No es verdad que + subj.', ko: '확신이 없으면 접속법 (creo que는 직설법)', ex: 'No creo que sea tan sencillo como parece.', exko: '보이는 것만큼 간단하지는 않을 것 같다.' },
  { id: 'valor', cat: '접속법', name: '가치 판단 + que + 접속법', pat: 'Es fundamental / lógico / preocupante que + subj.', ko: '평가·필요를 말하는 무인칭 표현 뒤 접속법', ex: 'Es fundamental que el gobierno invierta más en vivienda.', exko: '정부가 주거에 더 투자하는 것이 중요하다.' },
  { id: 'loque', cat: '접속법', name: 'Lo que más… es que + 접속법', pat: 'Lo que más me preocupa es que + subj.', ko: '강조 구문 — 의견문 첫 문장으로 강력함', ex: 'Lo que más me preocupa es que no se haga nada.', exko: '가장 걱정되는 건 아무것도 안 한다는 점이다.' },
  { id: 'cuando', cat: '접속법', name: '미래 시점 cuando + 접속법', pat: 'Cuando / En cuanto / Hasta que + subj. (미래)', ko: '아직 안 일어난 일의 시간절은 접속법', ex: 'Cuando termine el curso, me tomaré unas vacaciones.', exko: '수업이 끝나면 휴가를 갈 거다.' },
  { id: 'aunque', cat: '접속법', name: '양보 aunque + 접속법', pat: 'Aunque + subj. (설령 ~라도)', ko: '직설법=사실 인정, 접속법=가정·상관없음', ex: 'Aunque sea caro, merece la pena.', exko: '비싸더라도 그럴 가치가 있다.' },
  { id: 'paraque', cat: '접속법', name: '목적 para que + 접속법', pat: 'Para que / Sin que / Antes de que + subj.', ko: '주어가 다른 목적·조건절은 접속법', ex: 'Lo explico despacio para que todos lo entiendan.', exko: '모두가 이해하도록 천천히 설명한다.' },
  { id: 'rel', cat: '접속법', name: '불특정 선행사 + 접속법', pat: 'Necesitamos algo / alguien que + subj.', ko: '존재가 확정되지 않은 대상을 꾸미는 관계절', ex: 'Necesitamos políticas que protejan a los jóvenes.', exko: '젊은이들을 보호할 정책이 필요하다.' },
  { id: 'ojala', cat: '접속법', name: '소망 ojalá', pat: 'Ojalá + pres. subj. / imperf. subj.', ko: '현재형=가능한 바람, 과거형=가능성 낮은 바람', ex: 'Ojalá pudiéramos cambiar las cosas más rápido.', exko: '더 빨리 바꿀 수 있으면 좋을 텐데.' },
  { id: 'comosi', cat: '접속법', name: 'como si + 접속법 과거', pat: 'Como si + imperf./pluscuamp. subj.', ko: '마치 ~인 것처럼 (항상 접속법 과거 계열)', ex: 'Habla como si lo supiera todo.', exko: '그는 다 아는 것처럼 말한다.' },
  { id: 'pormucho', cat: '접속법', name: 'Por mucho que + 접속법', pat: 'Por mucho que / Por más que + subj.', ko: '아무리 ~해도 (강한 양보)', ex: 'Por mucho que lo intente, no consigo madrugar.', exko: '아무리 해도 일찍 못 일어나겠다.' },
  { id: 'cond', cat: '접속법', name: '조건 접속사 + 접속법', pat: 'A no ser que / Siempre que / Con tal de que + subj.', ko: '조건·예외를 정교하게 (si보다 B2다움)', ex: 'Iré a la reunión, a no ser que surja algo urgente.', exko: '급한 일이 생기지 않는 한 회의에 갈 거다.' },
  // 가정문
  { id: 'si2', cat: '가정문', name: '현재 반사실 가정', pat: 'Si + imperf. subj., condicional', ko: '지금 사실과 반대되는 가정', ex: 'Si tuviera más tiempo, aprendería a tocar el piano.', exko: '시간이 더 있다면 피아노를 배울 텐데.' },
  { id: 'si3', cat: '가정문', name: '과거 반사실 가정', pat: 'Si + pluscuamp. subj., condicional compuesto', ko: '과거에 일어나지 않은 일의 가정 (후회·비판)', ex: 'Si hubiera estudiado más, habría aprobado.', exko: '더 공부했더라면 합격했을 텐데.' },
  // 추측 표현
  { id: 'fut_prob', cat: '추측 표현', name: '추측의 미래 (지금)', pat: 'Estará / Tendrá / Será + … ', ko: '지금 일에 대한 짐작 — "~겠지". creo que보다 훨씬 자연스러움', ex: 'No contesta; estará en una reunión.', exko: '전화를 안 받네, 회의 중이겠지.' },
  { id: 'futperf_prob', cat: '추측 표현', name: '추측의 미래완료 (방금·이미)', pat: 'Habrá + participio', ko: '이미 일어났을 일에 대한 짐작 — "~했나 봐"', ex: 'Habrá perdido el autobús otra vez.', exko: '또 버스를 놓쳤나 봐.' },
  { id: 'cond_prob', cat: '추측 표현', name: '과거 추측의 조건법', pat: 'Estaría / Serían las… (과거 일 짐작)', ko: '과거의 일에 대한 짐작 — "~였겠지"', ex: 'Cuando la llamé no contestó; estaría dormida.', exko: '전화했을 때 안 받았어, 자고 있었겠지.' },
  { id: 'deberde', cat: '추측 표현', name: 'deber de + 원형 (추측)', pat: 'Debe de + inf. / Debía de + inf.', ko: 'deber + inf.는 의무, deber de + inf.는 추측', ex: 'Debe de ser difícil vivir tan lejos de tu familia.', exko: '가족과 그렇게 멀리 사는 건 분명 힘들 거야.' },
  // 과거 시제
  { id: 'pluscuam', cat: '과거 시제', name: '대과거로 시간 순서', pat: 'Cuando + indefinido, ya + pluscuamperfecto', ko: '"그보다 더 전에" 일어난 일을 표시', ex: 'Cuando llegué, la película ya había empezado.', exko: '내가 도착했을 때 영화는 이미 시작했었다.' },
  { id: 'llevaba', cat: '과거 시제', name: '과거 배경 + 사건', pat: 'Llevaba + 기간 + gerundio cuando + indefinido', ko: '불완료(진행 중이던 배경) + 단순과거(끼어든 사건)', ex: 'Llevaba tres años en Madrid cuando conocí a Lucía.', exko: '마드리드에 산 지 3년째였을 때 루시아를 만났다.' },
  // 간접화법
  { id: 'indirecto', cat: '간접화법', name: '간접 요청·충고 + 접속법 과거', pat: 'Me pidió / Me aconsejó que + imperf. subj.', ko: '과거의 요청·충고를 전달할 때', ex: 'Mi profesora me aconsejó que leyera más prensa.', exko: '선생님이 신문을 더 읽으라고 조언했다.' },
  { id: 'indir_fut', cat: '간접화법', name: '간접화법: 미래 → 조건법', pat: 'Dijo que + condicional', ko: '"~할게"라고 한 말을 전할 때. mañana → al día siguiente', ex: 'Me dijo que me llamaría al día siguiente.', exko: '다음 날 전화하겠다고 했다.' },
  { id: 'indir_past', cat: '간접화법', name: '간접화법: 완료·과거 → 대과거', pat: 'Me contó que + pluscuamperfecto', ko: '"~했어"라고 한 말을 전할 때', ex: 'Me contó que había dejado su trabajo.', exko: '그는 일을 그만뒀다고 내게 말했다.' },
  { id: 'indir_q', cat: '간접화법', name: '간접 의문문', pat: 'Me preguntó si / qué / cuándo + 직설법', ko: '예/아니오 질문은 si, 의문사 질문은 의문사 그대로 (악센트 유지)', ex: 'Me preguntó si quería ir con ellos.', exko: '같이 가고 싶냐고 내게 물었다.' },
  // 변화 동사
  { id: 'ponerse', cat: '변화 동사', name: 'ponerse + 형용사', pat: 'ponerse nervioso / triste / rojo', ko: '일시적인 감정·외모 변화', ex: 'Me puse muy nerviosa antes de la entrevista.', exko: '면접 전에 아주 긴장했다.' },
  { id: 'volverse', cat: '변화 동사', name: 'volverse + 형용사', pat: 'volverse loco / desconfiado / egoísta', ko: '성격이 근본적으로, 대개 갑작스럽게 변함', ex: 'Desde que es famoso, se ha vuelto muy desconfiado.', exko: '유명해진 뒤로 그는 의심이 많아졌다.' },
  { id: 'hacerse', cat: '변화 동사', name: 'hacerse + 명사/형용사', pat: 'hacerse rico / vegetariano / famoso', ko: '의지나 시간을 들인 변화 (직업·신념·부)', ex: 'Se hizo vegetariana hace dos años.', exko: '그녀는 2년 전에 채식주의자가 됐다.' },
  { id: 'quedarse', cat: '변화 동사', name: 'quedarse + 형용사', pat: 'quedarse sin palabras / sorprendido / solo', ko: '어떤 사건 뒤에 남은 결과 상태', ex: 'Me quedé sin palabras cuando me lo contó.', exko: '그 얘기를 들었을 때 할 말을 잃었다.' },
  { id: 'convertirse', cat: '변화 동사', name: 'convertirse en / llegar a ser', pat: 'convertirse en + 명사 / llegar a ser + 명사', ko: '완전히 다른 것으로 변신 / 긴 과정 끝에 도달', ex: 'El pueblo se ha convertido en un destino turístico.', exko: '그 마을은 관광지가 되었다.' },
  // 동사 우언법
  { id: 'llevar_ger', cat: '동사 우언법', name: 'llevar + 기간 + 현재분사', pat: 'Llevo + tiempo + gerundio', ko: '~한 지 (얼마)째 — hace… que보다 자연스러움', ex: 'Llevo dos años estudiando español por mi cuenta.', exko: '독학으로 스페인어 공부한 지 2년째다.' },
  { id: 'seguir_ger', cat: '동사 우언법', name: 'seguir + 현재분사 / seguir sin + 원형', pat: 'Sigo + gerundio / Sigo sin + inf.', ko: '여전히 ~하다 / 여전히 ~ 못 하다', ex: 'Sigo sin entender por qué lo hizo.', exko: '그가 왜 그랬는지 아직도 이해가 안 된다.' },
  { id: 'volver_a', cat: '동사 우언법', name: 'volver a + 원형', pat: 'volver a + inf.', ko: '다시 ~하다 (otra vez보다 B2다움)', ex: 'No volveré a cometer el mismo error.', exko: '같은 실수를 다시는 하지 않겠다.' },
  { id: 'dejar_de', cat: '동사 우언법', name: 'dejar de / ponerse a + 원형', pat: 'dejar de + inf. / ponerse a + inf.', ko: '~을 그만두다 / (갑자기) ~하기 시작하다', ex: 'He dejado de mirar el móvil antes de dormir.', exko: '자기 전에 휴대폰 보는 걸 그만뒀다.' },
  { id: 'ir_ger', cat: '동사 우언법', name: 'ir + 현재분사 (점점)', pat: 'ir + gerundio', ko: '변화가 조금씩 진행됨', ex: 'La situación va empeorando poco a poco.', exko: '상황이 조금씩 나빠지고 있다.' },
  { id: 'llegar_a', cat: '동사 우언법', name: 'llegar a + 원형 (심지어)', pat: 'llegar a + inf.', ko: '극단에 이르기까지 ~하다', ex: 'Llegué a pensar que nunca lo conseguiría.', exko: '절대 못 해낼 거라고까지 생각했다.' },
  { id: 'a_punto', cat: '동사 우언법', name: 'estar a punto de + 원형', pat: 'estar a punto de + inf.', ko: '막 ~하려던 참 (과거 배경에 자주)', ex: 'Estaba a punto de rendirme cuando me llamaron.', exko: '포기하려던 참에 연락이 왔다.' },
  // 대명사·lo
  { id: 'se_invol', cat: '대명사·lo', name: '비의지의 se', pat: 'Se me olvidó / Se me cayó / Se nos acabó', ko: '"저절로 그렇게 됐다" — 책임을 덜어내는 원어민식 표현', ex: 'Se me olvidaron las llaves en la oficina.', exko: '사무실에 열쇠를 깜빡 두고 왔다.' },
  { id: 'duplic', cat: '대명사·lo', name: '목적어 앞으로 + 대명사 중복', pat: 'Esto ya lo sabía / A mí me…', ko: '목적어를 문장 앞으로 빼면 대명사를 한 번 더', ex: 'Ese libro lo leí el verano pasado.', exko: '그 책은 지난여름에 읽었다.' },
  { id: 'lo_adj', cat: '대명사·lo', name: '중성 lo + 형용사', pat: 'Lo bueno / Lo peor / Lo curioso es que…', ko: '추상적인 "~한 점"을 명사처럼 — 의견문 필수', ex: 'Lo curioso es que nadie se dio cuenta.', exko: '신기한 건 아무도 눈치채지 못했다는 거다.' },
  { id: 'lo_que_es', cat: '대명사·lo', name: 'lo + 형용사 + que (얼마나)', pat: 'No sabes lo + adj. + que + verbo', ko: '"얼마나 ~한지" 감탄·강조', ex: 'No te imaginas lo difícil que es encontrar piso.', exko: '집 구하는 게 얼마나 어려운지 상상도 못 할 거야.' },
  // 관계사
  { id: 'rel_prep', cat: '관계사', name: '전치사 + el que / la cual', pat: 'La razón por la que… / El barrio en el que…', ko: '전치사가 붙는 관계절 — que 하나로 버티는 습관 탈출', ex: 'Esa es la razón por la que decidí mudarme.', exko: '그게 내가 이사하기로 한 이유다.' },
  { id: 'lo_cual', cat: '관계사', name: 'lo cual / lo que (앞 문장 전체)', pat: ', lo cual + verbo', ko: '앞 문장 전체를 받아 평가를 덧붙임', ex: 'Llegó tarde otra vez, lo cual me molestó bastante.', exko: '그는 또 늦었고, 그게 꽤 거슬렸다.' },
  { id: 'cuyo', cat: '관계사', name: 'cuyo/a/os/as (소유)', pat: 'sustantivo + cuyo/a + sustantivo', ko: '"그의/그것의 ~" — 뒤 명사에 성수 일치', ex: 'Es una escritora cuyas novelas me encantan.', exko: '소설이 정말 좋은 작가다.' },
  // 무인칭·축약
  { id: 'pasiva', cat: '무인칭·축약', name: '무인칭·수동 se', pat: 'Se ha demostrado que… / Se debería + inf.', ko: '논증문에서 주어를 숨기고 객관적 톤 만들기', ex: 'Se ha demostrado que leer en papel mejora la comprensión.', exko: '종이로 읽는 것이 이해를 높인다는 것이 입증됐다.' },
  { id: 'ser_part', cat: '무인칭·축약', name: 'ser + 과거분사 (격식 수동)', pat: 'fue aprobado / será construido (por…)', ko: '뉴스·보고서체. 일상에선 se 수동이 더 흔함', ex: 'El proyecto fue aprobado por unanimidad.', exko: '그 프로젝트는 만장일치로 승인됐다.' },
  { id: 'al_inf', cat: '무인칭·축약', name: 'al + 원형 (~할 때)', pat: 'Al + inf., …', ko: 'cuando절을 짧게 압축', ex: 'Al llegar a casa, me di cuenta de que había perdido la cartera.', exko: '집에 도착했을 때 지갑을 잃어버린 걸 알았다.' },
  { id: 'de_inf', cat: '무인칭·축약', name: 'de + haber + 과거분사 (가정 축약)', pat: 'De haberlo sabido, + condicional compuesto', ko: 'Si lo hubiera sabido와 같은 뜻, 더 세련됨', ex: 'De haberlo sabido, habría venido antes.', exko: '알았더라면 더 일찍 왔을 텐데.' },
  { id: 'part_abs', cat: '무인칭·축약', name: '절대 분사구문', pat: 'Terminada la reunión, … / Una vez + participio, …', ko: '"~가 끝나고/~한 뒤" — 문어체 고급', ex: 'Terminada la reunión, nos fuimos a cenar.', exko: '회의가 끝나고 저녁 먹으러 갔다.' },
  // 비교·강조
  { id: 'cuanto', cat: '비교·강조', name: 'cuanto más… más…', pat: 'Cuanto más + verbo, más + verbo', ko: '~할수록 더 ~하다', ex: 'Cuanto más leo, más cuenta me doy de lo poco que sé.', exko: '읽을수록 내가 얼마나 모르는지 깨닫는다.' },
  { id: 'tan_que', cat: '비교·강조', name: 'tan / tanto… que (결과)', pat: 'tan + adj. + que / tanto + sust. + que', ko: '너무 ~해서 ~했다', ex: 'Estaba tan cansada que me dormí en el metro.', exko: '너무 피곤해서 지하철에서 잠들었다.' },
  { id: 'enfasis', cat: '비교·강조', name: '강조 구문 es… donde/quien/cuando', pat: 'Es + 강조 요소 + donde / quien / cuando…', ko: '"~인 것은 바로 ~이다" — 논점을 또렷하게', ex: 'Es en los detalles donde se nota la calidad.', exko: '품질이 드러나는 건 바로 디테일에서다.' },
  { id: 'serestar', cat: '비교·강조', name: '의미가 바뀌는 ser/estar 형용사', pat: 'ser listo / estar listo · ser rico / estar rico · ser malo / estar malo', ko: 'ser=성질, estar=상태 — 형용사 뜻 자체가 달라짐', ex: 'Mi hermano es muy listo, pero nunca está listo a tiempo.', exko: '형은 아주 똑똑한데 제시간에 준비된 적이 없다.' },
  // 연결어
  { id: 'conect', cat: '연결어', name: '논증 연결어', pat: 'No obstante, Por consiguiente, Cabe destacar que, En definitiva', ko: 'pero/porque/entonces만 쓰면 B1 — 글의 층위를 올리는 연결어', ex: 'Cabe destacar, no obstante, que los datos son limitados.', exko: '다만 데이터가 제한적이라는 점은 짚어둘 만하다.' },
  { id: 'conect_causa', cat: '연결어', name: '원인·결과 연결어', pat: 'ya que, dado que, debido a / por lo tanto, de ahí que + subj.', ko: 'porque/entonces 대신. de ahí que 뒤는 접속법', ex: 'Dado que los precios suben, cada vez más jóvenes viven con sus padres.', exko: '물가가 오르니 부모와 사는 젊은이가 점점 늘고 있다.' },
  { id: 'conect_contra', cat: '연결어', name: '대조·양보 연결어', pat: 'sin embargo, en cambio, a pesar de que, si bien', ko: 'pero/aunque 대신. si bien은 격식 있는 양보', ex: 'Si bien la idea es buena, su aplicación resulta complicada.', exko: '아이디어는 좋지만 적용이 복잡하다.' },
];
const GRAM_BY_ID = {}; GRAM_B2.forEach(g => GRAM_BY_ID[g.id] = g);
function pickMissions(n, exclude) {
  // 덜 연습했고 성공률 낮은 구조 우선 + 무작위, 서로 다른 묶음에서 하나씩
  const ms = S.stats.mission || {};
  const scored = GRAM_B2.filter(g => !(exclude || []).includes(g.id)).map(g => { const m = ms[g.id] || { try: 0, ok: 0 }; return { g, score: m.try * 2 + m.ok * 3 + Math.random() * 6 }; });
  scored.sort((a, b) => a.score - b.score);
  const out = [], cats = new Set();
  for (const x of scored) { if (cats.has(x.g.cat)) continue; out.push(x.g.id); cats.add(x.g.cat); if (out.length >= n) break; }
  return out;
}
function missionBox(e, editable) {
  if (!e.mission || !e.mission.length) return '';
  return `<div class="card" style="border-color:#e9c6c2"><b>🎯 오늘의 B2 문법 미션</b> <span class="sub">이 구조를 글에 꼭 한 번씩 넣어보세요</span>` +
    e.mission.map(id => { const g = GRAM_BY_ID[id]; if (!g) return ''; return `<div class="err" style="border-left-color:var(--blue);background:#f5f8fc"><span class="tag" style="background:#e3edf8;color:var(--blue);font-size:11px">${esc(g.cat)}</span> <b>${esc(g.name)}</b><br><span style="font-family:monospace;font-size:13px">${esc(g.pat)}</span><br><span class="sub">${esc(g.ko)}</span><br>예) <i>${esc(g.ex)}</i> <button class="speak-btn" onclick="speak(GRAM_BY_ID['${g.id}'].ex)">🔊</button><br><span class="sub">${esc(g.exko)}</span></div>`; }).join('') +
    (editable ? `<div class="pill-group"><button class="ghost sm" onclick="rerollMission()">🎲 다른 미션</button><button class="ghost sm" onclick="showGrammarBook()">📘 B2 구조 사전</button></div>` : '') + `</div>`;
}
let gbCat = null;
function showGrammarBook(cat) {
  if (cat !== undefined) gbCat = cat;
  const ms = S.stats.mission || {};
  const cnt = c => GRAM_B2.filter(g => g.cat === c).length;
  let h = `<h2>📘 DELE B2 구조 사전 (${GRAM_B2.length}개)</h2><p>B2 작문 채점에서 '문법 범위·정확성'은 이 구조들을 상황에 맞게 골라 쓰는지로 갈려요. 묶음을 골라 🔊로 예문을 듣고 내 얘기로 바꿔 써보세요.</p>
    <div class="pill-group" style="margin-bottom:10px"><span class="pill ${!gbCat ? 'on' : ''}" onclick="showGrammarBook(null)">전체</span>` +
    GRAM_CATS.map(c => `<span class="pill ${gbCat === c.id ? 'on' : ''}" onclick="showGrammarBook('${c.id}')">${c.id} ${cnt(c.id)}</span>`).join('') + `</div>`;
  const cats = gbCat ? GRAM_CATS.filter(c => c.id === gbCat) : GRAM_CATS;
  cats.forEach(c => {
    h += `<div style="margin-top:14px"><b style="font-size:15px">${esc(c.id)}</b><div class="sub">${esc(c.desc)}</div></div>`;
    h += GRAM_B2.filter(g => g.cat === c.id).map(g => { const m = ms[g.id]; return `<div class="err" style="border-left-color:var(--blue);background:#f5f8fc"><b>${esc(g.name)}</b> ${m ? `<span class="tag ${m.ok ? 'green' : ''}">성공 ${m.ok}/${m.try}</span>` : ''}<br><span style="font-family:monospace;font-size:12px">${esc(g.pat)}</span><br><span class="sub">${esc(g.ko)}</span><br><i>${esc(g.ex)}</i> <button class="speak-btn" onclick="speak(GRAM_BY_ID['${g.id}'].ex)">🔊</button><br><span class="sub">${esc(g.exko)}</span></div>`; }).join('');
  });
  h += `<button class="flip" onclick="closeOverlay()">닫기</button>`;
  const box = $('overlayBox'); const keep = $('overlay').classList.contains('show') ? box.scrollTop : 0;
  openOverlay(h); if (cat !== undefined) box.scrollTop = 0; else box.scrollTop = keep;
}
let wrView = { mode: 'home', id: null };
function newEntry(mode, articleId) {
  const e = { id: 'j' + Date.now().toString(36), created: new Date().toISOString(), day: today(), mode, text: '', words: 0, status: 'draft', fb: null, fbRaw: '', rewrite: '', targets: [], mission: pickMissions(2) };
  if (mode === 'opinion') {
    const f = findArticle(articleId); const a = f && f.art;
    e.articleId = articleId; e.task = a ? { es: a.writing.task_es, ko: a.writing.task_ko, words: a.writing.words || '150–180', title: a.title } : { es: '', ko: '' };
    e.targets = a && a.writing.use ? a.writing.use.map(x => ({ es: x })) : [];
  } else {
    const p = DIARY_PROMPTS[Math.floor(Math.random() * DIARY_PROMPTS.length)];
    e.task = { es: p.es, ko: p.ko, focus: p.focus, words: '80–150' }; e.targets = pickTargets(2);
  }
  return e;
}
function startWriting(mode, articleId) {
  const e = newEntry(mode, articleId); S.journal.unshift(e); save();
  wrView = { mode: 'edit', id: e.id }; goTab('write');
}
function curEntry() { return S.journal.find(j => j.id === wrView.id); }
function wordCount(s) { return (s.trim().match(/[\p{L}\p{N}'’-]+/gu) || []).length; }
function targetUsed(text, t) { const u = norm(text); const kt = norm(t.es).split(' ').filter(w => w && !STOP.has(w)); const ut = u.split(' '); return kt.length > 0 && kt.every(k => ut.some(x => tokMatch(k, x))); }
function renderWrite() {
  const el = $('panel-write');
  if (wrView.mode === 'home' || !curEntry()) return renderWriteHome(el);
  const e = curEntry();
  if (wrView.mode === 'edit') return renderEditor(el, e);
  if (wrView.mode === 'request') return renderRequest(el, e);
  if (wrView.mode === 'result') return renderResult(el, e);
}
function renderWriteHome(el) {
  wrView.mode = 'home';
  const thisWeek = PACKS.latest ? PACKS.latest.articles : [];
  let h = `<div class="card"><b>오늘 쓰기</b><div class="sub" style="margin-top:4px">쓰기 (B2 문법 미션 2개) → Claude 첨삭 → 레벨업 다시 쓰기 → 재검사. 틀린 문장과 업그레이드 문장은 복습 카드가 돼요.</div>
    <div class="btn-row"><button class="big gA" onclick="startWriting('diary')">📔 짧은 일기 (80–150단어)</button></div>`;
  if (thisWeek.length) h += `<div class="sub" style="margin-top:14px">또는 이번 주 기사로 의견문 (DELE B2형, 150–180단어)</div>` + thisWeek.map(a => `<div class="list-item" style="margin-top:8px" onclick="startWriting('opinion','${a.id}')"><span class="tag red">${esc(a.topic)}</span> <span class="t">${esc(a.title_ko || a.title)}</span></div>`).join('');
  h += `<div class="btn-row"><button class="ghost" onclick="showGrammarBook()">📘 B2 핵심 구조 ${GRAM_B2.length}개 보기</button></div></div>`;
  const errTop = Object.entries(S.stats.writeErr).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (errTop.length) h += `<div class="card"><b>내가 자주 틀리는 것</b><div class="detail">${errTop.map(([k, v]) => `<span class="tag red" style="margin:2px">${esc(k)} ×${v}</span>`).join(' ')}</div><div class="sub" style="margin-top:6px">다음 글에서 이 부분을 의식해서 써보세요.</div></div>`;
  h += `<h2 class="sec">내 글 (${S.journal.length})</h2>`;
  if (!S.journal.length) h += `<div class="card empty">아직 쓴 글이 없어요.<br>첫 일기를 써볼까요?</div>`;
  h += S.journal.map(j => {
    const st = { draft: '초안', requested: '첨삭 대기', reviewed: '첨삭 완료', done: '다시 쓰기 완료' }[j.status] || j.status;
    const preview = (j.rewrite || j.text || '').slice(0, 70);
    return `<div class="list-item" onclick="openEntry('${j.id}')"><div class="meta-row" style="margin-bottom:4px"><span class="tag">${fmtDate(j.created)}</span><span class="tag ${j.status === 'done' ? 'green' : j.status === 'draft' ? '' : 'red'}">${st}</span><span class="tag">${j.mode === 'opinion' ? '의견문' : '일기'} · ${j.words || 0}단어</span></div>
      <div class="sub" style="color:var(--ink)">${esc(preview) || '<i>(비어 있음)</i>'}${preview.length >= 70 ? '…' : ''}</div></div>`;
  }).join('');
  el.innerHTML = h;
}
function openEntry(id) { const e = S.journal.find(j => j.id === id); if (!e) return; wrView.id = id; wrView.mode = e.status === 'draft' ? 'edit' : e.status === 'requested' ? 'request' : 'result'; renderWrite(); window.scrollTo(0, 0); }
function taskBox(e) {
  if (!e.task) return '';
  return `<div class="task-box"><div class="es">${esc(e.task.es)}</div>${esc(e.task.ko)}${e.task.focus ? '<br><span style="font-size:13px">💡 이 주제에 어울리는 표현: ' + esc(e.task.focus) + '</span>' : ''}${e.task.title ? '<br><span style="font-size:12px">기사: ' + esc(e.task.title) + '</span>' : ''}</div>`;
}
function renderEditor(el, e) {
  let h = `<div class="pill-group" style="margin-bottom:10px"><button class="ghost sm" onclick="saveDraft();wrView.mode='home';renderWrite()">← 목록</button>${e.mode === 'diary' ? '<button class="ghost sm" onclick="rerollPrompt()">🎲 다른 주제</button>' : ''}<button class="ghost sm" onclick="deleteEntry()">삭제</button></div>`;
  h += missionBox(e, true);
  if (e.articleId) h += hlRefBox(e.articleId);
  h += `<div class="card">${taskBox(e)}<div class="sub" style="margin-top:8px">주제는 참고용이에요. 오늘 있었던 일을 자유롭게 써도 돼요. 미션 구조만 꼭 넣어보세요.</div>`;
  if (e.targets && e.targets.length) h += `<div style="margin-top:10px"><span class="sub">넣어볼 표현:</span><br>` + e.targets.map((t, i) => `<span class="chip" id="tg${i}" title="${esc(t.from || '')}">${esc(t.es)}</span>`).join('') + `</div>`;
  h += `<textarea id="wrText" rows="12" placeholder="Hoy... (스페인어로 써보세요. 모르는 단어는 (한국어)로 남겨도 돼요)" autocapitalize="sentences" spellcheck="false">${esc(e.text)}</textarea><div class="wc" id="wrWc"></div>
    <div class="btn-row"><button class="ghost" onclick="saveDraft(true)">임시 저장</button><button class="big gA" onclick="goRequest()">Claude에게 첨삭받기 →</button></div></div>`;
  el.innerHTML = h;
  const ta = $('wrText'); const upd = () => { const w = wordCount(ta.value); $('wrWc').textContent = w + '단어 · 목표 ' + ((e.task && e.task.words) || '80–150'); (e.targets || []).forEach((t, i) => { const c = $('tg' + i); if (c) c.classList.toggle('used', targetUsed(ta.value, t)); }); };
  ta.oninput = () => { upd(); clearTimeout(renderEditor._t); renderEditor._t = setTimeout(() => saveDraft(), 800); };
  upd();
}
function saveDraft(show) { const e = curEntry(); const ta = $('wrText'); if (!e || !ta) return; e.text = ta.value; e.words = wordCount(ta.value); e.updated = new Date().toISOString(); save(); if (show) toast('저장했어요'); }
function rerollPrompt() { const e = curEntry(); saveDraft(); const p = DIARY_PROMPTS[Math.floor(Math.random() * DIARY_PROMPTS.length)]; e.task = { es: p.es, ko: p.ko, focus: p.focus, words: '80–150' }; e.targets = pickTargets(2); save(); renderWrite(); }
function rerollMission() { const e = curEntry(); saveDraft(); e.mission = pickMissions(2, e.mission); save(); renderWrite(); }
function deleteEntry() { if (!confirm('이 글을 삭제할까요?')) return; S.journal = S.journal.filter(j => j.id !== wrView.id); save(); wrView.mode = 'home'; renderWrite(); }
function goRequest() {
  saveDraft(); const e = curEntry();
  if (wordCount(e.text) < 15) { toast('조금만 더 써볼까요? (15단어 이상)'); return; }
  e.status = 'requested'; e.day = today(); touchStreak(); save(); wrView.mode = 'request'; renderWrite(); window.scrollTo(0, 0);
}
const ERR_TYPES = ['시제·법', '접속법', '성수일치', '전치사', '관사', 'ser/estar', 'por/para', '대명사', '어휘선택', '어순', '연결어', '철자·악센트', '문체·격식'];
function missionLines(e) { return (e.mission || []).map((id, i) => { const g = GRAM_BY_ID[id]; return g ? `${i + 1}) ${g.name} — ${g.pat}` : ''; }).filter(Boolean).join('\n'); }
function buildPrompt(e) {
  const tg = (e.targets || []).map(t => t.es).join(', ');
  return `너는 한국인 학습자를 가르치는 스페인어 작문 첨삭 선생님이야. 학습자는 DELE B2 합격이 목표고, 접속법·가정문 같은 B2 구조를 "자유자재로" 쓰는 게 지금 과제야. 단순히 틀린 걸 고치는 데서 끝내지 말고, 글의 문법 수준을 B2로 끌어올리는 법과 원어민다운 톤을 함께 가르쳐줘.

[과제] ${e.mode === 'opinion' ? 'DELE B2형 의견문 (' + ((e.task && e.task.words) || '150–180') + '단어)' : '짧은 일기 (80–150단어)'}
${e.task ? '주제: ' + e.task.es + ' (' + e.task.ko + ')' : ''}
${tg ? '넣어보기로 한 표현: ' + tg : ''}
[문법 미션] 학습자가 이 글에 넣기로 한 B2 구조:
${missionLines(e) || '(없음)'}

[학습자 글]
"""
${e.text.trim()}
"""

[첨삭 규칙]
1. corrected: 학습자 문장과 의도를 살린 최소 수정본 (전체 글).
2. errors: 중요한 오류만 최대 6개. 사소한 건 corrected에만 반영. why는 한국어 1~2문장.
   type은 다음 중 하나: ${ERR_TYPES.join(', ')}
3. mission_check: 미션 구조마다 하나씩, 위 순서대로. used(시도했는지), correct(맞게 썼는지), found(글에서 해당 문장, 없으면 ""), fix(틀렸으면 고친 문장, 안 썼으면 이 글 맥락에 맞게 그 구조로 쓴 예문), note(한국어 한 줄).
4. upgrades: 학습자 문장 중 단순한 문장(직설법만, pero/porque/es importante 반복, creo que 남발, 짧은 단문 나열) 3~4개를 골라 같은 뜻을 B2 구조로 끌어올린 문장. 접속법만 쓰지 말고 다양하게: 접속법·가정문, 추측의 미래/조건법(estará, habrá + p.p.), 대과거, 간접화법 시제 일치, 변화 동사(ponerse/volverse/hacerse/quedarse/convertirse en), 동사 우언법(llevar + 현재분사, volver a, dejar de, seguir sin), 비의지 se, 중성 lo(lo bueno es que), 전치사+관계사·lo cual·cuyo, 무인칭 se·al + 원형·de haber + p.p.·절대 분사구문, cuanto más…, 강조 구문, 고급 연결어(dado que, de ahí que, si bien) 중 이 문장에 가장 자연스러운 것을 골라. orig(학습자 원문), up(업그레이드 문장, 학습자가 외워 쓸 수 있는 길이), structure(구조 이름, 예: "Es fundamental que + 접속법"), why(왜 이 구조가 더 B2다운지 한국어 1문장).
5. native: 문법은 맞지만 직역투·교과서투라 원어민에게 어색한 표현 2~4개를 원어민이 실제로 쓰는 말로. orig, native, why(뉘앙스·연어(collocation)·연결어·구어/문어 톤 차이를 한국어로). 스페인 스페인어 기준, 중남미와 다르면 why에 짧게 덧붙여.
6. natural: 위 업그레이드와 원어민 톤을 반영한 전체 글. 학습자 글보다 한 단계 위(B2+)지만 학습자가 흉내 낼 수 있는 수준으로.
7. cards: 외워두면 좋을 문장 3~5개. 고친 문장과 업그레이드 문장을 섞어서 (es 완전한 문장, ko 자연스러운 뜻, point 핵심 한 줄).
8. 괄호 안 한국어 단어는 알맞은 스페인어로. 넣어보기로 한 표현 사용 여부는 targets_check.
9. 설명은 모두 한국어, 예문은 스페인어.

[출력 형식] 아래 JSON을 \`\`\`json 코드블록 하나로만 출력해. 코드블록 앞뒤에 다른 말은 쓰지 마.
\`\`\`json
{
  "summary": "총평 2~3문장 (한국어)",
  "level": "글에서 보이는 수준 (예: B1+)",
  "good": ["잘한 점"],
  "errors": [{"orig": "틀린 부분", "fix": "고친 부분", "type": "접속법", "why": "이유"}],
  "mission_check": [{"structure": "구조 이름", "used": true, "correct": false, "found": "글 속 문장", "fix": "고친 문장 또는 예문", "note": "한 줄 설명"}],
  "upgrades": [{"orig": "학습자 원문", "up": "B2 업그레이드 문장", "structure": "구조", "why": "이유"}],
  "native": [{"orig": "학습자 표현", "native": "원어민 표현", "why": "뉘앙스 설명"}],
  "corrected": "최소 수정본 전체",
  "natural": "B2+ 원어민 버전 전체",
  "cards": [{"es": "문장", "ko": "뜻", "point": "포인트"}],
  "targets_check": "표현 사용 확인",
  "next": "다음 글에서 시도할 것 한 가지"
}
\`\`\``;
}
function buildRecheckPrompt(e) {
  return `너는 스페인어 작문 첨삭 선생님이야. 한국인 학습자(DELE B2 목표)가 첨삭을 받은 뒤, B2 구조를 넣어서 글을 다시 썼어. 이번에는 새로 넣은 B2 구조(접속법·가정문·양보·관계절·연결어 등)가 맞게 쓰였는지를 중심으로 검사해줘.

[문법 미션]
${missionLines(e) || '(없음)'}

[다시 쓴 글]
"""
${(e.rewrite || '').trim()}
"""

[규칙] 오류는 최대 5개, why는 한국어 1~2문장. mission_check는 미션 순서대로. b2_used에는 이 글에서 제대로 쓴 B2 구조를 글 속 문장 그대로 나열. 더 고칠 게 없으면 errors는 빈 배열.
아래 JSON을 \`\`\`json 코드블록 하나로만 출력해.
\`\`\`json
{
  "summary": "한 줄 평가 (한국어)",
  "errors": [{"orig": "틀린 부분", "fix": "고친 부분", "type": "접속법", "why": "이유"}],
  "mission_check": [{"structure": "구조 이름", "used": true, "correct": true, "found": "글 속 문장", "fix": "", "note": "한 줄"}],
  "b2_used": ["제대로 쓴 B2 구조 문장"],
  "corrected": "고친 전체 글"
}
\`\`\``;
}
const CLAUDE_URL = 'https://claude.ai/new';
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length); let ok = false; try { ok = document.execCommand('copy'); } catch (_) { } document.body.removeChild(ta); return ok;
  }
}
function openClaudeWith(p) {
  // 복사와 창 열기를 같은 탭 동작 안에서 실행해야 iOS·팝업 차단에 안 걸린다
  const cp = copyText(p);
  const url = p.length < 6000 ? CLAUDE_URL + '?q=' + encodeURIComponent(p) : CLAUDE_URL;
  const w = window.open(url, '_blank');
  cp.then(ok => toast(ok ? '📋 요청을 복사했어요. 입력창이 비어 있으면 붙여넣고 보내세요.' : '복사가 안 됐어요. "요청문 보기"에서 직접 복사해주세요.', 3500));
  if (!w) setTimeout(() => { location.href = url; }, 400);
}
function sendToClaude() { openClaudeWith(buildPrompt(curEntry())); }
async function copyOnly() { const ok = await copyText(buildPrompt(curEntry())); toast(ok ? '📋 복사했어요' : '복사 실패 — 요청문을 길게 눌러 복사하세요'); }
function showPrompt(which) { const e = curEntry(); openOverlay(`<h2>요청문</h2><p>길게 눌러 전체 선택 → 복사하세요.</p><textarea rows="14" readonly style="font-size:13px">${esc(which === 'recheck' ? buildRecheckPrompt(e) : buildPrompt(e))}</textarea><button class="flip" onclick="closeOverlay()">닫기</button>`); }
function renderRequest(el, e) {
  let h = `<div class="pill-group" style="margin-bottom:10px"><button class="ghost sm" onclick="wrView.mode='home';renderWrite()">← 목록</button><button class="ghost sm" onclick="e_backToEdit()">✏️ 글 고치기</button></div>`;
  h += `<div class="card"><b>Claude에게 첨삭받기</b>
    <div class="step"><div class="num">1</div><div><b>요청 보내기</b><div class="sub">버튼을 누르면 첨삭 요청이 복사되고 Claude가 열려요. 입력창이 비어 있으면 붙여넣기 후 보내세요.</div>
      <div class="btn-row" style="margin-top:10px"><button class="big gK" onclick="sendToClaude()">Claude 열기 ↗</button><button class="ghost" onclick="copyOnly()">복사만</button><button class="ghost" onclick="showPrompt()">요청문 보기</button></div></div></div>
    <div class="step"><div class="num">2</div><div style="flex:1"><b>Claude 답변 붙여넣기</b><div class="sub">Claude 답변의 코드블록(json)을 통째로 복사해 여기에 붙여넣으세요. 답변 전체를 붙여넣어도 돼요.</div>
      <textarea id="fbPaste" rows="7" placeholder="여기에 붙여넣기" style="font-size:13px">${esc(e.fbRaw || '')}</textarea>
      <div class="btn-row"><button class="ghost" onclick="pasteInto('fbPaste')">📋 클립보드에서 붙여넣기</button><button class="big g3" onclick="applyFeedback()">첨삭 반영</button></div></div></div>
  </div>`;
  h += missionBox(e, false);
  h += `<div class="card"><div class="sub">내가 쓴 글 · ${e.words}단어</div><div class="journal-text" style="margin-top:8px">${esc(e.text)}</div></div>`;
  el.innerHTML = h;
}
function e_backToEdit() { const e = curEntry(); e.status = 'draft'; save(); wrView.mode = 'edit'; renderWrite(); }
async function pasteInto(id) { try { const t = await navigator.clipboard.readText(); $(id).value = t; toast('붙여넣었어요'); } catch (e) { toast('입력칸을 길게 눌러 붙여넣기 해주세요'); } }
function extractJSON(raw) {
  let s = String(raw || '').trim(); if (!s) return null;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) s = fence[1];
  const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null;
  s = s.slice(a, b + 1);
  const tries = [s, s.replace(/,\s*([}\]])/g, '$1'), s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1')];
  for (const t of tries) { try { const o = JSON.parse(t); if (o && typeof o === 'object') return o; } catch (e) { } }
  return null;
}
const _str = v => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const _arr = v => Array.isArray(v) ? v : (v ? [v] : []);
const _objs = v => _arr(v).filter(x => x && typeof x === 'object');
const _bool = v => v === true || v === 'true' || v === 'sí' || v === 'yes';
function sanErrors(v) { return _objs(v).map(x => ({ orig: _str(x.orig), fix: _str(x.fix), type: _str(x.type) || '기타', why: _str(x.why) })).slice(0, 10); }
function sanMission(v) { return _objs(v).map(x => ({ structure: _str(x.structure), used: _bool(x.used), correct: _bool(x.correct), found: _str(x.found), fix: _str(x.fix), note: _str(x.note) })).slice(0, 4); }
function sanitizeFb(o) {
  return {
    summary: _str(o.summary), level: _str(o.level), good: _arr(o.good).map(_str).filter(Boolean),
    errors: sanErrors(o.errors), mission_check: sanMission(o.mission_check),
    upgrades: _objs(o.upgrades).filter(x => x.up).map(x => ({ orig: _str(x.orig), up: _str(x.up), structure: _str(x.structure), why: _str(x.why) })).slice(0, 6),
    native: _objs(o.native).filter(x => x.native).map(x => ({ orig: _str(x.orig), native: _str(x.native), why: _str(x.why) })).slice(0, 6),
    corrected: _str(o.corrected), natural: _str(o.natural),
    cards: _objs(o.cards).filter(x => x.es).map(x => ({ es: _str(x.es), ko: _str(x.ko), point: _str(x.point) })).slice(0, 8),
    targets_check: _str(o.targets_check), next: _str(o.next),
  };
}
function formatFailOverlay(keepFn) {
  openOverlay(`<h2>형식을 읽지 못했어요</h2><p>Claude 답변에서 JSON을 찾지 못했어요. 아래 문장을 복사해 같은 Claude 대화에 보내면 형식을 맞춰서 다시 줘요.</p>
    <textarea rows="3" readonly style="font-size:13px">방금 요청한 JSON 형식 그대로, \`\`\`json 코드블록 하나로만 다시 출력해줘.</textarea>
    <button class="flip" onclick="copyText('방금 요청한 JSON 형식 그대로, \`\`\`json 코드블록 하나로만 다시 출력해줘.').then(()=>toast('복사했어요'))">문장 복사</button>
    ${keepFn ? `<button class="ghost" style="width:100%;margin-top:8px" onclick="${keepFn}()">그냥 텍스트로 저장하기</button>` : ''}
    <button class="ghost" style="width:100%;margin-top:8px" onclick="closeOverlay()">닫기</button>`);
}
function recordMission(e, checks, stage) {
  // 미션 구조 숙련도: 첫 첨삭과 재검사 각각 1회씩 집계
  S.stats.mission = S.stats.mission || {};
  (e.mission || []).forEach((id, i) => {
    const c = checks[i]; if (!c) return;
    const m = S.stats.mission[id] = S.stats.mission[id] || { try: 0, ok: 0 };
    m.try++; if (c.used && c.correct) m.ok++;
  });
  e['missionLogged_' + stage] = true;
}
function applyFeedback() {
  const e = curEntry(); const raw = $('fbPaste').value; e.fbRaw = raw;
  if (!raw.trim()) { toast('Claude 답변을 먼저 붙여넣어 주세요'); return; }
  const o = extractJSON(raw);
  if (!o) { save(); formatFailOverlay('keepRawFeedback'); return; }
  const fb = sanitizeFb(o);
  if (!fb.corrected && !fb.errors.length) { toast('첨삭 내용이 비어 있어요. 답변을 다시 확인해주세요.'); return; }
  const first = !e.fb; e.fb = fb; e.status = 'reviewed'; e.reviewedAt = new Date().toISOString();
  if (first) {
    fb.errors.forEach(x => { const t = x.type || '기타'; S.stats.writeErr[t] = (S.stats.writeErr[t] || 0) + 1; const tag = '작문·' + t; S.stats.tags[tag] = S.stats.tags[tag] || { ok: 0, bad: 0 }; S.stats.tags[tag].bad++; });
    e.cardSel = fb.cards.map(() => true);
  }
  if (!e.missionLogged_first && fb.mission_check.length) recordMission(e, fb.mission_check, 'first');
  save(); wrView.mode = 'result'; renderWrite(); window.scrollTo(0, 0);
}
function keepRawFeedback() { const e = curEntry(); e.fb = { summary: '', level: '', good: [], errors: [], mission_check: [], upgrades: [], native: [], corrected: '', natural: '', cards: [], targets_check: '', next: '', rawOnly: e.fbRaw }; e.status = 'reviewed'; save(); closeOverlay(); wrView.mode = 'result'; renderWrite(); }
function missionCheckHTML(e, checks) {
  if (!checks || !checks.length) return '';
  return checks.map((c, i) => {
    const g = GRAM_BY_ID[(e.mission || [])[i]];
    const icon = c.used && c.correct ? '✅' : c.used ? '⚠️' : '❌';
    const label = c.used && c.correct ? '성공' : c.used ? '시도했지만 오류' : '안 씀';
    return `<div class="err" style="border-left-color:${c.used && c.correct ? 'var(--ok)' : c.used ? 'var(--warn)' : 'var(--bad)'};background:#fafafa">${icon} <b>${esc(c.structure || (g && g.name) || '')}</b> <span class="tag">${label}</span>
      ${c.found ? `<br><span class="sub">내 문장:</span> ${esc(c.found)}` : ''}
      ${c.fix ? `<br><span class="sub">${c.used ? '고치면' : '이렇게 써볼 수 있어요'}:</span> <span class="f">${esc(c.fix)}</span> <button class="speak-btn" onclick="speak(${jsAttr(c.fix)})">🔊</button>` : ''}
      ${c.note ? `<br><span class="sub">${esc(c.note)}</span>` : ''}</div>`;
  }).join('');
}
function jsAttr(s) { return esc(JSON.stringify(String(s))); }
function renderResult(el, e) {
  const fb = e.fb || {};
  let h = `<div class="pill-group" style="margin-bottom:10px"><button class="ghost sm" onclick="wrView.mode='home';renderWrite()">← 목록</button><button class="ghost sm" onclick="wrView.mode='request';renderWrite()">첨삭 다시 붙여넣기</button></div>`;
  h += `<div class="card"><div class="meta-row"><span class="tag">${fmtDate(e.created)}</span>${fb.level ? '<span class="tag red">추정 ' + esc(fb.level) + '</span>' : ''}<span class="tag">${e.words}단어</span></div>`;
  if (fb.rawOnly) h += `<div class="journal-text" style="font-size:14px">${esc(fb.rawOnly)}</div>`;
  if (fb.summary) h += `<div style="line-height:1.7">${esc(fb.summary)}</div>`;
  if (fb.good && fb.good.length) h += `<div class="detail"><b>👍 잘한 점</b><br>${fb.good.map(g => '• ' + esc(g)).join('<br>')}</div>`;
  if (fb.targets_check) h += `<div class="detail"><b>표현 사용</b> ${esc(fb.targets_check)}</div>`;
  h += `</div>`;
  if (fb.mission_check && fb.mission_check.length) h += `<div class="card"><b>🎯 문법 미션 결과</b>${missionCheckHTML(e, fb.mission_check)}</div>`;
  if (fb.errors && fb.errors.length) h += `<div class="card"><b>고칠 점 ${fb.errors.length}개</b>` + fb.errors.map(x => `<div class="err"><span class="tag red" style="font-size:11px">${esc(x.type)}</span><br><span class="o">${esc(x.orig)}</span> → <span class="f">${esc(x.fix)}</span><br><span class="sub">${esc(x.why)}</span></div>`).join('') + `</div>`;
  if (fb.upgrades && fb.upgrades.length) {
    h += `<div class="card"><b>⬆️ B2로 끌어올리기</b> <span class="sub">같은 뜻, 한 단계 위 문법</span>` + fb.upgrades.map((u, i) => {
      const have = S.mine.some(m => m.text === u.up);
      return `<div class="err" style="border-left-color:var(--blue);background:#f5f8fc">${u.structure ? `<span class="tag" style="background:#e3edf8;color:var(--blue);font-size:11px">${esc(u.structure)}</span><br>` : ''}<span class="sub">내 문장:</span> ${esc(u.orig)}<br><b>→ ${esc(u.up)}</b> <button class="speak-btn" onclick="speak(curEntry().fb.upgrades[${i}].up)">🔊</button><br><span class="sub">${esc(u.why)}</span>
        <div style="margin-top:6px"><button class="ghost sm" ${have ? 'disabled' : ''} onclick="addUpgradeCard(${i})">${have ? '카드 추가됨' : '+ 카드'}</button></div></div>`;
    }).join('') + `</div>`;
  }
  if (fb.native && fb.native.length) h += `<div class="card"><b>🗣️ 원어민 톤</b> <span class="sub">문법은 맞지만 교과서투인 표현</span>` + fb.native.map((n, i) => `<div class="err" style="border-left-color:#8a6d3b;background:#fbf8f2"><span class="sub">내 표현:</span> ${esc(n.orig)}<br><b>→ ${esc(n.native)}</b> <button class="speak-btn" onclick="speak(curEntry().fb.native[${i}].native)">🔊</button><br><span class="sub">${esc(n.why)}</span></div>`).join('') + `</div>`;
  if (fb.corrected) h += `<div class="card"><b>고친 글</b> <span class="sub">최소 수정</span> <button class="speak-btn" onclick="speak(curEntry().fb.corrected)">🔊</button><div class="journal-text" style="margin-top:8px">${esc(fb.corrected)}</div></div>`;
  if (fb.natural) h += `<div class="card"><b>B2+ 원어민 버전</b> <button class="speak-btn" onclick="speak(curEntry().fb.natural)">🔊</button><div class="journal-text" style="margin-top:8px">${esc(fb.natural)}</div></div>`;
  if (fb.cards && fb.cards.length) {
    const added = !!e.cardsAdded;
    h += `<div class="card"><b>복습 카드로 만들기</b> <span class="sub">'오늘' 탭 새 문장으로 먼저 나와요</span>` + fb.cards.map((c, i) => `<label class="expr" style="cursor:pointer"><div><b>${esc(c.es)}</b><div class="sub">${esc(c.ko)}${c.point ? ' · ' + esc(c.point) : ''}</div></div><input type="checkbox" ${(e.cardSel || [])[i] !== false ? 'checked' : ''} ${added ? 'disabled' : ''} onchange="curEntry().cardSel[${i}]=this.checked;save()" style="width:22px;height:22px;flex:none"></label>`).join('') +
      `<div class="btn-row">${added ? '<span class="tag green" style="padding:10px 14px">✓ 카드 ' + e.cardsAdded + '개 추가됨</span>' : '<button class="big g4" onclick="addFbCards()">선택한 문장 카드로 추가</button>'}</div></div>`;
  }
  if (fb.next) h += `<div class="card"><b>➡️ 다음 글에서</b><div class="detail">${esc(fb.next)}</div></div>`;
  // 레벨업 다시 쓰기
  h += `<div class="card" style="border-color:#b9dcbb"><b>✍️ 레벨업 다시 쓰기</b><div class="sub">같은 내용을 다시 쓰되, <b>미션 구조 + 위 업그레이드 중 2개 이상</b>을 내 문장으로 녹여 넣으세요. 그대로 베끼기보다 조금 바꿔 쓰는 게 실력이 돼요.</div>
    <textarea id="rwText" rows="9" placeholder="다시 써보기" spellcheck="false">${esc(e.rewrite || '')}</textarea>
    <div class="btn-row"><button class="ghost" onclick="toggleHideRef()">${wrView.hideRef ? '첨삭 보이기' : '첨삭 가리고 쓰기'}</button><button class="big g3" onclick="saveRewrite()">${e.status === 'done' ? '다시 쓰기 저장' : '저장'}</button></div>`;
  if (e.rewrite) {
    h += `<div class="step"><div class="num">✓</div><div style="flex:1"><b>다시 쓴 글 검사받기</b><div class="sub">새로 넣은 B2 구조가 맞는지 Claude에게 한 번 더 확인받아요.</div>
      <div class="btn-row"><button class="big gK" onclick="openClaudeWith(buildRecheckPrompt(curEntry()))">재검사 요청 ↗</button><button class="ghost" onclick="showPrompt('recheck')">요청문 보기</button></div>
      <textarea id="rcPaste" rows="4" placeholder="재검사 답변 붙여넣기" style="font-size:13px">${esc(e.recheckRaw || '')}</textarea>
      <div class="btn-row"><button class="ghost" onclick="pasteInto('rcPaste')">📋 붙여넣기</button><button class="big g3" onclick="applyRecheck()">재검사 반영</button></div></div></div>`;
  }
  if (e.recheck) {
    const r = e.recheck;
    h += `<div class="detail" style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)"><b>🔁 재검사 결과</b> ${esc(r.summary)}</div>` + missionCheckHTML(e, r.mission_check);
    if (r.b2_used && r.b2_used.length) h += `<div class="detail"><b>제대로 쓴 B2 구조</b><br>${r.b2_used.map(s => '✅ ' + esc(s)).join('<br>')}</div>`;
    if (r.errors.length) h += r.errors.map(x => `<div class="err"><span class="tag red" style="font-size:11px">${esc(x.type)}</span><br><span class="o">${esc(x.orig)}</span> → <span class="f">${esc(x.fix)}</span><br><span class="sub">${esc(x.why)}</span></div>`).join('');
    else h += `<div class="detail" style="color:var(--ok)"><b>오류 없음 — 완벽해요! 🎉</b></div>`;
  }
  h += `</div>`;
  h += `<div class="card"><div class="sub">처음 쓴 글</div><div class="journal-text" style="margin-top:8px;color:var(--sub)">${esc(e.text)}</div></div>`;
  el.innerHTML = h;
  if (wrView.hideRef) document.querySelectorAll('#panel-write .card').forEach((c, i, all) => { if (!c.querySelector('#rwText') && i < all.length - 1) c.style.filter = 'blur(6px)'; });
}
function applyRecheck() {
  const e = curEntry(); const raw = $('rcPaste').value; e.recheckRaw = raw;
  if (!raw.trim()) { toast('재검사 답변을 먼저 붙여넣어 주세요'); return; }
  const o = extractJSON(raw); if (!o) { save(); formatFailOverlay(null); return; }
  e.recheck = { summary: _str(o.summary), errors: sanErrors(o.errors), mission_check: sanMission(o.mission_check), b2_used: _arr(o.b2_used).map(_str).filter(Boolean), corrected: _str(o.corrected) };
  if (!e.missionLogged_recheck && e.recheck.mission_check.length) recordMission(e, e.recheck.mission_check, 'recheck');
  e.recheck.errors.forEach(x => { const t = x.type || '기타'; S.stats.writeErr[t] = (S.stats.writeErr[t] || 0) + 1; });
  save(); renderWrite(); toast('재검사 반영!');
}
function addUpgradeCard(i) { const e = curEntry(); const u = e.fb.upgrades[i]; const n = addMine([mkMine(u.up, u.orig ? '(내 문장) ' + u.orig : '', u.structure + (u.why ? ' — ' + u.why : ''), 'B2 업그레이드', u.structure)]); queueBuilt = false; toast(n ? '카드 추가! 한국어 칸에는 내 원래 문장이 나와요' : '이미 있는 문장이에요'); renderWrite(); }
function toggleHideRef() { const ta = $('rwText'); if (ta) curEntry().rewrite = ta.value; wrView.hideRef = !wrView.hideRef; renderWrite(); }
function addFbCards() {
  const e = curEntry(); const sel = e.fb.cards.filter((c, i) => (e.cardSel || [])[i] !== false);
  const n = addMine(sel.map(c => mkMine(c.es, c.ko, c.point, '내 글 · ' + fmtDate(e.created), c.point)));
  e.cardsAdded = n || sel.length; save(); queueBuilt = false; toast(n + '개 카드 추가!'); renderWrite();
}
function saveRewrite() {
  const e = curEntry(); e.rewrite = $('rwText').value; e.status = 'done'; e.doneAt = new Date().toISOString(); save();
  if (e.articleId) { const r = S.read[e.articleId] = S.read[e.articleId] || {}; r.wrote = true; save(); }
  toast('✨ 저장했어요. 이제 재검사를 받아보세요'); wrView.hideRef = false; renderWrite();
}

/* ── 기록 ─────────────────────────────────── */
let browseQ = '';
function renderRecord() {
  const el = $('panel-record'); const cards = activeCards(); const t = today();
  let learned = 0, mature = 0;
  cards.forEach(d => { const p = S.prog[d.id]; if (p && p.seen > 0) { learned++; if (p.box >= 4) mature++; } });
  const doneJ = S.journal.filter(j => j.status === 'done' || j.status === 'reviewed').length;
  const totalWords = S.journal.reduce((a, j) => a + (j.words || 0), 0);
  const readN = Object.values(S.read).filter(r => r.done).length;
  let h = `<div class="stat-grid">
    <div class="stat-box"><div class="num">${S.stats.streak}</div><div class="lbl">🔥 연속 학습일</div></div>
    <div class="stat-box"><div class="num">${learned}</div><div class="lbl">학습한 문장 / ${cards.length}</div></div>
    <div class="stat-box"><div class="num">${mature}</div><div class="lbl">장기기억 (16일+)</div></div>
    <div class="stat-box"><div class="num">${dueCount()}</div><div class="lbl">오늘 복습 대기</div></div>
    <div class="stat-box"><div class="num">${doneJ}</div><div class="lbl">첨삭받은 글 (${totalWords}단어)</div></div>
    <div class="stat-box"><div class="num">${readN}</div><div class="lbl">읽은 기사 ${S.stats.quizTotal ? '· 정답 ' + Math.round(S.stats.quizRight / S.stats.quizTotal * 100) + '%' : ''}</div></div>
  </div>`;
  // 레벨
  h += `<div class="card"><b>학습 레벨</b> <span class="sub">'오늘' 카드와 연습에 쓸 문장 레벨</span><div class="pill-group" style="margin-top:10px">` +
    LEVELS.map(lv => `<span class="pill ${S.levels[lv] ? 'on' : ''}" onclick="toggleLevel('${lv}')">${lv}</span>`).join('') +
    `<span class="pill on" style="opacity:.6">내 문장 ${S.mine.length}</span></div>`;
  LEVELS.forEach(lv => { const set = SENTENCES.filter(d => d.level === lv); const ln = set.filter(d => S.prog[d.id] && S.prog[d.id].seen > 0).length; const pct = Math.round(ln / set.length * 100); h += `<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:13px"><b>${lv}</b><span class="sub">${ln}/${set.length}</span></div><div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div></div>`; });
  h += `<div class="pill-group" style="margin-top:14px"><span class="sub">하루 새 문장</span>${[5, 10, 15, 20].map(n => `<span class="pill ${S.newLimit === n ? 'on' : ''}" onclick="S.newLimit=${n};save();queueBuilt=false;renderRecord()">${n}</span>`).join('')}</div></div>`;
  // 14일
  const last14 = [...Array(14)].map((_, i) => { const d = S.stats.daily[String(t - 13 + i)]; return d ? (d.rev || 0) + (d.prac || 0) : 0; });
  const wdays = new Set(S.journal.map(j => j.day));
  const mx = Math.max(...last14, 1);
  h += `<div class="card"><b>최근 14일</b> <span class="sub">막대 = 복습·연습 횟수, ✍️ = 글 쓴 날</span><div style="display:flex;gap:4px;align-items:flex-end;height:64px;margin-top:10px">` +
    last14.map(v => `<div style="flex:1;background:var(--accent);opacity:${v ? 1 : .15};border-radius:4px 4px 0 0;height:${Math.max(5, v / mx * 60)}px"></div>`).join('') + `</div><div style="display:flex;gap:4px;margin-top:4px">` +
    last14.map((_, i) => `<div style="flex:1;text-align:center;font-size:10px">${wdays.has(t - 13 + i) ? '✍️' : ''}</div>`).join('') + `</div></div>`;
  // 약점
  const errTop = Object.entries(S.stats.writeErr).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (errTop.length) { const m2 = errTop[0][1]; h += `<div class="card"><b>작문 오류 유형</b> <span class="sub">Claude 첨삭 누적</span>` + errTop.map(([k, v]) => `<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;font-size:13px"><b>${esc(k)}</b><span class="sub">${v}회</span></div><div class="bar-wrap"><div class="bar" style="width:${v / m2 * 100}%;background:var(--bad)"></div></div></div>`).join('') + `</div>`; }
  const msArr = GRAM_B2.map(g => ({ g, m: S.stats.mission[g.id] })).filter(x => x.m && x.m.try);
  if (msArr.length) h += `<div class="card"><b>B2 구조 숙련도</b> <span class="sub">문법 미션 성공 / 시도</span>` + msArr.sort((a, b) => (a.m.ok / a.m.try) - (b.m.ok / b.m.try)).map(({ g, m }) => { const pc = Math.round(m.ok / m.try * 100); return `<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;font-size:13px"><b>${esc(g.name)}</b><span class="sub">${m.ok}/${m.try}</span></div><div class="bar-wrap"><div class="bar" style="width:${pc}%;background:${pc >= 70 ? 'var(--ok)' : pc >= 40 ? 'var(--warn)' : 'var(--bad)'}"></div></div></div>`; }).join('') + `<div class="btn-row"><button class="ghost sm" onclick="showGrammarBook()">📘 구조 전체 보기</button></div></div>`;
  const tagArr = Object.keys(S.stats.tags).filter(k => !k.startsWith('작문·')).map(k => { const v = S.stats.tags[k]; const n = v.ok + v.bad; return { k, n, rate: n ? v.bad / n : 0 }; }).filter(x => x.n >= 5).sort((a, b) => b.rate - a.rate).slice(0, 8);
  if (tagArr.length) h += `<div class="card"><b>약점 문법</b> <span class="sub">카드·연습 오답률 (5회 이상)</span>` + tagArr.map(x => { const pc = Math.round(x.rate * 100); return `<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center;font-size:13px"><b>${esc(x.k)}</b><span class="sub">${pc}% · ${x.n}회 <button class="ghost sm" onclick="focusGrammar('${jsq(x.k)}')">집중 복습</button></span></div><div class="bar-wrap"><div class="bar" style="width:${pc}%;background:var(--bad)"></div></div></div>`; }).join('') + `</div>`;
  const mw = Object.entries(S.stats.missWords).sort((a, b) => b[1] - a[1]).slice(0, 16);
  if (mw.length) h += `<div class="card"><b>자주 놓치는 단어</b><div style="margin-top:8px">` + mw.map(([k, v]) => `<span class="tag" style="margin:2px">${esc(k.split(':')[1])} ×${v}</span>`).join('') + `</div></div>`;
  // 문장 찾기
  h += `<div class="card"><b>문장 찾기</b><input type="text" id="browseBox" placeholder="단어, 표현, 한국어 뜻…" value="${esc(browseQ)}" autocapitalize="off"><div id="browseOut"></div></div>`;
  // 설정·백업
  h += `<div class="card"><b>백업 · 설정</b><div class="sub" style="margin-top:4px">일기와 학습 기록은 이 기기에만 저장돼요. 마지막 백업: ${S.stats.lastBackup ? (t - S.stats.lastBackup) + '일 전' : '없음'}</div>
    <div class="btn-row"><button class="ghost" onclick="doExport()">💾 백업 파일 저장</button><button class="ghost" onclick="$('importFile').click()">불러오기</button><button class="ghost" onclick="showGuide()">사용법</button></div>
    <div class="btn-row"><button class="ghost" onclick="exportJournalText()">📔 글 모음 텍스트로 내보내기</button><button class="ghost" style="color:var(--bad)" onclick="resetAll()">초기화</button></div>
    <input type="file" id="importFile" accept=".json,application/json" style="display:none" onchange="doImport(this)">
    <div class="sub" style="margin-top:12px">v${APP_VERSION} · 문장 ${SENTENCES.length} · 대화 ${DIALOGS.length}</div></div>`;
  el.innerHTML = h;
  const bb = $('browseBox'); bb.oninput = () => { browseQ = bb.value; renderBrowse(); }; renderBrowse();
}
function toggleLevel(lv) { S.levels[lv] = !S.levels[lv]; if (!LEVELS.some(l => S.levels[l])) S.levels[lv] = true; save(); queueBuilt = false; renderRecord(); updateHeader(); }
function renderBrowse() {
  const out = $('browseOut'); if (!out) return; const q = browseQ.trim().toLowerCase();
  if (!q) { out.innerHTML = ''; return; }
  const res = activeCards().filter(d => (d.text + ' ' + d.ko + ' ' + d.vocab + ' ' + d.grammar + ' ' + d.ctx).toLowerCase().includes(q)).slice(0, 60);
  out.innerHTML = res.length ? '<table>' + res.map(d => `<tr><td style="width:30px"><button class="speak-btn" onclick="speakId('${d.id}')">🔊</button></td><td><b>${esc(d.text)}</b><br><span class="sub">${esc(d.ko)} · ${esc(d.level)}</span></td></tr>`).join('') + '</table>' : '<div class="sub" style="margin-top:10px">결과 없음</div>';
}
function focusGrammar(cat) {
  const cards = activeCards().filter(d => gramCat(d) === cat);
  const studied = cards.filter(d => S.prog[d.id] && S.prog[d.id].seen > 0); const rest = cards.filter(d => !(S.prog[d.id] && S.prog[d.id].seen > 0));
  queue = studied.concat(rest).slice(0, 30); qi = 0; flipped = false; queueBuilt = true; goTab('today');
}
async function doExport() {
  S.stats.lastBackup = today(); save();
  const d = new Date(); const name = 'estudio_backup_' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.json';
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '문장장 백업' }); refreshTab(); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  refreshTab();
}
function doImport(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const o = JSON.parse(r.result);
      if (!o || typeof o !== 'object' || !o.prog) throw new Error('bad');
      if (!confirm('백업으로 지금 기록을 덮어쓸까요? (이전 버전 문장장 백업도 불러올 수 있어요)')) return;
      S = normState(o); rebuildIndex(); save(); queueBuilt = false; refreshTab(); updateHeader(); toast('불러왔어요!');
    } catch (e) { alert('백업 파일을 읽을 수 없어요.'); }
    inp.value = '';
  };
  r.readAsText(f);
}
function exportJournalText() {
  const txt = S.journal.slice().reverse().map(j => {
    let s = `# ${new Date(j.created).toLocaleDateString('ko-KR')} · ${j.mode === 'opinion' ? '의견문' : '일기'}\n`;
    if (j.task) s += `주제: ${j.task.es}\n`;
    s += `\n${j.text}\n`;
    if (j.fb && j.fb.corrected) s += `\n## 고친 글\n${j.fb.corrected}\n`;
    if (j.fb && j.fb.errors && j.fb.errors.length) s += `\n## 고칠 점\n` + j.fb.errors.map(x => `- ${x.orig} → ${x.fix} (${x.type}) ${x.why}`).join('\n') + '\n';
    if (j.rewrite) s += `\n## 다시 쓰기\n${j.rewrite}\n`;
    return s;
  }).join('\n---\n\n');
  const blob = new Blob([txt], { type: 'text/markdown' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mis_textos.md'; document.body.appendChild(a); a.click(); a.remove();
}
function resetAll() { if (!confirm('모든 학습 기록과 일기를 지울까요? 되돌릴 수 없어요.')) return; if (!confirm('정말요? 백업을 먼저 받는 걸 권해요.')) return; S = normState({}); rebuildIndex(); save(); queueBuilt = false; refreshTab(); }

/* ── 오버레이 · 안내 ─────────────────────────── */
function openOverlay(html) { $('overlayBox').innerHTML = html; $('overlay').classList.add('show'); }
function closeOverlay() { $('overlay').classList.remove('show'); }
$('overlay').onclick = e => { if (e.target.id === 'overlay') closeOverlay(); };
function showGuide() {
  openOverlay(`<h2>👋 문장장 Español</h2>
  <p>하루 루틴은 세 칸이에요.</p>
  <ol><li><b>오늘</b> — 복습 카드 + 새 문장 10개 (간격 반복)</li><li><b>읽기</b> — 매주 새 시사·교양 기사 B2판. 표현은 카드로 가져가요.</li><li><b>쓰기</b> — 짧은 일기 → Claude 첨삭 → 다시 쓰기. 틀린 문장은 카드가 돼요.</li></ol>
  <p><b>첨삭 받는 법</b>: 쓰기에서 'Claude 열기'를 누르면 요청이 복사되고 Claude가 열려요. 보내고 받은 답(json 코드블록)을 복사해서 앱에 붙여넣으면 끝. 별도 API 없이 내 Claude 구독으로 돌아가요.</p>
  <p><b>홈 화면에 설치</b>: Safari 공유 버튼 → '홈 화면에 추가'. 앱처럼 열리고 오프라인에서도 돼요.</p>
  <p><b>기록 보관</b>: 모든 기록은 이 폰에만 있어요. 일주일에 한 번 기록 탭에서 백업해주세요.</p>
  <button class="flip" onclick="closeOverlay();localStorage.setItem('estudio_seen','1')">시작하기</button>`);
}

/* ── 탭 ─────────────────────────────────── */
let currentTab = 'today';
function goTab(tab) {
  stopSpeak();
  document.querySelectorAll('nav.tabbar button').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('show'));
  currentTab = tab; $('panel-' + tab).classList.add('show'); refreshTab(); hlBarUpdate(); window.scrollTo(0, 0);
}
document.querySelectorAll('nav.tabbar button').forEach(b => b.onclick = () => { if (b.dataset.tab === 'write' && currentTab === 'write' && wrView.mode !== 'edit') wrView.mode = 'home'; if (b.dataset.tab === 'read' && currentTab === 'read') { rdView.art = null; rdView.hlList = false; } goTab(b.dataset.tab); });
function refreshTab() {
  updateHeader();
  if (currentTab === 'today') renderToday(); else if (currentTab === 'practice') renderPractice(false);
  else if (currentTab === 'read') renderRead(); else if (currentTab === 'write') renderWrite(); else renderRecord();
}
function updateHeader() { $('hdrInfo').textContent = LEVELS.filter(l => S.levels[l]).join('·') + ' · 복습 ' + dueCount(); }
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || currentTab !== 'today') return;
  if (e.code === 'Space') { e.preventDefault(); flipCard(); }
  if (flipped && ['1', '2', '3', '4'].includes(e.key)) grade(parseInt(e.key));
});
// 날짜가 바뀐 채로 앱을 다시 열면 큐 재생성
let lastDaySeen = today();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && today() !== lastDaySeen) { lastDaySeen = today(); queueBuilt = false; refreshTab(); } });

/* ── 시작 ─────────────────────────────────── */
refreshTab();
loadPackIndex();
if (!localStorage.getItem('estudio_seen')) showGuide();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('새 버전이 준비됐어요. 앱을 다시 열면 적용돼요.', 3500); }); });
  }).catch(() => { });
}
