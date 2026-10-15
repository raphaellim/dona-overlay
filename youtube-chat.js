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
  if (crypto.randomInt(2) === 1) return `${body} ${pickIcons(pool, 2)}`;
  const width = crypto.randomInt(1, 4);
  return body.split(/(\s+)/u).map(part => part.trim() ? Array.from(part).join('ㅡ'.repeat(width)) : part).join('');
}
function shuffle(values) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function createYoutubeChat({ supabase, withSettingsMutation, env = process.env, fetchImpl = fetch, namespace = '' }) {
  const states = new Map();
  const stationOAuth = namespace === 'service';
  const storeKey = slug => namespace ? `${namespace}:${slug}` : slug;
  const key = () => crypto.createHash('sha256').update(env.YOUTUBE_CHAT_ENCRYPTION_KEY).digest();
  async function configured(slug) {try {await clientConfig(slug);return true;}catch (_) {return false;}}
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
      const storageKey = storeKey(slug);
      const accounts = Array.isArray(store[storageKey]) ? store[storageKey] : [];
      const result = await callback(accounts, store);
      store[storageKey] = accounts;
      const { error } = await supabase.from('settings').upsert({ id: 3, data: store, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) throw error;
      return result;
    });
  }
  function requireSlug(slug) {if(typeof slug !== 'string' || !slug.trim())throw new Error('방송국을 선택하세요.');return slug;}
  async function clientConfig(slug) {
    if(!env.YOUTUBE_CHAT_ENCRYPTION_KEY || !env.YOUTUBE_REDIRECT_URI)throw new Error('서버의 OAuth 암호화 키·콜백 주소 설정이 필요합니다.');
    if(!stationOAuth) {
      if(!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET)throw new Error('YouTube OAuth 설정이 필요합니다.');
      return {clientId:env.YOUTUBE_CLIENT_ID,clientSecret:env.YOUTUBE_CLIENT_SECRET,redirectUri:env.YOUTUBE_REDIRECT_URI,revision:'legacy'};
    }
    requireSlug(slug);const store=await readStore();const encrypted=Object.hasOwn(store.$oauthClients||{},storeKey(slug))?store.$oauthClients[storeKey(slug)]:null;
    if(!encrypted)throw new Error('이 방송국의 Google Cloud OAuth 설정을 먼저 저장하세요.');
    const value=open(encrypted);
    if(!value.clientId || !value.clientSecret || !value.revision)throw new Error('방송국 OAuth 설정을 다시 저장하세요.');
    return {...value,redirectUri:env.YOUTUBE_REDIRECT_URI};
  }
  async function updateOAuth(slug,input) {
    if(!stationOAuth)throw new Error('운영채팅 전용 설정입니다.');requireSlug(slug);
    if(!env.YOUTUBE_CHAT_ENCRYPTION_KEY || !env.YOUTUBE_REDIRECT_URI)throw new Error('서버 OAuth 암호화 키·콜백 주소 설정이 필요합니다.');
    const clientId=String(input?.clientId||'').trim(),secret=String(input?.clientSecret||'').trim();
    if(clientId.length>300 || !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId))throw new Error('Google OAuth 클라이언트 ID를 확인하세요.');
    if(secret.length>2000)throw new Error('클라이언트 보안 비밀번호를 확인하세요.');
    await changeStore(slug,(_,store)=>{
      if(!store.$oauthClients || typeof store.$oauthClients!=='object')store.$oauthClients={};
      const old=Object.hasOwn(store.$oauthClients,storeKey(slug))?open(store.$oauthClients[storeKey(slug)]):null;
      const clientSecret=secret || (old?.clientId===clientId?old.clientSecret:'');
      if(!clientSecret)throw new Error('클라이언트 보안 비밀번호를 입력하세요.');
      const changed=!old || old.clientId!==clientId || old.clientSecret!==clientSecret;
      store.$oauthClients[storeKey(slug)]=seal({clientId,clientSecret,revision:changed?crypto.randomUUID():old.revision});
    });
    return oauthInfo(slug);
  }
  async function google(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(12000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error?.message || result.error_description || `Google API 오류 (${response.status})`);
      error.reason = result.error?.errors?.[0]?.reason;
      throw error;
    }
    return result;
  }
  async function token(form,config) {
    return google('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...form }) });
  }
  // Railway/Render처럼 OAuth 왕복 중 인스턴스가 재시작될 수 있는 환경에서는
  // state를 메모리 Map에만 저장하면 callback에서 '인증 요청이 만료'가 발생할 수 있습니다.
  // 암호화된 stateless state에 방송국/만료시각/namespace를 넣어 callback이 다른 인스턴스로
  // 들어와도 검증할 수 있게 합니다. 기존 메모리 state도 호환용으로 유지합니다.
  function makeOAuthState(slug,revision) {
    const payload = {
      type: 'youtube-oauth-state-v1',
      revision,
      slug: String(slug || 'default'),
      namespace: String(namespace || ''),
      expires: Date.now() + 10 * 60 * 1000,
      nonce: crypto.randomBytes(12).toString('hex')
    };
    return seal(payload);
  }
  function readOAuthState(value) {
    const raw = String(value || '');
    if (!raw) return null;
    try {
      const payload = open(raw);
      if (payload?.type !== 'youtube-oauth-state-v1') return null;
      if (String(payload.namespace || '') !== String(namespace || '')) return null;
      if (!payload.slug || Number(payload.expires || 0) < Date.now()) return null;
      return { slug: String(payload.slug), expires: Number(payload.expires), revision:payload.revision };
    } catch (_) {
      // 구버전 state(메모리 Map) 호환
      const pending = states.get(raw);
      states.delete(raw);
      return pending || null;
    }
  }
  async function oauthInfo(slug) {
    let config;try{config=await clientConfig(slug);}catch(_){}
    return {configured:!!config,namespace:String(namespace||''),stationScoped:stationOAuth,
      clientId:config?.clientId||'',hasClientSecret:!!config?.clientSecret,redirectUri:String(env.YOUTUBE_REDIRECT_URI||'')};
  }
  async function begin(slug) {
    const config=await clientConfig(slug);
    const state=makeOAuthState(slug,config.revision);
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'https://www.googleapis.com/auth/youtube.force-ssl',access_type:'offline',prompt:'consent select_account',state}).toString();
    return url.toString();
  }
  async function finish(state, code) {
    const pending = readOAuthState(state);
    if (!pending || pending.expires < Date.now() || !code) throw new Error('인증 요청이 만료되었습니다. 다시 연결하세요.');
    const config=await clientConfig(pending.slug);
    if(stationOAuth && pending.revision!==config.revision)throw new Error('Google Cloud 설정이 변경되었습니다. 다시 연결하세요.');
    const credentials = await token({ code, redirect_uri: config.redirectUri, grant_type: 'authorization_code' },config);
    if (!credentials.refresh_token) throw new Error('오프라인 승인 정보를 받지 못했습니다. Google 계정에서 권한을 확인하고 다시 승인하세요.');
    const channels = await google('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${credentials.access_token}` } });
    const channel = channels.items?.[0];
    if (!channel?.id) throw new Error('해당 Google 계정에 YouTube 채널이 없습니다.');
    await changeStore(pending.slug, (accounts,store) => {
      if(stationOAuth && open(store.$oauthClients[storeKey(pending.slug)]).revision!==config.revision)throw new Error('OAuth 설정이 변경되었습니다. 다시 연결하세요.');
      const old = accounts.findIndex(a => a.id === channel.id);
      const previous = old >= 0 ? accounts[old] : {};
      const account = { id: channel.id, name: channel.snippet?.title || channel.id, suffixMode: modeOf(previous), manualSuffix: manualOf(previous), secret: seal({ oauthRevision:config.revision, refreshToken: credentials.refresh_token, accessToken: credentials.access_token, expiresAt: Date.now() + credentials.expires_in * 1000 }) };
      if (old >= 0) accounts[old] = account; else accounts.push(account);
    });
    return pending.slug;
  }
  async function accounts(slug) {
    const store = await readStore();
    const saved = store[storeKey(slug)] || [];
    const result = [];
    for (const a of saved) {
      let connected = true, authError = '';
      try { await access(slug, a); }
      catch (e) { connected = false; authError = /expired|revoked|invalid_grant|재인증/i.test(String(e.message||'')) ? '인증 만료 · 다시 연결 필요' : String(e.message||'연결 확인 실패'); }
      result.push({ id: a.id, name: a.name, suffixMode: modeOf(a), manualSuffix: manualOf(a), connected, authError });
    }
    return result;
  }
  async function options(slug) {
    const store = await readStore();
    return normalizeOptions(store.$chatOptions?.[storeKey(slug)]);
  }
  async function donationAuto(slug) {
    const store = await readStore();
    const v = store.$donationAuto?.[storeKey(slug)] || {};
    return { enabled: v.enabled === true, liveUrl: String(v.liveUrl || ''), accountId: String(v.accountId || ''), firstEnabled: v.firstEnabled !== false, secondEnabled: v.secondEnabled !== false, firstTemplate: String(v.firstTemplate || '💸 {후원자} {금액} {방식} → {분배} {프리셋}'), secondTemplate: String(v.secondTemplate || '{누적}'), statusSelections: Array.isArray(v.statusSelections) && v.statusSelections.length ? v.statusSelections.filter(x => ['cumulative','preset','allowance'].includes(x)) : ['cumulative'], repeatEnabled: v.repeatEnabled === true, repeatMinutes: Math.max(1, Number(v.repeatMinutes || 10)) };
  }
  async function updateDonationAuto(slug, input) {
    const prev = await donationAuto(slug);
    const selections = Array.isArray(input?.statusSelections) ? input.statusSelections.filter(x => ['cumulative','preset','allowance'].includes(x)) : prev.statusSelections;
    const value = { enabled: input?.enabled === true, liveUrl: String(input?.liveUrl || '').trim(), accountId: String(input?.accountId || '').trim(), firstEnabled: input?.firstEnabled !== false, secondEnabled: input?.secondEnabled !== false, firstTemplate: String(input?.firstTemplate || '💸 {후원자} {금액} {방식} → {분배} {프리셋}').trim(), secondTemplate: String(input?.secondTemplate || '{누적}').trim(), statusSelections: selections?.length ? selections : ['cumulative'], repeatEnabled: input?.repeatEnabled === true, repeatMinutes: Math.max(1, Number(input?.repeatMinutes || 10)) };
    if (value.firstTemplate.length > 180 || value.secondTemplate.length > 180) throw new Error('자동 채팅 문구는 각각 180자 이내로 입력하세요.');
    if (value.enabled && !value.firstEnabled && !value.secondEnabled) throw new Error('1차 또는 2차 자동 메시지 중 하나는 켜주세요.');
    if (value.enabled && !value.liveUrl) throw new Error('자동 후원 채팅에 사용할 라이브 주소를 입력하세요.');
    if (value.enabled && !value.accountId) throw new Error('자동 후원 채팅에 사용할 계정을 선택하세요.');
    if (value.liveUrl) {
      let u; try { u = new URL(value.liveUrl); } catch (_) { throw new Error('유효한 유튜브 라이브 주소를 입력하세요.'); }
      if (!/youtube\.com$|youtu\.be$/i.test(u.hostname.replace(/^www\./,''))) throw new Error('유튜브 라이브 주소를 입력하세요.');
    }
    await changeStore(slug, (_, store) => {
      if (!store.$donationAuto || typeof store.$donationAuto !== 'object') store.$donationAuto = {};
      store.$donationAuto[storeKey(slug)] = value;
    });
    return value;
  }
  async function sendExact(slug, videoId, accountId, message) {
    const store = await readStore();
    const account = (store[storeKey(slug)] || []).find(a => a.id === accountId);
    if (!account) throw new Error('자동 채팅 계정을 다시 선택하세요.');
    const target = await resolve(slug, videoId, accountId);
    const text = String(message || '').trim();
    if (!text || Array.from(text).length > 200) throw new Error('자동 채팅 메시지가 비어 있거나 너무 깁니다.');
    await google('https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet', { method: 'POST', headers: { Authorization: `Bearer ${await access(slug, account)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snippet: { liveChatId: target.liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: text } } }) });
    return { ok: true, accountId: account.id, name: account.name, text };
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
      store.$chatOptions[storeKey(slug)] = value;
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
  async function access(slug, account) {
    const config=await clientConfig(slug);
    const auth = open(account.secret);
    if(stationOAuth && auth.oauthRevision!==config.revision)throw new Error('방송국 전용 Google Cloud 설정으로 계정을 다시 연결하세요.');
    if (auth.expiresAt > Date.now() + 60000 && auth.accessToken) return auth.accessToken;
    let fresh;
    try { fresh = await token({ grant_type: 'refresh_token', refresh_token: auth.refreshToken },config); }
    catch (e) {
      if (/expired|revoked|invalid_grant/i.test(String(e.message||''))) throw new Error('YouTube 인증이 만료되었거나 취소되었습니다. 이 계정을 다시 연결하세요.');
      throw e;
    }
    if (!fresh.access_token) throw new Error('YouTube 계정 재인증이 필요합니다.');
    const nextAuth = { oauthRevision:config.revision, refreshToken: fresh.refresh_token || auth.refreshToken, accessToken: fresh.access_token, expiresAt: Date.now() + Number(fresh.expires_in || 3600) * 1000 };
    const nextSecret = seal(nextAuth);
    await changeStore(slug, accounts => { const item = accounts.find(x => x.id === account.id); if (item) item.secret = nextSecret; });
    account.secret = nextSecret;
    return fresh.access_token;
  }
  async function resolve(slug, videoId, accountId = '') {
    const store = await readStore();
    const saved = store[storeKey(slug)] || [];
    const account = accountId ? saved.find(a => a.id === accountId) : saved[0];
    if (!account) throw new Error(accountId ? '선택한 YouTube 계정을 찾을 수 없습니다. 계정을 다시 선택하세요.' : '채팅 계정을 먼저 연결하세요.');
    const data = await google(`https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${await access(slug, account)}` } });
    const video = data.items?.[0];
    if (!video?.liveStreamingDetails?.activeLiveChatId) throw new Error('현재 라이브 채팅이 열려 있지 않습니다.');
    return { videoId, liveChatId: video.liveStreamingDetails.activeLiveChatId, title: video.snippet?.title || '' };
  }
  async function send(slug, videoId, ids, message) {
    const target = await resolve(slug, videoId, Array.isArray(ids) && ids.length ? ids[0] : '');
    const store = await readStore(), selected = (store[storeKey(slug)] || []).filter(a => ids.includes(a.id));
    const settings = normalizeOptions(store.$chatOptions?.[storeKey(slug)]);
    if (!selected.length || selected.length !== ids.length || selected.length > 10) throw new Error('전송할 연결 계정을 1~10개 선택하세요.');
    if (typeof message !== 'string' || !message.trim() || message.length > 180) throw new Error('공용 멘트는 1~180자로 입력하세요.');
    if (settings.varietyMode && emojisOf(settings).length < 3) throw new Error('서로 다른 이모지를 3개 이상 등록하세요.');
    const results = [];
    shuffle(selected);
    let quotaStopped = false;
    for (const a of selected) {
      if (quotaStopped) {
        results.push({ accountId: a.id, name: a.name, ok: false, skipped: true, error: '할당량 초과로 전송하지 않았습니다.' });
        continue;
      }
      try {
        const mode = modeOf(a);
        const useManual = mode === 'manual' || (mode === 'mixed' && manualOf(a) && crypto.randomInt(2) === 0);
        const suffix = mode === 'off' ? '' : useManual ? manualOf(a) : RANDOM_SUFFIXES[crypto.randomInt(RANDOM_SUFFIXES.length)];
        if (mode === 'manual' && !suffix) throw new Error('수동 개별 멘트를 입력하세요.');
        const body = settings.varietyMode && !useManual ? variedMessage(message, settings) : message.trim();
        const text = `${body}${suffix ? ` ${suffix}` : ''}`;
        if (Array.from(text).length > 200) throw new Error('장식과 개별 멘트를 합친 메시지가 너무 깁니다. 공용 멘트를 줄이세요.');
        await google('https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet', { method: 'POST', headers: { Authorization: `Bearer ${await access(slug, a)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snippet: { liveChatId: target.liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: text } } }) });
        results.push({ accountId: a.id, name: a.name, ok: true, text });
      } catch (error) {
        if (['quotaExceeded', 'dailyLimitExceeded'].includes(error.reason) || /exceeded.*quota|quota.*exceeded/i.test(error.message)) quotaStopped = true;
        results.push({ accountId: a.id, name: a.name, ok: false, error: error.message });
      }
    }
    return { results };
  }
  return { configured, oauthInfo, updateOAuth, begin, finish, accounts, options, updateOptions, donationAuto, updateDonationAuto, sendExact, update, updateAll, resolve, send };
}
module.exports = { createYoutubeChat };
