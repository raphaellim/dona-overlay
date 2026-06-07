const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;


const MEDIA_BASE_DIR = path.join(__dirname, 'public', 'uploads');
const MEDIA_IMAGE_DIR = path.join(MEDIA_BASE_DIR, 'images');
const MEDIA_VIDEO_DIR = path.join(MEDIA_BASE_DIR, 'videos');
for (const d of [MEDIA_BASE_DIR, MEDIA_IMAGE_DIR, MEDIA_VIDEO_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
}

function safeMediaName(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  const base = path.basename(String(name || ''), ext)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9가-힣_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'media';
  return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${base}${ext}`;
}

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const mime = String(file.mimetype || '');
      if (mime.startsWith('video/')) cb(null, MEDIA_VIDEO_DIR);
      else cb(null, MEDIA_IMAGE_DIR);
    },
    filename(req, file, cb) { cb(null, safeMediaName(file.originalname)); }
  }),
  limits: { fileSize: 120 * 1024 * 1024, files: 10 },
  fileFilter(req, file, cb) {
    const mime = String(file.mimetype || '');
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const okImage = mime.startsWith('image/') && ['.png','.jpg','.jpeg','.webp','.gif'].includes(ext);
    const okVideo = mime.startsWith('video/') && ['.mp4','.webm','.mov'].includes(ext);
    if (okImage || okVideo) return cb(null, true);
    cb(new Error('이미지(png/jpg/webp/gif) 또는 영상(mp4/webm/mov)만 업로드할 수 있습니다.'));
  }
});

function listMediaFiles() {
  const items = [];
  const scan = (dir, type, urlBase) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const ext = path.extname(f.name).toLowerCase();
      if (type === 'image' && !['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)) continue;
      if (type === 'video' && !['.mp4','.webm','.mov'].includes(ext)) continue;
      const abs = path.join(dir, f.name);
      const st = fs.statSync(abs);
      items.push({
        id: Buffer.from(`${urlBase}/${f.name}`).toString('base64url'),
        type,
        name: f.name,
        url: `${urlBase}/${encodeURIComponent(f.name)}`,
        size: st.size,
        createdAt: st.birthtime || st.mtime,
        updatedAt: st.mtime
      });
    }
  };
  scan(MEDIA_IMAGE_DIR, 'image', '/uploads/images');
  scan(MEDIA_VIDEO_DIR, 'video', '/uploads/videos');

  // 기존 서버 이미지 폴더도 선택 가능하게 포함하되 삭제 대상은 uploads만 허용합니다.
  for (const dirName of ['images', 'slides', 'img']) {
    const dir = path.join(__dirname, 'public', dirName);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const ext = path.extname(f.name).toLowerCase();
      if (!['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)) continue;
      const abs = path.join(dir, f.name);
      const st = fs.statSync(abs);
      const url = `/${dirName}/${encodeURIComponent(f.name)}`;
      items.push({ id: Buffer.from(url).toString('base64url'), type:'image', name:f.name, url, size:st.size, createdAt:st.birthtime || st.mtime, updatedAt:st.mtime, readonly:true });
    }
  }
  return items.sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt));
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(accessGuard);
app.use(express.static('public'));

function defaultPresets() {
  return [
    { id: 'smoke', enabled: true, title: '펴피지마', plusName: '흡연', plusPrice: 11900, minusName: '금연', minusPrice: 12000 },
    { id: 'food', enabled: true, title: '먹먹마', plusName: '먹어', plusPrice: 14000, minusName: '먹지마', minusPrice: 15000 }
  ];
}

function defaultSettings() {
  return {
    title: '도네이터 현황',
    titleImage: '',
    noticeTitle: '공지',
    notice: '',
    noticeColors: ['#ffffff', '#ffe066', '#5ecbff', '#ffb4ca', '#ff4d5e'],
    viewerPassword: '',
    viewerToken: '',
    overlaySections: { account: true, notice: false, creators: true, creatorDonations: true, karaoke: false, funding: false, broadcastTimer: false, media: true },
    columns: 4,
    maxCreators: 12,
    creators: [],
    presets: defaultPresets(),
    prices: { smoke: 11900, nosmoke: 12000, eat: 14000, noeat: 15000 },
    karaokeData: normalizeKaraokeData({}),
    fundingData: normalizeFundingData({}),
    stationStyle: normalizeStationStyle({}),
    broadcastTimerData: normalizeBroadcastTimerData({}),
    broadcastLiveData: normalizeBroadcastLiveData({}),
    roulette: defaultRouletteData(),
    soundRules: {
      enabled: true,
      defaultSound: 'alert.mp3',
      amountRules: [
        { id: 'small', title: '계좌 1만원 미만', min: 1, max: 9999, sound: 'account_small.mp3' },
        { id: 'mid', title: '계좌 1만원 이상', min: 10000, max: 49999, sound: 'account_mid.mp3' },
        { id: 'big', title: '계좌 5만원 이상', min: 50000, max: 99999, sound: 'account_big.mp3' },
        { id: 'super', title: '계좌 10만원 이상', min: 100000, max: 0, sound: 'account_super.mp3' }
      ]
    },
    stationSettings: {}
  };
}

function normName(v) {
  return String(v || '').replace(/\u00A0/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeSlug(v) {
  const s = String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return s || 'default';
}

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

function toWon(v) {
  const raw = String(v ?? '').trim().replace(/,/g, '');
  if (!raw) return 0;
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) > 0 && Math.abs(n) < 1000) return Math.round(n * 1000);
  return Math.trunc(n);
}

function displayMan(won) {
  return Math.trunc(Number(won || 0) / 1000) / 10;
}

function displayManText(won) {
  return displayMan(won).toFixed(1).replace(/\.0$/, '');
}

function normalizePreset(p, idx) {
  const defaults = defaultPresets()[idx] || {
    id: `preset_${idx + 1}`,
    enabled: true,
    title: `프리셋${idx + 1}`,
    plusName: '플러스',
    plusPrice: 10000,
    minusName: '마이너스',
    minusPrice: 10000
  };

  return {
    id: String(p?.id || defaults.id || `preset_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '') || `preset_${idx + 1}`,
    enabled: p?.enabled !== false && p?.enabled !== 'false',
    title: normName(p?.title || defaults.title),
    plusName: normName(p?.plusName || defaults.plusName),
    plusPrice: Math.max(0, toWon(p?.plusPrice ?? defaults.plusPrice)),
    minusName: normName(p?.minusName || defaults.minusName),
    minusPrice: Math.max(0, toWon(p?.minusPrice ?? defaults.minusPrice)),
    soundFile: cleanSoundFile(p?.soundFile ?? defaults.soundFile ?? '')
  };
}


function cleanSoundFile(v) {
  return String(v || '').replace(/[\\\/]/g, '').trim();
}

