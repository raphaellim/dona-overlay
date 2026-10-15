'use strict';
const keys=['account','notice','creators','funding','karaoke','broadcastTimer','media','allowance','presets'];
async function saveDisplay({supabase,ctx,mode,sections,readEffectiveSettings,saveEffectiveSettings}){
 if(!['combined','selected','slideshow'].includes(mode)||!Array.isArray(sections)||sections.some(k=>!keys.includes(k)))throw Error('표시 항목 확인 필요');
 const selected=[...new Set(sections)];
 // Legacy controls and modern console read the same persisted section switches.
 const settings=await readEffectiveSettings(ctx.station.slug,ctx.active.id);const overlaySections={...settings.overlaySections};for(const key of keys)overlaySections[key]=selected.includes(key);
 await saveEffectiveSettings(ctx.station.slug,ctx.active.id,{overlaySections});
 const {error}=await supabase.from('station_alert_preferences').upsert({station_id:ctx.station.id,display_mode:mode,selected_sections:selected});if(error)throw error;return selected;
}
async function syncLegacy({supabase,ctx,sections}){const {data,error}=await supabase.from('station_alert_preferences').select('*').eq('station_id',ctx.station.id).maybeSingle();if(error)throw error;const selected=new Set(data?.selected_sections||['account','creators']);for(const key of keys)if(Object.prototype.hasOwnProperty.call(sections,key)){if(sections[key])selected.add(key);else selected.delete(key);}const saved=await supabase.from('station_alert_preferences').upsert({station_id:ctx.station.id,selected_sections:[...selected]});if(saved.error)throw saved.error;return [...selected];}
module.exports={keys,saveDisplay,syncLegacy};
