'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveAircraftIdentifier:r}=require('../aircraft-identifiers.cjs');
test('airline passenger numbers become ICAO broadcast callsigns',()=>{
 for(const [input,expected] of Object.entries({
  DL3475:'DAL3475',WN3475:'SWA3475',SW3475:'SWA3475',
  AA1200:'AAL1200',UA909:'UAL909',B6123:'JBU123',
  F9181:'FFT181',AS99:'ASA99',G4145:'AAY145',NK221:'NKS221',
  OO5432:'SKW5432',MQ3830:'ENY3830',OH1213:'JIA1213',
  FX123:'FDX123','5X123':'UPS123'
 })){
  const v=r(input);assert.equal(v.lookup,expected,input);assert.equal(v.kind,'callsign',input);
 }
});
test('ICAO callsigns are accepted directly without changing them',()=>{
 for(const id of ['DAL3475','SWA3475','AAL123','SKW5432','FDX80']){
  assert.deepEqual(r(id),{input:id,lookup:id,kind:'callsign',error:null});
 }
});
test('GA registrations are not mistaken for commercial flight numbers',()=>{
 for(const id of ['N123AB','N45','C-GABC','D-ABCD','VH-ABC','G-ABCD','N201AB']){
  const value=r(id.toLowerCase());assert.equal(value.lookup,id);assert.equal(value.kind,'registration');
 }
});
test('unrecognized airline codes are not silently treated as registrations',()=>{
 const value=r('XY3475');assert.equal(value.lookup,null);assert.match(value.error,/Unknown two-character airline code/);
});
test('reject malformed identifiers',()=>{
 for(const id of ['',' ','DL 3475','DL/3475','<img>','N1234567890000']){
  const value=r(id);assert.equal(value.lookup,null,id);assert.ok(value.error,id);
 }
});
