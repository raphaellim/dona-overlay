'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
// Finance receipts stay private; URLs expire and are signed with a per-process key.
module.exports=function createReceiptStorage(app,{directory}){
 const root=directory&&path.resolve(directory),secret=crypto.randomBytes(32);
 function objectFile(bucket,object){if(bucket!=='broadcast-expense-receipts'||typeof object!=='string'||object.includes('\\'))throw Error('Invalid receipt path');const parts=object.split('/');if(parts.some(x=>!x||x==='.'||x==='..'||!/^[\w.-]+$/.test(x)))throw Error('Invalid receipt path');if(!root)throw Error('RECEIPT_STORAGE_DIR에 영구 볼륨 경로를 설정하세요.');return path.join(root,...parts);}
 const sign=s=>crypto.createHmac('sha256',secret).update(s).digest('base64url');
 const fail=e=>({data:null,error:{message:e.message}});
 app.get('/api/private-receipts/:token',async(req,res)=>{try{
  const [body,mac,...extra]=String(req.params.token).split('.');if(extra.length||!mac)throw Error('invalid');const expected=sign(body);if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw Error('invalid');const v=JSON.parse(Buffer.from(body,'base64url').toString());if(!Number.isFinite(v.exp)||v.exp<Date.now())throw Error('expired');const file=objectFile(v.bucket,v.object);await fs.access(file);res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment'});res.sendFile(file);
 }catch{res.status(404).json({error:'증빙 링크가 만료되었거나 파일이 없습니다.'});}});
 return {from:bucket=>({
  async upload(object,buffer,{upsert=false}={}){try{const file=objectFile(bucket,object);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,buffer,{flag:upsert?'w':'wx'});return {data:{path:object},error:null};}catch(e){return fail(e);}},
  async remove(objects){try{for(const object of objects)await fs.rm(objectFile(bucket,object),{force:true});return {data:[],error:null};}catch(e){return fail(e);}},
  async createSignedUrl(object,seconds){try{await fs.access(objectFile(bucket,object));const body=Buffer.from(JSON.stringify({bucket,object,exp:Date.now()+Math.min(60,seconds)*1000})).toString('base64url');return {data:{signedUrl:'/api/private-receipts/'+body+'.'+sign(body)},error:null};}catch(e){return fail(e);}}
 })};
};
