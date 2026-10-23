'use strict';const fs=require('fs'),path=require('path'),file=process.argv[2]||path.join(__dirname,'server.js');let s=fs.readFileSync(file,'utf8');if(s.includes('/* mission-source-v63 */')){console.log('v63 미션 타이머 연결 유지');process.exit(0);}function replace(a,b){if(!s.includes(a))throw Error('v63 서버 연결 위치 확인 필요. 변경하지 않았습니다.');s=s.replace(a,b);}
replace("'/donation-alert.html'].includes(pathOnly)","'/donation-alert.html','/mission-timer-overlay.html'].includes(pathOnly)");
replace('    return originalJson(body);',`    // mission-source-v63-event: notify only after a successful persisted mutation.
    if(body?.ok&&res.statusCode<300&&(req.path.startsWith('/api/mission-timer/')||(req.path==='/api/settings'&&req.body?.broadcastTimerData))){
      const timer=body.broadcastTimerData||body.settings?.broadcastTimerData;
      if(timer)setImmediate(()=>collectionWs.notify(getStationSlug(req),'timer',{broadcastTimerData:timer,serverNow:Date.now()}).catch(e=>console.warn('[mission timer notify]',e?.name||'error')));
    }
    if(body?.ok&&res.statusCode<300&&(req.path.startsWith('/api/broadcasts/')||req.path.startsWith('/api/broadcast-timer/')))setImmediate(()=>collectionWs.notify(getStationSlug(req),'timer',{reload:true}).catch(()=>{}));
    return originalJson(body);`);
replace('httpServer.listen(PORT, () => {',`/* mission-source-v63 */
require('./timer-source')(app,{getStationContext,stationAllowed,stationTokenAllowed,readEffectiveSettings,normalizeBroadcastTimerData});
httpServer.listen(PORT, () => {`);fs.copyFileSync(file,file+'.before-v63');fs.writeFileSync(file,s);console.log('v63 미션 타이머 독립 소스·즉시 상태 전송 연결 완료');
