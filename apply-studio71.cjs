'use strict';const fs=require('fs'),path=require('path'),file=process.argv[2]||path.join(__dirname,'server.js');let s=fs.readFileSync(file,'utf8');if(s.includes('/* studio-panel-v71 */'))process.exit(0);
const anchor='httpServer.listen(PORT, () => {';if(!s.includes(anchor))throw Error('서버 시작 연결 위치 확인 필요');
s=s.replace(anchor,"/* studio-panel-v71 */\nrequire('./studio-panel')(app,{getStationContext,stationAllowed,managerAllowed,stationTokenAllowed,readEffectiveSettings,saveEffectiveSettings,saveSharedStationSettings,normalizeKaraokeData,karaokeCarryoverData,normalizeBroadcastTimerData,withSettingsMutation,collectionWs,readGlobalSettings,effectiveSettingsFromGlobal,pickScopedSettings,normalizeSettings,pickStationSharedSettings,writeGlobalSettings});\n"+anchor);
const styleResponse='    return originalJson(body);';if(!s.includes(styleResponse))throw Error('스타일 송출 응답 위치 확인 필요');s=s.replace(styleResponse,`    if(body?.ok&&res.statusCode<300&&req.path==='/api/station-style'&&body.stationStyle)setImmediate(()=>collectionWs.notify(getStationSlug(req),'studioStyle',{timerOpacity:body.stationStyle.timerOpacity,karaokeOpacity:body.stationStyle.karaokeAlarmOpacity}).catch(()=>{}));
`+styleResponse);
const allow="'/mission-timer-overlay.html'";if(!s.includes(allow))throw Error('미션 타이머 소스 연결 위치 확인 필요');s=s.replace(allow,allow+",'/karaoke-alert.html'");
const timerStart=s.indexOf('function normalizeBroadcastTimerData(raw)');const timerEnd=s.indexOf('function missionTimerElapsedMs',timerStart);if(timerStart<0||timerEnd<0)throw Error('타이머 설정 위치 확인 필요');let timer=s.slice(timerStart,timerEnd);timer=timer.replace('    running: value.running === true,',`    alarmEnabled: value.alarmEnabled === true,
    alarmBeforeSec: Math.max(0,Math.min(86400,Number(value.alarmBeforeSec)||0)),
    alarmSound: require('./timer-alarm').sound(value.alarmSound),
    running: value.running === true,`);s=s.slice(0,timerStart)+timer+s.slice(timerEnd);
const buildStart=s.indexOf('function buildMissionTimerUpdate(');const buildEnd=s.indexOf("app.post('/api/mission-timer/save'",buildStart);let build=s.slice(buildStart,buildEnd);build=build.replace('    running,',`    alarmEnabled: has('alarmEnabled')?body.alarmEnabled===true:prev.alarmEnabled,
    alarmBeforeSec: has('alarmBeforeSec')?body.alarmBeforeSec:prev.alarmBeforeSec,
    alarmSound: has('alarmSound')?body.alarmSound:prev.alarmSound,
    running,`);s=s.slice(0,buildStart)+build+s.slice(buildEnd);
const styleStart=s.indexOf('function normalizeStationStyle(raw)');const styleEnd=s.indexOf('function normalizeSettings',styleStart);if(styleStart<0||styleEnd<0)throw Error('스타일 정규화 위치 확인 필요');let style=s.slice(styleStart,styleEnd);style=style.replace('    topSlideEnabled:',`    timerOpacity: num('timerOpacity',35,0,100),
    karaokeAlarmOpacity: num('karaokeAlarmOpacity',70,0,100),
    topSlideEnabled:`);s=s.slice(0,styleStart)+style+s.slice(styleEnd);
const mappings=[['capture-test.js',"const payload={station_id:station.id,source,event_id:eventId",`if(source==='toonie'){const stableId=require('./toonie-donor-key')(b.toonieDonorId);if(stableId)prepared.routing={...prepared.routing,toonieDonorId:stableId};}
 const payload={station_id:station.id,source,event_id:eventId`],['collection-review.js','captureId:candidate.id,targetId:r.targetId',"captureId:candidate.id,toonieDonorId:require('./toonie-donor-key')(candidate.routing?.toonieDonorId),targetId:r.targetId"]];
mappings.push(['collection-review.js','const routing={preservePresets:',"const routing={toonieDonorId:require('./toonie-donor-key')(row.routing?.toonieDonorId),preservePresets:"]);
const updates=new Map();for(const [name,from,to]of mappings){const target=path.join(path.dirname(file),name),text=updates.get(target)?.next||fs.readFileSync(target,'utf8');if(!text.includes(from))throw Error(name+' 후원자 ID 보존 연결 위치 확인 필요');updates.set(target,{target,text:updates.get(target)?.text||text,next:text.replace(from,to)});}
for(const u of updates.values()){fs.copyFileSync(u.target,u.target+'.before-studio71');fs.writeFileSync(u.target,u.next);}
fs.copyFileSync(file,file+'.before-studio71');fs.writeFileSync(file,s);
