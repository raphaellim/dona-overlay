const crypto = require('crypto');

const DEFAULT_TEMPLATE = '💗 {donor}님 → {details} | 총 {total}원 후원!{process}';
const SEND_INTERVAL_MS = 5300;

function normalizeChatSettings(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    enabled: raw.enabled === true,
    template: String(raw.template ?? DEFAULT_TEMPLATE).trim().slice(0, 400) || DEFAULT_TEMPLATE
  };
}

function cleanText(value) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildChatMessage(rows, settings) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const valid = rows.filter(row => Number(row.total_amount || 0) > 0);
  if (!valid.length) return '';
  // 합산 화면과 같이 후원 행마다 1,000원 미만을 절삭합니다.
  const rounded = row => Math.trunc(Number(row.total_amount || 0) / 1000) * 1000;
  const total = valid.reduce((sum, row) => sum + rounded(row), 0);
  const details = valid.map(row => `${cleanText(row.creator)} ${rounded(row).toLocaleString('ko-KR')}원`).join(' / ');
  const processType = cleanText(valid[0].process_type);
  const fields = {
    donor: cleanText(valid[0].donor), details,
    creator: valid.length === 1 ? cleanText(valid[0].creator) : cleanText(valid.map(row => row.creator).join(' / ')),
    amount: valid.length === 1 ? rounded(valid[0]).toLocaleString('ko-KR') : total.toLocaleString('ko-KR'),
    total: total.toLocaleString('ko-KR'),
    process: processType && processType !== '후원' ? ` · ${processType}` : ''
  };
  const template = normalizeChatSettings(settings).template;
  const message = template.replace(/\{(donor|details|creator|amount|total|process)\}/g, (_, key) => fields[key]);
  return cleanText(message).slice(0, 400);
}

