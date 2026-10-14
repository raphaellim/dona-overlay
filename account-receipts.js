'use strict';
// Captured bank receipts are the source of account totals; allocation rows only own creator totals.
function ledgerRows(donations,receipts){
 const seen=new Set(),valid=[];for(const r of receipts||[]){if(r.source!=='account'||r.status==='dismissed'||r.routing?.receiptFirst!==true||seen.has(r.id))continue;seen.add(r.id);valid.push(r);}
 return [...(donations||[]).filter(d=>!seen.has(d.captureId)),...valid.map(r=>({id:'receipt:'+r.id,captureId:r.id,donor:r.routing.receiptDonor||r.donor,creator:'',accountAmount:Number(r.amount),toonieAmount:0,totalAmount:Number(r.amount),createdAt:r.received_at,silentAlert:true}))];
}
function donorRows(rows,{normalize=s=>s,aggregate=n=>n,format=String}={}){
 const map=new Map();for(const row of rows||[]){const amount=Number(row.accountAmount||0);if(amount<=0)continue;const donor=normalize(row.donor);if(!donor)continue;const r=map.get(donor)||{donor,amount:0,latestAt:row.createdAt};r.amount+=aggregate(amount);r.amountText=format(r.amount);if(Date.parse(row.createdAt)>Date.parse(r.latestAt))r.latestAt=row.createdAt;map.set(donor,r);}
 return [...map.values()].sort((a,b)=>Date.parse(b.latestAt)-Date.parse(a.latestAt));
}
module.exports={ledgerRows,donorRows};