function normalizeSoundRules(raw, base) {
  const fallback = base || defaultSettings().soundRules;
  const value = raw && typeof raw === 'object' ? raw : {};
  const rawRules = Array.isArray(value.amountRules) ? value.amountRules : fallback.amountRules;

  return {
    enabled: value.enabled !== false,
    defaultSound: cleanSoundFile(value.defaultSound) || fallback.defaultSound || 'alert.mp3',
    amountRules: rawRules.slice(0, 10).map((r, idx) => ({
      id: String(r.id || `amount_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '') || `amount_${idx + 1}`,
      title: normName(r.title || `금액구간 ${idx + 1}`),
      min: Math.max(0, Number(r.min || 0)),
      max: Math.max(0, Number(r.max || 0)),
      sound: cleanSoundFile(r.sound) || ''
    }))
  };
}




function defaultRouletteData() {
  return {
    enabled: true,
    displayMode: 'box',
    duration: 3600,
    resultHoldMs: 10000,
    historyLimit: 30,
    lists: [
      {
        id: 'viewer',
        title: '시청자 추첨',
        items: [
          { id: 'viewer_1', text: '빵떠기', enabled: true },
          { id: 'viewer_2', text: '또영이', enabled: true },
          { id: 'viewer_3', text: '파파', enabled: true },
          { id: 'viewer_4', text: '빵울', enabled: true }
        ]
      },
      {
        id: 'reaction',
        title: '리액션 룰렛',
        items: [
          { id: 'reaction_1', text: '손하트 10초', enabled: true },
          { id: 'reaction_2', text: '애교 한마디', enabled: true },
          { id: 'reaction_3', text: '노래 한 소절', enabled: true }
        ]
      }
    ],
    autoRules: [
      { id: 'rule_10000', enabled: false, minAmount: 10000, listId: 'reaction' }
    ],
    current: null,
    history: []
  };
}

function cleanRouletteId(v, fallback) {
  return String(v || fallback || '').replace(/[^a-zA-Z0-9_-]/g, '') || fallback || ('id_' + Date.now());
}

function normalizeRouletteData(raw) {
  const base = defaultRouletteData();
  const value = raw && typeof raw === 'object' ? raw : {};
  const sourceLists = Array.isArray(value.lists) && value.lists.length ? value.lists : base.lists;
  const lists = sourceLists.map((list, idx) => {
    const id = cleanRouletteId(list?.id, `roulette_${idx + 1}`);
    const rawItems = Array.isArray(list?.items) ? list.items : [];
    const items = rawItems.map((item, itemIdx) => {
      if (typeof item === 'string') {
        return { id: `${id}_${itemIdx + 1}`, text: normName(item), enabled: true };
      }
      return {
        id: cleanRouletteId(item?.id, `${id}_${itemIdx + 1}`),
        text: normName(item?.text || item?.name || item?.title || ''),
        enabled: item?.enabled !== false && item?.enabled !== 'false'
      };
    }).filter(item => item.text).slice(0, 200);
    return {
      id,
      title: normName(list?.title || list?.name || `룰렛${idx + 1}`),
      items
    };
  }).filter(list => list.title && list.items.length).slice(0, 50);

  const validListIds = new Set(lists.map(l => l.id));
  const sourceRules = Array.isArray(value.autoRules) ? value.autoRules : base.autoRules;
  const autoRules = sourceRules.map((rule, idx) => ({
    id: cleanRouletteId(rule?.id, `rule_${idx + 1}`),
    enabled: rule?.enabled === true || rule?.enabled === 'true',
    minAmount: Math.max(0, toWon(rule?.minAmount ?? rule?.amount ?? 0)),
    listId: cleanRouletteId(rule?.listId || rule?.rouletteId, '')
  })).filter(rule => rule.minAmount > 0 && validListIds.has(rule.listId)).slice(0, 30);

  const current = value.current && typeof value.current === 'object' ? {
    running: value.current.running === true,
    runId: String(value.current.runId || ''),
    mode: ['manual', 'auto'].includes(String(value.current.mode || '')) ? String(value.current.mode) : 'manual',
    listId: cleanRouletteId(value.current.listId, ''),
    listTitle: String(value.current.listTitle || ''),
    result: String(value.current.result || ''),
    donor: String(value.current.donor || ''),
    amount: Math.max(0, Number(value.current.amount || 0)),
    startedAt: Math.max(0, Number(value.current.startedAt || 0)),
    duration: Math.max(1200, Math.min(30000, Number(value.current.duration || value.duration || base.duration))),
    batchId: String(value.current.batchId || ''),
    sequence: Math.max(0, Number(value.current.sequence || 0)),
    total: Math.max(0, Number(value.current.total || 0))
  } : null;

  const queue = Array.isArray(value.queue) ? value.queue.map((q, idx) => ({
    running: true,
    runId: String(q.runId || `queue_${idx}_${Date.now()}`),
    mode: ['manual', 'auto'].includes(String(q.mode || '')) ? String(q.mode) : 'auto',
    listId: cleanRouletteId(q.listId, ''),
    listTitle: String(q.listTitle || ''),
    result: String(q.result || ''),
    donor: String(q.donor || ''),
    amount: Math.max(0, Number(q.amount || 0)),
    startedAt: 0,
    duration: Math.max(1200, Math.min(30000, Number(q.duration || value.duration || base.duration))),
    batchId: String(q.batchId || ''),
    sequence: Math.max(0, Number(q.sequence || 0)),
    total: Math.max(0, Number(q.total || 0))
  })).filter(q => q.result && q.listId).slice(0, 50) : [];

  const history = Array.isArray(value.history) ? value.history.map((h, idx) => ({
    id: String(h.id || h.runId || `hist_${idx}`),
    mode: ['manual', 'auto'].includes(String(h.mode || '')) ? String(h.mode) : 'manual',
    listId: cleanRouletteId(h.listId, ''),
    listTitle: String(h.listTitle || ''),
    result: String(h.result || ''),
    donor: String(h.donor || ''),
    amount: Math.max(0, Number(h.amount || 0)),
    createdAt: Math.max(0, Number(h.createdAt || 0)),
    batchId: String(h.batchId || ''),
    sequence: Math.max(0, Number(h.sequence || 0)),
    total: Math.max(0, Number(h.total || 0))
  })).filter(h => h.result).slice(-100) : [];

  return {
    enabled: value.enabled !== false,
    displayMode: ['box', 'center', 'side'].includes(String(value.displayMode || '')) ? String(value.displayMode) : base.displayMode,
    duration: Math.max(1200, Math.min(30000, Number(value.duration || base.duration))),
    resultHoldMs: Math.max(1000, Math.min(60000, Number(value.resultHoldMs || base.resultHoldMs))),
    historyLimit: Math.max(1, Math.min(100, Number(value.historyLimit || base.historyLimit))),
    lists,
    autoRules,
    current,
    queue,
    history
  };
}

const ROULETTE_MIN_RESULT_VISIBLE_MS = 3100;

function pickRouletteWinner(list) {
  const activeItems = (list?.items || []).filter(item => item.enabled !== false && item.text);
  if (!activeItems.length) return '';
  const index = crypto.randomInt ? crypto.randomInt(activeItems.length) : Math.floor(Math.random() * activeItems.length);
  return activeItems[index].text;
}

async function saveRouletteForContext(ctx, roulette) {
  const normalized = normalizeRouletteData(roulette);
  await saveSharedStationSettings(ctx.station.slug, { roulette: normalized });
  await saveEffectiveSettings(ctx.station.slug, ctx.active.id, { roulette: normalized });
  return normalized;
}

function makeRouletteHistoryRow(run) {
  return {
    id: run.runId,
    mode: run.mode,
    listId: run.listId,
    listTitle: run.listTitle,
    result: run.result,
    donor: run.donor,
    amount: run.amount,
    createdAt: Date.now(),
    batchId: run.batchId || '',
    sequence: Number(run.sequence || 0),
    total: Number(run.total || 0)
  };
}

function buildRouletteRun(list, mode, extra = {}) {
  const now = Date.now();
  const result = pickRouletteWinner(list);
  if (!result) throw new Error('사용 가능한 룰렛 항목이 없습니다.');
  return {
    running: true,
    runId: `roulette_${now}_${Math.random().toString(36).slice(2, 8)}`,
    mode: mode === 'auto' ? 'auto' : 'manual',
    listId: list.id,
    listTitle: list.title,
    result,
    donor: String(extra.donor || ''),
    amount: Math.max(0, Number(extra.amount || 0)),
    startedAt: Math.max(0, Number(extra.startedAt || now)),
    duration: Math.max(1200, Math.min(30000, Number(extra.duration || 5000))),
    batchId: String(extra.batchId || ''),
    sequence: Math.max(0, Number(extra.sequence || 0)),
    total: Math.max(0, Number(extra.total || 0))
  };
}

async function createRouletteRun(ctx, listId, mode, extra = {}) {
  return createRouletteBatch(ctx, listId, mode, 1, extra);
}

async function createRouletteBatch(ctx, listId, mode, count = 1, extra = {}) {
  const currentSettings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
  const roulette = normalizeRouletteData(currentSettings.roulette);
  if (!roulette.enabled) throw new Error('룰렛 기능이 OFF 상태입니다.');
  const list = roulette.lists.find(x => x.id === listId);
  if (!list) throw new Error('룰렛 리스트를 찾을 수 없습니다.');
  const now = Date.now();
  const prev = roulette.current;
  if (!extra.force && prev && prev.startedAt) {
    const prevUnlockAt = Number(prev.startedAt || 0) + Number(prev.duration || roulette.duration || 3600) + ROULETTE_MIN_RESULT_VISIBLE_MS;
    if (now < prevUnlockAt) {
      const waitSec = Math.ceil((prevUnlockAt - now) / 1000);
      throw new Error(`이전 룰렛 결과 표시 중입니다. ${waitSec}초 후 다시 실행하세요.`);
    }
  }
  const safeCount = Math.max(1, Math.min(50, Math.trunc(Number(count || 1))));
  const batchId = String(extra.batchId || (safeCount > 1 ? `batch_${now}_${Math.random().toString(36).slice(2, 8)}` : ''));
  const duration = Math.max(1200, Math.min(30000, Number(extra.duration || roulette.duration || 5000)));
  const runs = [];
  for (let i = 1; i <= safeCount; i++) {
    runs.push(buildRouletteRun(list, mode, {
      ...extra,
      duration,
      startedAt: i === 1 ? now : 0,
      batchId,
      sequence: safeCount > 1 ? i : Math.max(0, Number(extra.sequence || 0)),
      total: safeCount > 1 ? safeCount : Math.max(0, Number(extra.total || 0))
    }));
  }
  roulette.current = runs[0];
  roulette.queue = runs.slice(1);
  roulette.history = [...(roulette.history || []), makeRouletteHistoryRow(runs[0])].slice(-roulette.historyLimit);
  const saved = await saveRouletteForContext(ctx, roulette);
  return { roulette: saved, run: runs[0], runs };
}

function resolveRouletteRuleForAmount(roulette, amount, body = {}) {
  const total = Math.max(0, Number(amount || 0));
  if (total <= 0) return null;
  const rules = (roulette.autoRules || []).filter(rule => rule.enabled && Number(rule.minAmount || 0) > 0);
  const explicitRuleId = cleanRouletteId(body.rouletteRuleId || '', '');
  let selected = null;
  // v7: 룰렛은 rouletteRuleId가 명시적으로 같이 전달될 때만 실행합니다.
  // 일반 후원, processType=후원, processType=roulette:* 값만으로는 자동 실행하지 않습니다.
  if (!explicitRuleId) return null;
  selected = rules.find(rule => rule.id === explicitRuleId) || null;
  if (!selected) return null;
  const unit = Math.max(1, Number(selected.minAmount || 0));
  const count = Math.max(0, Math.min(50, Math.floor(total / unit)));
  if (count <= 0) return null;
  return { rule: selected, count, unit };
}

async function maybeStartAutoRoulette(ctx, amount, donor = '', body = {}) {
  const total = Math.max(0, Number(amount || 0));
  if (total <= 0) return null;
  const currentSettings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
  const roulette = normalizeRouletteData(currentSettings.roulette);
  if (!roulette.enabled) return null;
  if (roulette.current?.startedAt && Date.now() < Number(roulette.current.startedAt || 0) + Number(roulette.current.duration || roulette.duration || 3600) + ROULETTE_MIN_RESULT_VISIBLE_MS) return null;
  const matched = resolveRouletteRuleForAmount(roulette, total, body);
  if (!matched) return null;
  try {
    return await createRouletteBatch(ctx, matched.rule.listId, 'auto', matched.count, { donor, amount: total, unitAmount: matched.unit });
  } catch (e) {
    console.warn('[roulette-auto] skipped:', e.message || e);
    return null;
  }
}

async function advanceRouletteQueue(ctx, currentRunId = '') {
  const currentSettings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
  const roulette = normalizeRouletteData(currentSettings.roulette);
  if (!roulette.current || (currentRunId && roulette.current.runId !== currentRunId)) {
    return { roulette, run: null };
  }
  const next = (roulette.queue || []).shift();
  if (!next) {
    // 마지막 회차까지 표시가 끝났으면 current를 반드시 비워서
    // 새로고침/재접속 시 마지막 룰렛이 다시 재생되지 않게 합니다.
    roulette.current = null;
    roulette.queue = [];
    const saved = await saveRouletteForContext(ctx, roulette);
    return { roulette: saved, run: null };
  }
  next.startedAt = Date.now();
  next.running = true;
  roulette.current = next;
  roulette.history = [...(roulette.history || []), makeRouletteHistoryRow(next)].slice(-roulette.historyLimit);
  const saved = await saveRouletteForContext(ctx, roulette);
  return { roulette: saved, run: next };
}

function rouletteRunExpireAt(run, roulette) {
  if (!run || !run.startedAt) return 0;
  const duration = Number(run.duration || roulette.duration || 3600);
  const hold = Math.max(ROULETTE_MIN_RESULT_VISIBLE_MS, Number(roulette.resultHoldMs || 0));
  const total = Math.max(0, Number(run.total || 0));
  const sequence = Math.max(0, Number(run.sequence || 0));
  const finalPageCount = total > 5 && sequence >= total ? Math.ceil(total / 5) : 1;
  return Number(run.startedAt || 0) + duration + (hold * finalPageCount) + 1800;
}

async function cleanupExpiredRoulette(ctx) {
  const currentSettings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
  const roulette = normalizeRouletteData(currentSettings.roulette);
  if (!roulette.current || !roulette.current.startedAt) return roulette;

  // 표시 시간이 충분히 지난 마지막 current는 서버에서 자동 정리합니다.
  // overlay가 꺼져 있거나 새로고침된 경우에도 같은 runId가 반복 재생되지 않습니다.
  if (!(roulette.queue || []).length && Date.now() > rouletteRunExpireAt(roulette.current, roulette)) {
    roulette.current = null;
    roulette.queue = [];
    return await saveRouletteForContext(ctx, roulette);
  }
  return roulette;
}

function normalizeFundingData(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    items: items.map((f, idx) => ({
      id: String(f.id || ('fund_' + Date.now() + '_' + idx)).replace(/[^a-zA-Z0-9_-]/g, '') || ('fund_' + idx),
      title: String(f.title || `펀딩${idx + 1}`).trim(),
      current: Math.max(0, Number(f.current || 0)),
      target: Math.max(0, Number(f.target || 0)),
      enabled: f.enabled !== false
    })).filter(f => f.title).slice(0, 30)
  };
}

function normalizeBroadcastTimerData(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const mode = ['countdown','until','countup'].includes(String(value.mode || '')) ? String(value.mode) : 'countdown';
  return {
    running: value.running === true,
    mode,
    label: String(value.label || '미션타이머'),
    startedAt: value.startedAt ? String(value.startedAt) : '',
    endedAt: value.endedAt ? String(value.endedAt) : '',
    elapsedMs: Math.max(0, Number(value.elapsedMs || 0)),
    durationMs: Math.max(0, Number(value.durationMs || 0)),
    targetAt: value.targetAt ? String(value.targetAt) : ''
  };
}

function normalizeBroadcastLiveData(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const status = ['ready','live','ended'].includes(String(value.status || '')) ? String(value.status) : 'ready';
  return {
    status,
    live: status === 'live' || value.live === true,
    startedAt: value.startedAt ? String(value.startedAt) : '',
    endedAt: value.endedAt ? String(value.endedAt) : ''
  };
}

async function inputAllowedForActiveBroadcast(ctx) {
  const current = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
  const live = normalizeBroadcastLiveData(current.broadcastLiveData);
  return live.live === true && live.status === 'live';
}

function normalizeKaraokeData(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const coinTypes = ['verse', 'full', 'special'];

  const users = Array.isArray(value.users) ? value.users.map(u => {
    const coins = u && typeof u.coins === 'object' ? u.coins : {};
    return {
      nick: normName(u.nick || u.name || ''),
      coins: {
        verse: Math.max(0, Number(coins.verse || 0)),
        full: Math.max(0, Number(coins.full || 0)),
        special: Math.max(0, Number(coins.special || 0))
      }
    };
  }).filter(u => u.nick) : [];

  const songs = Array.isArray(value.songs) ? value.songs.map(s => {
    const type = coinTypes.includes(String(s.type || '')) ? String(s.type) : 'verse';
    const status = ['진행','대기','보류','완료'].includes(String(s.status || '')) ? String(s.status) : '대기';
    return {
      id: String(s.id || ('song_' + Date.now() + '_' + Math.random().toString(36).slice(2))),
      nick: normName(s.nick || ''),
      title: String(s.title || '').trim(),
      type,
      status,
      holdPromoted: s.holdPromoted === true
    };
  }).filter(s => s.nick && s.title) : [];

  return {
    title: String(value.title || '노래방 공지 알림판'),
    notice: String(value.notice || value.ticker || '노래문의필수'),
    users,
    songs
  };
}

function normalizeOverlaySections(raw, base) {
  const fallback = base || {
    account: true,
    notice: false,
    creators: true,
    creatorDonations: true,
    karaoke: false,
    funding: false,
    broadcastTimer: false,
    media: true
  };
  const value = raw && typeof raw === 'object' ? raw : fallback;
  return {
    account: value.account !== false,
    notice: value.notice === true,
    creators: value.creators !== false,
    creatorDonations: value.creatorDonations !== false,
    karaoke: value.karaoke === true,
    funding: value.funding === true,
    broadcastTimer: value.broadcastTimer === true,
    media: value.media !== false
  };
}


function normalizeStationStyle(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const pick = (key, fallback) => {
    const v = value[key];
    if (v === undefined || v === null || String(v).trim() === '') return fallback;
    return String(v).trim();
  };
  const num = (key, fallback, min = 0, max = 999999999) => {
    const n = Number(value[key]);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  return {
    topSlideEnabled: value.topSlideEnabled !== false && String(value.topSlideEnabled || 'true') !== 'false',
    boxBorderColor: pick('boxBorderColor', 'rgba(255,138,185,.95)'),
    boxBgTop: pick('boxBgTop', 'rgba(18,22,32,.88)'),
    boxBgBottom: pick('boxBgBottom', 'rgba(10,12,20,.82)'),

    accountTitleColor: pick('accountTitleColor', '#ffe680'),
    noticeTitleColor: pick('noticeTitleColor', '#8ee7ff'),
    fundingTitleColor: pick('fundingTitleColor', '#b8ff9d'),
    karaokeTitleColor: pick('karaokeTitleColor', '#ff9bd6'),
    timerTitleColor: pick('timerTitleColor', '#ffe680'),

    contentColor: pick('contentColor', '#ffffff'),
    noticeContentColor: pick('noticeContentColor', '#ffffff'),
    fundingContentColor: pick('fundingContentColor', '#f8fafc'),
    karaokeContentColor: pick('karaokeContentColor', '#ffffff'),
    karaokeNoticeColor: pick('karaokeNoticeColor', '#fde68a'),
    karaokeCurrentColor: pick('karaokeCurrentColor', '#e0f2fe'),
    karaokeQueueColor: pick('karaokeQueueColor', '#ffffff'),
    karaokeCoinColor: pick('karaokeCoinColor', '#ffffff'),
    karaokeDonorColor: pick('karaokeDonorColor', '#39ff88'),
    karaokeHeartColor: pick('karaokeHeartColor', '#ff4fa3'),

    accountTitleSize: num('accountTitleSize', 20, 10, 80),
    noticeTitleSize: num('noticeTitleSize', 20, 10, 80),
    fundingTitleSize: num('fundingTitleSize', 20, 10, 80),
    karaokeTitleSize: num('karaokeTitleSize', 20, 10, 80),
    contentFontSize: num('contentFontSize', 20, 10, 80),
    creatorContentSize: num('creatorContentSize', 24, 10, 80),
    accountRollFontSize: num('accountRollFontSize', 25, 10, 80),
    alertFontSize: num('alertFontSize', 30, 10, 90),

    fundingBarColor: pick('fundingBarColor', 'repeating-linear-gradient(135deg, rgba(255,182,213,.9) 0px, rgba(255,182,213,.9) 10px, rgba(255,79,163,.86) 10px, rgba(255,79,163,.86) 20px)'),

    // 오버레이 레이아웃 / 단일 패널 / 상단 이미지 슬라이드
    boxGroupMode: ['single','separate'].includes(String(value.boxGroupMode || '').trim()) ? String(value.boxGroupMode).trim() : 'separate',
    overlayWidth: num('overlayWidth', 285, 180, 900),
    overlayTop: num('overlayTop', 54, 0, 2000),
    overlayRight: num('overlayRight', 14, 0, 2000),
    overlayGap: num('overlayGap', 8, 0, 80),
    boxRadius: num('boxRadius', 18, 0, 80),
    topSlideImages: Array.isArray(value.topSlideImages)
      ? value.topSlideImages.map(v => String(v || '').trim()).filter(Boolean).slice(0, 30)
      : String(value.topSlideImages || '').split(/\r?\n|,/).map(v => v.trim()).filter(Boolean).slice(0, 30),
    topSlideHeight: num('topSlideHeight', 105, 0, 420),
    topSlideInterval: num('topSlideInterval', 3500, 800, 20000),
    topSlideOpacity: num('topSlideOpacity', 1, 0, 1),

    // 노래방 세부 폰트 크기
    karaokeNoticeSize: num('karaokeNoticeSize', 17, 10, 80),
    karaokeCurrentSize: num('karaokeCurrentSize', 18, 10, 80),
    karaokeQueueSize: num('karaokeQueueSize', 15, 10, 80),
    karaokeCoinSize: num('karaokeCoinSize', 15, 10, 80),

    vipAccountThreshold: num('vipAccountThreshold', 500000, 0, 999999999),
    vipAccountBg1: pick('vipAccountBg1', 'rgba(255,79,216,.22)'),
    vipAccountBg2: pick('vipAccountBg2', 'rgba(0,234,255,.18)')
  };
}


function normalizeSettings(settings) {
  const base = defaultSettings();
  const raw = settings && typeof settings === 'object' ? settings : {};

  let presets = Array.isArray(raw.presets) && raw.presets.length
    ? raw.presets
    : [
        { ...base.presets[0], plusPrice: raw.prices?.smoke ?? base.presets[0].plusPrice, minusPrice: raw.prices?.nosmoke ?? base.presets[0].minusPrice },
        { ...base.presets[1], plusPrice: raw.prices?.eat ?? base.presets[1].plusPrice, minusPrice: raw.prices?.noeat ?? base.presets[1].minusPrice }
      ];

  presets = presets.map((p, idx) => normalizePreset(p || {}, idx));
  if (!presets.find(p => p.id === 'smoke')) presets.unshift(base.presets[0]);
  if (!presets.find(p => p.id === 'food')) presets.push(base.presets[1]);

  const smoke = presets.find(p => p.id === 'smoke') || base.presets[0];
  const food = presets.find(p => p.id === 'food') || base.presets[1];

  return {
    ...base,
    ...raw,
    title: String(raw.title ?? base.title),
    titleImage: String(raw.titleImage ?? base.titleImage),
    noticeTitle: String(raw.noticeTitle ?? base.noticeTitle ?? '공지'),
    notice: String(raw.notice ?? base.notice),
    noticeColors: Array.isArray(raw.noticeColors) ? raw.noticeColors.slice(0, 5) : base.noticeColors,
    viewerPassword: String(raw.viewerPassword ?? base.viewerPassword ?? ''),
    viewerToken: String(raw.viewerToken ?? base.viewerToken ?? ''),
    overlaySections: normalizeOverlaySections(raw.overlaySections, base.overlaySections),
    soundRules: normalizeSoundRules(raw.soundRules, base.soundRules),
    roulette: normalizeRouletteData(raw.roulette || base.roulette),
    karaokeData: normalizeKaraokeData(raw.karaokeData || base.karaokeData),
    fundingData: normalizeFundingData(raw.fundingData || base.fundingData),
    stationStyle: normalizeStationStyle(raw.stationStyle || base.stationStyle),
    broadcastTimerData: normalizeBroadcastTimerData(raw.broadcastTimerData || base.broadcastTimerData),
    broadcastLiveData: normalizeBroadcastLiveData(raw.broadcastLiveData || base.broadcastLiveData),
    columns: Math.max(1, Math.min(6, Number(raw.columns || base.columns))),
    maxCreators: Math.max(1, Math.min(50, Number(raw.maxCreators || base.maxCreators))),
    creators: Array.isArray(raw.creators) ? raw.creators.map(normName).filter(Boolean) : base.creators,
    presets,
    prices: {
      smoke: smoke.plusPrice,
      nosmoke: smoke.minusPrice,
      eat: food.plusPrice,
      noeat: food.minusPrice
    },
    stationSettings: raw.stationSettings && typeof raw.stationSettings === 'object' ? raw.stationSettings : {}
  };
}

const SETTING_FIELDS = [
  'viewerPassword', 'viewerToken', 'overlaySections',
  'columns', 'maxCreators', 'creators', 'presets', 'prices', 'soundRules', 'roulette',
  'broadcastTimerData', 'broadcastLiveData'
];

function pickScopedSettings(settings) {
  const src = normalizeSettings(settings || {});
  const picked = {};
  for (const key of SETTING_FIELDS) {
    if (src[key] !== undefined) picked[key] = src[key];
  }
  return JSON.parse(JSON.stringify(picked));
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try { out[key] = decodeURIComponent(val); } catch { out[key] = val; }
  });
  return out;
}

function setCookie(res, name, value, maxAgeSeconds = 60 * 60 * 12) {
  const safe = encodeURIComponent(String(value || ''));
  res.setHeader('Set-Cookie', `${name}=${safe}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function isMasterRequest(req) {
  const cookies = parseCookies(req);
  const pw = req.headers['x-admin-password'] || req.body?.password || req.query?.password || cookies.admin_password;
  return pw === ADMIN_PASSWORD;
}

function getStationSlug(req) {
  return safeSlug(req.query.station || req.body?.station || parseCookies(req).station_slug || 'default');
}

function requireDb(res) {
  if (!supabase) {
    res.status(500).json({ error: 'Supabase 환경변수가 설정되지 않았습니다.' });
    return false;
  }
  return true;
}

async function readGlobalSettings() {
  const { data, error } = await supabase.from('settings').select('data').eq('id', 1).maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;

  if (!data || !data.data || typeof data.data !== 'object') {
    const settings = defaultSettings();
    await writeGlobalSettings(settings);
    return settings;
  }

  return normalizeSettings(data.data);
}

async function writeGlobalSettings(settings) {
  const normalized = normalizeSettings(settings);
  const { error } = await supabase
    .from('settings')
    .upsert({ id: 1, data: normalized, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
  return normalized;
}

async function ensureDefaultStation() {
  let { data, error } = await supabase.from('stations').select('*').eq('slug', 'default').maybeSingle();
  if (error) throw error;
  if (data) return data;

  const inserted = await supabase
    .from('stations')
    .insert({
      name: '기본방송국',
      slug: 'default',
      station_admin_password: '',
      overlay_token: randomToken()
    })
    .select()
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function getStation(reqOrSlug) {
  const slug = typeof reqOrSlug === 'string' ? safeSlug(reqOrSlug) : getStationSlug(reqOrSlug);
  let { data, error } = await supabase.from('stations').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (data) return data;
  if (slug === 'default') return await ensureDefaultStation();
  return null;
}

function stationToClient(row, includeSecret = false) {
  const out = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    overlayToken: row.overlay_token || '',
    createdAt: row.created_at,
    hasAdminPassword: !!row.station_admin_password
  };
  if (includeSecret) {
    out.stationAdminPassword = String(row.station_admin_password || '');
  }
  return out;
}

async function listStations(includeSecret = false) {
  await ensureDefaultStation();
  const { data, error } = await supabase
    .from('stations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => stationToClient(row, includeSecret));
}

async function stationAllowed(req, station) {
  if (isMasterRequest(req)) return true;
  if (!station) return false;
  const cookies = parseCookies(req);
  const slug = station.slug;
  const cookieSlug = cookies.station_slug;
  const cookiePw = cookies.station_admin_password;
  const given = req.headers['x-station-password'] || req.body?.stationPassword || req.query?.stationPassword;
  const pw = String(station.station_admin_password || '');

  if (!pw) return true;
  if (cookieSlug === slug && cookiePw === pw) return true;
  if (given && String(given) === pw) return true;
  return false;
}


async function stationTokenAllowed(req, station) {
  const stationToken = String(station?.overlay_token || '');
  if (!stationToken) return false;

  const token = String(req.query.token || req.headers['x-station-token'] || '');
  return !!token && token === stationToken;
}

async function overlayAllowed(req, station) {
  return await stationTokenAllowed(req, station);
}

async function ensureActiveBroadcast(stationId) {
  // 활성 방송이 없을 때마다 새 방송이 자동 생성되면 station_control 목록에
  // 같은 날짜 방송이 중복으로 생깁니다. 기존 방송이 있으면 최신 방송을
  // 현재 방송으로 복구하고, 방송이 하나도 없을 때만 최초 방송을 생성합니다.
  let { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('station_id', stationId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const latest = await supabase
    .from('broadcasts')
    .select('*')
    .eq('station_id', stationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) throw latest.error;
  if (latest.data) {
    const restored = await supabase
      .from('broadcasts')
      .update({ is_active: true })
      .eq('station_id', stationId)
      .eq('id', latest.data.id)
      .select()
      .single();
    if (restored.error) throw restored.error;
    return restored.data;
  }

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const title = `${mm}${dd}방송`;

  const inserted = await supabase
    .from('broadcasts')
    .insert({ station_id: stationId, title, is_active: true, broadcast_password: '' })
    .select()
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

function broadcastToClient(row) {
  return {
    id: row.id,
    stationId: row.station_id,
    title: row.title,
    isActive: row.is_active,
    hasPassword: !!row.broadcast_password,
    createdAt: row.created_at,
    endedAt: row.ended_at || null,
    memo: row.memo || ''
  };
}

async function listBroadcasts(stationId) {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('station_id', stationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(broadcastToClient);
}


async function getStationBroadcastOrNull(stationId, broadcastId) {
  if (!broadcastId) return null;
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('station_id', stationId)
    .eq('id', broadcastId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function setActiveBroadcast(stationId, id) {
  const active = await supabase
    .from('broadcasts')
    .update({ is_active: false })
    .eq('station_id', stationId)
    .eq('is_active', true);
  if (active.error) throw active.error;

  const { data, error } = await supabase
    .from('broadcasts')
    .update({ is_active: true, ended_at: null })
    .eq('station_id', stationId)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function broadcastPasswordAllowed(req, broadcast) {
  if (!broadcast) return false;
  if (!String(broadcast.broadcast_password || '')) return true;

  const cookies = parseCookies(req);
  const cookiePw = cookies[`broadcast_pw_${broadcast.id}`];
  const given =
    req.headers['x-broadcast-password'] ||
    req.body?.broadcastPassword ||
    req.body?.password ||
    req.query?.broadcastPassword ||
    req.query?.password;

  if (cookiePw && cookiePw === String(broadcast.broadcast_password || '')) return true;
  if (given && String(given) === String(broadcast.broadcast_password || '')) return true;
  return false;
}

async function operatorAllowed(req, station, broadcast) {
  if (await stationAllowed(req, station)) return true;
  return await broadcastPasswordAllowed(req, broadcast);
}


const STATION_SHARED_SETTING_FIELDS = [
  // 방송국별로 유지하면서, 같은 방송국의 새 방송에는 이어질 항목
  'title', 'titleImage', 'noticeTitle', 'notice', 'noticeColors',
  'karaokeData', 'fundingData', 'stationStyle', 'presets', 'roulette'
];

function pickStationSharedSettings(settings) {
  const src = normalizeSettings(settings || {});
  const picked = {};
  for (const key of STATION_SHARED_SETTING_FIELDS) {
    if (src[key] !== undefined) picked[key] = src[key];
  }
  return JSON.parse(JSON.stringify(picked));
}

async function saveSharedStationSettings(stationSlug, updates) {
  const global = await readGlobalSettings();
  const stationSettings = { ...(global.stationSettings || {}) };
  const stationBucket = { ...(stationSettings[stationSlug] || {}) };
  const currentShared = stationBucket._shared && typeof stationBucket._shared === 'object' ? stationBucket._shared : {};
  const nextShared = { ...currentShared };

  for (const key of STATION_SHARED_SETTING_FIELDS) {
    if (updates[key] !== undefined) nextShared[key] = updates[key];
  }

  stationBucket._shared = pickStationSharedSettings({ ...currentShared, ...nextShared });
  stationSettings[stationSlug] = stationBucket;

  return await writeGlobalSettings({
    ...global,
    stationSettings
  });
}

async function readEffectiveSettings(stationSlug, broadcastId) {
  const global = await readGlobalSettings();
  const stationMap = global.stationSettings && typeof global.stationSettings === 'object' ? global.stationSettings : {};
  const stationSettings = stationMap[stationSlug] && typeof stationMap[stationSlug] === 'object' ? stationMap[stationSlug] : {};
  const stationShared = stationSettings._shared && typeof stationSettings._shared === 'object' ? stationSettings._shared : {};
  const scoped = broadcastId && stationSettings[broadcastId] && typeof stationSettings[broadcastId] === 'object'
    ? stationSettings[broadcastId]
    : {};

  return normalizeSettings({
    ...global,
    ...stationShared,
    ...scoped,

    // 공지/펀딩/노래방/스타일은 전체 공통이 아니라 방송국별 공통
    title: stationShared.title ?? global.title,
    titleImage: stationShared.titleImage ?? global.titleImage,
    noticeTitle: stationShared.noticeTitle ?? global.noticeTitle,
    notice: stationShared.notice ?? global.notice,
    noticeColors: stationShared.noticeColors ?? global.noticeColors,
    karaokeData: stationShared.karaokeData ?? global.karaokeData,
    fundingData: stationShared.fundingData ?? global.fundingData,
    stationStyle: stationShared.stationStyle ?? global.stationStyle,

    stationSettings: global.stationSettings || {}
  });
}

async function saveEffectiveSettings(stationSlug, broadcastId, updates) {
  const global = await readGlobalSettings();
  const stationSettings = { ...(global.stationSettings || {}) };
  const stationBucket = { ...(stationSettings[stationSlug] || {}) };
  const current = await readEffectiveSettings(stationSlug, broadcastId);
  const effective = normalizeSettings({ ...current, ...(updates || {}) });

  stationBucket[broadcastId] = pickScopedSettings(effective);
  stationSettings[stationSlug] = stationBucket;

  return await writeGlobalSettings({
    ...global,
    stationSettings
  });
}

async function copySettingsToBroadcast(stationSlug, broadcastId) {
  const current = await readEffectiveSettings(stationSlug, null);
  await saveEffectiveSettings(stationSlug, broadcastId, current);
}

async function removeBroadcastSettings(stationSlug, broadcastId) {
  const global = await readGlobalSettings();
  const stationSettings = { ...(global.stationSettings || {}) };
  const stationBucket = { ...(stationSettings[stationSlug] || {}) };
  delete stationBucket[broadcastId];
  stationSettings[stationSlug] = stationBucket;
  await writeGlobalSettings({ ...global, stationSettings });
}

function htmlRedirect(res, url) {
  res.redirect(302, url);
}

function isHtmlPage(pathname) {
  return pathname === '/' || pathname.endsWith('.html');
}

const PUBLIC_HTML = new Set([
  '/admin_login.html',
  '/station_login.html',
  '/viewer_login.html'
]);

const MASTER_HTML = new Set([
  '/master.html'
]);

const STATION_HTML = new Set([
  '/admin.html',
  '/control.html',
  '/station_control.html',
  '/m_admin.html',
  '/m_control.html',
  '/station_style.html',
  '/media_manager.html',
  '/m_media_manager.html',
  '/roulette.html',
  '/m_roulette.html'
]);

const VIEWER_HTML = new Set([
  '/overlay.html',
  '/overlay2.html',
  '/summary.html',
  '/creator_detail.html',
  '/donor_detail.html',
  '/donations.html',
  '/debug_overlay.html',
  '/debug_settings.html'
]);

async function viewerAllowed(req, station, broadcast) {
  if (await operatorAllowed(req, station, broadcast)) return true;
  const settings = await readEffectiveSettings(station.slug, broadcast.id);
  const viewerPassword = String(settings.viewerPassword || '');
  const viewerToken = String(settings.viewerToken || '');

  if (!viewerPassword && !viewerToken) return true;

  const cookies = parseCookies(req);
  const givenToken = String(req.query?.viewerToken || req.headers['x-viewer-token'] || cookies.viewer_token || '');
  const givenPassword = String(req.query?.viewerPassword || req.query?.viewPassword || req.headers['x-viewer-password'] || cookies.viewer_password || '');

  if (viewerToken && givenToken && givenToken === viewerToken) return true;
  if (viewerPassword && givenPassword && givenPassword === viewerPassword) return true;
  return false;
}

async function accessGuard(req, res, next) {
  try {
    const pathOnly = req.path || '/';

    if (pathOnly.startsWith('/sounds/') || pathOnly === '/favicon.ico' || pathOnly === '/app.css' || pathOnly === '/common.js') {
      return next();
    }

    if (PUBLIC_HTML.has(pathOnly)) return next();

    if (isHtmlPage(pathOnly)) {
      if (pathOnly === '/') return htmlRedirect(res, '/station_login.html');

      if (MASTER_HTML.has(pathOnly)) {
        if (isMasterRequest(req)) return next();
        return htmlRedirect(res, `/admin_login.html?next=${encodeURIComponent(req.originalUrl || pathOnly)}`);
      }

      const station = await getStation(req);
      if (!station) return htmlRedirect(res, `/station_login.html?station=${encodeURIComponent(getStationSlug(req))}`);

      const active = await ensureActiveBroadcast(station.id);

      // overlay는 관리자 로그인 여부와 상관없이 방송국 토큰이 있어야만 접근 허용
      if (pathOnly === '/overlay.html' || pathOnly === '/overlay2.html') {
        if (await stationTokenAllowed(req, station)) return next();
        return res.status(403).send('오버레이 토큰이 필요합니다.');
      }

      if (STATION_HTML.has(pathOnly)) {
        if (await operatorAllowed(req, station, active)) return next();
        return htmlRedirect(res, `/station_login.html?station=${encodeURIComponent(station.slug)}&next=${encodeURIComponent(req.originalUrl || pathOnly)}`);
      }

      if (VIEWER_HTML.has(pathOnly)) {
        if (await viewerAllowed(req, station, active)) return next();
        return htmlRedirect(res, `/viewer_login.html?station=${encodeURIComponent(station.slug)}&next=${encodeURIComponent(req.originalUrl || pathOnly)}`);
      }
    }

    if (req.method === 'GET' && ['/api/settings', '/api/summary', '/api/donations', '/api/sound-events'].includes(pathOnly)) {
      const station = await getStation(req);
      if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
      const active = await ensureActiveBroadcast(station.id);

      // overlay.html은 방송국 token으로 내부 API를 조회해야 화면 데이터가 표시됩니다.
      if (typeof stationTokenAllowed === 'function' && await stationTokenAllowed(req, station)) return next();

      if (await viewerAllowed(req, station, active)) return next();
      return res.status(403).json({ error: '시청 권한이 없습니다.' });
    }

    return next();
  } catch (e) {
    return res.status(500).send('접근 확인 중 오류: ' + (e.message || e));
  }
}

function checkMaster(req, res, next) {
  if (!isMasterRequest(req)) return res.status(401).json({ error: '최고관리자 비밀번호가 틀렸습니다.' });
  next();
}

async function getStationContext(req, res) {
  const station = await getStation(req);
  if (!station) {
    res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    return null;
  }
  const active = await ensureActiveBroadcast(station.id);
  return { station, active };
}

function findPreset(settings, processType) {
  const value = normName(processType);
  if (!value || value === '후원') return null;
  const presets = settings.presets || defaultPresets();
  return presets.find(p => p.enabled && (p.id === value || p.title === value || p.plusName === value || p.minusName === value)) || null;
}

function calcCheck(processType, amount, settings) {
  const result = { smoke: 0, nosmoke: 0, eat: 0, noeat: 0, checks: [], label: '후원' };
  const preset = findPreset(settings, processType);
  if (!preset) return result;

  const value = normName(processType);
  let fixedValue = value;

if (fixedValue.includes('흡연')) fixedValue = '흡연';
if (fixedValue.includes('금연')) fixedValue = '금연';
if (fixedValue.includes('먹지마')) fixedValue = '먹지마';
else if (fixedValue.includes('먹어')) fixedValue = '먹어';
  const plusPrice = Number(preset.plusPrice || 0);
  const minusPrice = Number(preset.minusPrice || 0);
  let side = null;
  let price = 0;

  // 선택한 프리셋명/옵션명으로 + / - 를 명확히 결정합니다.
  // 예: 50,000원 + 흡연(11,900원) => +4, 잔액은 후원금 원본에 그대로 남김.
  if (fixedValue === preset.minusName || fixedValue === `${preset.title}:${preset.minusName}` || fixedValue === `${preset.id}:minus`) {
    side = 'minus';
    price = minusPrice;
  } else if (fixedValue === preset.plusName || fixedValue === `${preset.title}:${preset.plusName}` || fixedValue === `${preset.id}:plus` || fixedValue === preset.title || fixedValue === preset.id) {
    side = 'plus';
    price = plusPrice;
  } else if (amount > 0 && minusPrice > 0 && amount % minusPrice === 0) {
    side = 'minus';
    price = minusPrice;
  } else if (amount > 0 && plusPrice > 0 && amount % plusPrice === 0) {
    side = 'plus';
    price = plusPrice;
  }

  const count = side && price > 0 ? Math.floor(amount / price) : 0;
  if (!side || count <= 0) {
    result.label = `${preset.title} 확인`;
    return result;
  }

  const check = {
    presetId: preset.id,
    presetTitle: preset.title,
    side,
    name: side === 'plus' ? preset.plusName : preset.minusName,
    price,
    count,
    usedAmount: count * price,
    remainAmount: Math.max(0, amount - count * price)
  };

  result.checks.push(check);
  result.label = `${check.name}${side === 'minus' ? '-' : '+'}${count}`;

  if (preset.id === 'smoke') {
    if (side === 'plus') result.smoke = count;
    else result.nosmoke = count;
  } else if (preset.id === 'food') {
    if (side === 'plus') result.eat = count;
    else result.noeat = count;
  }
  return result;
}

function getRouletteProcessTitle(settings, rouletteRuleId) {
  const id = cleanRouletteId(rouletteRuleId || '', '');
  if (!id) return '';
  const roulette = normalizeRouletteData(settings?.roulette || {});
  const rule = (roulette.autoRules || []).find(r => r.id === id);
  if (!rule) return '';
  const list = (roulette.lists || []).find(l => l.id === rule.listId);
  return normName(list?.title || rule.title || '룰렛');
}

function resolveDonationProcessType(body, settings) {
  const rouletteRuleId = cleanRouletteId(body?.rouletteRuleId || '', '');
  if (rouletteRuleId) {
    const title = getRouletteProcessTitle(settings, rouletteRuleId) || '룰렛';
    return `룰렛+${title}`;
  }
  const raw = normName(body?.processType) || '후원';
  // 룰렛은 rouletteRuleId가 같이 전달될 때만 인정합니다.
  // processType 값만 roulette:* 형태로 들어온 경우 일반 후원으로 저장/처리합니다.
  if (String(raw).startsWith('roulette:')) return '후원';
  return raw;
}

function makeDonationRow(body, settings, stationId, broadcastId) {
  const donor = normName(body.donor);
  const creator = normName(body.creator);
  const processType = resolveDonationProcessType(body, settings);
  const accountAmount = toWon(body.accountAmount);
  const toonieAmount = toWon(body.toonieAmount);
  const total = accountAmount + toonieAmount;

  if (!donor) throw new Error('도네이터명을 입력하세요.');
  if (!creator) throw new Error('크리에이터를 선택하세요.');
  if (total <= 0) throw new Error(`${creator}: 금액을 입력하세요.`);

  const check = calcCheck(processType, total, settings);
  const silentAlert = body.silentAlert === true || body.noAlert === true || String(body.alert || '').toLowerCase() === 'false';
  const manualKind = normName(body.manualKind || body.entryKind || '');
  if (silentAlert || manualKind) {
    check.checks = Array.isArray(check.checks) ? check.checks : [];
    check.checks.push({
      meta: true,
      silentAlert,
      manualKind,
      sourceType: normName(body.sourceType || body.source || ''),
      fundingId: String(body.fundingId || '').trim(),
      editedAt: body.editedAt || ''
    });
  }

  return {
    station_id: stationId,
    broadcast_id: broadcastId,
    donor,
    creator,
    process_type: processType,
    account_amount: accountAmount,
    toonie_amount: toonieAmount,
    total_amount: total,
    display_amount: displayManText(total),
    smoke: check.smoke,
    nosmoke: check.nosmoke,
    eat: check.eat,
    noeat: check.noeat,
    checks: check.checks,
    result_label: check.label,
    memo: (silentAlert ? '[무알림] ' : '') + String(body.memo || '').trim()
  };
}

function dbRowToDonation(row) {
  const checks = Array.isArray(row.checks) ? row.checks : [];
  const meta = checks.find(c => c && c.meta === true) || {};
  const memoText = String(row.memo || '');
  const silentAlert = meta.silentAlert === true || memoText.includes('[무알림]');
  return {
    id: row.id,
    stationId: row.station_id,
    broadcastId: row.broadcast_id,
    createdAt: row.created_at,
    donor: row.donor,
    creator: row.creator,
    processType: row.process_type,
    accountAmount: row.account_amount || 0,
    toonieAmount: row.toonie_amount || 0,
    totalAmount: row.total_amount || 0,
    displayAmount: row.display_amount || displayManText(row.total_amount || 0),
    smoke: row.smoke || 0,
    nosmoke: row.nosmoke || 0,
    eat: row.eat || 0,
    noeat: row.noeat || 0,
    checks,
    resultLabel: row.result_label || '후원',
    memo: row.memo || '',
    silentAlert,
    manualKind: meta.manualKind || '',
    sourceType: meta.sourceType || '',
    fundingId: meta.fundingId || ''
  };
}

async function readDonations(stationId, broadcastId) {
  let q = supabase.from('donations').select('*').eq('station_id', stationId).order('created_at', { ascending: true });
  if (broadcastId) q = q.eq('broadcast_id', broadcastId);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(dbRowToDonation);
}

function emptyCreator(name) {
  return { creator: name, account: 0, toonie: 0, total: 0, smoke: 0, nosmoke: 0, eat: 0, noeat: 0, presetNets: {}, rows: [] };
}
function emptyDonor(name) {
  return { donor: name, account: 0, toonie: 0, total: 0, latestProcess: '후원', rows: [] };
}

function addPresetCheck(target, d) {
  const checks = Array.isArray(d.checks) ? d.checks : [];
  for (const ch of checks) {
    const key = ch.presetId || ch.presetTitle;
    if (!key) continue;
    if (!target.presetNets[key]) {
      target.presetNets[key] = { presetId: ch.presetId, presetTitle: ch.presetTitle, plusName: '', minusName: '', plus: 0, minus: 0, net: 0 };
    }
    if (ch.side === 'plus') {
      target.presetNets[key].plusName = ch.name;
      target.presetNets[key].plus += Number(ch.count || 0);
    } else {
      target.presetNets[key].minusName = ch.name;
      target.presetNets[key].minus += Number(ch.count || 0);
    }
    target.presetNets[key].net = target.presetNets[key].plus - target.presetNets[key].minus;
  }
}

function buildSummary(settings, donations, broadcast, station) {
  const creators = new Map();
  const donors = new Map();
  const accountDonors = [];

  for (const name of settings.creators || []) {
    const key = normName(name);
    if (key) creators.set(key, emptyCreator(key));
  }

  for (const d of donations || []) {
    const creator = normName(d.creator);
    const donor = normName(d.donor);
    if (!creator || !donor) continue;

    if (!creators.has(creator)) creators.set(creator, emptyCreator(creator));
    if (!donors.has(donor)) donors.set(donor, emptyDonor(donor));

    const c = creators.get(creator);
    const dn = donors.get(donor);
    const account = Number(d.accountAmount || 0);
    const toonie = Number(d.toonieAmount || 0);
    const total = account + toonie;
    const row = { ...d, accountAmount: account, toonieAmount: toonie, totalAmount: total, displayAmount: displayManText(total) };

    c.account += account;
    c.toonie += toonie;
    c.total += total;
    c.smoke += Number(d.smoke || 0);
    c.nosmoke += Number(d.nosmoke || 0);
    c.eat += Number(d.eat || 0);
    c.noeat += Number(d.noeat || 0);
    addPresetCheck(c, d);
    c.rows.push(row);

    dn.account += account;
    dn.toonie += toonie;
    dn.total += total;
    dn.latestProcess = d.processType || '후원';
    dn.rows.push(row);

    if (account > 0) {
      accountDonors.push({ id: d.id, createdAt: d.createdAt, donor, creator, amount: account, amountText: displayManText(account) });
    }
  }

  const creatorRows = Array.from(creators.values()).map(row => {
    const donorMap = new Map();
    for (const r of row.rows) {
      const donor = normName(r.donor);
      if (!donorMap.has(donor)) donorMap.set(donor, emptyDonor(donor));
      const dn = donorMap.get(donor);
      dn.account += Number(r.accountAmount || 0);
      dn.toonie += Number(r.toonieAmount || 0);
      dn.total += Number(r.totalAmount || 0);
      dn.latestProcess = r.processType || '후원';
      dn.rows.push(r);
    }
    const donorSummary = Array.from(donorMap.values()).map(dn => ({
      ...dn,
      accountText: displayManText(dn.account),
      toonieText: displayManText(dn.toonie),
      totalText: displayManText(dn.total)
    })).sort((a, b) => b.total - a.total);

    return {
      ...row,
      accountText: displayManText(row.account),
      toonieText: displayManText(row.toonie),
      totalText: displayManText(row.total),
      eatNet: row.eat - row.noeat,
      smokeNet: row.smoke - row.nosmoke,
      presetNets: Object.values(row.presetNets || {}),
      donorSummary
    };
  }).sort((a, b) => b.total - a.total);

  const donorRows = Array.from(donors.values()).map(row => ({
    ...row,
    accountText: displayManText(row.account),
    toonieText: displayManText(row.toonie),
    totalText: displayManText(row.total)
  })).sort((a, b) => b.total - a.total);

  accountDonors.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const accountDonorMap = new Map();
  for (const item of accountDonors) {
    const key = normName(item.donor) || '익명';
    if (!accountDonorMap.has(key)) {
      accountDonorMap.set(key, { donor: key, amount: 0, amountText: '0', latestAt: item.createdAt });
    }
    const row = accountDonorMap.get(key);
    row.amount += Number(item.amount || 0);
    row.amountText = displayManText(row.amount);
    if (new Date(item.createdAt) > new Date(row.latestAt)) row.latestAt = item.createdAt;
  }

  const accountDonorSummary = Array.from(accountDonorMap.values())
    .sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt))
    .slice(0, 10);

  return {
    settings,
    station: station ? stationToClient(station) : null,
    broadcast: broadcast ? broadcastToClient(broadcast) : null,
    creators: creatorRows,
    donors: donorRows,
    accountDonors: accountDonorSummary,
    accountDonorDetails: accountDonors,
    donations
  };
}

/* 로그인 */
app.post('/api/admin-login', (req, res) => {
  const pw = String(req.body?.password || '');
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: '최고관리자 비밀번호가 틀렸습니다.' });
  setCookie(res, 'admin_password', pw, 60 * 60 * 24);
  res.json({ ok: true });
});

app.post('/api/station-login', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const slug = safeSlug(req.body?.station || req.query.station || '');
    const station = await getStation(slug);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });

    const pw = String(req.body?.password || '');
    if (String(station.station_admin_password || '') && pw !== String(station.station_admin_password || '')) {
      return res.status(401).json({ error: '방송국 관리자 비밀번호가 틀렸습니다.' });
    }

    setCookie(res, 'station_slug', station.slug, 60 * 60 * 24);
    setCookie(res, 'station_admin_password', pw, 60 * 60 * 24);
    res.json({ ok: true, station: stationToClient(station) });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송국 로그인 실패' });
  }
});

app.post('/api/broadcast-login', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;

    const broadcastId = req.body?.broadcastId || req.query.broadcastId || ctx.active.id;
    const { data: broadcast, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('station_id', ctx.station.id)
      .eq('id', broadcastId)
      .single();

    if (error) throw error;
    const pw = String(req.body?.password || '');
    if (String(broadcast.broadcast_password || '') && pw !== String(broadcast.broadcast_password || '')) {
      return res.status(401).json({ error: '방송 비밀번호가 틀렸습니다.' });
    }

    setCookie(res, `broadcast_pw_${broadcast.id}`, pw, 60 * 60 * 24);
    res.json({ ok: true, broadcast: broadcastToClient(broadcast) });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송 로그인 실패' });
  }
});

app.post('/api/logout', (req, res) => {
  clearCookie(res, 'admin_password');
  clearCookie(res, 'station_slug');
  clearCookie(res, 'station_admin_password');
  clearCookie(res, 'viewer_token');
  clearCookie(res, 'viewer_password');
  res.json({ ok: true });
});

/* 기본 API */
app.get('/api/health', (req, res) => res.json({ ok: true, storage: 'supabase', multistation: true, supabaseConfigured: !!supabase }));

/* 최고관리자 방송국 API */
app.get('/api/stations', checkMaster, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const stations = await listStations(true);
    res.json({ stations });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송국 목록 조회 실패' });
  }
});

app.post('/api/stations', checkMaster, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const name = normName(req.body.name);
    const slug = safeSlug(req.body.slug || name);
    if (!name) return res.status(400).json({ error: '방송국명을 입력하세요.' });

    const payload = {
      name,
      slug,
      station_admin_password: String(req.body.stationAdminPassword || ''),
      overlay_token: String(req.body.overlayToken || randomToken())
    };

    const { data, error } = await supabase.from('stations').insert(payload).select().single();
    if (error) throw error;

    const active = await ensureActiveBroadcast(data.id);
    await copySettingsToBroadcast(data.slug, active.id);

    res.json({ ok: true, station: stationToClient(data), active: broadcastToClient(active) });
  } catch (e) {
    res.status(400).json({ error: e.message || '방송국 생성 실패' });
  }
});

app.put('/api/stations/:id', checkMaster, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const payload = {};
    if (req.body.name !== undefined) payload.name = normName(req.body.name);
    if (req.body.stationAdminPassword !== undefined) payload.station_admin_password = String(req.body.stationAdminPassword || '');
    if (req.body.overlayToken !== undefined) payload.overlay_token = String(req.body.overlayToken || randomToken());

    const { data, error } = await supabase
      .from('stations')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, station: stationToClient(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '방송국 수정 실패' });
  }
});

