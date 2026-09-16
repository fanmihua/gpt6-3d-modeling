import test from 'node:test';
import assert from 'node:assert/strict';
import { getPumpAlert, DEMO_TEMPERATURE_ALARM } from '../src/pump-alert.js';

test('temperature demo explains its rule and maps to a monitoring location, not internal damage',()=>{
  const alarm=getPumpAlert({id:'P-03',status:'alarm',temperature:86.3});
  assert.equal(alarm.threshold,80);
  assert.equal(alarm.excess,6.3);
  assert.equal(alarm.component,'motor');
  assert.equal(alarm.part,'housing');
  assert.match(alarm.location,/示意/);
  assert.match(alarm.diagnosis,/尚未/);
  assert.equal(alarm.ruleType,'演示规则');
});

test('normal, recovered and missing telemetry never produce an active temperature marker',()=>{
  for(const fixture of [
    {status:'running',temperature:62},
    {status:'alarm',temperature:79.9},
    {status:'offline',temperature:null},
    {status:'alarm',temperature:null},
    {status:'alarm',temperature:NaN},
    {status:'alarm',temperature:Infinity},
  ])assert.equal(getPumpAlert({id:'P-03',...fixture}),null);
  assert.equal(getPumpAlert({id:'P-03',status:'alarm',temperature:DEMO_TEMPERATURE_ALARM.threshold}).excess,0);
});
