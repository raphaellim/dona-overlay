const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

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
    notice: '',
    overlaySections: { account: true, notice: false, creators: true },
    columns: 4,
    maxCreators: 12,
    creators: ['빵떠기', '또영', '수박', '몰라', '익명'],
    presets: defaultPresets(),
    prices: { smoke: 11900, nosmoke: 12000, eat: 14000, noeat: 15000 }
  };
}

function normName(v) {
  return String(v || '').replace(/\u00A0/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toWon(v) {
  const raw = String(v ?? '').trim().replace(/,/g, '');
  if (!raw) return 0;

  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;

  // 운영 편의 입력:
  // 20  => 20,000원
  // 6.6 => 6,600원
  // 11900 => 11,900원
  if (Math.abs(n) > 0 && Math.abs(n) < 1000) {
    return Math.round(n * 1000);
  }

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
    minusPrice: Math.max(0, toWon(p?.minusPrice ?? defaults.minusPrice))
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
    notice: String(raw.notice ?? base.notice),
    overlaySections: normalizeOverlaySections(raw.overlaySections, base.overlaySections),
    columns: Math.max(1, Math.min(6, Number(raw.columns || base.columns))),
    maxCreators: Math.max(1, Math.min(50, Number(raw.maxCreators || base.maxCreators))),
    creators: Array.isArray(raw.creators) ? raw.creators.map(normName).filter(Boolean) : base.creators,
    presets,
    prices: {
      smoke: smoke.plusPrice,
      nosmoke: smoke.minusPrice,
      eat: food.plusPrice,
      noeat: food.minusPrice
    }
  };
}

function checkAuth(req, res, next) {
  const pw = req.headers['x-admin-password'] || req.body?.password || req.query?.password;
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: '관리자 비밀번호가 틀렸습니다.' });
  next();
}

function requireDb(res) {
  if (!supabase) {
    res.status(500).json({ error: 'Supabase 환경변수가 설정되지 않았습니다.' });
    return false;
  }
  return true;
}

async function readSettings() {
  const { data, error } = await supabase.from('settings').select('data').eq('id', 1).single();
  if (error && error.code !== 'PGRST116') throw error;

  if (!data) {
    const settings = defaultSettings();
    await writeSettings(settings);
    return settings;
  }
  return normalizeSettings(data.data);
}

async function writeSettings(settings) {
  const normalized = normalizeSettings(settings);
  const { error } = await supabase
    .from('settings')
    .upsert({ id: 1, data: normalized, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
  return normalized;
}

/* 방송 세션 */
function broadcastToClient(row) {
  return {
    id: row.id,
    title: row.title,
    isActive: row.is_active,
    createdAt: row.created_at,
    endedAt: row.ended_at || null,
    memo: row.memo || ''
  };
}

async function ensureActiveBroadcast() {
  let { data, error } = await supabase
    .from('broadcasts')
    .select('*')
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
    .insert({ title, is_active: true })
    .select()
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function listBroadcasts() {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(broadcastToClient);
}

async function setActiveBroadcast(id) {
  const active = await supabase.from('broadcasts').update({ is_active: false }).eq('is_active', true);
  if (active.error) throw active.error;

  const { data, error } = await supabase
    .from('broadcasts')
    .update({ is_active: true, ended_at: null })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
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

function makeDonationRow(body, settings, broadcastId) {
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

async function readDonations(broadcastId) {
  let q = supabase.from('donations').select('*').order('created_at', { ascending: true });
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

function buildSummary(settings, donations, broadcast) {
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

  // 계좌후원 롤링용: 같은 도네이터는 1번만 표시하고 계좌금액 합산
  const accountDonorMap = new Map();
  for (const item of accountDonors) {
    const key = normName(item.donor) || '익명';
    if (!accountDonorMap.has(key)) {
      accountDonorMap.set(key, {
        donor: key,
        amount: 0,
        amountText: '0',
        latestAt: item.createdAt
      });
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
    broadcast: broadcast ? broadcastToClient(broadcast) : null,
    creators: creatorRows,
    donors: donorRows,
    accountDonors: accountDonorSummary,
    accountDonorDetails: accountDonors,
    donations
  };
}

/* 기본 API */
app.get('/api/health', (req, res) => res.json({ ok: true, storage: 'supabase', sessions: true, supabaseConfigured: !!supabase }));

/* 방송 세션 API */
app.get('/api/broadcasts', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const active = await ensureActiveBroadcast();
    const broadcasts = await listBroadcasts();
    res.json({ active: broadcastToClient(active), broadcasts });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송 목록 조회 실패' });
  }
});

app.post('/api/broadcasts', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const title = normName(req.body.title);
    if (!title) return res.status(400).json({ error: '방송 제목을 입력하세요.' });

    if (req.body.activate !== false) {
      const off = await supabase.from('broadcasts').update({ is_active: false }).eq('is_active', true);
      if (off.error) throw off.error;
    }

    const { data, error } = await supabase
      .from('broadcasts')
      .insert({ title, memo: String(req.body.memo || ''), is_active: req.body.activate !== false })
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, broadcast: broadcastToClient(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '방송 생성 실패' });
  }
});

app.post('/api/broadcasts/:id/activate', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const data = await setActiveBroadcast(req.params.id);
    res.json({ ok: true, active: broadcastToClient(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '현재 방송 선택 실패' });
  }
});

app.post('/api/broadcasts/:id/end', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const { data, error } = await supabase
      .from('broadcasts')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, broadcast: broadcastToClient(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '방송 종료 실패' });
  }
});

