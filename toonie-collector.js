// Optional server-side Toonation widget collector. Requires Playwright Chromium.
const crypto = require('crypto');

function validWidgetUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'https:' && u.hostname === 'toon.at' && /^\/widget\/alertbox\/[a-zA-Z0-9]+\/?$/.test(u.pathname)
      ? u.href : '';
  } catch { return ''; }
}

function parseAlert(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean || /테스트/i.test(clean)) return null;
  const match = clean.match(/(.{1,100}?)님(?:이)?\s*([\d,]+)\s*캐시/);
  if (!match) return null;
  const donor = match[1].trim().replace(/^(?:VIP|[♛♚👑]\s*)+/, '').trim();
  const amount = Number(match[2].replace(/,/g, ''));
  if (!donor || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1e9) return null;
  return { donor, amount, message: clean.slice(0, 300), signature: clean };
}

function startToonieCollector({ listSources, port, token }) {
  const sources = new Map();
  let browser = null;
  let playwright;
  try { playwright = require('playwright'); }
  catch { console.warn('Toonie collector disabled: install Playwright and Chromium.'); return; }
  if (!token) { console.warn('Toonie collector disabled: AUTO_DONATION_TOKEN missing.'); return; }

  async function closeSource(slug) {
    const old = sources.get(slug);
    sources.delete(slug);
    if (old) { clearInterval(old.timer); await old.page.close().catch(() => {}); }
  }
  async function openSource(slug, url) {
    if (!browser) browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ javaScriptEnabled: true });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const state = { page, url, last: '', lastAt: 0, busy: false, timer: null };
    state.timer = setInterval(async () => {
      if (state.busy) return;
      state.busy = true;
      try {
        const text = await page.evaluate(() => document.body?.innerText || '');
        const event = parseAlert(text);
        if (!event) { if (!String(text || '').trim()) state.last = ''; return; }
        const now = Date.now();
        if (event.signature === state.last && now - state.lastAt < 60000) return;
        state.last = event.signature; state.lastAt = now;
        const eventId = `widget:${crypto.randomUUID()}`;
        const response = await fetch(`http://127.0.0.1:${port}/api/auto-donations/toonie`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-auto-donation-token': token },
          body: JSON.stringify({ station: slug, eventId, donor: event.donor, amount: event.amount,
            message: event.message, receivedAt: new Date(now).toISOString() })
        });
        if (!response.ok) console.warn('Toonie registration failed:', slug, response.status);
      } catch (error) {
        console.warn('Toonie widget read failed:', slug, error.message);
      } finally { state.busy = false; }
    }, 700);
    sources.set(slug, state);
  }
  async function sync() {
    try {
      const wanted = new Map((await listSources()).map(x => [x.slug, validWidgetUrl(x.url)]).filter(x => x[1]));
      for (const [slug, old] of sources) if (wanted.get(slug) !== old.url) await closeSource(slug);
      for (const [slug, url] of wanted) if (!sources.has(slug)) {
        try { await openSource(slug, url); }
        catch (error) { console.warn('Toonie widget connect failed:', slug, error.message); }
      }
    } catch (error) { console.warn('Toonie source sync failed:', error.message); }
  }
  let syncing = false;
  const reconcile = async () => { if (syncing) return; syncing = true; try { await sync(); } finally { syncing = false; } };
  setTimeout(reconcile, 3000);
  setInterval(reconcile, 30000);
  return { sync: reconcile, status: slug => sources.has(slug) ? 'connected' : 'disconnected' };
}

module.exports = { validWidgetUrl, parseAlert, startToonieCollector };