app.post('/api/stations/:id/token', checkMaster, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const token = randomToken();
    const { data, error } = await supabase
      .from('stations')
      .update({ overlay_token: token })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, token, station: stationToClient(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '토큰 생성 실패' });
  }
});

app.delete('/api/stations/:id', checkMaster, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const { data: station, error: stErr } = await supabase.from('stations').select('*').eq('id', req.params.id).single();
    if (stErr) throw stErr;
    if (station.slug === 'default') return res.status(400).json({ error: '기본 방송국은 삭제할 수 없습니다.' });

    const delDon = await supabase.from('donations').delete().eq('station_id', req.params.id);
    if (delDon.error) throw delDon.error;
    const delBroad = await supabase.from('broadcasts').delete().eq('station_id', req.params.id);
    if (delBroad.error) throw delBroad.error;
    const delSt = await supabase.from('stations').delete().eq('id', req.params.id);
    if (delSt.error) throw delSt.error;

    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송국 삭제 실패' });
  }
});

/* 방송국/방송 API */
app.get('/api/station-info', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    const active = await ensureActiveBroadcast(station.id);
    const activeSettings = await readEffectiveSettings(station.slug, active.id);
    const activeClient = {
      ...broadcastToClient(active),
      broadcastLiveData: normalizeBroadcastLiveData(activeSettings.broadcastLiveData),
      broadcastTimerData: normalizeBroadcastTimerData(activeSettings.broadcastTimerData)
    };
    res.json({ station: stationToClient(station), active: activeClient, allowed: await stationAllowed(req, station) });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송국 정보 조회 실패' });
  }
});

