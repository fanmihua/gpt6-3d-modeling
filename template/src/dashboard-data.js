import { FACTORY, ALARMS } from './factory-data.js';
/* 水厂指标、设备状态与告警的共享演示数据。 */
window.DEMO_DATA = {
  plant: {
    name:'绿源净水厂', area:'送水机房', totalDevices:186,
    initialCounts:{running:155,stopped:22,alarm:3,maintenance:6,offline:0},
    pressure:0.36, inletOffset:80,
    today:{supply:FACTORY.metrics.todaySupply,energy:FACTORY.metrics.todayEnergy,intensity:FACTORY.metrics.intensity},
    month:{supply:FACTORY.monthly.totalOutflow,energy:FACTORY.monthly.totalEnergy,intensity:0.290},
  },
  devices:[
    {id:'P-01',name:'1号水泵',shortName:'1号泵',status:'running',baseFlow:930,flow:930,head:36.7,pressure:.36,current:132.4,rpm:1480,temperature:61.8,x:24.46,y:34.45},
    {id:'P-02',name:'2号水泵',shortName:'2号泵',status:'running',baseFlow:920,flow:920,head:36.5,pressure:.36,current:130.7,rpm:1480,temperature:59.6,x:41.87,y:43.10},
    {id:'P-03',name:'3号水泵',shortName:'3号泵',status:'alarm',baseFlow:925,flow:0,head:0,pressure:.36,current:0,rpm:0,temperature:86.3,x:58.75,y:55.10},
    {id:'P-04',name:'4号水泵',shortName:'4号泵',status:'running',baseFlow:930,flow:930,head:36.7,pressure:.36,current:132.1,rpm:1480,temperature:60.7,x:75.91,y:67.02},
  ],
  alarms:[
    {id:'AL-004',zoneId:'workshop',deviceId:'P-03',device:'3号泵',time:'10:22:14',title:'电机温度偏高',level:'high',value:'86.3 ℃',threshold:'≥80 ℃',excess:'6.3 ℃',description:'送水机房 P-03 电机机壳测点温度为86.3℃，超过演示阈值6.3℃。',acknowledged:false},
    ...ALARMS.filter(a=>a.id!=='AL-004').map(a=>({id:a.id,zoneId:a.zoneId,deviceId:a.zoneId==='filtration'?'F-03':'D-02',device:a.zoneId==='filtration'?'F-03':'D-02',time:a.time,title:a.title,level:a.level==='warning'?'medium':'low',value:`${a.value} ${a.unit}`,threshold:a.thresholdText,excess:`${a.excess} ${a.unit==='%'?'个百分点':a.unit}`,description:a.description,acknowledged:false})),
  ],
  flow:{labels:FACTORY.daily.hours.filter((_,i)=>i%2===0),inlet:FACTORY.daily.inflow.filter((_,i)=>i%2===0),outlet:FACTORY.daily.outflow.filter((_,i)=>i%2===0)},
  energy:{
    day:{unit:'kWh',labels:FACTORY.monthly.labels.slice(-7),values:FACTORY.monthly.energy.slice(-7),max:22000},
    month:{unit:'万 kWh',labels:['03月','04月','05月','06月','07月','08月','09月'],values:[49.3,48.8,52.1,52.7,56.8,55.4,+(FACTORY.monthly.totalEnergy/10000).toFixed(2)],max:70},
    year:{unit:'万 kWh',labels:['2020','2021','2022','2023','2024','2025','2026'],values:[502,519,538,556,581,604,438],max:700},
  },
  water:[
    {label:'浊度',value:.16,unit:'NTU',color:'#27c3ff',series:[.18,.17,.16,.18,.17,.15,.16]},
    {label:'余氯',value:.62,unit:'mg/L',color:'#29ddbd',series:[.59,.61,.62,.64,.63,.61,.62]},
    {label:'pH',value:7.4,unit:'',color:'#27c3ff',series:[7.3,7.4,7.3,7.5,7.4,7.3,7.4]},
    {label:'电导率',value:246,unit:'μS/cm',color:'#29ddbd',series:[241,244,248,245,247,244,246]},
  ],
};
