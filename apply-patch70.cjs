'use strict';
const fs=require('fs'),path=require('path'),dir=process.argv[2]||__dirname;
// Targeted edits only: never replace device pairing, session protocol or server configuration.
const jobs=[['server.js',s=>{
 const from="const newBroadcastMode=req.body.broadcastMode==='collab'||req.body.mode==='collab'?'collab':'solo';";
 if(!s.includes(from))throw Error('v68 방송 생성 연결을 확인하세요.');
 return s.replace(from,"/* station-basic-v70 */ const newBroadcastMode='solo';");
}],['bank-broadcast-session.js',s=>{
 const from="return {collectionProtocol:'broadcast-link-v1',";
 if(!s.includes(from))throw Error('방송 연결 응답 위치를 확인하세요.');
 return s.replace(from,"/* station-basic-v70 */ "+"return {creator:String(data.$broadcastDefaults?.[station.slug]?.creator||device.creator||''),collectionProtocol:'broadcast-link-v1',");
}],['bank-devices.js',s=>{
 const from='res.json(await saveAccount({...b,creator:d.creator},station));';
 if(!s.includes(from))throw Error('계좌 수집 전송 위치를 확인하세요.');
 return s.replace(from,"/* station-basic-v70 */ const stationDefault=await require('./broadcast-default-mode').read(supabase,station.slug);\n res.json(await saveAccount({...b,creator:stationDefault.creator||d.creator},station));");
}]];
const pending=[];for(const [name,edit] of jobs){const file=path.join(dir,name),old=fs.readFileSync(file,'utf8');if(old.includes('/* station-basic-v70 */'))continue;pending.push({file,old,next:edit(old)});}
for(const {file,old,next} of pending){if(!fs.existsSync(file+'.before-v70'))fs.writeFileSync(file+'.before-v70',old);fs.writeFileSync(file,next);}
console.log('v70 방송국 기본 설정 · 새 방송 갠방 연결 완료');