function createNightbotChat({ supabase, withSettingsMutation, fetchImpl = fetch, env = process.env, logger = console }) {
  const states = new Map();
  const pending = [];
  const seen = new Set();
  let pumping = false;
  let lastAttemptAt = 0;
  const refreshInFlight = new Map();

  function configured() {
    return !!(env.NIGHTBOT_CLIENT_ID && env.NIGHTBOT_CLIENT_SECRET && env.NIGHTBOT_REDIRECT_URI && env.NIGHTBOT_TOKEN_ENCRYPTION_KEY);
  }
  function key() {
    return crypto.createHash('sha256').update(env.NIGHTBOT_TOKEN_ENCRYPTION_KEY).digest();
  }
  function seal(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${bytes.toString('base64')}`;
  }
  function unseal(value) {
    const [iv, tag, bytes] = String(value || '').split('.');
    if (!iv || !tag || !bytes) throw new Error('Nightbot 인증 정보를 읽을 수 없습니다. 연결을 다시 설정하세요.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(bytes, 'base64')), decipher.final()]).toString('utf8'));
  }
  async function readStore() {
    const { data, error } = await supabase.from('settings').select('data').eq('id', 2).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.data && typeof data.data === 'object' ? data.data : {};
  }
  async function readAuth(stationSlug) {
    const store = await readStore();
    return store[stationSlug] ? unseal(store[stationSlug]) : null;
  }
  async function saveAuth(stationSlug, auth) {
    await withSettingsMutation(async () => {
      const store = await readStore();
      if (auth) store[stationSlug] = seal(auth);
      else delete store[stationSlug];
      const { error } = await supabase.from('settings').upsert({ id: 2, data: store, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw error;
    });
  }
  async function exchange(form) {
    const response = await fetchImpl('https://api.nightbot.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.NIGHTBOT_CLIENT_ID, client_secret: env.NIGHTBOT_CLIENT_SECRET, ...form }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Nightbot 인증 실패 (${response.status})`);
    return await response.json();
  }
  function begin(stationSlug) {
    if (!configured()) throw new Error('Render에 Nightbot OAuth 환경변수 4개를 먼저 등록하세요.');
    const state = crypto.randomBytes(24).toString('hex');
    states.set(state, { stationSlug, expires: Date.now() + 10 * 60 * 1000 });
    const url = new URL('https://api.nightbot.tv/oauth2/authorize');
    url.search = new URLSearchParams({ response_type: 'code', client_id: env.NIGHTBOT_CLIENT_ID, redirect_uri: env.NIGHTBOT_REDIRECT_URI, scope: 'channel_send', state }).toString();
    return url.toString();
  }
  async function finish(state, code) {
    const pendingState = states.get(String(state));
    states.delete(String(state));
    if (!pendingState || pendingState.expires < Date.now() || !code) throw new Error('연결 요청이 만료되었습니다. 설정에서 다시 연결하세요.');
    const token = await exchange({ grant_type: 'authorization_code', code, redirect_uri: env.NIGHTBOT_REDIRECT_URI });
    if (!token.access_token || !token.refresh_token || !String(token.scope || '').split(' ').includes('channel_send')) {
      throw new Error('Nightbot 채팅 전송 권한을 받지 못했습니다.');
    }
    await saveAuth(pendingState.stationSlug, {
      accessToken: token.access_token, refreshToken: token.refresh_token,
      expiresAt: Date.now() + Number(token.expires_in ?? 2592000) * 1000
    });
    return pendingState.stationSlug;
  }
  async function status(stationSlug) {
    if (!configured()) return { configured: false, connected: false };
    return { configured: true, connected: !!await readAuth(stationSlug) };
  }
  async function accessToken(stationSlug) {
    const auth = await readAuth(stationSlug);
    if (!auth) return null;
    if (auth.expiresAt > Date.now() + 60 * 1000) return auth.accessToken;
    if (!refreshInFlight.has(stationSlug)) {
      const task = (async () => {
        const latest = await readAuth(stationSlug);
        if (latest?.expiresAt > Date.now() + 60 * 1000) return latest.accessToken;
        const token = await exchange({ grant_type: 'refresh_token', refresh_token: latest.refreshToken });
        if (!token.access_token) throw new Error('Nightbot 토큰 갱신 실패');
        await saveAuth(stationSlug, {
          accessToken: token.access_token,
          refreshToken: token.refresh_token || latest.refreshToken,
          expiresAt: Date.now() + Number(token.expires_in ?? 2592000) * 1000
        });
        return token.access_token;
      })().finally(() => refreshInFlight.delete(stationSlug));
      refreshInFlight.set(stationSlug, task);
    }
    return refreshInFlight.get(stationSlug);
  }
  function enqueue(stationSlug, rows, settings) {
    if (!normalizeChatSettings(settings).enabled || !configured()) return;
    const ids = rows.map(row => String(row.id || '')).filter(Boolean);
    if (ids.length !== rows.length || ids.every(id => seen.has(id))) return;
    const message = buildChatMessage(rows, settings);
    if (!message) return;
    ids.forEach(id => seen.add(id));
    if (seen.size > 10000) seen.clear();
    pending.push({ stationSlug, message });
    void pump();
  }
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (pending.length) {
        const item = pending.shift();
        try {
          const token = await accessToken(item.stationSlug);
          if (!token) throw new Error('Nightbot 채널 연결이 없습니다.');
          const wait = Math.max(0, SEND_INTERVAL_MS - (Date.now() - lastAttemptAt));
          if (wait) await new Promise(resolve => setTimeout(resolve, wait));
          lastAttemptAt = Date.now();
          const response = await fetchImpl('https://api.nightbot.tv/1/channel/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: item.message }),
            signal: AbortSignal.timeout(10000)
          });
          if (!response.ok) throw new Error(`Nightbot 채팅 전송 실패 (${response.status})`);
        } catch (error) {
          logger.error(`[Nightbot] ${item.stationSlug}: ${error.message}`);
        }
      }
    } finally { pumping = false; }
  }
  return { begin, finish, status, disconnect: slug => saveAuth(slug, null), enqueue };
}

module.exports = { createNightbotChat, normalizeChatSettings, buildChatMessage, DEFAULT_TEMPLATE };
