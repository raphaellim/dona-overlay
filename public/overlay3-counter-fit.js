/* Resize only on new counters or source resizing; no requests, timers or animation. */
(()=>{'use strict';const row=document.getElementById('allowanceRow');if(!row)return;let frame=0,active=false;
function fit(){frame=0;for(const cell of row.children){const number=cell.querySelector('.allowance-value,.preset-card-value');if(!number||!cell.clientWidth)continue;let size=Number(getComputedStyle(number).getPropertyValue('--counter-base'))||(number.classList.contains('allowance-value')?23:25);number.style.setProperty('--counter-size',size+'px');while(cell.scrollWidth>cell.clientWidth&&size>10){size-=.5;number.style.setProperty('--counter-size',size+'px');}}}
function schedule(){if(active&&!frame)frame=requestAnimationFrame(fit);}
const changes=new MutationObserver(schedule),resize=window.ResizeObserver?new ResizeObserver(schedule):null;
function start(){if(active)return;active=true;changes.observe(row,{childList:true,subtree:true,characterData:true});resize?.observe(row);window.addEventListener('resize',schedule);window.addEventListener('overlay3:appearance',schedule);schedule();}
function stop(){active=false;cancelAnimationFrame(frame);frame=0;changes.disconnect();resize?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('overlay3:appearance',schedule);}
window.addEventListener('pagehide',stop);window.addEventListener('pageshow',start);document.fonts?.ready.then(schedule);start();})();
