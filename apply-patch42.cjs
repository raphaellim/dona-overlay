'use strict';
// Run at the existing Node project root. Patch only exact integration points; never overwrite bank modules.
const fs=require('fs'),path=require('path');const file=path.resolve(process.argv[2]||'server.js');let source=fs.readFileSync(file,'utf8');
if(source.includes('/* donation patch 6.16.8.42 */')){console.log('v42 서버 연결이 이미 적용되어 있습니다.');process.exit(0);}
function replace(before,after){const matches=source.split(before).length-1;if(matches!==1)throw Error('서버 버전이 달라 자동 적용을 중지했습니다. 파일 변경 없음. 확인할 코드: '+before.slice(0,100));source=source.replace(before,after);}
for(const name of ['donor-ranking.js','ranking-ledger.js','alert-test-cart.js','alert-display-name.js'])if(!fs.existsSync(path.join(path.dirname(file),name)))throw Error(name+'를 서버 루트에 먼저 복사하세요.');
replace('const identityNotify=collectionWs.notify.bind(collectionWs);',`/* donation patch 6.16.8.42 */
const donorRanking=require('./donor-ranking')(app,{supabase,getStationContext,stationAllowed,stationTokenAllowed,withSettingsMutation,donorIdentity,notify:(...args)=>collectionWs.notify(...args),readRows:(station,active)=>require('./ranking-ledger')({supabase,station,active,dbRowToDonation,readAccountReceipts})});
require('./alert-test-cart')(app,{supabase,getStationContext,stationAllowed,readStudio:slug=>alertStudio.read(slug),notify:(...args)=>collectionWs.notify(...args)});
const identityNotify=collectionWs.notify.bind(collectionWs);`);
replace("collectionWs.notify=async(slug,type,payload)=>{try{", "collectionWs.notify=async(slug,type,payload)=>{try{\n if(['state','candidates','ranking'].includes(type))donorRanking.invalidate();");
replace("if(payload.source==='account'){const name=await donorIdentity.names(slug);payload={...payload,donor:name(payload.donor),donorDisplayResolved:true};}","if(payload.source==='account')payload=require('./alert-display-name').split(await donorIdentity.list(slug),payload);");
replace("source:candidate.source,donor:routing.donor,title:candidate.title", "source:candidate.source,originalDonor:candidate.donor,donor:routing.donor,title:candidate.title");
replace("receiptOnly:true,source:'account',donor:candidate.routing.receiptDonor||candidate.donor,title:candidate.title", "receiptOnly:true,source:'account',originalDonor:candidate.donor,donor:candidate.routing.receiptDonor||candidate.donor,title:candidate.title");
replace("'/overlay.html','/overlay3.html','/overlay2.html'", "'/donor-ranking.html','/overlay.html','/overlay3.html','/overlay2.html'");
const backup=file+'.before-v42';if(fs.existsSync(backup))throw Error('기존 백업이 있어 중지했습니다: '+backup);fs.copyFileSync(file,backup);fs.writeFileSync(file,source);console.log('v42 서버 연결 적용 완료. 원본 백업: '+path.basename(backup));
