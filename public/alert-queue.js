(function(root,factory){const Queue=factory();if(typeof module==='object'&&module.exports)module.exports=Queue;else root.DonationAlertQueue=Queue;})(typeof globalThis==='object'?globalThis:this,function(){
class Queue{
 constructor({show,hide,now=()=>Date.now(),limit=200}){this.show=show;this.hide=hide;this.now=now;this.limit=limit;this.queue=[];this.current=null;this.ids=new Set();this.mode='native';this.playback={known:false,busy:true};this.accountEnabled=true;this.remaining=0;this.started=0;}
 configure({mode,accountEnabled,playback}){this.mode=mode;this.accountEnabled=accountEnabled;this.playback=playback||{known:false,busy:true};if(this.mode==='native'&&this.current?.source==='toonie'){this.hide();this.current=null;}this.tick();}
 push(event){if(!event?.id||this.ids.has(event.id))return false;if(this.queue.length>=this.limit)return false;this.ids.add(event.id);if(this.ids.size>3000)this.ids.delete(this.ids.values().next().value);if(event.source==='account'&&!this.accountEnabled)return true;if(event.source==='toonie'&&this.mode==='native')return true;this.queue.push(event);this.tick();return true;}
 blocked(){return this.mode==='native'&&(!this.playback.known||this.playback.busy||!this.playback.at||this.now()-this.playback.at>15000);}
 tick(){if(this.blocked()){if(this.current){this.hide();this.queue.unshift(this.current);this.current=null;}return;}if(this.current||!this.queue.length)return;let index=this.mode==='internal'?this.queue.findIndex(r=>r.source==='toonie'):-1;if(index<0)index=0;const event=this.queue.splice(index,1)[0];if(event.source==='toonie'&&this.mode==='native')return this.tick();if(event.source==='account'&&!this.accountEnabled)return this.tick();this.current=event;this.show(event);}
 end(){if(!this.current)return;this.hide();this.current=null;this.tick();}
}
return Queue;
});
