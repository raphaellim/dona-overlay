const assert=require('node:assert/strict');
const {createYoutubeChat}=require('../youtube-chat');
let store={};let lock=Promise.resolve();const requests=[];
const supabase={
 from(){return {
  select(){return this},eq(){return this},
  async maybeSingle(){return {data:{data:structuredClone(store)}}},
  async upsert(row){store=structuredClone(row.data);return {error:null}}
 }}
};
let issued=0;const fetchImpl=async(url,options={})=>{requests.push({url,form:options.body instanceof URLSearchParams?Object.fromEntries(options.body):null});let data;
 if(url.includes('oauth2.googleapis.com/token'))data={refresh_token:'refresh-'+(++issued),access_token:'access-'+issued,expires_in:0};
 else if(url.includes('/channels'))data={items:[{id:'same-channel',snippet:{title:'Channel'}}]};
 else if(url.includes('/videos'))data={items:[{liveStreamingDetails:{activeLiveChatId:'live-chat'}}]};
 else data={id:'message'};return {ok:true,json:async()=>data};};
const service=createYoutubeChat({supabase,withSettingsMutation:fn=>{const next=lock.then(fn);lock=next.catch(()=>{});return next},namespace:'service',env:{YOUTUBE_CLIENT_ID:'SHARED.apps.googleusercontent.com',YOUTUBE_CLIENT_SECRET:'SHARED-SECRET',YOUTUBE_REDIRECT_URI:'https://example.test/api/youtube-chat-service/callback',YOUTUBE_CHAT_ENCRYPTION_KEY:'server-encryption-key'},fetchImpl});
(async()=>{
 assert.equal(await service.configured('a'),false);await assert.rejects(()=>service.begin('a'),/방송국/);
 await service.updateOAuth('a',{clientId:'a.apps.googleusercontent.com',clientSecret:'secret-a'});
 await service.updateOAuth('b',{clientId:'b.apps.googleusercontent.com',clientSecret:'secret-b'});
 assert.equal((await service.oauthInfo('a')).hasClientSecret,true);assert.equal(JSON.stringify(await service.oauthInfo('a')).includes('secret-a'),false);
 assert.equal(JSON.stringify(store).includes('secret-a'),false);assert.equal(JSON.stringify(store).includes('a.apps.googleusercontent.com'),false);
 const a=new URL(await service.begin('a')),b=new URL(await service.begin('b'));
 assert.equal(a.searchParams.get('client_id'),'a.apps.googleusercontent.com');assert.equal(b.searchParams.get('client_id'),'b.apps.googleusercontent.com');
 await service.finish(a.searchParams.get('state'),'code-a');await service.finish(b.searchParams.get('state'),'code-b');
 let grants=requests.filter(r=>r.form?.grant_type==='authorization_code');assert.equal(grants[0].form.client_secret,'secret-a');assert.equal(grants[1].form.client_secret,'secret-b');
 await service.accounts('a');await service.accounts('b');
 let refresh=requests.filter(r=>r.form?.grant_type==='refresh_token');assert.equal(refresh[0].form.client_id,'a.apps.googleusercontent.com');assert.equal(refresh[1].form.client_id,'b.apps.googleusercontent.com');
 await assert.rejects(()=>service.sendExact('unconfigured','video','same-channel','message'),/계정/);
 const oldState=new URL(await service.begin('a')).searchParams.get('state');
 await service.updateOAuth('a',{clientId:'a2.apps.googleusercontent.com',clientSecret:'secret-a2'});
 await assert.rejects(()=>service.finish(oldState,'code'),/변경/);
 let disconnected=await service.accounts('a');assert.equal(disconnected[0].connected,false);assert.equal((await service.accounts('b'))[0].connected,true);
 await assert.rejects(()=>service.sendExact('a','video','same-channel','message'),/다시 연결/);
 assert.equal(requests.some(r=>r.form?.client_id==='SHARED.apps.googleusercontent.com'),false);
 const before=await service.begin('b');await service.updateOAuth('b',{clientId:'b.apps.googleusercontent.com',clientSecret:''});await service.finish(new URL(before).searchParams.get('state'),'code-b2');
 console.log('PASS station OAuth isolation: no global fallback, encrypted storage, separate auth/refresh clients, secret masking, stale-state rejection, old-token rejection, other station unchanged, blank-secret preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
