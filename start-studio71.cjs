'use strict';const {execFileSync}=require('child_process'),path=require('path'),fs=require('fs');
for(const version of [42,54,56,63,67,68]){const script=path.join(__dirname,'apply-patch'+version+'.cjs');if(fs.existsSync(script))execFileSync(process.execPath,[script,path.join(__dirname,'server.js')],{stdio:'inherit'});}
execFileSync(process.execPath,[path.join(__dirname,'apply-patch69.cjs'),path.join(__dirname,'collection-review.js')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'apply-patch70.cjs'),__dirname],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'apply-studio71.cjs')],{stdio:'inherit'});require('./server.js');
