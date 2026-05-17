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

function ensureDb() {
  if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ settings: defaultSettings(), donations: [] }, null, 2));
  }
}

function defaultSettings() {
  return {
    title: '도네이터 현황',
    titleImage: '',
    notice: '',
    columns: 4,
    maxCreators: 12,
    creators: ['떠기', '빵떠기', '수박', '열려'],
    prices: { smoke: 11900, nosmoke: 12000, eat: 14000, noeat: 15000 }
  };
}

function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    db.settings = { ...defaultSettings(), ...(db.settings || {}) };
    db.settings.prices = { ...defaultSettings().prices, ...(db.settings.prices || {}) };
    db.donations = Array.isArray(db.donations) ? db.donations : [];
    return db;
  } catch (e) {
    return { settings: defaultSettings(), donations: [] };
  }
}

function writeDb(db) {
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
  return Math.trunc(Number(won || 0) / 1000) / 10; // 12600 -> 1.2, 12900 -> 1.2
}

function displayManText(won) {
  return displayMan(won).toFixed(1).replace(/\.0$/, '');
}

function calcCheck(processType, amount, prices) {
  const result = { smoke: 0, nosmoke: 0, eat: 0, noeat: 0, label: '' };
  if (!processType || processType === '후원') {
    result.label = '후원';
    return result;
  }

  if (processType === '흡금') {
    if (amount > 0 && amount % prices.nosmoke === 0) {
      result.nosmoke = amount / prices.nosmoke;
      result.label = `금연 ${result.nosmoke}`;
    } else if (amount > 0 && amount % prices.smoke === 0) {
      result.smoke = amount / prices.smoke;
      result.label = `흡연 ${result.smoke}`;
    } else {
      result.label = '흡금 확인';
    }
  }

  if (processType === '먹먹마') {
    if (amount > 0 && amount % prices.noeat === 0) {
      result.noeat = amount / prices.noeat;
      result.label = `먹지마 ${result.noeat}`;
    } else if (amount > 0 && amount % prices.eat === 0) {
      result.eat = amount / prices.eat;
      result.label = `먹어 ${result.eat}`;
    } else {
      result.label = '먹먹마 확인';
    }
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
  if (total <= 0) throw new Error(`${creator}: 계좌금액 또는 투네금액을 입력하세요.`);

  const check = calcCheck(processType, total, settings.prices || defaultSettings().prices);
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
    resultLabel: check.label,
    memo: String(body.memo || '').trim()
  };
}

function buildSummary(db) {
  const settings = db.settings || defaultSettings();
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

function emptyCreator(name) {
  return { creator: name, account: 0, toonie: 0, total: 0, smoke: 0, nosmoke: 0, eat: 0, noeat: 0, rows: [] };
}
function emptyDonor(name) {
  return { donor: name, account: 0, toonie: 0, total: 0, latestProcess: '후원', rows: [] };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/settings', (req, res) => {
  const db = readDb();
  res.json(db.settings || defaultSettings());
});

app.post('/api/settings', checkAuth, (req, res) => {
  const db = readDb();
  const body = req.body || {};
  db.settings = {
    ...defaultSettings(),
    ...(db.settings || {}),
    title: String(body.title ?? db.settings?.title ?? '도네이터 현황'),
    titleImage: String(body.titleImage ?? db.settings?.titleImage ?? ''),
    notice: String(body.notice ?? db.settings?.notice ?? ''),
    columns: Math.max(1, Math.min(6, Number(body.columns || db.settings?.columns || 4))),
    maxCreators: Math.max(1, Math.min(50, Number(body.maxCreators || db.settings?.maxCreators || 12))),
    creators: Array.isArray(body.creators) ? body.creators.map(normName).filter(Boolean) : (db.settings?.creators || []),
    prices: {
      smoke: toWon(body.prices?.smoke ?? db.settings?.prices?.smoke ?? 11900),
      nosmoke: toWon(body.prices?.nosmoke ?? db.settings?.prices?.nosmoke ?? 12000),
      eat: toWon(body.prices?.eat ?? db.settings?.prices?.eat ?? 14000),
      noeat: toWon(body.prices?.noeat ?? db.settings?.prices?.noeat ?? 15000)
    }
  };
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

    // 상단 도네이터 총액: 계좌 / 투네 각각 입력
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

    // 크리에이터별 금액은 1칸만 받기 때문에 계좌/투네는 입력 순서대로 자동 배분
    // 예: 계좌총액 5만, 투네총액 3만 / A 4만, B 4만 => A 계좌4만, B 계좌1만+투네3만
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
