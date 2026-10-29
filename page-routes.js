'use strict';
// Only these obsolete public UI files are retired. Media/DB/upload files are never touched.
const aliases={
 '/donation-alert.html':'/sound-alert.html','/console.html':'/', '/livecatch-entry.html':'/',
 '/admin.html':'/?tab=donations','/m_admin.html':'/?tab=donations','/collection-review.html':'/?tab=donations',
 '/control.html':'/?tab=operate','/m_control.html':'/?tab=operate','/creator_index.html':'/','/manager_index.html':'/',
 '/station_style.html':'/overlay-appearance.html','/m_media_manager.html':'/media_manager.html',
 '/overlay.html':'/overlay3.html','/overlay2.html':'/overlay3.html','/overlay2_fixed.html':'/overlay3.html','/overlay_luxury_api.html':'/overlay3.html','/overlay_shorts.html':'/overlay3.html',
 '/overlay3-obs.html':'/overlay3.html?profile=obs','/overlay3-prism.html':'/overlay3.html?profile=prism',
 '/debug_overlay.html':'/overlay3.html?debug=1','/debug_settings.html':'/?tab=overlay',
 '/collection-test-preview.html':'/collection-test.html'
};
function register(app){for(const [old,target]of Object.entries(aliases))app.get(old,(req,res)=>{const url=new URL(target,'http://internal.invalid');for(const [k,v]of Object.entries(req.query||{}))if(!url.searchParams.has(k)&&typeof v==='string'&&v.length<2048)url.searchParams.set(k,v);res.set('Cache-Control','no-store');res.redirect(302,url.pathname+(url.search||''));});}
module.exports={register,aliases};
