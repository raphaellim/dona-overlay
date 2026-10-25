'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),express=require('express');
test('Finance receipts: private storage, signed download, invalid token, path traversal and missing volume',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'receipts-'));const app=express();const storage=require('../private-receipt-storage')(app,{directory:root});const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));const base='http://127.0.0.1:'+s.address().port,b=storage.from('broadcast-expense-receipts');
 try{assert.equal((await b.upload('station/expense/proof.pdf',Buffer.from('%PDF-test'))).error,null);
 assert.ok((await b.upload('../outside',Buffer.from('bad'))).error);
 assert.ok((await b.upload('station/expense/proof.pdf',Buffer.from('overwrite'))).error);
 const u=await b.createSignedUrl('station/expense/proof.pdf',60);const res=await fetch(base+u.data.signedUrl);assert.equal(res.status,200);assert.equal(await res.text(),'%PDF-test');assert.equal(res.headers.get('cache-control'),'private, no-store');
 assert.equal((await fetch(base+u.data.signedUrl+'x')).status,404);
 const expired=await b.createSignedUrl('station/expense/proof.pdf',-1);assert.equal((await fetch(base+expired.data.signedUrl)).status,404);
 await b.remove(['station/expense/proof.pdf']);assert.ok((await b.createSignedUrl('station/expense/proof.pdf',60)).error);
 const missing=require('../private-receipt-storage')(express(),{});assert.ok((await missing.from('broadcast-expense-receipts').upload('x',Buffer.from('x'))).error);
 }finally{await new Promise(r=>s.close(r));await fs.rm(root,{recursive:true,force:true});}
});
