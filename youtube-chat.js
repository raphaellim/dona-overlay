const crypto = require('crypto');
const RANDOM_SUFFIXES = ['할짝할짝 😋💦', '츄릅츄릅 🤤💦', '낼름낼름 😛✨', '쫍쫍쫍 😘💋', '쭈압쭈압 😘💖', '굽신굽신 🙇‍♂️✨'];
const modeOf = a => ['random', 'manual', 'mixed', 'off'].includes(a.suffixMode) ? a.suffixMode : (a.emoji ? 'manual' : 'random');
const manualOf = a => String(a.manualSuffix ?? a.emoji ?? '').trim();
const DEFAULT_EMOJI_POOL = '❤️ 🧡 💛 💚 🩵 💙 💜 🩷 🤍 🌹 🌷 🌸 🌼 🌻 🪻 💐';
function normalizeOptions(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    randomOrder: true,
    varietyMode: raw.varietyMode !== false,
    emojiPool: typeof raw.emojiPool === 'string' ? raw.emojiPool : DEFAULT_EMOJI_POOL
  };
}
function emojisOf(options) {
  return options.emojiPool.trim().split(/[\s,]+/u).filter(Boolean);
}
function pickIcons(pool, count) {
  const available = [...pool], chosen = [];
  for (let i = 0; i < count; i++) chosen.push(available.splice(crypto.randomInt(available.length), 1)[0]);
  return chosen.join('');
}
function variedMessage(message, options) {
  const body = message.trim(), pool = emojisOf(options);
  const variant = body ? crypto.randomInt(3) : 2;
  if (variant === 2) return pickIcons(pool, 3);
  if (variant === 1) return `${body} ${pickIcons(pool, 2)}`;
  const width = crypto.randomInt(3, 11);
  return body.split(/(\s+)/u).map(part => part.trim() ? Array.from(part).join('ㅡ'.repeat(width)) : part).join('');
}
function shuffle(values) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function createYoutubeChat({ supabase, withSettingsMutation, env = process.env, fetchImpl = fetch }) {
  const states = new Map();
  const key = () => crypto.createHash('sha256').update(env.YOUTUBE_CHAT_ENCRYPTION_KEY).digest();
  const configured = () => !!(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REDIRECT_URI && env.YOUTUBE_CHAT_ENCRYPTION_KEY);
  const seal = value => {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map(x => x.toString('base64')).join('.');
  };
  const open = value => {
    const [iv, tag, body] = String(value).split('.').map(x => Buffer.from(x, 'base64'));
    const cipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(body), cipher.final()]).toString());
  };
  async function readStore() {
    const { data, error } = await supabase.from('settings').select('data').eq('id', 3).maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.data && typeof data.data === 'object' ? data.data : {};
  }
  async function changeStore(slug, callback) {
    return withSettingsMutation(async () => {
      const store = await readStore();
      const accounts = Array.isArray(store[slug]) ? store[slug] : [];
      const result = await callback(accounts, store);
      store[slug] = accounts;
      const { error } = await supabase.from('settings').upsert({ id: 3, data: store, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw error;
      return result;
    });
  }
  async function google(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(12000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || result.error_description || `Google API 오류 (${response.status})`);
    return result;
  }
  async function token(form) {
    return google('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, ...form }) });
  }
  function begin(slug) {
    if (!configured()) throw new Error('YouTube OAuth 환경변수 4개를 먼저 등록하세요.');
    const state = crypto.randomBytes(24).toString('hex');
    states.set(state, { slug, expires: Date.now() + 10 * 60 * 1000 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID, redirect_uri: env.YOUTUBE_REDIRECT_URI, response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.force-ssl', access_type: 'offline', prompt: 'consent select_account', state }).toString();
    return url.toString();
  }
  async function finish(state, code) {
    const pending = states.get(String(state)); states.delete(String(state));
    if (!pending || pending.expires < Date.now() || !code) throw new Error('인증 요청이 만료되었습니다. 다시 연결하세요.');
    const credentials = await token({ code, redirect_uri: env.YOUTUBE_REDIRECT_URI, grant_type: 'authorization_code' });
    if (!credentials.refresh_token) throw new Error('오프라인 승인 정보를 받지 못했습니다. Google 계정에서 권한을 확인하고 다시 승인하세요.');
    const channels = await google('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${credentials.access_token}` } });
    const channel = channels.items?.[0];
    if (!channel?.id) throw new Error('해당 Google 계정에 YouTube 채널이 없습니다.');
    await changeStore(pending.slug, accounts => {
      const old = accounts.findIndex(a => a.id === channel.id);
      const previous = old >= 0 ? accounts[old] : {};
      const account = { id: channel.id, name: channel.snippet?.title || channel.id, suffixMode: modeOf(previous), manualSuffix: manualOf(previous), secret: seal({ refreshToken: credentials.refresh_token, accessToken: credentials.access_token, expiresAt: Date.now() + credentials.expires_in * 1000 }) };
      if (old >= 0) accounts[old] = account; else accounts.push(account);
    });
    return pending.slug;
  }
  async function accounts(slug) {
    const store = await readStore();
    return (store[slug] || []).map(a => ({ id: a.id, name: a.name, suffixMode: modeOf(a), manualSuffix: manualOf(a), connected: true }));
  }
  async function options(slug) {
    const store = await readStore();
    return normalizeOptions(store.$chatOptions?.[slug]);
  }
  async function updateOptions(slug, input) {
    if (!input || ['randomOrder', 'varietyMode'].some(key => typeof input[key] !== 'boolean')) throw new Error('전송 옵션을 다시 확인하세요.');
    if (typeof input.emojiPool !== 'string' || input.emojiPool.length > 250) throw new Error('이모지 목록은 250자 이내로 입력하세요.');
    const pool = emojisOf(input);
    if (input.varietyMode && pool.length < 3) throw new Error('서로 다른 이모지를 3개 이상 입력하세요.');
    if (pool.length > 30 || pool.some(item => Array.from(item).length > 12)) throw new Error('이모지는 최대 30개, 각 항목은 12자 이내로 입력하세요.');
    const value = { randomOrder: true, varietyMode: input.varietyMode, emojiPool: input.emojiPool.trim() };
    await changeStore(slug, (_, store) => {
      if (!store.$chatOptions || typeof store.$chatOptions !== 'object') store.$chatOptions = {};
      store.$chatOptions[slug] = value;
    });
    return value;
  }
  async function update(slug, id, value) {
    const changes = value || {};
    if (changes.suffixMode !== undefined && !['random', 'manual', 'mixed', 'off'].includes(changes.suffixMode)) throw new Error('개별 멘트 방식을 선택하세요.');
    const manual = changes.manualSuffix ?? changes.emoji;
    if (manual !== undefined && (typeof manual !== 'string' || manual.length > 80)) throw new Error('개별 멘트는 80자 이내로 입력하세요.');
    await changeStore(slug, accounts => {
      const item = accounts.find(a => a.id === id);
      if (!item) throw new Error('연결된 계정이 없습니다.');
      if (changes.suffixMode !== undefined) item.suffixMode = changes.suffixMode;
      if (manual !== undefined) item.manualSuffix = manual.trim();
    });
  }
  async function updateAll(slug, value) {
    const mode = value?.suffixMode;
    if (!['random', 'manual', 'mixed', 'off'].includes(mode)) throw new Error('전체 설정을 선택하세요.');
    const manual = value?.manualSuffix;
    if (manual !== undefined && (typeof manual !== 'string' || manual.length > 80)) throw new Error('공통 수동 멘트는 80자 이내로 입력하세요.');
    await changeStore(slug, accounts => {
      for (const item of accounts) {
        item.suffixMode = mode;
        if ((mode === 'manual' || mode === 'mixed') && manual?.trim()) item.manualSuffix = manual.trim();
      }
    });
    return accounts(slug);
  }
  async function access(account) {
    const auth = open(account.secret);
    if (auth.expiresAt > Date.now() + 60000) return auth.accessToken;
    const fresh = await token({ grant_type: 'refresh_token', refresh_token: auth.refreshToken });
    if (!fresh.access_token) throw new Error('계정 재인증이 필요합니다.');
    return fresh.access_token;
  }
  async function resolve(slug, videoId) {
    const store = await readStore(), first = (store[slug] || [])[0];
    if (!first) throw new Error('채팅 계정을 먼저 연결하세요.');
    const data = await google(`https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${await access(first)}` } });
    const video = data.items?.[0];
    if (!video?.liveStreamingDetails?.activeLiveChatId) throw new Error('현재 라이브 채팅이 열려 있지 않습니다.');
    return { videoId, liveChatId: video.liveStreamingDetails.activeLiveChatId, title: video.snippet?.title || '' };
  }
  async function send(slug, videoId, ids, message) {
    const target = await resolve(slug, videoId);
    const store = await readStore(), selected = (store[slug] || []).filter(a => ids.includes(a.id));
    const settings = normalizeOptions(store.$chatOptions?.[slug]);
    if (!selected.length || selected.length !== ids.length || selected.length > 10) throw new Error('전송할 연결 계정을 1~10개 선택하세요.');
    if (typeof message !== 'string' || message.length > 180 || (!settings.varietyMode && !message.trim())) throw new Error('공용 멘트는 180자 이내로 입력하세요.');
    if (settings.varietyMode && emojisOf(settings).length < 3) throw new Error('서로 다른 이모지를 3개 이상 등록하세요.');
    const results = [];
    shuffle(selected);
    for (const a of selected) {
      try {
        let text;
        if (settings.varietyMode) text = variedMessage(message, settings);
        else {
          const mode = modeOf(a);
          const useManual = mode === 'manual' || (mode === 'mixed' && manualOf(a) && crypto.randomInt(2) === 0);
          const suffix = mode === 'off' ? '' : useManual ? manualOf(a) : RANDOM_SUFFIXES[crypto.randomInt(RANDOM_SUFFIXES.length)];
          if (mode === 'manual' && !suffix) throw new Error('수동 개별 멘트를 입력하세요.');
          text = `${message.trim()}${suffix ? ` ${suffix}` : ''}`;
        }
        if (Array.from(text).length > 200) throw new Error('장식과 개별 멘트를 합친 메시지가 너무 깁니다. 공용 멘트를 줄이세요.');
        await google('https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet', { method: 'POST', headers: { Authorization: `Bearer ${await access(a)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snippet: { liveChatId: target.liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: text } } }) });
        results.push({ accountId: a.id, name: a.name, ok: true, text });
      } catch (error) { results.push({ accountId: a.id, name: a.name, ok: false, error: error.message }); }
    }
    return { results };
  }
  return { configured, begin, finish, accounts, options, updateOptions, update, updateAll, resolve, send };
}
module.exports = { createYoutubeChat };
