'use strict';
// Optional: existing finance receipt objects are separate from the SQL backup.
// Run in the server host with a mounted persistent RECEIPT_STORAGE_DIR.
const {Client}=require('pg'),{createClient}=require('@supabase/supabase-js'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const {SOURCE_DATABASE_URL,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,RECEIPT_STORAGE_DIR}=process.env;
 if(!SOURCE_DATABASE_URL||!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY||!RECEIPT_STORAGE_DIR)throw Error('Set SOURCE_DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and persistent RECEIPT_STORAGE_DIR on the host.');
 const db=new Client({connectionString:SOURCE_DATABASE_URL}),storage=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('broadcast-expense-receipts');
 try{await db.connect();const exists=await db.query("SELECT to_regclass('public.broadcast_expense_attachments') AS t");if(!exists.rows[0].t){console.log('No finance attachment table; no receipt objects to copy.');return;}
 const {rows}=await db.query('SELECT object_path,sha256,size_bytes FROM public.broadcast_expense_attachments');let count=0;
 for(const row of rows){const parts=row.object_path.split('/');if(parts.some(x=>!x||x==='.'||x==='..'||!/^[\w.-]+$/.test(x)))throw Error('Invalid object path');const dest=path.join(path.resolve(RECEIPT_STORAGE_DIR),...parts);let buffer;try{buffer=await fs.readFile(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!buffer){const got=await storage.download(row.object_path);if(got.error)throw Error('Source receipt download failed; keep Supabase available.');buffer=Buffer.from(await got.data.arrayBuffer());}
 if(buffer.length!==row.size_bytes||crypto.createHash('sha256').update(buffer).digest('hex')!==row.sha256)throw Error('Receipt integrity mismatch. No file overwritten.');
 await fs.mkdir(path.dirname(dest),{recursive:true});try{await fs.writeFile(dest,buffer,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}count++;
 }console.log(`Verified ${count} private receipt files. Back up this persistent directory separately.`);
 }finally{await db.end();}
})().catch(e=>{console.error(e.code||'Receipt transfer failed',e.message.replace(/postgres(?:ql)?:\/\/\S+/gi,'[connection hidden]'));process.exitCode=1;});
