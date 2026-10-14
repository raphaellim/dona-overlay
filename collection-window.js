'use strict';
function captureReason(live,event,broadcastId){
 if(!live||live.live!==true||live.status!=='live')return 'broadcast_not_live';
 const start=Math.max(Date.parse(live.startedAt),Date.parse(live.collectionStartedAt||live.startedAt)),received=Date.parse(event.receivedAt);
 if(!Number.isFinite(start)||!Number.isFinite(received)||received<start)return 'outside_broadcast_window';
 if(event.broadcastId&&String(event.broadcastId)!==String(broadcastId))return 'previous_broadcast';
 if(event.replay)return 'replay';
 return '';
}
module.exports={captureReason};