app.get('/api/broadcasts', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    const active = await ensureActiveBroadcast(station.id);
    const broadcasts = await listBroadcasts(station.id);

    const withTimers = await Promise.all((broadcasts || []).map(async b => {
      const settings = await readEffectiveSettings(station.slug, b.id);
      return {
        ...b,
        broadcastTimerData: normalizeBroadcastTimerData(settings.broadcastTimerData),
        broadcastLiveData: normalizeBroadcastLiveData(settings.broadcastLiveData)
      };
    }));

    res.json({ station: stationToClient(station), active: broadcastToClient(active), broadcasts: withTimers });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송 목록 조회 실패' });
  }
});

app.post('/api/broadcasts', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    if (!await stationAllowed(req, station)) return res.status(401).json({ error: '방송국 관리자 권한이 필요합니다.' });

    const title = normName(req.body.title);
    if (!title) return res.status(400).json({ error: '방송 제목을 입력하세요.' });

    if (req.body.activate !== false) {
      const off = await supabase.from('broadcasts').update({ is_active: false }).eq('station_id', station.id).eq('is_active', true);
      if (off.error) throw off.error;
    }

    const { data, error } = await supabase
      .from('broadcasts')
      .insert({
        station_id: station.id,
        title,
        memo: String(req.body.memo || ''),
        broadcast_password: String(req.body.broadcastPassword || ''),
        is_active: req.body.activate !== false
      })
      .select()
      .single();

    if (error) throw error;
    await copySettingsToBroadcast(station.slug, data.id);
    res.json({ ok: true, station: stationToClient(station), broadcast: broadcastToClient(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '방송 생성 실패' });
  }
});

