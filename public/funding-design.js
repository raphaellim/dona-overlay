(()=>{'use strict';const box=document.getElementById('fundingBox');if(!box)return;const css=document.createElement('style');css.textContent=`
body #overlayPanel>.overlay-box::before{width:2px!important;min-width:2px!important;max-width:2px!important}
body #overlayPanel>.overlay-box::after{height:2px!important;width:80%!important;background:linear-gradient(90deg,var(--section-color,#ffd783) 0%,var(--section-color,#ffd783) 40%,transparent 100%)!important}
body #overlayPanel #fundingBox .o3-funding-meter{background:var(--fund-track,rgba(19,185,157,.25))!important;border:0!important;border-radius:7px!important;min-height:42px!important;overflow:hidden!important}
body #overlayPanel #fundingBox .o3-funding-fill{background:var(--fund-fill)!important;border:0!important;opacity:.9!important;transition:none!important}
body #overlayPanel #fundingBox .o3-funding-label{position:relative!important;z-index:1!important;padding:8px 10px!important;gap:9px!important;line-height:26px!important}
body #overlayPanel #fundingBox .o3-funding-label strong{font-size:19px!important;font-weight:750!important;color:#fff!important;text-shadow:0 1px 1px #0008!important}
body #overlayPanel #fundingBox .funding-ratio,body #overlayPanel #fundingBox .funding-ratio *{font-size:20px!important;font-weight:800!important;color:#fff!important;text-shadow:0 1px 1px #0008!important}
body #overlayPanel #fundingBox .o3-funding-detail{display:none!important}
body #overlayPanel #fundingBox .o3-funding-label{flex-wrap:nowrap!important;gap:7px!important;padding:8px 9px!important}
body #overlayPanel #fundingBox .o3-funding-label strong{flex:1 1 auto!important;min-width:0!important;font-size:17px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
body #overlayPanel #fundingBox .funding-ratio{display:flex!important;justify-content:space-between!important;align-items:center!important;width:auto!important;flex:0 0 auto!important;gap:7px!important}
body #overlayPanel #fundingBox .funding-ratio .funding-money{font-size:14px!important;white-space:nowrap!important}
body #overlayPanel #fundingBox .funding-ratio .funding-percent{font-size:16px!important;flex-shrink:0!important}
`;document.head.append(css);
const colors=['#537e98','#7d749c','#648e83','#a47e88','#a28c60'];
function update(){const meter=box.querySelector('.o3-funding-meter');if(!meter||meter.dataset.fundingDesign==='616855')return;const title=meter.getAttribute('data-funding-key')||meter.getAttribute('aria-label')||'펀딩';const custom=meter.dataset.fundingColor;let hash=0;for(const ch of title)hash=(hash*31+ch.charCodeAt(0))>>>0;const pair=[title,/^#[0-9a-f]{6}$/i.test(custom||'')?custom:colors[hash%colors.length]];
meter.dataset.fundingDesign='616855';meter.style.setProperty('--fund-fill',pair[1]);const rgb=pair[1].slice(1).match(/../g).map(v=>parseInt(v,16));meter.style.setProperty('--fund-track','rgba('+rgb.join(',')+',.25)');const ratio=meter.querySelector('.funding-ratio');if(ratio){const detail=box.querySelector('.o3-funding-detail')?.textContent||'';const m=detail.match(/달성률\s*([\d.]+)%/);const amount=ratio.textContent.trim();const percent=m?m[1]+'%':detail.includes('목표 미설정')?'—':Math.round(Number(meter.getAttribute('aria-valuenow'))||0)+'%';ratio.replaceChildren();const money=document.createElement('span');money.className='funding-money';money.textContent=amount;const rate=document.createElement('span');rate.className='funding-percent';rate.textContent=percent;ratio.append(money,rate);}}
const observer=new MutationObserver(update);observer.observe(box,{childList:true,subtree:true});update();window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});window.addEventListener('pageshow',()=>{observer.observe(box,{childList:true,subtree:true});update();});})();
