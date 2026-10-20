'use strict';
module.exports=async function({supabase,station,active,dbRowToDonation,readAccountReceipts}){
 const rows=[];for(let offset=0;;offset+=1000){const {data,error}=await supabase.from('donations').select('id,donor,account_amount,toonie_amount,created_at,checks').eq('station_id',station.id).eq('broadcast_id',active.id).order('id').range(offset,offset+999);if(error)throw error;rows.push(...(data||[]).map(dbRowToDonation));if((data||[]).length<1000)break;}
 const receipts=await readAccountReceipts(station.id,active.id);return require('./account-receipts').ledgerRows(rows,receipts);
};
