const crypto = require('crypto');

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
      const result = await callback(accounts);
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
      const account = { id: channel.id, name: channel.snippet?.title || channel.id, emoji: old >= 0 ? accounts[old].emoji : '💗', secret: seal({ refreshToken: credentials.refresh_token, accessToken: credentials.access_token, expiresAt: Date.now() + credentials.expires_in * 1000 }) };
      if (old >= 0) accounts[old] = account; else accounts.push(account);
    });
    return pending.slug;
  }
  async function accounts(slug) {
    const store = await readStore();
    return (store[slug] || []).map(({ id, name, emoji }) => ({ id, name, emoji, connected: true }));
  }
  async function update(slug, id, emoji) {
    if (typeof emoji !== 'string' || emoji.length > 20) throw new Error('이모지는 20자 이내로 입력하세요.');
    await changeStore(slug, accounts => {
      const item = accounts.find(a => a.id === id);
      if (!item) throw new Error('연결된 계정이 없습니다.');
      item.emoji = emoji.trim();
    });
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
    if (!selected.length || selected.length !== ids.length || selected.length > 10) throw new Error('전송할 연결 계정을 1~10개 선택하세요.');
    if (typeof message !== 'string' || !message.trim() || message.length > 180) throw new Error('공용 멘트는 1~180자로 입력하세요.');
    const results = [];
    for (const a of selected) {
      try {
        const text = `${message.trim()} 업 ${a.emoji || ''}`.trim();
        await google('https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet', { method: 'POST', headers: { Authorization: `Bearer ${await access(a)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snippet: { liveChatId: target.liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: text } } }) });
        results.push({ accountId: a.id, name: a.name, ok: true });
      } catch (error) { results.push({ accountId: a.id, name: a.name, ok: false, error: error.message }); }
    }
    return { results };
  }
  return { configured, begin, finish, accounts, update, resolve, send };
}
module.exports = { createYoutubeChat };
