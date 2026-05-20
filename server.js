const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
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
    overlaySections: { account: true, notice: false, creators: true },
    columns: 4,
    maxCreators: 12,
    creators: ['빵떠기', '또영', '수박', '몰라', '익명'],
    presets: defaultPresets(),
    prices: { smoke: 11900, nosmoke: 12000, eat: 14000, noeat: 15000 },
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

function normalizeOverlaySections(raw, base) {
  const fallback = base || { account: true, notice: false, creators: true };
  const value = raw && typeof raw === 'object' ? raw : fallback;
  return {
    account: value.account !== false,
    notice: value.notice === true,
    creators: value.creators !== false
  };
}

function normalizeSettings(settings) {
  const base = defaultSettings();
  const raw = settings || {};

  let presets = Array.isArray(raw.presets) && raw.presets.length
    ? raw.presets
    : [
        { ...base.presets[0], plusPrice: raw.prices?.smoke ?? base.presets[0].plusPrice, minusPrice: raw.prices?.nosmoke ?? base.presets[0].minusPrice },
        { ...base.presets[1], plusPrice: raw.prices?.eat ?? base.presets[1].plusPrice, minusPrice: raw.prices?.noeat ?? base.presets[1].minusPrice }
      ];

  presets = presets.map((p, idx) => normalizePreset(p, idx));
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
  'title', 'titleImage', 'noticeTitle', 'notice', 'noticeColors',
  'viewerPassword', 'viewerToken', 'overlaySections',
  'columns', 'maxCreators', 'creators', 'presets', 'prices', 'soundRules'
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
  const { data, error } = await supabase.from('settings').select('data').eq('id', 1).single();
  if (error && error.code !== 'PGRST116') throw error;

  if (!data) {
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

function stationToClient(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    overlayToken: row.overlay_token || '',
    createdAt: row.created_at,
    hasAdminPassword: !!row.station_admin_password
  };
}

async function listStations() {
  await ensureDefaultStation();
  const { data, error } = await supabase
    .from('stations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(stationToClient);
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
  const key = `broadcast_pw_${broadcast.id}`;
  const given = req.headers['x-broadcast-password'] || req.body?.broadcastPassword || req.query?.broadcastPassword || cookies[key];
  return String(given || '') === String(broadcast.broadcast_password || '');
}

async function operatorAllowed(req, station, broadcast) {
  if (await stationAllowed(req, station)) return true;
  return await broadcastPasswordAllowed(req, broadcast);
}

async function readEffectiveSettings(stationSlug, broadcastId) {
  const global = await readGlobalSettings();
  const stationMap = global.stationSettings || {};
  const stationSettings = stationMap[stationSlug] || {};
  const scoped = broadcastId && stationSettings[broadcastId] ? stationSettings[broadcastId] : {};
  return normalizeSettings({
    ...global,
    ...scoped,
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
  '/station_control.html'
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

  const plusPrice = Number(preset.plusPrice || 0);
  const minusPrice = Number(preset.minusPrice || 0);
  let side = null;
  let count = 0;

  if (amount > 0 && minusPrice > 0 && amount % minusPrice === 0) {
    side = 'minus';
    count = amount / minusPrice;
  } else if (amount > 0 && plusPrice > 0 && amount % plusPrice === 0) {
    side = 'plus';
    count = amount / plusPrice;
  }

  if (!side) {
    result.label = `${preset.title} 확인`;
    return result;
  }

  const check = {
    presetId: preset.id,
    presetTitle: preset.title,
    side,
    name: side === 'plus' ? preset.plusName : preset.minusName,
    count
  };

  result.checks.push(check);
  result.label = `${check.name} ${count}`;

  if (preset.id === 'smoke') {
    if (side === 'plus') result.smoke = count;
    else result.nosmoke = count;
  } else if (preset.id === 'food') {
    if (side === 'plus') result.eat = count;
    else result.noeat = count;
  }
  return result;
}

function makeDonationRow(body, settings, stationId, broadcastId) {
  const donor = normName(body.donor);
  const creator = normName(body.creator);
  const processType = normName(body.processType) || '후원';
  const accountAmount = toWon(body.accountAmount);
  const toonieAmount = toWon(body.toonieAmount);
  const total = accountAmount + toonieAmount;

  if (!donor) throw new Error('도네이터명을 입력하세요.');
  if (!creator) throw new Error('크리에이터를 선택하세요.');
  if (total <= 0) throw new Error(`${creator}: 금액을 입력하세요.`);

  const check = calcCheck(processType, total, settings);

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
    memo: String(body.memo || '').trim()
  };
}

function dbRowToDonation(row) {
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
    checks: Array.isArray(row.checks) ? row.checks : [],
    resultLabel: row.result_label || '후원',
    memo: row.memo || ''
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
    const stations = await listStations();
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
    res.json({ station: stationToClient(station), active: broadcastToClient(active), allowed: await stationAllowed(req, station) });
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
    res.json({ station: stationToClient(station), active: broadcastToClient(active), broadcasts });
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
    if (!await stationAllowed(req, station)) return res.status(401).json({ error: '방송국 관리자 권한이 필요합니다.' });

    const data = await setActiveBroadcast(station.id, req.params.id);
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

    const { data, error } = await supabase
      .from('sound_events')
      .insert({
        station_id: ctx.station.id,
        broadcast_id: ctx.active.id,
        sound_file: soundFile,
        title,
        message,
        played_at: null,
        status: soundStatus
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      ok: true,
      event: {
        id: data.id,
        createdAt: data.created_at,
        soundFile: data.sound_file,
        title: data.title,
        message: data.message
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

    let q = supabase
      .from('sound_events')
      .select('*')
      .eq('station_id', ctx.station.id)
      .eq('broadcast_id', ctx.active.id)
      .is('played_at', null)
      .order('created_at', { ascending: true })
      .limit(50);

    // overlay는 pending만 재생, admin은 all=1로 queued/pending 전체 대기열 확인
    if (String(req.query.all || '') !== '1') {
      q = q.eq('status', 'pending');
    } else {
      q = q.in('status', ['queued', 'pending']);
    }

    const { data, error } = await q;
    if (error) throw error;

    res.json({
      events: (data || []).map(row => ({
        id: row.id,
        createdAt: row.created_at,
        playedAt: row.played_at,
        status: row.status || 'pending',
        soundFile: row.sound_file,
        title: row.title,
        message: row.message
      }))
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
    const { data, error } = await supabase.from('sound_events')
      .update({ played_at: new Date().toISOString(), status: 'played' })
      .eq('station_id', ctx.station.id)
      .eq('broadcast_id', ctx.active.id)
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ ok: true, event: data });
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
      .update({ status: 'pending' })
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


/* 설정 */
app.get('/api/settings', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const station = await getStation(req);
    if (!station) return res.status(404).json({ error: '방송국을 찾을 수 없습니다.' });
    const active = await ensureActiveBroadcast(station.id);
    const settings = await readEffectiveSettings(station.slug, active.id);
    res.json({ ...settings, station: stationToClient(station), broadcast: broadcastToClient(active) });
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
    const updates = {
      title: String(body.title ?? '도네이터 현황'),
      titleImage: String(body.titleImage ?? ''),
      noticeTitle: String(body.noticeTitle ?? '공지'),
      notice: String(body.notice ?? ''),
      noticeColors: Array.isArray(body.noticeColors) ? body.noticeColors.slice(0, 5) : undefined,
      viewerPassword: String(body.viewerPassword ?? ''),
      viewerToken: String(body.viewerToken ?? ''),
      overlaySections: normalizeOverlaySections(body.overlaySections, { account: true, notice: false, creators: true }),
      columns: body.columns ?? 4,
      maxCreators: body.maxCreators ?? 12,
      creators: Array.isArray(body.creators) ? body.creators.map(normName).filter(Boolean) : [],
      presets: Array.isArray(body.presets) ? body.presets : [],
      soundRules: normalizeSoundRules(body.soundRules, undefined)
    };

    const savedGlobal = await saveEffectiveSettings(ctx.station.slug, ctx.active.id, updates);
    const effective = await readEffectiveSettings(ctx.station.slug, ctx.active.id);

    res.json({ ok: true, settings: { ...effective, station: stationToClient(ctx.station), broadcast: broadcastToClient(ctx.active) } });
  } catch (e) {
    res.status(500).json({ error: e.message || '설정 저장 실패' });
  }
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

app.get('/api/summary', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    const broadcastId = req.query.broadcastId || ctx.active.id;
    const settings = await readEffectiveSettings(ctx.station.slug, broadcastId);
    const donations = await readDonations(ctx.station.id, broadcastId);
    res.json(buildSummary(settings, donations, ctx.active, ctx.station));
  } catch (e) {
    res.status(500).json({ error: e.message || '합산 조회 실패' });
  }
});

app.post('/api/donations', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const ctx = await getStationContext(req, res);
    if (!ctx) return;
    if (!await operatorAllowed(req, ctx.station, ctx.active)) return res.status(401).json({ error: '방송 비밀번호 또는 방송국 관리자 권한이 필요합니다.' });

    const settings = await readEffectiveSettings(ctx.station.slug, ctx.active.id);
    const row = makeDonationRow(req.body || {}, settings, ctx.station.id, ctx.active.id);

    const { data, error } = await supabase.from('donations').insert(row).select().single();
    if (error) throw error;
    res.json({ ok: true, station: stationToClient(ctx.station), broadcast: broadcastToClient(ctx.active), donation: dbRowToDonation(data) });
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
        memo: r.memo
      }, settings, ctx.station.id, ctx.active.id);
    });

    const { data, error } = await supabase.from('donations').insert(created).select();
    if (error) throw error;

    res.json({ ok: true, station: stationToClient(ctx.station), broadcast: broadcastToClient(ctx.active), count: data.length, donations: data.map(dbRowToDonation) });
  } catch (e) {
    res.status(400).json({ error: e.message || '저장 실패' });
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