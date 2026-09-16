import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY, ZONES, ALARMS, PROCESS_STEPS, WATER_QUALITY, acknowledgeAlarm, summarizeAlarms } from '../src/factory-data.js';
import { getPumpAlert } from '../src/pump-alert.js';

const sum = values => Number(values.reduce((total, value) => total + value, 0).toFixed(2));

test('full-day flow and energy series reconcile with the headline metrics', () => {
  assert.equal(FACTORY.daily.hours.length, 24);
  assert.equal(sum(FACTORY.daily.outflow), FACTORY.metrics.todaySupply);
  assert.equal(sum(FACTORY.daily.energy), FACTORY.metrics.todayEnergy);
  assert.ok(Math.abs(FACTORY.metrics.todayEnergy / FACTORY.metrics.todaySupply - FACTORY.metrics.intensity) < 1e-10);
  assert.ok(Math.abs(FACTORY.metrics.todaySupply / FACTORY.designCapacity * 100 - FACTORY.metrics.load) < 1e-10);
  for (const series of [FACTORY.daily, FACTORY.monthly]) {
    for (const key of ['inflow', 'outflow', 'energy']) {
      assert.equal(series[key].length, series.labels.length);
      assert.ok(series[key].every(value => Number.isFinite(value) && value >= 0));
    }
    assert.equal(series.totalOutflow, sum(series.outflow));
    assert.equal(series.totalInflow, sum(series.inflow));
    assert.equal(series.totalEnergy, sum(series.energy));
    assert.ok(series.inflow.every((value, index) => value >= series.outflow[index]));
  }
  assert.equal(FACTORY.monthly.outflow.at(-1), FACTORY.metrics.todaySupply);
});

test('zone device totals and all navigation targets remain internally consistent', () => {
  const ids = new Set(ZONES.map(zone => zone.id));
  assert.equal(ids.size, 8);
  for (const [state, expected] of Object.entries(FACTORY.deviceCounts)) {
    assert.equal(sum(ZONES.map(zone => zone.equipment[state])), expected, state);
  }
  for (const zone of ZONES) {
    assert.equal(zone.equipment.total, sum(['running', 'standby', 'maintenance', 'alarm'].map(key => zone.equipment[key])));
  }
  assert.equal(sum(ZONES.map(zone => zone.equipment.total)), 186);
  assert.equal(ALARMS.length, FACTORY.deviceCounts.alarm);
  for (const entry of [...ALARMS, ...PROCESS_STEPS]) assert.ok(ids.has(entry.zoneId), entry.zoneId);
  for (const alarm of ALARMS) {
    assert.equal(Number(Math.abs(alarm.value - alarm.threshold).toFixed(2)), alarm.excess);
    assert.match(alarm.ruleLabel, /演示/);
  }
  assert.ok(WATER_QUALITY.every(item => /演示/.test(item.range) && /不用于合规判断/.test(item.note)));
});

test('acknowledgement only changes local pending event state and preserves the original snapshot', () => {
  const original = structuredClone(ALARMS);
  const frozenAlarms = Object.freeze(ALARMS.map(alarm => Object.freeze({ ...alarm })));
  const updated = acknowledgeAlarm(frozenAlarms, ALARMS[0].id);
  assert.notEqual(updated, frozenAlarms);
  assert.equal(updated[0].status, 'acknowledged');
  assert.equal(updated[1].status, 'pending');
  assert.deepEqual(ALARMS, original);
  assert.equal(frozenAlarms[0].status, 'pending');
  assert.deepEqual(summarizeAlarms(updated), {
    total: 3, pending: 2, acknowledged: 1, warning: 1, notice: 1, byZone: { dosing: 1, workshop: 1 },
  });
  assert.deepEqual(acknowledgeAlarm(updated, ALARMS[0].id), updated);
  assert.deepEqual(acknowledgeAlarm(frozenAlarms, 'missing-event'), frozenAlarms);
  assert.deepEqual(summarizeAlarms(), { total: 0, pending: 0, acknowledged: 0, warning: 0, notice: 0, byZone: {} });
});

test('the campus includes the pump-room temperature event and keeps the exceeded condition after acknowledgement', () => {
  const workshop = ZONES.find(zone => zone.id === 'workshop');
  const campusAlarm = ALARMS.find(alarm => alarm.id === 'AL-004');
  const pumpAlarm = getPumpAlert({ id: 'P-03', status: 'alarm', temperature: 86.3 });
  assert.equal(campusAlarm.zoneId, workshop.id);
  assert.equal(workshop.status, 'attention');
  assert.deepEqual(workshop.equipment, { total: 16, running: 12, standby: 1, maintenance: 2, alarm: 1 });
  for (const key of ['deviceId', 'component', 'part', 'value', 'unit', 'threshold', 'excess']) {
    assert.equal(campusAlarm[key], pumpAlarm[key], key);
  }
  const acknowledged = acknowledgeAlarm(ALARMS, 'AL-004').find(alarm => alarm.id === 'AL-004');
  assert.equal(acknowledged.status, 'acknowledged');
  assert.equal(acknowledged.value, 86.3);
  assert.equal(acknowledged.excess, 6.3);
  assert.equal(FACTORY.deviceCounts.alarm, 3);
  assert.equal(workshop.status, 'attention');
});

