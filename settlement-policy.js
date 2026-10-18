'use strict';
const ratios=['10:0','9:1','8:2','7:3','6:4'];
function item(v={}){if(!ratios.includes(v.ratio))throw Error('정산 비율을 확인하세요');if(typeof v.tax!=='boolean')throw Error('3.3% 공제 설정을 확인하세요');return {ratio:v.ratio,tax:v.tax};}
function validate(v){const defaults=item(v),creators=Object.create(null);const entries=Object.entries(v.creators||{});if(entries.length>300)throw Error('방송인 설정은 300명까지입니다');for(const [name,value]of entries){if(!name||name.length>100||['__proto__','constructor','prototype'].includes(name))throw Error('방송인 이름 확인 필요');creators[name]=item(value);}return {...defaults,creators};}
function calculate(income,deduction,policy){const [a,b]=policy.ratio.split(':').map(Number),share=Math.floor(income*a/(a+b)),tax=policy.tax?Math.floor(share*33/1000):0;return {ratio:policy.ratio,taxEnabled:policy.tax,share,platformShare:income-share,tax,deduction,final:share-tax-deduction};}
module.exports={validate,calculate,defaults:{ratio:'8:2',tax:true,creators:{}}};
