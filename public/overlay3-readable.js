/* Fit only a newly rendered/resized funding row. No polling or extra requests. */
(()=>{'use strict';const box=document.getElementById('fundingBox');if(!box)return;let frame=0,disposed=false;
function fit(){frame=0;for(const ratio of box.querySelectorAll('.funding-ratio')){const money=ratio.querySelector('.funding-money'),rate=ratio.querySelector('.funding-percent');if(!money||!rate||!ratio.clientWidth)continue;let size=18;money.style.setProperty('--readable-funding-money',size+'px');while(ratio.scrollWidth>ratio.clientWidth+1&&size>10){size-=.5;money.style.setProperty('--readable-funding-money',size+'px');}}}
function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(fit);}
const changes=new MutationObserver(schedule);changes.observe(box,{childList:true,subtree:true,characterData:true});const resize=window.ResizeObserver?new ResizeObserver(schedule):null;resize?.observe(box);window.addEventListener('resize',schedule);document.fonts?.ready.then(schedule);schedule();
window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);frame=0;changes.disconnect();resize?.disconnect();window.removeEventListener('resize',schedule);},{once:true});
})();
