'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const locks=new Map();
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function commit(file,original,writeName){
 const dir=path.dirname(file.path),previous=locks.get(dir)||Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
  const names=(await fs.promises.readdir(dir)).filter(n=>/^[-a-z0-9]+\.(png|jpg|jpeg|webp|gif|mp3|wav|ogg)$/i.test(n)&&n!==file.filename);
  const digest=await hash(file.path);
  for(const name of names){const candidate=path.join(dir,name);let stat;try{stat=await fs.promises.stat(candidate);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(stat.size===file.size&&await hash(candidate)===digest){await fs.promises.unlink(file.path);return {name,duplicate:true};}}
  if(names.length>=1000)throw Error('파일은 방송국당 1,000개까지입니다. 미사용 파일을 삭제하세요');
  await writeName(file.filename,original);return {name:file.filename,duplicate:false};
 }).catch(async e=>{await fs.promises.unlink(file.path).catch(()=>{});throw e;});
 locks.set(dir,task);try{return await task;}finally{if(locks.get(dir)===task)locks.delete(dir);}
}
module.exports={commit};
