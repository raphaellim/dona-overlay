const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function defaultPresets() {
  return [
    {
      id: 'smoke',
      enabled: true,
      title: '펴피지마',
      plusName: '흡연',
      plusPrice: 11900,
      minusName: '금연',
      minusPrice: 12000
    },
    {
      id: 'food',
      enabled: true,
      title: '먹먹마',
      plusName: '먹어',
      plusPrice: 14000,
      minusName: '먹지마',
      minusPrice: 15000
    }
  ];
}

function defaultSettings() {
  return {
    title: '도네이터 현황',
    titleImage: '',
    notice: '',
    columns: 4,
    maxCreators: 12,
    creators: ['빵떠기', '또영', '수박', '몰라', '익명'],
    presets: defaultPresets(),
    // 구버전 호환용
    prices: { smoke: 11900, nosmoke: 12000, eat: 14000, noeat: 15000 }
  };
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

function normalizeSettings(settings) {
  const base = defaultSettings();
  const raw = settings || {};

  // 구버전 prices만 있던 경우 presets 생성
  let presets = Array.isArray(raw.presets) && raw.presets.length
    ? raw.presets
    : [
        {
          ...base.presets[0],
          plusPrice: raw.prices?.smoke ?? base.presets[0].plusPrice,
          minusPrice: raw.prices?.nosmoke ?? base.presets[0].minusPrice
        },
        {
          ...base.presets[1],
          plusPrice: raw.prices?.eat ?? base.presets[1].plusPrice,
          minusPrice: raw.prices?.noeat ?? base.presets[1].minusPrice
        }
      ];

  presets = presets.map((p, idx) => normalizePreset(p, idx));

  // 최소 2개 기본 프리셋 유지
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

function ensureDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ settings: defaultSettings(), donations: [] }, null, 2));
  }
}

function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    db.settings = normalizeSettings(db.settings);
    db.donations = Array.isArray(db.donations) ? db.donations : [];
    return db;
  } catch (e) {
    return { settings: defaultSettings(), donations: [] };
  }
}

function writeDb(db) {
  db.settings = normalizeSettings(db.settings);
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function checkAuth(req, res, next) {
  const pw = req.headers['x-admin-password'] || req.body?.password || req.query?.password;
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: '관리자 비밀번호가 틀렸습니다.' });
  next();
}

