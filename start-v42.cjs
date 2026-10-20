'use strict';
// Safe integration before the existing server starts. Keeps its other changes, including bank connections.
const {execFileSync}=require('child_process'),path=require('path');
execFileSync(process.execPath,[path.join(__dirname,'apply-patch42.cjs'),path.join(__dirname,'server.js')],{stdio:'inherit'});
require('./server.js');
