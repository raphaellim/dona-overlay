'use strict';
(()=>{const header=document.querySelector('header'),tabs=document.getElementById('tabs');let last=-1;
 function fit(){const mobile=matchMedia('(max-width:760px)').matches;const bottom=Math.round((mobile?tabs:header)?.getBoundingClientRect().bottom||88);if(bottom!==last){last=bottom;document.documentElement.style.setProperty('--console-top',bottom+'px');}}
 const observer=new ResizeObserver(fit);if(header)observer.observe(header);if(tabs)observer.observe(tabs);window.addEventListener('resize',fit,{passive:true});fit();window.addEventListener('pagehide',()=>{observer.disconnect();window.removeEventListener('resize',fit);},{once:true});})();