app.delete('/api/broadcasts/:id', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;

    const { data: target, error: readError } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (readError) throw readError;
    if (target?.is_active) {
      return res.status(400).json({ error: '현재 방송은 삭제할 수 없습니다. 다른 방송을 현재 방송으로 선택한 뒤 삭제하세요.' });
    }

    const delDonations = await supabase
      .from('donations')
      .delete()
      .eq('broadcast_id', req.params.id);
    if (delDonations.error) throw delDonations.error;

    const delBroadcast = await supabase
      .from('broadcasts')
      .delete()
      .eq('id', req.params.id);
    if (delBroadcast.error) throw delBroadcast.error;

    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    res.status(500).json({ error: e.message || '방송 삭제 실패' });
  }
});

/* 설정 */
app.get('/api/settings', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const settings = await readSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message || '설정 조회 실패' });
  }
});

app.post('/api/settings', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const old = await readSettings();
    const body = req.body || {};

    const settings = normalizeSettings({
      ...old,
      title: String(body.title ?? old.title ?? '도네이터 현황'),
      titleImage: String(body.titleImage ?? old.titleImage ?? ''),
      notice: String(body.notice ?? old.notice ?? ''),
      overlaySections: normalizeOverlaySections(body.overlaySections, old.overlaySections),
      columns: body.columns ?? old.columns,
      maxCreators: body.maxCreators ?? old.maxCreators,
      creators: Array.isArray(body.creators) ? body.creators.map(normName).filter(Boolean) : old.creators,
      presets: Array.isArray(body.presets) ? body.presets : old.presets
    });

    const saved = await writeSettings(settings);
    res.json({ ok: true, settings: saved });
  } catch (e) {
    res.status(500).json({ error: e.message || '설정 저장 실패' });
  }
});

/* 후원/합산: 모두 현재 활성 방송 기준 */
app.get('/api/donations', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const active = await ensureActiveBroadcast();
    const broadcastId = req.query.broadcastId || active.id;
    const donations = await readDonations(broadcastId);
    res.json({ broadcast: broadcastToClient(active), donations });
  } catch (e) {
    res.status(500).json({ error: e.message || '후원 조회 실패' });
  }
});

app.get('/api/summary', async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const settings = await readSettings();
    const active = await ensureActiveBroadcast();
    const broadcastId = req.query.broadcastId || active.id;
    const donations = await readDonations(broadcastId);
    res.json(buildSummary(settings, donations, active));
  } catch (e) {
    res.status(500).json({ error: e.message || '합산 조회 실패' });
  }
});

app.post('/api/donations', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const settings = await readSettings();
    const active = await ensureActiveBroadcast();
    const row = makeDonationRow(req.body || {}, settings, active.id);

    const { data, error } = await supabase.from('donations').insert(row).select().single();
    if (error) throw error;
    res.json({ ok: true, broadcast: broadcastToClient(active), donation: dbRowToDonation(data) });
  } catch (e) {
    res.status(400).json({ error: e.message || '저장 실패' });
  }
});

app.post('/api/donations/batch', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const settings = await readSettings();
    const active = await ensureActiveBroadcast();

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
      }, settings, active.id);
    });

    const { data, error } = await supabase.from('donations').insert(created).select();
    if (error) throw error;

    res.json({ ok: true, broadcast: broadcastToClient(active), count: data.length, donations: data.map(dbRowToDonation) });
  } catch (e) {
    res.status(400).json({ error: e.message || '저장 실패' });
  }
});

app.delete('/api/donations/:id', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const { error } = await supabase.from('donations').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    res.status(500).json({ error: e.message || '삭제 실패' });
  }
});

app.post('/api/reset', checkAuth, async (req, res) => {
  try {
    if (!requireDb(res)) return;
    const active = await ensureActiveBroadcast();
    const broadcastId = req.body.broadcastId || active.id;
    const { error } = await supabase.from('donations').delete().eq('broadcast_id', broadcastId);
    if (error) throw error;
    res.json({ ok: true, broadcastId });
  } catch (e) {
    res.status(500).json({ error: e.message || '현재 방송 데이터 초기화 실패' });
  }
});

app.get('/', (req, res) => res.redirect('/admin.html'));

app.listen(PORT, () => {
  console.log(`Donation Supabase Session server running on port ${PORT}`);
});
