'use strict';
const fs=require('fs'),path=require('path');
const file=process.argv[2]||path.join(__dirname,'server.js');let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function normalizeFundingData(raw) {'),end=source.indexOf('\nfunction ',start+1);
if(start<0||end<0)throw Error('펀딩 정규화 함수 위치를 확인하세요. 서버는 변경하지 않았습니다.');
let part=source.slice(start,end);
if(!part.includes('funding-color-v54')){const anchor='      current: Math.max(0, Number(f.current || 0)),';if(!part.includes(anchor))throw Error('펀딩 함수 버전을 확인하세요. 서버는 변경하지 않았습니다.');part=part.replace(anchor,"      // funding-color-v54: preserve validated per-funding presentation only.\n      color: /^#[0-9a-f]{6}$/i.test(String(f.color || '')) ? String(f.color) : '',\n"+anchor);fs.copyFileSync(file,file+'.before-v54');source=source.slice(0,start)+part+source.slice(end);fs.writeFileSync(file,source);}
console.log('v54 펀딩 색상 저장 연결 완료');