app.post('/api/broadcasts/:id/activate', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });

    const target = await getStationBroadcastOrNull(station.id, req.params.id);
    if (!target) return res.status(404).json({ error: '방송을 찾을 수 없습니다.' });

    const allowed = await stationAllowed(req, station) || await broadcastPasswordAllowed(req, target);
    if (!allowed) return res.status(401).json({ error: '방송국 관리자 또는 해당 방송 비밀번호가 필요합니다.' });

    const data = await setActiveBroadcast(station.id, req.params.id);

    // 해당 방송 비밀번호로 활성화했다면 쿠키도 저장
    const given = req.body?.broadcastPassword || req.body?.password || req.query?.broadcastPassword || req.query?.password;
    if (given && String(given) === String(target.broadcast_password || '')) {
      setCookie(res, `broadcast_pw_${target.id}`, String(given), 60 * 60 * 24);
    }

    res.json({ ok: true, active: broadcastToClient(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '현재 방송 선택 실패' });
  }
});

app.put('/api/broadcasts/:id', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    if (!await stationAllowed(req, station)) return res.status(401).json({ error: '방송국 관리자 권한이 필요합니다.' });

    const payload = {};
    if (req.body.title !== undefined) payload.title = normName(req.body.title);
    if (req.body.broadcastPassword !== undefined) payload.broadcast_password = String(req.body.broadcastPassword || '');
    if (req.body.memo !== undefined) payload.memo = String(req.body.memo || '');

    const { data, error } = await supabase
      .from('broadcasts')
      .update(payload)
      .eq('station_id', station.id)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, broadcast: broadcastToClient(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '방송 수정 실패' });
  }
});