function normName(v) {
  return String(v || '').replace(/\u00A0/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toWon(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function displayMan(won) {
  return Math.trunc(Number(won || 0) / 1000) / 10;
}

function displayManText(won) {
  return displayMan(won).toFixed(1).replace(/\.0$/, '');
}

function findPreset(settings, processType) {
  const value = normName(processType);
  if (!value || value === '후원') return null;
  const presets = settings.presets || defaultPresets();
  return presets.find(p =>
    p.enabled &&
    (p.id === value || p.title === value || p.plusName === value || p.minusName === value)
  ) || null;
}

function calcCheck(processType, amount, settings) {
  const result = {
    smoke: 0,
    nosmoke: 0,
    eat: 0,
    noeat: 0,
    checks: [],
    label: '후원'
  };

  const preset = findPreset(settings, processType);
  if (!preset) return result;

  const plusPrice = Number(preset.plusPrice || 0);
  const minusPrice = Number(preset.minusPrice || 0);

  let side = null;
  let count = 0;

  // 마이너스 단가 우선: 24000이면 금연2 / 30000이면 먹지마2
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

  // 기존 overlay/summary 호환용 필드
  if (preset.id === 'smoke') {
    if (side === 'plus') result.smoke = count;
    else result.nosmoke = count;
  } else if (preset.id === 'food') {
    if (side === 'plus') result.eat = count;
    else result.noeat = count;
  }

  return result;
}

function makeDonationRow(body, settings) {
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
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    donor,
    creator,
    processType,
    accountAmount,
    toonieAmount,
    totalAmount: total,
    displayAmount: displayManText(total),
    smoke: check.smoke,
    nosmoke: check.nosmoke,
    eat: check.eat,
    noeat: check.noeat,
    checks: check.checks,
    resultLabel: check.label,
    memo: String(body.memo || '').trim()
  };
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
      target.presetNets[key] = {
        presetId: ch.presetId,
        presetTitle: ch.presetTitle,
        plusName: '',
        minusName: '',
        plus: 0,
        minus: 0,
        net: 0
      };
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

function buildSummary(db) {
  const settings = normalizeSettings(db.settings);
  const creators = new Map();
  const donors = new Map();
  const accountDonors = [];

  for (const name of settings.creators || []) {
    const key = normName(name);
    if (key) creators.set(key, emptyCreator(key));
  }

  for (const d of db.donations || []) {
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

    const normalizedRow = {
      ...d,
      accountAmount: account,
      toonieAmount: toonie,
      totalAmount: total,
      displayAmount: displayManText(total)
    };

    c.account += account;
    c.toonie += toonie;
    c.total += total;
    c.smoke += Number(d.smoke || 0);
    c.nosmoke += Number(d.nosmoke || 0);
    c.eat += Number(d.eat || 0);
    c.noeat += Number(d.noeat || 0);
    addPresetCheck(c, d);
    c.rows.push(normalizedRow);

    dn.account += account;
    dn.toonie += toonie;
    dn.total += total;
    dn.latestProcess = d.processType || '후원';
    dn.rows.push(normalizedRow);

    if (account > 0) {
      accountDonors.push({
        id: d.id,
        createdAt: d.createdAt,
        donor,
        creator,
        amount: account,
        amountText: displayManText(account)
      });
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

  return {
    settings,
    creators: creatorRows,
    donors: donorRows,
    accountDonors: accountDonors.slice(0, 10),
    donations: db.donations || []
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/settings', (req, res) => {
  const db = readDb();
  res.json(db.settings);
});

app.post('/api/settings', checkAuth, (req, res) => {
  const db = readDb();
  const body = req.body || {};
  const old = db.settings || defaultSettings();

  db.settings = normalizeSettings({
    ...old,
    title: String(body.title ?? old.title ?? '도네이터 현황'),
    titleImage: String(body.titleImage ?? old.titleImage ?? ''),
    notice: String(body.notice ?? old.notice ?? ''),
    columns: body.columns ?? old.columns,
    maxCreators: body.maxCreators ?? old.maxCreators,
    creators: Array.isArray(body.creators) ? body.creators.map(normName).filter(Boolean) : old.creators,
    presets: Array.isArray(body.presets) ? body.presets : old.presets
  });

  writeDb(db);
  res.json({ ok: true, settings: db.settings });
});

app.get('/api/summary', (req, res) => {
  const db = readDb();
  res.json(buildSummary(db));
});

app.get('/api/donations', (req, res) => {
  const db = readDb();
  res.json({ donations: db.donations || [] });
});

app.post('/api/donations', checkAuth, (req, res) => {
  try {
    const db = readDb();
    const settings = db.settings || defaultSettings();
    const row = makeDonationRow(req.body || {}, settings);
    db.donations = db.donations || [];
    db.donations.push(row);
    writeDb(db);
    res.json({ ok: true, donation: row });
  } catch (e) {
    res.status(400).json({ error: e.message || '저장 실패' });
  }
});

app.post('/api/donations/batch', checkAuth, (req, res) => {
  try {
    const db = readDb();
    const settings = db.settings || defaultSettings();

    const donor = normName(req.body.donor);
    const processType = normName(req.body.processType) || '후원';

    const accountTotal = toWon(req.body.accountTotal ?? req.body.accountAmountTotal ?? req.body.accountAmount);
    const toonieTotal = toWon(req.body.toonieTotal ?? req.body.toonationTotal ?? req.body.toonieAmountTotal ?? req.body.toonieAmount);
    const grandTotal = accountTotal + toonieTotal;

    const inputRows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (!donor) return res.status(400).json({ error: '도네이터명을 입력하세요.' });
    if (grandTotal <= 0) return res.status(400).json({ error: '상단 계좌금액 또는 투네금액을 입력하세요.' });

    const validRows = inputRows
      .map(r => ({
        creator: normName(r.creator),
        amount: toWon(r.amount ?? r.totalAmount ?? r.value),
        memo: String(r.memo || req.body.memo || '').trim()
      }))
      .filter(r => r.creator && r.amount > 0);

    if (!validRows.length) {
      return res.status(400).json({ error: '크리에이터별 금액을 1개 이상 입력하세요.' });
    }

    const splitTotal = validRows.reduce((sum, r) => sum + r.amount, 0);
    if (splitTotal !== grandTotal) {
      return res.status(400).json({
        error: `상단 총액과 크리에이터별 금액 합계가 다릅니다. 상단 합계 ${displayManText(grandTotal)}, 분배 합계 ${displayManText(splitTotal)}`
      });
    }

    let remainAccount = accountTotal;
    let remainToonie = toonieTotal;

    const created = validRows.map(r => {
      const accountPart = Math.min(remainAccount, r.amount);
      remainAccount -= accountPart;

      const tooniePart = r.amount - accountPart;
      remainToonie -= tooniePart;

      return makeDonationRow({
        donor,
        creator: r.creator,
        processType,
        accountAmount: accountPart,
        toonieAmount: tooniePart,
        memo: r.memo
      }, settings);
    });

    db.donations = db.donations || [];
    db.donations.push(...created);
    writeDb(db);

    res.json({
      ok: true,
      count: created.length,
      accountTotal,
      toonieTotal,
      total: grandTotal,
      donations: created
    });
  } catch (e) {
    res.status(400).json({ error: e.message || '저장 실패' });
  }
});

app.delete('/api/donations/:id', checkAuth, (req, res) => {
  const db = readDb();
  const before = (db.donations || []).length;
  db.donations = (db.donations || []).filter(d => d.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true, deleted: before - db.donations.length });
});

app.post('/api/reset', checkAuth, (req, res) => {
  const db = readDb();
  db.donations = [];
  writeDb(db);
  res.json({ ok: true });
});

app.get('/', (req, res) => res.redirect('/admin.html'));

app.listen(PORT, () => {
  ensureDb();
  console.log(`Donation JSON server running on port ${PORT}`);
});
