'use strict';
function compact(state){return {...state,donations:[...(state.donations||[])].sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0)).slice(-160)};}
class Cache{constructor(){this.entries=new Map();this.epoch=0;}get(key){const e=this.entries.get(key);if(!e)return;if(e.until<Date.now()){this.entries.delete(key);return;}return e.value;}set(key,value,epoch){if(epoch!==this.epoch)return;this.entries.delete(key);this.entries.set(key,{value,until:Date.now()+1000});while(this.entries.size>25)this.entries.delete(this.entries.keys().next().value);}invalidate(){this.epoch++;this.entries.clear();}}
module.exports={compact,Cache};
