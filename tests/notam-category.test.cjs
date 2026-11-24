const assert=require('node:assert/strict');
const {test}=require('node:test');
const classification=import('../notam-category.mjs');
test('uses FAA subject codes and identifies cancellations without hiding them',async()=>{
  const {classifyNotam}=await classification;
  assert.equal(classifyNotam('QMRLC','N','RWY 14L/32R CLSD').categoryCode,'RUNWAY');
  assert.equal(classifyNotam('QMRXX','N','RWY 14L FICON 5/5/5').categoryCode,'RWY_COND');
  assert.equal(classifyNotam('QMXXX','N','TWY U CLSD').categoryCode,'TAXIWAY');
  assert.equal(classifyNotam('QICAS','N','NAV ILS RWY 18 U/S').categoryCode,'NAVAID');
  assert.equal(classifyNotam('QPICH','N','IAP ILS RWY 18').categoryCode,'OTHER');
  assert.deepEqual(classifyNotam('QXXXX','C',
    'A5121/26 NOTAMC A5119/26\nQ) KZMP/QMRXX////000/999/4118N09553W005\nE) RWY 14L/32R CLSD CANCELED'),
  {categoryCode:'RUNWAY',isTfr:false,cancellation:true});
  assert.equal(classifyNotam('QRTCA','N','TEMPORARY FLIGHT RESTRICTION').isTfr,true);
});
