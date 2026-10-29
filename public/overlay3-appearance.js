(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OverlayAppearance=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';const defaults={enabled:false,gap:10,titleSize:22,contentSize:22};function normalize(raw){const v=raw&&typeof raw==='object'?raw:{};const n=(k,min,max)=>Number.isFinite(Number(v[k]))?Math.max(min,Math.min(max,Math.round(Number(v[k])))):defaults[k];return {enabled:v.enabled===true,gap:n('gap',0,30),titleSize:n('titleSize',12,32),contentSize:n('contentSize',12,32)};}
let previewOverride=null,applied={...defaults},lastSignature=null;function apply(raw,preview=false){if(typeof document==='undefined')return;if(preview)previewOverride=normalize(raw);const v=previewOverride||normalize(raw),signature=JSON.stringify(v);if(signature===lastSignature&&document.getElementById('compact-appearance'))return;lastSignature=signature;applied=v;let style=document.getElementById('compact-appearance');if(!style){style=document.createElement('style');style.id='compact-appearance';document.head.append(style);}if(!v.enabled){style.textContent='';window.dispatchEvent(new Event('overlay3:appearance'));return;}const h=Math.ceil(v.contentSize*1.36);style.textContent=`
html body #overlayPanel>.overlay-box{margin-bottom:${v.gap}px!important}
html body #overlayPanel :is(.account-title,.notice-title,.funding-title,.creator-title,.karaoke-title){font-size:${v.titleSize}px!important;line-height:${Math.ceil(v.titleSize*1.27)}px!important}
html body #overlayPanel #accountBox .account-title::before{font-size:${v.titleSize}px!important}
html body #overlayPanel #noticeBox .notice-line{font-size:${v.contentSize}px!important;height:${h}px!important;min-height:${h}px!important;max-height:${h}px!important;flex-basis:${h}px!important;line-height:${h}px!important}
html body #overlayPanel #noticeBox :is(.notice-text,.notice-roll-window){--notice-row-height:${h}px;height:${h*4}px!important;min-height:${h*4}px!important;max-height:${h*4}px!important}
html body #overlayPanel #fundingBox .o3-funding-label strong{font-size:${v.contentSize}px!important}
html body #overlayPanel #fundingBox .funding-ratio :is(.funding-money,.funding-percent){font-size:min(var(--readable-funding-money,${Math.max(10,v.contentSize-4)}px),${Math.max(10,v.contentSize-4)}px)!important}
html body #overlayPanel #creatorBox .o3-rank-name{font-size:${v.contentSize}px!important}
html body #overlayPanel #creatorBox .o3-rank-money{font-size:${v.contentSize+3}px!important}
html body #overlayPanel #allowanceBox .preset-card-value{--counter-base:${v.contentSize+3};font-size:var(--counter-size,${v.contentSize+3}px)!important}
html body #overlayPanel #allowanceBox .allowance-value{--counter-base:${v.contentSize+1};font-size:var(--counter-size,${v.contentSize+1}px)!important}
`;window.dispatchEvent(new Event('overlay3:appearance'));}
return {defaults,normalize,apply,get current(){return applied;}};});
if(typeof window!=='undefined'){window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||new URLSearchParams(location.search).get('appearancePreview')!=='1'||event.data?.type!=='overlay-appearance-preview')return;window.OverlayAppearance.apply(event.data.value,true);});}