app.delete('/api/broadcasts/:id', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    if (!await stationAllowed(req, station)) return res.status(401).json({ error: '방송국 관리자 권한이 필요합니다.' });

    const { data: target, error: readError } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('station_id', station.id)
      .eq('id', req.params.id)
      .single();

    if (readError) throw readError;
    if (target?.is_active) {
      return res.status(400).json({ error: '현재 방송은 삭제할 수 없습니다. 다른 방송을 현재 방송으로 선택한 뒤 삭제하세요.' });
    }

    const delDonations = await supabase.from('donations').delete().eq('station_id', station.id).eq('broadcast_id', req.params.id);
    if (delDonations.error) throw delDonations.error;

    const delBroadcast = await supabase.from('broadcasts').delete().eq('station_id', station.id).eq('id', req.params.id);
    if (delBroadcast.error) throw delBroadcast.error;

    await removeBroadcastSettings(station.slug, req.params.id);
    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송 삭제 실패' });
  }
});


app.get('/api/sounds', async (req, res) => {
  try {
    const dir = path.join(__dirname, 'public', 'sounds');
    if (!fs.existsSync(dir)) return res.json({ sounds: [] });

    const sounds = fs.readdirSync(dir)
      .filter(file => /\.(mp3|wav|ogg|m4a)$/i.test(file))
      .map(file => ({ file, label: file.replace(/\.[^.]+$/, '') }))
      .sort((a, b) => a.file.localeCompare(b.file, 'ko'));

    res.json({ sounds });
  } catch (e) {
    res.status(500).json({ error: e.message || '사운드 목록 조회 실패' });
  }
});



/* 수동 사운드 이벤트: 후원 저장과 별개로 overlay에 사운드/alert만 전송 */
app.post('/api/sound-events', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;

    if (!await operatorAllowed(req, ctx.station, ctx.active)) {
      return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    }

    const soundFile = cleanSoundFile(req.body?.soundFile || '');
    if (!soundFile) return res.status(400).json({ error: '재생할 사운드 파일을 선택하세요.' });

    const title = String(req.body?.title || soundFile).trim();
    const message = String(req.body?.message || '').trim();
    const soundStatus = String(req.body?.mode || req.body?.status || 'immediate') === 'queue' ? 'queued' : 'pending';
    const releasedAt = soundStatus === 'pending' ? new Date().toISOString() : null;
    const repeatTotal = Math.max(1, Math.min(100, parseInt(req.body?.repeatCount || req.body?.repeat_total || 1, 10) || 1));

    const { data, error } = await supabase
      .from('sound_events')
      .insert({
        station_id: ctx.station.id,
        broadcast_id: ctx.active.id,
        sound_file: soundFile,
        title,
        message,
        played_at: null,
        status: soundStatus,
        released_at: releasedAt,
        repeat_total: repeatTotal,
        repeat_played: 0
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      ok: true,
      event: {
        id: data.id,
        createdAt: data.created_at,
        playedAt: data.played_at,
        releasedAt: data.released_at,
        status: data.status || soundStatus,
        soundFile: data.sound_file,
        title: data.title,
        message: data.message,
        repeatTotal: data.repeat_total || repeatTotal,
        repeatPlayed: data.repeat_played || 0,
        repeatRemaining: Math.max(0, (data.repeat_total || repeatTotal) - (data.repeat_played || 0))
      }
    });
  } catch (e) {
    res.status(400).json({ error: e.message || '수동 사운드 전송 실패' });
  }
});

app.get('/api/sound-events', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;

    const tokenOk = typeof stationTokenAllowed === 'function' ? await stationTokenAllowed(req, ctx.station) : false;
    const canView = tokenOk || await operatorAllowed(req, ctx.station, ctx.active);
    if (!canView) return res.status(403).json({ error: '오버레이 토큰이 필요합니다.' });

    const all = String(req.query.all || '') === '1';
    const after = String(req.query.after || '');

    let q = supabase
      .from('sound_events')
      .select('*')
      .eq('station_id', ctx.station.id)
      .eq('broadcast_id', ctx.active.id)
      .is('played_at', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (all) {
      q = q.in('status', ['queued', 'pending']);
    } else {
      q = q.eq('status', 'pending');
      if (after) q = q.gt('released_at', after);
      else return res.json({ events: [] });
    }

    const { data, error } = await q;
    if (error) throw error;

    res.json({
      events: (data || []).map(row => {
        const total = Math.max(1, Number(row.repeat_total || 1));
        const played = Math.max(0, Number(row.repeat_played || 0));
        return {
          id: row.id,
          createdAt: row.created_at,
          playedAt: row.played_at,
          releasedAt: row.released_at,
          status: row.status || 'pending',
          soundFile: row.sound_file,
          title: row.title,
          message: row.message,
          repeatTotal: total,
          repeatPlayed: played,
          repeatRemaining: Math.max(0, total - played)
        };
      })
    });
  } catch (e) {
    res.status(500).json({ error: e.message || '수동 사운드 이벤트 조회 실패' });
  }
});



app.post('/api/sound-events/:id/played', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;

    const tokenOk = typeof stationTokenAllowed === 'function' ? await stationTokenAllowed(req, ctx.station) : false;
    const canUpdate = tokenOk || await operatorAllowed(req, ctx.station, ctx.active);
    if (!canUpdate) return res.status(403).json({ error: '권한이 없습니다.' });

    const { data: current, error: readError } = await supabase
      .from('sound_events')
      .select('*')
      .eq('station_id', ctx.station.id)
      .eq('broadcast_id', ctx.active.id)
      .eq('id', req.params.id)
      .single();

    if (readError) throw readError;

    const total = Math.max(1, Number(current.repeat_total || 1));
    const nextPlayed = Math.min(total, Math.max(0, Number(current.repeat_played || 0)) + 1);
    const done = nextPlayed >= total;

    const payload = { repeat_played: nextPlayed };

    if (done) {
      payload.played_at = new Date().toISOString();
      payload.status = 'played';
    }

    const { data, error } = await supabase
      .from('sound_events')
      .update(payload)
      .eq('station_id', ctx.station.id)
      .eq('broadcast_id', ctx.active.id)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      ok: true,
      done,
      event: {
        id: data.id,
        repeatTotal: Number(data.repeat_total || total),
        repeatPlayed: Number(data.repeat_played || nextPlayed),
        repeatRemaining: Math.max(0, Number(data.repeat_total || total) - Number(data.repeat_played || nextPlayed)),
        status: data.status || (done ? 'played' : 'pending')
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message || '수동 사운드 played 처리 실패' });
  }
});

app.delete('/api/sound-events/:id', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    const { error } = await supabase.from('sound_events').delete()
      .eq('station_id', ctx.station.id)
      .eq('broadcast_id', ctx.active.id)
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    res.status(500).json({ error: e.message || '수동 사운드 삭제 실패' });
  }
});



app.post('/api/sound-events/release', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;

    if (!await operatorAllowed(req, ctx.station, ctx.active)) {
      return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    }

    const { data, error } = await supabase
      .from('sound_events')
      .update({ status: 'pending', released_at: new Date().toISOString() })
      .eq('station_id', ctx.station.id)
      .eq('broadcast_id', ctx.active.id)
      .is('played_at', null)
      .eq('status', 'queued')
      .select();

    if (error) throw error;

    res.json({ ok: true, count: (data || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message || '대기열 전송 실패' });
  }
});



/* 미디어 업로드/관리: PC/모바일 공통 */
app.get('/api/media', async (req, res) => {
  try {
    const media = listMediaFiles();
    res.json({
      media,
      images: media.filter(x => x.type === 'image'),
      videos: media.filter(x => x.type === 'video')
    });
  } catch (e) {
    res.status(500).json({ error: e.message || '미디어 목록 조회 실패' });
  }
});

app.post('/api/media/upload', mediaUpload.array('files', 10), async (req, res) => {
  try {
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) {
      return res.status(401).json({ error: '방송국 관리자 또는 방송 비밀번호 권한이 필요합니다.' });
    }
    const uploaded = (req.files || []).map(f => {
      const type = String(f.mimetype || '').startsWith('video/') ? 'video' : 'image';
      const urlBase = type === 'video' ? '/uploads/videos' : '/uploads/images';
      return {
        id: Buffer.from(`${urlBase}/${f.filename}`).toString('base64url'),
        type,
        name: f.filename,
        originalName: f.originalname,
        url: `${urlBase}/${encodeURIComponent(f.filename)}`,
        size: f.size
      };
    });
    res.json({ ok: true, uploaded, media: listMediaFiles() });
  } catch (e) {
    res.status(500).json({ error: e.message || '업로드 실패' });
  }
});

