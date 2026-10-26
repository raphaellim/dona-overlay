'use strict';
exports.sound=value=>{const s=String(value||'');return s.length<=200&&!/[\\/\x00-\x1f\x7f]/.test(s)&&/\.(mp3|wav|ogg|m4a)$/i.test(s)?s:'';};
