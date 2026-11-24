const assert = require('node:assert/strict');
const { test } = require('node:test');
const guidance = import('../gfs-guidance.mjs');

test('interpolates east/north wind vectors and temperature without extrapolating', async () => {
  const {interpolateModelWind} = await guidance;
  assert.deepEqual(interpolateModelWind([
    {altitude:3000,east:10,north:0,tempC:10},
    {altitude:9000,east:0,north:10,tempC:-10},
  ],[2000,3000,6000,9000,10000]).map(x=>[x.altitude,x.direction,x.speed,x.tempC]),
  [[3000,270,10,10],[6000,225,7,0],[9000,180,10,-10]]);
  assert.equal(interpolateModelWind([
    {altitude:3000,east:5,north:0},{altitude:9000,east:-5,north:0},
  ],[6000])[0].calm,true);
});

const header='time,alt[unit="Pa"],station,latitude[unit="degrees_north"],longitude[unit="degrees_east"],u-component_of_wind_isobaric[unit="m/s"],v-component_of_wind_isobaric[unit="m/s"],Geopotential_height_isobaric[unit="gpm"],Temperature_isobaric[unit="K"]';
const time='2026-11-25T06:00:00Z';
const profile=[
  [time,85000,'KOMA',41.25,264,10,0,1500,269],
  [time,80000,'KOMA',41.25,264,0,10,2100,260],
];
const csv=(rows)=>[header,...rows.map(row=>row.join(','))].join('\n');

test('reads Unidata pressure levels using their height and converts wind units', async () => {
  const {parseGfsPointCsv}=await guidance;
  const report=parseGfsPointCsv(csv(profile),[41.3032,-95.8941],Date.parse(time));
  assert.equal(report.validAt,'2026-11-25T06:00:00.000Z');
  assert.deepEqual(report.rows.map(x=>[x.altitude,x.direction,x.speed,x.tempC]),[[6000,220,14,-9]]);
});

test('rejects stale, distant, malformed or missing model samples', async()=>{
  const {parseGfsPointCsv}=await guidance;
  const target=Date.parse(time);
  const coordinates=[41.3032,-95.8941];
  assert.throws(()=>parseGfsPointCsv(csv(profile),coordinates,target+4*3600000),/no timely/);
  assert.throws(()=>parseGfsPointCsv(csv(profile),[40,-95.8941],target),/no timely/);
  assert.throws(()=>parseGfsPointCsv(csv(profile.map(row=>row.map((v,i)=>i===5?'':v))),coordinates,target),/no timely/);
  assert.throws(()=>parseGfsPointCsv(csv(profile).replace('"m/s"','"kn"'),coordinates,target),/variables or units/);
});
