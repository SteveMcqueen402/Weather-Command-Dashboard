import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const page=read('index.html');
const script=read('app.js');
const server=read('server.mjs');
const styles=read('styles.css');
test('team leaders panel and unused data polling are removed',()=>{
  assert.doesNotMatch(page,/id="leaders"|id="leaders-list"/);
  assert.doesNotMatch(script,/renderLeaders\(/);
  assert.doesNotMatch(server,/teams\/2\/leaders/);
});
test('season performance is rendered as a compact results list',()=>{
  assert.match(page,/id="trend-chart" class="performance-list"/);
  assert.match(script,/<table class="performance-table">/);
  assert.match(styles,/#season-trend \.performance-list\{[^}]*max-height:215px/);
});
test('injury watcher is a three-column list, with full report preserved',()=>{
  assert.match(script,/injury-mini-header/);
  assert.match(script,/PLAYER<\/span><span>INJURY<\/span><span>STATUS/);
  assert.match(page,/id="injury-full"/);
  assert.match(styles,/#injury-mini \.injury-mini-list\{[^}]*max-height:215px/);
});