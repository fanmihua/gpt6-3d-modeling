// 仅用于本项目温度告警演示，不代表厂家限值或实际设备保护定值。
export const DEMO_TEMPERATURE_ALARM = Object.freeze({
  id: 'motor-temperature-high', title: '电机温度偏高', threshold: 80, unit: '℃',
  component: 'motor', part: 'housing', location: '电机外壳测点（示意）',
});

export function getPumpAlert(device) {
  if (!device || device.status !== 'alarm' || !Number.isFinite(device.temperature)
    || device.temperature < DEMO_TEMPERATURE_ALARM.threshold) return null;
  return { ...DEMO_TEMPERATURE_ALARM, deviceId: device.id, value: device.temperature,
    excess: +(device.temperature - DEMO_TEMPERATURE_ALARM.threshold).toFixed(1),
    source: '本地模拟数据', ruleType: '演示规则', diagnosis: '温度越限，尚未定位内部损坏' };
}
