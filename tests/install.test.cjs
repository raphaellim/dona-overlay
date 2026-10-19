const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mobile-install-'));
try{
 const studio=fs.readFileSync(process.argv[2],'utf8'),server=fs.readFileSync(process.argv[3],'utf8');fs.writeFileSync(path.join(root,'alert-studio.js'),studio);fs.writeFileSync(path.join(root,'server.js'),server);
 const installer=path.resolve(__dirname,'../server-patch/install.cjs');cp.execFileSync(process.execPath,[installer,root]);const after=fs.readFileSync(path.join(root,'alert-studio.js'),'utf8');const hook="require('./mobile-alert-controls')(app,{route,read,readEffectiveSettings,jobs,notify,makeFreeRandomPlan,matchIntro,getStationContext});\n ";assert.equal(after.replace(hook,''),studio);assert.equal(fs.readFileSync(path.join(root,'server.js'),'utf8'),server);
 cp.execFileSync(process.execPath,[installer,root]);assert.equal(fs.readFileSync(path.join(root,'alert-studio.js'),'utf8'),after);
 console.log('PASS: surgical installation preserves existing code and is repeatable');
}finally{fs.rmSync(root,{recursive:true,force:true});}