test('the original dashboard and campus share flows, totals and navigable alarm identities', async t => {
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const previousWindow = globalThis.window;
  let dashboard;
  try {
    globalThis.window = {};
    await import('../src/dashboard-data.js');
    dashboard = globalThis.window.DEMO_DATA;
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
  assert.ok(dashboard, 'the original dashboard must publish its actual DEMO_DATA');

  await t.test('pump flow and plant counters reconcile across both views', () => {
    const outlet = sum(dashboard.devices.map(device => device.flow));
    assert.equal(outlet, 2780);
    assert.equal(outlet, FACTORY.metrics.outletFlow);
    assert.equal(dashboard.plant.inletOffset, 80);
    assert.equal(outlet + dashboard.plant.inletOffset, FACTORY.metrics.inletFlow);
    assert.equal(dashboard.plant.pressure, FACTORY.metrics.pressure);
    const counts = dashboard.plant.initialCounts;
    assert.deepEqual({
      running: counts.running,
      standby: counts.stopped,
      maintenance: counts.maintenance,
      alarm: counts.alarm,
    }, FACTORY.deviceCounts);
    assert.equal(counts.offline, 0);
    assert.equal(sum(Object.values(counts)), dashboard.plant.totalDevices);
    assert.equal(dashboard.plant.totalDevices, sum(ZONES.map(zone => zone.equipment.total)));
  });

  await t.test('every shared event targets the same zone and P-03 uses the actual pump reading', () => {
    const identity = alarm => `${alarm.id}:${alarm.zoneId}`;
    assert.equal(dashboard.alarms.length, 3);
    assert.equal(new Set(dashboard.alarms.map(alarm => alarm.id)).size, 3);
    assert.deepEqual(dashboard.alarms.map(identity).sort(), ALARMS.map(identity).sort());
    for (const alarm of dashboard.alarms) {
      const campusAlarm = ALARMS.find(item => item.id === alarm.id);
      assert.equal(alarm.acknowledged, campusAlarm.status === 'acknowledged');
      assert.equal(Number.parseFloat(alarm.value), campusAlarm.value);
      assert.equal(Number.parseFloat(alarm.excess), campusAlarm.excess);
    }
    const originalAlarm = dashboard.alarms.find(alarm => alarm.id === 'AL-004');
    const campusAlarm = ALARMS.find(alarm => alarm.id === originalAlarm.id);
    const device = dashboard.devices.find(item => item.id === originalAlarm.deviceId);
    const actualPumpAlert = getPumpAlert(device);
    assert.ok(actualPumpAlert, 'the linked pump must actually meet the demo alarm rule');
    assert.equal(originalAlarm.deviceId, 'P-03');
    assert.equal(originalAlarm.zoneId, 'workshop');
    for (const key of ['deviceId', 'value', 'threshold', 'excess', 'component', 'part']) {
      assert.equal(campusAlarm[key], actualPumpAlert[key], key);
    }
    assert.equal(Number.parseFloat(originalAlarm.threshold.replace(/^[^\d.-]+/, '')), actualPumpAlert.threshold);
  });

  await t.test('daily and monthly energy use the same supply totals in both views', () => {
    assert.deepEqual(dashboard.plant.today, {
      supply: FACTORY.metrics.todaySupply,
      energy: FACTORY.metrics.todayEnergy,
      intensity: FACTORY.metrics.intensity,
    });
    assert.equal(dashboard.plant.month.supply, FACTORY.monthly.totalOutflow);
    assert.equal(dashboard.plant.month.energy, FACTORY.monthly.totalEnergy);
    for (const period of [dashboard.plant.today, dashboard.plant.month]) {
      assert.ok(Math.abs(period.supply * period.intensity - period.energy) < 1e-6);
    }
    assert.equal(dashboard.energy.day.values.at(-1), FACTORY.metrics.todayEnergy);
    assert.deepEqual(dashboard.flow.labels, FACTORY.daily.hours.filter((_, index) => index % 2 === 0));
    assert.deepEqual(dashboard.flow.inlet, FACTORY.daily.inflow.filter((_, index) => index % 2 === 0));
    assert.deepEqual(dashboard.flow.outlet, FACTORY.daily.outflow.filter((_, index) => index % 2 === 0));
  });
});
