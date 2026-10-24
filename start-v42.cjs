'use strict';
// Safe integration before the existing server starts. Keeps its other changes, including bank connections.
const {execFileSync}=require('child_process'),path=require('path');
execFileSync(process.execPath,[path.join(__dirname,'apply-patch42.cjs'),path.join(__dirname,'server.js')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'apply-patch54.cjs'),path.join(__dirname,'server.js')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'apply-patch56.cjs'),path.join(__dirname,'server.js')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'apply-patch63.cjs'),path.join(__dirname,'server.js')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'apply-patch67.cjs'),path.join(__dirname,'server.js')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'apply-patch68.cjs'),path.join(__dirname,'server.js')],{stdio:'inherit'});
require('./server.js');
