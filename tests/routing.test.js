const assert=require('node:assert/strict');
const {classify}=require('../donation-routing');
const config={mode:'collab',targets:[{name:'빵떠기',aliases:['떠기']},{name:'또영이',aliases:['또영']},{name:'C'},{name:'국고',group:'other'},{name:'스탭',group:'other'},{name:'스패너',group:'other'}]};
const parse=(donor,amount,c=config)=>classify({donor,amount,source:'account'},c);
for(const donor of ['열려 떠기','열려/떠기','열려,떠기','열려가 빵떠기에게 후원']){const p=parse(donor,50000);assert.equal(p.donor,'열려');assert.deepEqual(p.rows.map(({creator,amount})=>({creator,amount})),[{creator:'빵떠기',amount:50000}]);}
for(const donor of ['열려 떠기2 또영3','열려가 떠기에게2 또영에게3']){const p=parse(donor,50000);assert.equal(p.state,'review');assert.deepEqual(p.rows.map(r=>r.amount),[20000,30000]);}
for(const donor of ['열려 6 각2','열려 6 균등']){const p=parse(donor,60000);assert.equal(p.donor,'열려');assert.equal(p.state,'review');assert.deepEqual(p.rows.map(r=>r.creator),['빵떠기','또영이','C']);}
assert.equal(parse('열려 떠기2 또영3',60000).state,'hold');assert.equal(parse('열려 6 각3',60000).state,'hold');
assert.equal(parse('열려 균등',10000).state,'hold');assert.equal(parse('열려 국고2',20000).rows[0].creator,'국고');
assert.equal(parse('열려',100,{mode:'solo',targets:[config.targets[0],config.targets[3]]}).state,'auto');
assert.equal(parse('열려 국고2',20000,{mode:'solo',targets:[config.targets[0],config.targets[3]]}).state,'review');
assert.equal(classify({donor:'열려',amount:100,source:'toonie',replay:true},{mode:'solo',targets:[config.targets[0]]}).state,'hold');
assert.equal(parse('열려',10000).state,'hold');assert.equal(parse('열려 떠기2 떠기3',50000).state,'hold');
assert.equal(parse('열려 떠기2',20000,{mode:'collab',targets:[{name:'A',aliases:['떠기']},{name:'B',aliases:['떠기']}]}).state,'hold');
console.log('PASS routing: aliases, Korean wording, split totals, groups, solo, replay, ambiguity');
