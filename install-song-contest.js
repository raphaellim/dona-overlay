'use strict';
const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(process.argv[2]||'.');const file=path.join(target,'server.js');
if(!fs.existsSync(file))throw Error('server.js가 있는 서버 루트 폴더에서 실행하세요.');
let src=fs.readFileSync(file,'utf8');const mark="require('./song-contest')(app,";
if(src.includes(mark)){console.log('노래대회 연결 코드가 이미 있습니다. 모듈 파일 갱신 후 서버를 재시작하세요.');process.exit(0);}
for(const name of ['getStationContext','stationAllowed','stationTokenAllowed','supabase'])if(!src.includes(name))throw Error('이 서버 구조는 자동 연결 대상이 아닙니다: '+name);
const anchor='app.use(accessGuard);';if(src.split(anchor).length!==2)throw Error('연결 위치를 유일하게 찾지 못했습니다. server.js는 변경하지 않았습니다.');
const backup=file+'.before-song-contest-'+Date.now()+'.bak';fs.copyFileSync(file,backup);
src=src.replace(anchor,anchor+"\n// 노래대회: 방송국 관리자 권한 / 방송국 토큰 / 별도 DB 저장\nrequire('./song-contest')(app,{supabase,getStationContext,stationAllowed,stationTokenAllowed});");fs.writeFileSync(file,src);console.log('연결 완료. 원본 백업: '+path.basename(backup));
