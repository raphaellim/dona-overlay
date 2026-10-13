(()=>{'use strict';const q=new URLSearchParams(location.search);if(q.get('demo')==='1')return;
document.getElementById('broadcastTimerBox')?.removeAttribute('data-v5-hidden');
const ids={account:'accountBox',notice:'noticeBox',creators:'creatorBox',funding:'fundingBox',karaoke:'karaokeBox',media:'topSlideBox'};
const style=document.createElement('style');style.textContent='[data-v5-hidden="1"]{display:none!important}.overlay-box.hidden[data-v5-hidden="0"]{display:block!important}.v5-combined{background:rgba(10,14,23,.88)!important;border:1px solid #b89b59!important;border-radius:14px!important;padding:10px!important}.v5-combined>.overlay-box{background:transparent!important;border:0!important;border-bottom:1px solid #ffffff22!important;border-radius:0!important}';document.head.append(style);
let config=null,index=0,timer;
function apply(){if(!config)return;const selected=config.selectedSections.filter(key=>document.getElementById(ids[key]));const key=selected[index%Math.max(1,selected.length)];for(const [name,id]of Object.entries(ids)){const el=document.getElementById(id);if(el)el.dataset.v5Hidden=selected.includes(name)&&(config.displayMode!=='slideshow'||name===key)?'0':'1';}document.getElementById('overlayPanel')?.classList.toggle('v5-combined',config.displayMode==='combined');}
async function refresh(){try{const r=await fetch('/api/alert-config?'+q);if(!r.ok)return;config=await r.json();clearInterval(timer);apply();if(config.displayMode==='slideshow')timer=setInterval(()=>{index++;apply();},6000);}catch{}}
window.addEventListener('collection:connected',refresh);window.addEventListener('collection:changed',e=>{if(e.detail.topic==='playback')refresh();});
})();
