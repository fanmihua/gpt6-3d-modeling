/**
 * 绿源净水厂：包含送水泵房设备与告警的全厂演示快照。
 * 功能分区按单张照片推定，读数、设备数量和阈值均为构造的演示数据。
 * 本模块不连接实际设备，不构成水质合规判断或设备故障诊断。
 */

const round = (value, precision = 2) => Number(value.toFixed(precision));
const sum = values => round(values.reduce((total, value) => total + value, 0));
const hours = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}:00`);
const hourlyOutflow = [2120, 2050, 1990, 1950, 2060, 2260, 2650, 2920, 3040, 2960, 2880, 2790, 2740, 2810, 2900, 2990, 3050, 2960, 2800, 2720, 2650, 2450, 2320, 2420];
const hourlyInflow = hourlyOutflow.map(value => value + 80);
const hourlyEnergy = hourlyOutflow.map(value => round(value * 0.29));
const monthlyOutflow = [59820, 60640, 61320, 60980, 59460, 58820, 61240, 62160, 61880, 62740, 63280, 62520, 60960, 61580, 62040, 62480];
const monthlyInflow = monthlyOutflow.map(value => value + 1920);
const monthlyEnergy = monthlyOutflow.map(value => round(value * 0.29));

export const FACTORY = {
  name: '绿源净水厂',
  subtitle: '厂区智慧运营中心',
  designCapacity: 80000,
  areaHa: 4.2,
  sourceLabel: '演示数据',
  snapshotDate: '2026-09-16',
  dataNote: '全日演示快照；未连接实际设备。',
  thresholdNote: '测点、采样值和阈值均为演示设置，不用于水质合规判断或设备故障诊断。',
  metrics: {
    todaySupply: 62480,
    todayEnergy: 18119.2,
    intensity: 0.290,
    qualityRate: 99.8,
    inletFlow: 2860,
    outletFlow: 2780,
    pressure: 0.36,
    load: 78.1,
  },
  deviceCounts: { running: 155, standby: 22, maintenance: 6, alarm: 3 },
  daily: {
    hours,
    labels: hours,
    inflow: hourlyInflow,
    outflow: hourlyOutflow,
    energy: hourlyEnergy,
    totalInflow: sum(hourlyInflow),
    totalOutflow: sum(hourlyOutflow),
    totalEnergy: sum(hourlyEnergy),
    flowUnit: 'm³/h',
    energyUnit: 'kWh',
  },
  monthly: {
    labels: Array.from({ length: monthlyOutflow.length }, (_, index) => `09/${String(index + 1).padStart(2, '0')}`),
    inflow: monthlyInflow,
    outflow: monthlyOutflow,
    energy: monthlyEnergy,
    totalInflow: sum(monthlyInflow),
    totalOutflow: sum(monthlyOutflow),
    totalEnergy: sum(monthlyEnergy),
    flowUnit: 'm³/日',
    energyUnit: 'kWh',
  },
};

export const ZONES = [
  {
    id: 'admin', name: '综合办公楼', code: 'A01', category: '综合管理', status: 'normal',
    description: '对应照片前部的多层主楼，保留玻璃中庭、入口雨棚与门前广场；办公功能为视觉推定。',
    metrics: [{ label: '今日用电', value: 428, unit: 'kWh' }, { label: '室内温度', value: 25.6, unit: '℃' }, { label: '在线终端', value: 8, unit: '台' }],
    equipment: { total: 8, running: 8, standby: 0, maintenance: 0, alarm: 0 },
  },
  {
    id: 'sedimentation', name: '沉淀池区', code: 'B01', category: '工艺处理', status: 'normal', processIndex: 2,
    description: '对应照片右侧连片的露天矩形池体，保留分格、水面与跨池检修桥；沉淀工艺为示意映射。',
    metrics: [{ label: '处理流量', value: 2860, unit: 'm³/h' }, { label: '出水浊度', value: 1.82, unit: 'NTU' }, { label: '池体液位', value: 3.42, unit: 'm' }],
    equipment: { total: 36, running: 32, standby: 4, maintenance: 0, alarm: 0 },
  },
  {
    id: 'filtration', name: '过滤池区', code: 'B02', category: '工艺处理', status: 'attention', processIndex: 3,
    description: '对应照片中后部的方形处理池与设备廊道。滤池编号与差压测点为演示配置。',
    metrics: [{ label: '滤后浊度', value: 0.16, unit: 'NTU' }, { label: 'F-03 差压', value: 38.6, unit: 'kPa' }, { label: '运行滤格', value: 7, unit: '格' }],
    equipment: { total: 48, running: 41, standby: 4, maintenance: 2, alarm: 1 },
  },
  {
    id: 'tanks', name: '储罐区', code: 'C01', category: '储存设施', status: 'normal', processIndex: 4,
    description: '对应照片后部的立式圆罐与球顶罐，保留罐体组团和外部连接管线；清水缓冲功能为工艺演示。',
    metrics: [{ label: '储罐液位', value: 72.4, unit: '%' }, { label: '缓冲储量', value: 5792, unit: 'm³' }, { label: '出水余氯', value: 0.62, unit: 'mg/L' }],
    equipment: { total: 20, running: 18, standby: 2, maintenance: 0, alarm: 0 },
  },
  {
    id: 'dosing', name: '加药设备区', code: 'C02', category: '辅助工艺', status: 'attention', processIndex: 1,
    description: '对应罐区前方的低层设备建筑与架空管线，药剂储罐与液位测点采用示意数据。',
    metrics: [{ label: '药剂投加量', value: 18.2, unit: 'mg/L' }, { label: 'D-02 液位', value: 24, unit: '%' }, { label: '加药流量', value: 52.1, unit: 'L/h' }],
    equipment: { total: 18, running: 14, standby: 3, maintenance: 0, alarm: 1 },
  },
  {
    id: 'workshop', name: '送水机房', code: 'D01', category: '生产建筑', status: 'attention', processIndex: 5,
    description: '对应照片右前方的长条形工业建筑；送水功能为示意映射。区域包含泵房 P-03 电机温度演示告警。',
    metrics: [{ label: '送水流量', value: 2780, unit: 'm³/h' }, { label: '出厂压力', value: 0.36, unit: 'MPa' }, { label: '机组效率', value: 84.2, unit: '%' }],
    equipment: { total: 16, running: 12, standby: 1, maintenance: 2, alarm: 1 },
  },
  {
    id: 'utilities', name: '动力辅助区', code: 'D02', category: '公用设施', status: 'normal', processIndex: 0,
    description: '对应照片后部及左侧辅助建筑，组合展示取水与动力保障演示指标；实际建筑用途待现场资料确认。',
    metrics: [{ label: '进厂流量', value: 2860, unit: 'm³/h' }, { label: '当前功率', value: 806.2, unit: 'kW' }, { label: '供电频率', value: 50, unit: 'Hz' }],
    equipment: { total: 32, running: 26, standby: 4, maintenance: 2, alarm: 0 },
  },
  {
    id: 'gate', name: '门岗与入口', code: 'E01', category: '厂区安防', status: 'normal',
    description: '对应照片前部主入口、门卫室与伸缩门，保留车辆道路、步行过街线及围栏连接关系。',
    metrics: [{ label: '今日通行', value: 126, unit: '人次' }, { label: '入厂车辆', value: 18, unit: '辆' }, { label: '在厂车辆', value: 9, unit: '辆' }],
    equipment: { total: 8, running: 4, standby: 4, maintenance: 0, alarm: 0 },
  },
];

export const ALARMS = [
  {
    id: 'EVT-F03-0916', zoneId: 'filtration', title: 'F-03 滤池差压偏高', point: 'F-03 滤池进出水差压',
    value: 38.6, unit: 'kPa', threshold: 35, excess: 3.6, operator: '>=',
    thresholdText: '≥ 35 kPa', ruleLabel: '演示阈值', level: 'warning', time: '14:32:08', status: 'pending',
    description: '演示测点差压高于设定值 3.6 kPa，可检查反冲洗记录与测点状态；此事件不代表已确认滤料或内部部件损坏。',
  },
  {
    id: 'EVT-D02-0916', zoneId: 'dosing', title: 'D-02 药剂储罐液位偏低', point: 'D-02 药剂储罐液位',
    value: 24, unit: '%', threshold: 25, excess: 1, operator: '<=',
    thresholdText: '≤ 25%', ruleLabel: '演示阈值', level: 'notice', time: '14:18:42', status: 'pending',
    description: '演示测点液位低于设定值 1 个百分点，可安排库存核对；确认事件仅更新本地演示状态，不操作任何设备。',
  },
  {
    id: 'AL-004', deviceId: 'P-03', zoneId: 'workshop', title: 'P-03 电机温度偏高', point: 'P-03 电机外壳测点（示意）',
    component: 'motor', part: 'housing',
    value: 86.3, unit: '℃', threshold: 80, excess: 6.3, operator: '>=',
    thresholdText: '≥ 80 ℃', ruleLabel: '演示阈值', level: 'warning', time: '10:22:14', status: 'pending',
    description: '与送水泵房共用 P-03 温度演示事件，电机外壳测点高于设定值 6.3 ℃。水泵处于告警停机状态，尚未定位内部损坏；确认事件不代表温度恢复或设备重新启动。',
  },
];

export const PROCESS_STEPS = [
  { id: 'intake', title: '取水', zoneId: 'utilities', value: 2860, unit: 'm³/h', description: '原水进入厂区，工艺位置为示意。' },
  { id: 'coagulation', title: '混凝', zoneId: 'dosing', value: 18.2, unit: 'mg/L', description: '展示演示药剂投加量。' },
  { id: 'settling', title: '沉淀', zoneId: 'sedimentation', value: 1.82, unit: 'NTU', description: '展示沉淀出水浊度演示值。' },
  { id: 'filtering', title: '过滤', zoneId: 'filtration', value: 0.16, unit: 'NTU', description: '展示滤后浊度及差压演示事件。' },
  { id: 'storage', title: '清水', zoneId: 'tanks', value: 72.4, unit: '%', description: '展示清水缓冲储量；储罐用途为推定。' },
  { id: 'delivery', title: '送水', zoneId: 'workshop', value: 2780, unit: 'm³/h', description: '展示出厂流量与压力演示值。' },
];

export const WATER_QUALITY = [
  { label: '出厂浊度', value: 0.16, unit: 'NTU', range: '演示目标 ≤ 0.50', note: '构造采样值，不用于合规判断。' },
  { label: '余氯', value: 0.62, unit: 'mg/L', range: '演示目标 0.30–1.00', note: '构造采样值，不用于合规判断。' },
  { label: 'pH', value: 7.4, unit: '', range: '演示目标 6.5–8.5', note: '构造采样值，不用于合规判断。' },
  { label: '电导率', value: 246, unit: 'μS/cm', range: '演示目标 100–500', note: '构造采样值，不用于合规判断。' },
];

/** Count pending events separately from historical acknowledgements. */
export function summarizeAlarms(alarms = []) {
  const summary = { total: alarms.length, pending: 0, acknowledged: 0, warning: 0, notice: 0, byZone: {} };
  for (const alarm of alarms) {
    if (alarm.status === 'acknowledged') summary.acknowledged += 1;
    if (alarm.status !== 'pending') continue;
    summary.pending += 1;
    if (alarm.level === 'warning' || alarm.level === 'notice') summary[alarm.level] += 1;
    summary.byZone[alarm.zoneId] = (summary.byZone[alarm.zoneId] || 0) + 1;
  }
  return summary;
}

/** Acknowledge a demo event without mutating source data or issuing device commands. */
export function acknowledgeAlarm(alarms = [], id) {
  return alarms.map(alarm => alarm.id === id && alarm.status === 'pending'
    ? { ...alarm, status: 'acknowledged' }
    : alarm);
}