app.delete('/api/media', async (req, res) => {
  try {
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) {
      return res.status(401).json({ error: '방송국 관리자 또는 방송 비밀번호 권한이 필요합니다.' });
    }
    const url = String(req.query.url || req.body?.url || '').trim();
    if (!url) return res.status(400).json({ error: '삭제할 파일 URL이 없습니다.' });
    const decoded = decodeURIComponent(url);
    const allowedBases = ['/uploads/images/', '/uploads/videos/'];
    if (!allowedBases.some(b => decoded.startsWith(b))) {
      return res.status(400).json({ error: '업로드 폴더의 파일만 삭제할 수 있습니다.' });
    }
    const abs = path.normalize(path.join(__dirname, 'public', decoded));
    if (!abs.startsWith(path.normalize(MEDIA_BASE_DIR))) {
      return res.status(400).json({ error: '삭제 경로가 올바르지 않습니다.' });
    }
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    res.json({ ok: true, media: listMediaFiles() });
  } catch (e) {
    res.status(500).json({ error: e.message || '삭제 실패' });
  }
});

/* 서버 이미지 목록: station_style.html 썸네일 선택용 */
app.get('/api/server-images', async (req, res) => {
  try {
    const images = listMediaFiles().filter(x => x.type === 'image');
    res.json({ images });
  } catch (e) {
    res.status(500).json({ error: e.message || '이미지 목록 조회 실패' });
  }
});



/* 슬롯형 룰렛 */
app.get('/api/roulette', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    const active = await ensureActiveBroadcast(station.id);
    const roulette = await cleanupExpiredRoulette({ station, active });
    res.json({ ok: true, roulette, station: stationToClient(station), broadcast: broadcastToClient(active) });
  } catch (e) {
    res.status(500).json({ error: e.message || '룰렛 조회 실패' });
  }
});

app.post('/api/roulette/save', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    const roulette = normalizeRouletteData(req.body?.roulette || req.body || {});
    const saved = await saveRouletteForContext(ctx, roulette);
    res.json({ ok: true, roulette: saved });
  } catch (e) {
    res.status(500).json({ error: e.message || '룰렛 저장 실패' });
  }
});

app.post('/api/roulette/start', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    const listId = cleanRouletteId(req.body?.listId || req.body?.rouletteId, '');
    if (!listId) return res.status(400).json({ error: '룰렛을 선택하세요.' });
    const count = Math.max(1, Math.min(50, Math.trunc(Number(req.body?.count || 1))));
    const out = await createRouletteBatch(ctx, listId, 'manual', count, {
      duration: req.body?.duration,
      donor: req.body?.donor,
      batchId: req.body?.batchId
    });
    res.json({ ok: true, roulette: out.roulette, result: out.run.result, run: out.run, runs: out.runs });
  } catch (e) {
    res.status(400).json({ error: e.message || '룰렛 시작 실패' });
  }
});

app.post('/api/roulette/reset', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    const currentSettings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    const roulette = normalizeRouletteData(currentSettings.roulette);
    roulette.current = null;
    roulette.queue = [];
    const saved = await saveRouletteForContext(ctx, roulette);
    res.json({ ok: true, roulette: saved });
  } catch (e) {
    res.status(500).json({ error: e.message || '룰렛 초기화 실패' });
  }
});


app.post('/api/roulette/advance', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    const out = await advanceRouletteQueue(ctx, String(req.body?.runId || ''));
    res.json({ ok: true, roulette: out.roulette, run: out.run });
  } catch (e) {
    res.status(400).json({ error: e.message || '룰렛 다음 회차 실행 실패' });
  }
});

app.post('/api/roulette/history/clear', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    const currentSettings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    const roulette = normalizeRouletteData(currentSettings.roulette);
    roulette.history = [];
    const saved = await saveRouletteForContext(ctx, roulette);
    res.json({ ok: true, roulette: saved });
  } catch (e) {
    res.status(500).json({ error: e.message || '룰렛 결과 삭제 실패' });
  }
});

/* 설정 */
app.get('/api/settings', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    const active = await ensureActiveBroadcast(station.id);
    const settings = await readEffectiveSettings(station.slug, active.id);
    const broadcastClient = {
      ...broadcastToClient(active),
      broadcastLiveData: normalizeBroadcastLiveData(settings.broadcastLiveData),
      broadcastTimerData: normalizeBroadcastTimerData(settings.broadcastTimerData)
    };
    res.json({ ...settings, station: stationToClient(station), broadcast: broadcastClient });
  } catch (e) {
    res.status(500).json({ error: e.message || '설정 조회 실패' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });

    const body = req.body || {};
    const has = key => Object.prototype.hasOwnProperty.call(body, key);
    const updates = {};

    // 방송국별 공통 저장 항목: body에 있을 때만 저장해서 다른 페이지 저장으로 초기화되지 않게 함
    if (has('title')) updates.title = String(body.title ?? '도네이터 현황');
    if (has('titleImage')) updates.titleImage = String(body.titleImage ?? '');
    if (has('noticeTitle')) updates.noticeTitle = String(body.noticeTitle ?? '공지');
    if (has('notice')) updates.notice = String(body.notice ?? '');
    if (has('noticeColors')) updates.noticeColors = Array.isArray(body.noticeColors) ? body.noticeColors.slice(0, 5) : undefined;
    if (has('karaokeData')) updates.karaokeData = normalizeKaraokeData(body.karaokeData);
    if (has('fundingData')) updates.fundingData = normalizeFundingData(body.fundingData);
    if (has('stationStyle')) updates.stationStyle = normalizeStationStyle(body.stationStyle);

    // 방송별/운영 설정
    if (has('viewerPassword')) updates.viewerPassword = String(body.viewerPassword ?? '');
    if (has('viewerToken')) updates.viewerToken = String(body.viewerToken ?? '');
    if (has('overlaySections')) updates.overlaySections = normalizeOverlaySections(body.overlaySections, { account: true, notice: false, creators: true, creatorDonations: true, karaoke: false, funding: false, broadcastTimer: false, media: true });
    if (has('columns')) updates.columns = body.columns ?? 4;
    if (has('maxCreators')) updates.maxCreators = body.maxCreators ?? 12;
    if (has('creators')) updates.creators = Array.isArray(body.creators) ? body.creators.map(normName).filter(Boolean) : [];
    if (has('presets')) updates.presets = Array.isArray(body.presets) ? body.presets : [];
    if (has('broadcastTimerData')) updates.broadcastTimerData = normalizeBroadcastTimerData(body.broadcastTimerData);
    if (has('broadcastLiveData')) updates.broadcastLiveData = normalizeBroadcastLiveData(body.broadcastLiveData);
    if (has('soundRules')) updates.soundRules = normalizeSoundRules(body.soundRules, undefined);
    if (has('roulette')) updates.roulette = normalizeRouletteData(body.roulette);

    await saveSharedStationSettings(ctx.station.slug, updates);
    await saveEffectiveSettings(ctx.station.slug, ctx.active.id, updates);
    const effective = await readEffectiveSettings(ctx.station.slug, ctx.active.id);

    const broadcastClient = {
      ...broadcastToClient(ctx.active),
      broadcastLiveData: normalizeBroadcastLiveData(effective.broadcastLiveData),
      broadcastTimerData: normalizeBroadcastTimerData(effective.broadcastTimerData)
    };
    res.json({ ok: true, settings: { ...effective, station: stationToClient(ctx.station), broadcast: broadcastClient } });
  } catch (e) {
    res.status(500).json({ error: e.message || '설정 저장 실패' });
  }
});

app.post('/api/karaoke-data', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) {
      return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    }

    const karaokeData = normalizeKaraokeData(req.body.karaokeData || req.body || {});
    await saveSharedStationSettings(ctx.station.slug, { karaokeData });

    const effective = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    res.json({ ok: true, karaokeData: effective.karaokeData });
  } catch (e) {
    res.status(500).json({ error: e.message || '노래방 저장 실패' });
  }
});

app.post('/api/funding-data', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) {
      return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    }

    const fundingData = normalizeFundingData(req.body.fundingData || req.body || {});
    await saveSharedStationSettings(ctx.station.slug, { fundingData });

    const effective = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    res.json({ ok: true, fundingData: effective.fundingData });
  } catch (e) {
    res.status(500).json({ error: e.message || '펀딩 저장 실패' });
  }
});

app.post('/api/station-style', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await stationAllowed(req, ctx.station)) {
      return res.status(401).json({ error: '방송국 관리자 권한이 필요합니다.' });
    }

    const stationStyle = normalizeStationStyle(req.body.stationStyle || req.body || {});
    await saveSharedStationSettings(ctx.station.slug, { stationStyle });
    const effective = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    res.json({ ok: true, stationStyle: effective.stationStyle });
  } catch (e) {
    res.status(500).json({ error: e.message || '스타일 저장 실패' });
  }
});


app.post('/api/broadcast-timer/start', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;

    const broadcastId = req.body.broadcastId || req.query.broadcastId || ctx.active.id;
    const target = await getStationBroadcastOrNull(ctx.station.id, broadcastId);
    if (!target) return res.status(404).json({ error: '방송을 찾을 수 없습니다.' });

    if (!await operatorAllowed(req, ctx.station, target)) {
      return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    }

    // 방송시작 버튼은 해당 방송을 현재 방송으로도 선택합니다.
    const activeBroadcast = await setActiveBroadcast(ctx.station.id, broadcastId);

    const current = await readEffectiveSettings(ctx.station.slug, broadcastId);
    const broadcastLiveData = normalizeBroadcastLiveData({ status: 'live', live: true, startedAt: new Date().toISOString(), endedAt: '' });
    await saveEffectiveSettings(ctx.station.slug, broadcastId, { ...current, broadcastLiveData });

    const given = req.body?.broadcastPassword || req.body?.password || req.query?.broadcastPassword || req.query?.password;
    if (given && String(given) === String(target.broadcast_password || '')) {
      setCookie(res, `broadcast_pw_${target.id}`, String(given), 60 * 60 * 24);
    }

    res.json({ ok: true, broadcastId, active: broadcastToClient(activeBroadcast), broadcastLiveData });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송 시작 실패' });
  }
});

app.post('/api/broadcast-timer/end', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;

    const broadcastId = req.body.broadcastId || req.query.broadcastId || ctx.active.id;
    const target = await getStationBroadcastOrNull(ctx.station.id, broadcastId);
    if (!target) return res.status(404).json({ error: '방송을 찾을 수 없습니다.' });

    if (!await operatorAllowed(req, ctx.station, target)) {
      return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    }

    const current = await readEffectiveSettings(ctx.station.slug, broadcastId);
    const broadcastLiveData = normalizeBroadcastLiveData({
      status: 'ended',
      live: false,
      startedAt: current.broadcastLiveData?.startedAt || '',
      endedAt: new Date().toISOString()
    });
    await saveEffectiveSettings(ctx.station.slug, broadcastId, { ...current, broadcastLiveData });

    const given = req.body?.broadcastPassword || req.body?.password || req.query?.broadcastPassword || req.query?.password;
    if (given && String(given) === String(target.broadcast_password || '')) {
      setCookie(res, `broadcast_pw_${target.id}`, String(given), 60 * 60 * 24);
    }

    res.json({ ok: true, broadcastId, broadcastLiveData });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송 종료 실패' });
  }
});

app.post('/api/mission-timer/start', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    const mode = ['countdown','until','countup'].includes(String(req.body.mode || '')) ? String(req.body.mode) : 'countdown';
    const durationMin = Math.max(0, Number(req.body.durationMin || 0));
    const durationMs = durationMin > 0 ? Math.round(durationMin * 60 * 1000) : Math.max(0, Number(req.body.durationMs || 0));
    const targetAt = req.body.targetAt ? String(req.body.targetAt) : '';
    const label = String(req.body.label || '미션타이머');
    const broadcastTimerData = normalizeBroadcastTimerData({ running: true, mode, label, startedAt: new Date().toISOString(), endedAt: '', elapsedMs: 0, durationMs, targetAt });
    const current = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    await saveEffectiveSettings(ctx.station.slug, ctx.active.id, { ...current, broadcastTimerData });
    res.json({ ok: true, broadcastTimerData });
  } catch(e){ res.status(500).json({ error: e.message || '미션타이머 시작 실패' }); }
});

app.post('/api/mission-timer/stop', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    const current = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    const prev = normalizeBroadcastTimerData(current.broadcastTimerData);
    const broadcastTimerData = normalizeBroadcastTimerData({ ...prev, running: false, endedAt: new Date().toISOString() });
    await saveEffectiveSettings(ctx.station.slug, ctx.active.id, { ...current, broadcastTimerData });
    res.json({ ok: true, broadcastTimerData });
  } catch(e){ res.status(500).json({ error: e.message || '미션타이머 종료 실패' }); }
});


/* 후원/합산 */
app.get('/api/donations', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    const broadcastId = req.query.broadcastId || ctx.active.id;
    const donations = await readDonations(ctx.station.id, broadcastId);
    res.json({ station: stationToClient(ctx.station), broadcast: broadcastToClient(ctx.active), donations });
  } catch (e) {
    res.status(500).json({ error: e.message || '후원 조회 실패' });
  }
});


function safeBuildSummary(settings, donations, broadcast, station) {
  const safeSettings = normalizeSettings(settings || {});
  const safeDonations = Array.isArray(donations) ? donations : [];
  try {
    return buildSummary(safeSettings, safeDonations, broadcast, station);
  } catch (e) {
    console.error('[safeBuildSummary]', e);
    return {
      ...safeSettings,
      station: station ? stationToClient(station) : null,
      broadcast: broadcast ? broadcastToClient(broadcast) : null,
      creators: [],
      creatorRows: [],
      donors: [],
      donorRows: [],
      accountDonors: [],
      accountRoller: [],
      recent: [],
      donations: []
    };
  }
}

app.get('/api/summary', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    const broadcastId = req.query.broadcastId || ctx.active.id;

    const settings = await readEffectiveSettings(ctx.station.slug, broadcastId);
    let donations = [];
    try {
      donations = await readDonations(ctx.station.id, broadcastId);
    } catch (donErr) {
      console.error('[api/summary readDonations]', donErr);
      donations = [];
    }

    try {
      res.json(buildSummary(settings, donations, ctx.active, ctx.station));
    } catch (sumErr) {
      console.error('[api/summary buildSummary]', sumErr);
      const safeSettings = normalizeSettings(settings || {});
      res.json({
        settings: safeSettings,
        title: safeSettings.title,
        titleImage: safeSettings.titleImage,
        noticeTitle: safeSettings.noticeTitle,
        notice: safeSettings.notice,
        noticeColors: safeSettings.noticeColors,
        overlaySections: safeSettings.overlaySections,
        soundRules: safeSettings.soundRules,
        karaokeData: safeSettings.karaokeData,
        fundingData: safeSettings.fundingData,
        broadcastTimerData: safeSettings.broadcastTimerData,
        creators: [],
        creatorRows: [],
        donors: [],
        donorRows: [],
        accountDonors: [],
        accountRoller: [],
        recent: [],
        donations: [],
        station: stationToClient(ctx.station),
        broadcast: broadcastToClient(ctx.active)
      });
    }
  } catch (e) {
    console.error('[api/summary fatal]', e);
    try {
      const fallback = normalizeSettings({});
      res.json({
        settings: fallback,
        title: fallback.title,
        titleImage: fallback.titleImage,
        noticeTitle: fallback.noticeTitle,
        notice: fallback.notice,
        noticeColors: fallback.noticeColors,
        overlaySections: fallback.overlaySections,
        soundRules: fallback.soundRules,
        karaokeData: fallback.karaokeData,
        fundingData: fallback.fundingData,
        broadcastTimerData: fallback.broadcastTimerData,
        creators: [],
        creatorRows: [],
        donors: [],
        donorRows: [],
        accountDonors: [],
        accountRoller: [],
        recent: [],
        donations: []
      });
    } catch {
      res.status(500).json({ error: e.message || '합산 조회 실패' });
    }
  }
});

app.post('/api/donations', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    if (!await inputAllowedForActiveBroadcast(ctx)) return res.status(403).json({ error: '방송시작 상태에서만 입력할 수 있습니다.' });

    const settings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    const row = makeDonationRow(req.body || {}, settings, ctx.station.id, ctx.active.id);

    const { data, error } = await supabase.from('donations').insert(row).select().single();
    if (error) throw error;
    const rouletteRun = await maybeStartAutoRoulette(ctx, row.total_amount, row.donor, req.body || {});
    res.json({ ok: true, station: stationToClient(ctx.station), broadcast: broadcastToClient(ctx.active), donation: dbRowToDonation(data), rouletteRun: rouletteRun?.run || null });
  } catch (e) {
    res.status(400).json({ error: e.message || '저장 실패' });
  }
});

app.post('/api/donations/batch', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    if (!await inputAllowedForActiveBroadcast(ctx)) return res.status(403).json({ error: '방송시작 상태에서만 입력할 수 있습니다.' });

    const settings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    const donor = normName(req.body.donor);
    const processType = normName(req.body.processType) || '후원';
    const accountTotal = toWon(req.body.accountTotal ?? req.body.accountAmountTotal ?? req.body.accountAmount);
    const toonieTotal = toWon(req.body.toonieTotal ?? req.body.toonationTotal ?? req.body.toonieAmountTotal ?? req.body.toonieAmount);
    const grandTotal = accountTotal + toonieTotal;
    const inputRows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (!donor) return res.status(400).json({ error: '도네이터명을 입력하세요.' });
    if (grandTotal <= 0) return res.status(400).json({ error: '상단 계좌금액 또는 투네금액을 입력하세요.' });

    const validRows = inputRows
      .map(r => ({ creator: normName(r.creator), amount: toWon(r.amount ?? r.totalAmount ?? r.value), memo: String(r.memo || req.body.memo || '').trim() }))
      .filter(r => r.creator && r.amount > 0);

    if (!validRows.length) return res.status(400).json({ error: '크리에이터별 금액을 1개 이상 입력하세요.' });

    const splitTotal = validRows.reduce((sum, r) => sum + r.amount, 0);
    if (splitTotal !== grandTotal) {
      return res.status(400).json({
        error: `상단 총액과 크리에이터별 금액 합계가 다릅니다. 상단 합계 ${displayManText(grandTotal)}, 분배 합계 ${displayManText(splitTotal)}`
      });
    }

    let remainAccount = accountTotal;
    const created = validRows.map(r => {
      const accountPart = Math.min(remainAccount, r.amount);
      remainAccount -= accountPart;
      const tooniePart = r.amount - accountPart;

      return makeDonationRow({
        donor,
        creator: r.creator,
        processType,
        accountAmount: accountPart,
        toonieAmount: tooniePart,
        memo: r.memo,
        rouletteRuleId: req.body.rouletteRuleId || ''
      }, settings, ctx.station.id, ctx.active.id);
    });

    const { data, error } = await supabase.from('donations').insert(created).select();
    if (error) throw error;

    const fundingId = String(req.body.fundingId || '').trim();
    if (fundingId) {
      const current = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
      const fundingData = normalizeFundingData(current.fundingData);
      const item = fundingData.items.find(f => f.id === fundingId);
      if (item) {
        let units = Math.trunc(Number(req.body.fundingUnits || 0));
        if (!units || units < 0) units = Math.floor(grandTotal / 10000);
        if (units > 0) {
          item.current = Number(item.current || 0) + units;
          await saveSharedStationSettings(ctx.station.slug, { fundingData });
        }
      }
    }

    const rouletteRun = await maybeStartAutoRoulette(ctx, grandTotal, donor, req.body || {});
    res.json({ ok: true, station: stationToClient(ctx.station), broadcast: broadcastToClient(ctx.active), count: data.length, donations: data.map(dbRowToDonation), rouletteRun: rouletteRun?.run || null });
  } catch (e) {
    res.status(400).json({ error: e.message || '저장 실패' });
  }
});


app.post('/api/manual-entry', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });
    if (!await inputAllowedForActiveBroadcast(ctx)) return res.status(403).json({ error: '방송시작 상태에서만 수동 입력할 수 있습니다.' });

    const settings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    const body = req.body || {};
    const donor = normName(body.donor);
    const amount = toWon(body.amount ?? body.totalAmount);
    const sourceType = normName(body.sourceType || body.source || 'toonie');
    const kind = normName(body.kind || body.manualKind || 'manual');
    const fundingId = String(body.fundingId || '').trim();
    let creator = normName(body.creator);
    let processType = normName(body.processType) || '후원';

    if (!donor) return res.status(400).json({ error: '도네이터명을 입력하세요.' });
    if (amount <= 0) return res.status(400).json({ error: '금액을 입력하세요.' });

    if (kind === 'funding') {
      const f = (settings.fundingData?.items || []).find(x => String(x.id) === fundingId);
      if (!f) return res.status(400).json({ error: '펀딩을 선택하세요.' });
      creator = creator || f.title || '펀딩';
      processType = processType || '펀딩';
    }
    if (!creator) creator = '수동입력';

    const donationBody = {
      donor,
      creator,
      processType,
      accountAmount: sourceType === 'account' ? amount : 0,
      toonieAmount: sourceType === 'account' ? 0 : amount,
      memo: body.memo || '',
      silentAlert: true,
      manualKind: kind,
      sourceType,
      fundingId
    };

    const row = makeDonationRow(donationBody, settings, ctx.station.id, ctx.active.id);
    const { data, error } = await supabase.from('donations').insert(row).select().single();
    if (error) throw error;

    if (kind === 'funding' && fundingId) {
      const current = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
      const fundingData = normalizeFundingData(current.fundingData);
      const item = fundingData.items.find(f => String(f.id) === fundingId);
      if (item) {
        item.current = Math.max(0, Number(item.current || 0) + amount);
        await saveSharedStationSettings(ctx.station.slug, { fundingData });
        await saveEffectiveSettings(ctx.station.slug, ctx.active.id, { fundingData });
      }
    }

    const rouletteRun = await maybeStartAutoRoulette(ctx, row.total_amount, row.donor, req.body || {});
    res.json({ ok: true, donation: dbRowToDonation(data), rouletteRun: rouletteRun?.run || null });
  } catch (e) {
    res.status(400).json({ error: e.message || '수동 입력 저장 실패' });
  }
});

app.put('/api/donations/:id', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });

    const settings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    const old = await supabase.from('donations').select('*').eq('station_id', ctx.station.id).eq('id', req.params.id).maybeSingle();
    if (old.error) throw old.error;
    if (!old.data) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });

    const prev = dbRowToDonation(old.data);
    const body = req.body || {};
    const accountAmount = body.accountAmount !== undefined ? toWon(body.accountAmount) : Number(prev.accountAmount || 0);
    const toonieAmount = body.toonieAmount !== undefined ? toWon(body.toonieAmount) : Number(prev.toonieAmount || 0);
    const nextRow = makeDonationRow({
      donor: body.donor !== undefined ? body.donor : prev.donor,
      creator: body.creator !== undefined ? body.creator : prev.creator,
      processType: body.processType !== undefined ? body.processType : prev.processType,
      accountAmount,
      toonieAmount,
      memo: body.memo !== undefined ? body.memo : prev.memo,
      silentAlert: body.silentAlert !== undefined ? body.silentAlert : prev.silentAlert,
      manualKind: body.manualKind || prev.manualKind,
      sourceType: body.sourceType || prev.sourceType,
      fundingId: body.fundingId || prev.fundingId,
      editedAt: new Date().toISOString()
    }, settings, ctx.station.id, prev.broadcastId || ctx.active.id);

    const { data, error } = await supabase.from('donations')
      .update({
        donor: nextRow.donor,
        creator: nextRow.creator,
        process_type: nextRow.process_type,
        account_amount: nextRow.account_amount,
        toonie_amount: nextRow.toonie_amount,
        total_amount: nextRow.total_amount,
        display_amount: nextRow.display_amount,
        smoke: nextRow.smoke,
        nosmoke: nextRow.nosmoke,
        eat: nextRow.eat,
        noeat: nextRow.noeat,
        checks: nextRow.checks,
        result_label: nextRow.result_label,
        memo: nextRow.memo
      })
      .eq('station_id', ctx.station.id)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, donation: dbRowToDonation(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '후원 내역 수정 실패' });
  }
});

app.delete('/api/donations/:id', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });

    const { error } = await supabase.from('donations').delete().eq('station_id', ctx.station.id).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    res.status(500).json({ error: e.message || '삭제 실패' });
  }
});

app.post('/api/reset', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });

    const broadcastId = req.body.broadcastId || ctx.active.id;
    const { error } = await supabase.from('donations').delete().eq('station_id', ctx.station.id).eq('broadcast_id', broadcastId);
    if (error) throw error;
    res.json({ ok: true, stationId: ctx.station.id, broadcastId });
  } catch (e) {
    res.status(500).json({ error: e.message || '현재 방송 데이터 초기화 실패' });
  }
});

app.get('/', (req, res) => res.redirect('/station_login.html'));

app.listen(PORT, () => {
  console.log(`Donation multi-station server running on port ${PORT}`);
});
