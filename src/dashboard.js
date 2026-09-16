import './dashboard.css';
import './dashboard-refinements.css';
import './dashboard-desktop.css';
import './dashboard-polish.css';
import './dashboard-spacing.css';
import './dashboard-data.js';
import { getPumpAlert, DEMO_TEMPERATURE_ALARM } from './pump-alert.js';
import { createCampusIntegration } from './campus-integration.js';

/* Vanilla JS dashboard. Blender CAD scene is mounted through the shared device bridge.
 * Public integration API: window.WaterDashboard (see README.md).
 */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n, digits = 0) => n == null || !Number.isFinite(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const data = clone(window.DEMO_DATA);
  const META = {
    running:{text:'运行中',color:'#23dfbf'}, stopped:{text:'停机',color:'#38a9f8'}, alarm:{text:'告警',color:'#ff697b'},
    maintenance:{text:'维护',color:'#a990e8'}, offline:{text:'离线',color:'#91adc7'}
  };
  const state = { selectedId:'P-01', scope:'campus', zoneId:'workshop', view:'scene', tab:'live', metricPeriod:'today', energyPeriod:'day', zoom:1,
    labels:true, simulating:!new URLSearchParams(location.search).has('still'), tick:0, adapter:null, lastUpdated:new Date(), alarms:data.alarms };
  const originalDevices = clone(data.devices);
  const residualCounts = {...data.plant.initialCounts};
  originalDevices.forEach(d => residualCounts[d.status]--);
  let toastTimer, focusBeforeModal, deviceModel, deviceModelPromise;
  let pickerIndex = 0;

  const ICONS = {
    droplets:'<path d="M7 3S3 7.5 3 10a4 4 0 0 0 8 0C11 7.5 7 3 7 3Z M17 8s-4 4.5-4 7a4 4 0 0 0 8 0c0-2.5-4-7-4-7Z"/><path d="M7 18a3 3 0 0 0 3 3"/>',
    droplet:'<path d="M12 2S5 10 5 14a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
    energy:'<path d="M13.5 2 5 13h6l-.5 9L19 10h-6l.5-8Z"/>',
    waves:'<path d="M2 6c3-4 5 4 9 0s6 4 11 0 M2 12c3-4 5 4 9 0s6 4 11 0 M2 18c3-4 5 4 9 0s6 4 11 0"/>',
    leaf:'<path d="M20 3C9 2 3 8 5 15c2 6 13 5 15-12Z M4 21l11-12 M9 15l-1-4 M12 12l5 1"/>',
    plant:'<path d="M3 21V9l6 3V5l6 5V2h4v19 M1 21h22 M6 15v2 M11 15v2 M16 15v2"/>',
    pump:'<rect x="2" y="8" width="9" height="10" rx="2"/><circle cx="16" cy="13" r="5"/><path d="M14 8V4h4v4 M21 12h2v3h-2 M4 11v4 M7 11v4 M2 21h20 M5 18v3 M16 18v3"/>',
    pool:'<path d="M3 6h18v14H3Z M3 14c3-3 5 3 9 0s6 3 9 0 M7 3v7 M11 3v7 M7 5h4 M7 8h4"/>',
    filter:'<path d="M3 4h18l-7 9v7l-4-2v-5L3 4Z M7 7h10"/>',
    flask:'<path d="M8 3h8 M10 3v7l-6 9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2l-6-9V3 M7 15h10 M10 18h1"/>',
    activity:'<path d="M2 12h4l3-8 5 16 3-8h5"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z M10 21h4 M12 2v1"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',
    arrow:'<path d="M3 12h17 M14 6l6 6-6 6"/>',
    inflow:'<path d="M8 3h8v9h4l-8 9-8-9h4V3Z"/>',
    outflow:'<path d="M8 21h8v-9h4l-8-9-8 9h4v9Z"/>',
    gauge:'<circle cx="12" cy="11" r="8"/><path d="m12 11 4-4 M9 22h6 M12 19v3 M5 11h1 M18 11h1 M12 4v1"/><circle cx="12" cy="11" r="1"/>',
    tag:'<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7" cy="7" r="1"/>',
    plus:'<path d="M12 4v16 M4 12h16"/>',minus:'<path d="M4 12h16"/>',
    reset:'<path d="M4 9a8 8 0 1 1 0 7 M4 3v6h6"/>',
    expand:'<path d="M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5"/>',
    cube:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z M3 7l9 5 9-5 M12 12v10 M7 4.8l10 5.6"/>',
    plan:'<path d="M3 3h18v18H3Z M3 10h7V3 M10 10v11 M10 15h11 M14 7h3 M17 5v4"/>',
    network:'<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5 M5 17v-5h14v5"/>',
    file:'<path d="M5 2h9l5 5v15H5V2Z M14 2v6h5 M8 12h8 M8 16h8 M8 19h4"/>',
    sliders:'<path d="M5 3v6 M5 13v8 M12 3v11 M12 18v3 M19 3v3 M19 10v11 M2 9h6v4H2Z M9 14h6v4H9Z M16 6h6v4h-6Z"/>',
    pause:'<path d="M8 5v14 M16 5v14" stroke-width="3"/>',
    play:'<path d="m8 4 12 8-12 8V4Z"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5 M12 17v.1"/>',
    close:'<path d="m6 6 12 12 M6 18 18 6"/>'
  };
  function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.cube}</svg>`; }
  function fillIcons(root = document) { $$('[data-icon]', root).forEach(el => {el.innerHTML = icon(el.dataset.icon);}); }
  function fit() {
    $('#dashboard').dataset.scale='1';
    drawFrames();drawHotspotFrames();renderFlow();renderEnergy();
    if (!$('#deviceMenu').hidden) positionPicker();
  }
  function drawFrames() {
    $$('.panel').forEach(panel => {
      let svg = $('.panel-frame', panel);
      if (!svg) { svg = document.createElementNS(NS,'svg');svg.classList.add('panel-frame');svg.setAttribute('aria-hidden','true');panel.append(svg); }
      const w = panel.offsetWidth, h = panel.offsetHeight;
      svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('preserveAspectRatio','none');
      svg.innerHTML = `<path d="M10 .7H${w-10}L${w-.7} 10V${h-10}L${w-10} ${h-.7}H10L.7 ${h-10}V10Z" fill="none" stroke="#0d6ca0" stroke-opacity=".76" stroke-width=".8"/><path d="M1 23V10L10 1H40 M${w-27} 1H${w-10}L${w-1} 10V26 M1 ${h-26}V${h-10}L10 ${h-1}H35 M${w-34} ${h-1}H${w-10}L${w-1} ${h-10}V${h-24}" fill="none" stroke="#24bffc" stroke-width="1.1"/><path d="M12 2H57" stroke="#7ddfff" stroke-opacity=".3"/><path d="M${w-12} ${h-3}h-17" stroke="#138ad1" stroke-opacity=".45"/>`;
    });
  }
  function timeString(date=new Date()){return date.toLocaleTimeString('en-GB',{hour12:false});}
  function clock(){ const now = new Date();$('#clock').textContent=timeString(now);$('#date').textContent=`${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;$('#headerWeek').textContent=['周日','周一','周二','周三','周四','周五','周六'][now.getDay()];$('#clock').setAttribute('datetime',now.toISOString()); }
  const device = () => data.devices.find(d => d.id === state.selectedId);
  function deviceById(id) { const d = data.devices.find(x => x.id === id);if(!d)throw new Error(`Unknown device ID: ${id}`);return d; }
  function emit(name, detail) { document.dispatchEvent(new CustomEvent(name,{detail:clone(detail)})); }
  function toast(message){ clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3500); }
  function totalFlow(){return data.devices.reduce((s,d)=>s+(d.flow||0),0);}
  function totalInlet(){const flow=totalFlow();return flow>0?flow+(data.plant.inletOffset??80):0;}
  function counts(){const result={...residualCounts};data.devices.forEach(d=>result[d.status]++);return result;}
  function renderStats(){
    const all=counts(), total=data.plant.totalDevices, circumference=2*Math.PI*61;
    let offset=0;
    const ring=Object.entries(META).map(([key,m])=>{const value=all[key],len=value/total*circumference,part=`<circle cx="80" cy="80" r="61" fill="none" stroke="${m.color}" stroke-width="13" stroke-dasharray="${Math.max(0,len-1.1)} ${circumference}" stroke-dashoffset="${-offset}"/>`;offset+=len;return part;}).join('');
    $('#statusDonut').innerHTML=`<circle cx="80" cy="80" r="70" fill="none" stroke="#123e5a" stroke-width=".7"/><circle cx="80" cy="80" r="61" fill="none" stroke="#0b2c45" stroke-width="13"/>${ring}<circle cx="80" cy="80" r="50" fill="none" stroke="#0b4969" stroke-width=".6"/>`;
    $('#statusDonut').setAttribute('aria-label',`设备总数${total}。${Object.keys(META).map(k=>META[k].text+all[k]+'台').join('，')}。`);
    $('#statusLegend').innerHTML=Object.entries(META).map(([k,m])=>`<div><dt><b class="legend-swatch" style="background:${m.color}"></b>${m.text}</dt><dd>${all[k]}<small>${(all[k]/total*100).toFixed(1)}%</small></dd></div>`).join('');
    const totalValue=totalFlow(), running=data.devices.filter(d=>d.status==='running').length;
    $('#inletFlow').textContent=fmt(totalInlet());$('#outletFlow').textContent=fmt(totalValue);
    $('#headerPressure').textContent=running?fmt(data.plant.pressure??.36,2):'0.00';$('#runningPumps').innerHTML=state.scope==='campus'?`${all.running}<span class="denominator"> / ${total}</span>`:`${running}<span class="denominator"> / 4</span>`;
    const labels=state.scope==='campus'?['全厂进水流量','全厂出水流量','出厂压力','全厂运行设备']:['泵房进水流量','泵房出水流量','出水母管压力','当前运行机组'];
    $$('.scene-kpi p').forEach((element,index)=>element.textContent=labels[index]);
  }
  function renderMetricPeriod(){
    const p=data.plant[state.metricPeriod], month=state.metricPeriod==='month';
    $('#supplyLabel').textContent=month?'本月供水量':'演示日供水量';$('#energyLabel').textContent=month?'本月用电量':'演示日用电量';
    $('#supplyValue').textContent=fmt(p.supply);$('#energyValue').textContent=month?fmt(p.energy/10000,2):fmt(p.energy,1);
    $('#energyValue').nextElementSibling.textContent=month?'万 kWh':'kWh';$('#intensityValue').textContent=fmt(p.intensity,3);
    setSegments('#metricPeriod',state.metricPeriod);
  }
  function setSegments(selector,value){ $$('button',$(selector)).forEach(b=>{const active=b.dataset.period===value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}); }
  // One closed outline includes the pointer, so no border crosses its base.
  function drawHotspotFrames(){
    $$('.hotspot-label').forEach(button=>{
      const w=button.offsetWidth,h=button.offsetHeight,c=w/2,svg=$('.hotspot-frame',button);
      if(!svg||!w||!h)return;
      svg.setAttribute('viewBox',`0 0 ${w} ${h+9}`);
      $('path',svg).setAttribute('d',`M5 .5H${w-5}Q${w-.5} .5 ${w-.5} 5V${h-5}Q${w-.5} ${h-.5} ${w-5} ${h-.5}H${c+8}L${c} ${h+7.5}L${c-8} ${h-.5}H5Q.5 ${h-.5} .5 ${h-5}V5Q.5 .5 5 .5Z`);
    });
  }
  function renderHotspots(){
    $('#deviceHotspots').innerHTML=data.devices.map(d=>`<div class="device-hotspot" style="left:${d.x}%;top:${d.y}%;--device-color:${META[d.status].color}"><span class="hotspot-stem"></span><span class="hotspot-anchor"></span><button class="hotspot-label ${d.status} ${d.id===state.selectedId?'selected':''}" data-select="${d.id}" aria-pressed="${d.id===state.selectedId}" aria-label="${d.name}，${META[d.status].text}，查看设备详情"><svg class="hotspot-frame" aria-hidden="true"><defs><linearGradient id="hotspot-fill-${d.id}" x1="0" y1="0" x2="1" y2="1"><stop class="hotspot-fill-start"/><stop class="hotspot-fill-end" offset="1"/></linearGradient></defs><path fill="url(#hotspot-fill-${d.id})"/></svg><span class="hotspot-title"><b></b>${d.shortName} <small style="font-size:9px;color:#75b1cc;margin-left:auto">${d.id}</small></span><span class="hotspot-status">${META[d.status].text}</span><span class="hotspot-flow">${fmt(d.flow)} <small>m³/h</small></span></button></div>`).join('');
    $('#deviceHotspots').hidden=!state.labels;
    drawHotspotFrames();
  }
  function spark(values,color='#51ccff') {
    const clean=values.filter(Number.isFinite);if(!clean.length)return '';
    let min=Math.min(...clean),max=Math.max(...clean);if(max===min){min-=1;max+=1;}
    const points=clean.map((v,i)=>`${i/(clean.length-1||1)*58},${22-(v-min)/(max-min)*17}`).join(' ');
    return `<svg class="data-spark" viewBox="0 0 60 28" aria-hidden="true"><defs><linearGradient id="spark-${Math.round(clean[0]*10)}" x2="0" y2="1"><stop stop-color="${color}" stop-opacity=".12"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="M0 27 ${points.split(' ').map(p=>'L'+p).join(' ')} L58 27Z" fill="url(#spark-${Math.round(clean[0]*10)})"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.25"/><circle cx="58" cy="${22-(clean.at(-1)-min)/(max-min)*17}" r="1.25" fill="${color}"/></svg>`;
  }
  function miniValues(base,index=0){if(base==null)return [];if(base===0)return [0,0,0,0,0,0,0];return [.91,.94,.92,.98,.955,1.01,1].map((m,i)=>+(base*(m+(i%3===0?index*.001:0))).toFixed(3));}
  function positionPicker(){
    const trigger=$('#devicePickerTrigger').getBoundingClientRect(), board=$('#dashboard').getBoundingClientRect();
    const scale=Number($('#dashboard').dataset.scale)||1, menu=$('#deviceMenu');
    menu.style.left=`${Math.max(16,Math.min($('#dashboard').clientWidth-262,(trigger.right-board.left)/scale-246))}px`;
    menu.style.top=`${(trigger.bottom-board.top)/scale+9}px`;
  }
  function renderPicker(){
    const d=device(),trigger=$('#devicePickerTrigger');
    trigger.innerHTML=`<span class="picker-name">${esc(d.name)}</span><span class="picker-chevron">${icon('chevron')}</span>`;
    $('#deviceOptions').innerHTML=data.devices.map((item,i)=>{
      const meta=META[item.status],selected=item.id===state.selectedId;
      return `<div id="device-option-${item.id}" class="device-option ${selected?'is-selected':''} ${i===pickerIndex?'is-highlighted':''}" role="option" aria-selected="${selected}" aria-label="${esc(item.name)} ${item.id} ${meta.text}" data-device-option="${item.id}" style="--status-color:${meta.color}"><span class="device-option-icon">${icon('pump')}</span><span class="device-option-copy"><strong>${esc(item.name)}</strong><small>${item.id}</small></span><span class="device-option-state"><b></b>${meta.text}</span><span class="device-option-check" aria-hidden="true">${selected?'✓':''}</span></div>`;
    }).join('');
    if(!$('#deviceMenu').hidden)trigger.setAttribute('aria-activedescendant',`device-option-${data.devices[pickerIndex].id}`);
  }
  function closePicker(restoreFocus=false){
    $('#deviceMenu').hidden=true;$('#devicePickerTrigger').setAttribute('aria-expanded','false');
    $('#devicePickerTrigger').removeAttribute('aria-activedescendant');
    if(restoreFocus)$('#devicePickerTrigger').focus();
  }
  function openPicker(){
    pickerIndex=data.devices.findIndex(d=>d.id===state.selectedId);
    $('#deviceMenu').hidden=false;$('#devicePickerTrigger').setAttribute('aria-expanded','true');
    renderPicker();positionPicker();$('#devicePickerTrigger').focus();
  }
  function bindPicker(){
    const trigger=$('#devicePickerTrigger'),menu=$('#deviceMenu');
    trigger.addEventListener('click',()=>menu.hidden?openPicker():closePicker());
    trigger.addEventListener('keydown',e=>{
      const keys=['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'];
      if(e.key==='Tab'){closePicker();return;}
      if(!keys.includes(e.key))return;e.preventDefault();
      if(e.key==='Escape'){closePicker(true);return;}
      if(menu.hidden){openPicker();if(e.key==='Home')pickerIndex=0;else if(e.key==='End')pickerIndex=data.devices.length-1;renderPicker();return;}
      if(e.key==='Enter'||e.key===' '){selectDevice(data.devices[pickerIndex].id);closePicker(true);return;}
      if(e.key==='Home')pickerIndex=0;
      else if(e.key==='End')pickerIndex=data.devices.length-1;
      else pickerIndex=(pickerIndex+(e.key==='ArrowDown'?1:data.devices.length-1))%data.devices.length;
      renderPicker();
    });
    menu.addEventListener('click',e=>{const option=e.target.closest('[data-device-option]');if(option){selectDevice(option.dataset.deviceOption);closePicker(true);}});
    document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!trigger.contains(e.target))closePicker();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden)closePicker(true);});
  }

  function renderDevice(){
    if(state.scope==='campus'){state.adapter?.refreshArea?.();return;}
    const d=device(),m=META[d.status];$('#deviceSelect').value=d.id;renderPicker();$('#deviceName').textContent=d.name;$('#deviceId').textContent=d.id;$('#deviceCode').textContent=`PUMP / ${d.id}`;
    deviceModel?.updateDevice(clone(d));
    $('#deviceUpdated').textContent=d.status==='offline'?'数据离线':timeString(state.lastUpdated);
    $('#deviceStatus').className=`status-badge ${d.status}`;$('#deviceStatus').innerHTML=`<b></b>${m.text}`;
    const fields=[['流量','flow','m³/h',0],['扬程','head','m',1],['出口压力','pressure','MPa',2],['电机电流','current','A',1],['转速','rpm','rpm',0],['电机温度','temperature','℃',1]];
    $('#liveData').innerHTML=fields.map(([label,key,unit,digits],i)=>{const bad=key==='temperature'&&d.status==='alarm';return `<article class="data-card ${bad?'critical':''}"><p class="data-label">${label}</p><div class="data-number"><strong>${fmt(d[key],digits)}</strong><small>${unit}</small></div>${spark(miniValues(d[key],i),bad?'#ff7181':key==='temperature'?'#d9b875':'#71cefa')}</article>`;}).join('');
    renderDeviceTrend(); renderDeviceHistory();
  }
  function renderDeviceTrend(){
    const d=device(),values=d.status==='offline'?Array(12).fill(null):data.flow.outlet.map((v,i)=>d.flow===0?0:Math.round(v/data.flow.outlet.at(-1)*d.flow));
    $('#deviceTrend').innerHTML=`<div class="device-trend-summary"><div><span>${d.name} · 流量</span><strong>${fmt(d.flow)} <small>m³/h</small></strong></div><small>模拟历史 · 最近24h</small></div><svg viewBox="0 0 360 151" role="img" aria-label="${d.name}流量模拟曲线">${lineChartMarkup({w:360,h:151,labels:data.flow.labels,series:[{values,color:'#37c7ff',id:'device-line'}],step:300,unit:'m³/h'})}</svg><p class="device-trend-caption">${d.status==='offline'?'设备离线，当前采样不可用':'曲线使用演示样例，数值随本地状态变化'}</p>`;
  }
  function renderDeviceHistory(){const d=device();$('#deviceHistory').innerHTML=[['2026.09.12','例行巡检','检查外观、底座与连接状态。'],['2026.08.26','运行记录检查','核对采样记录与演示设备台账。'],['2026.08.05','演示资产入库','完成设备编号与页面信息绑定。']].map(([date,title,note])=>`<article class="history-item"><time>${date} / ${d.id}</time><h4>${title}</h4><p>${note}（示例记录）</p></article>`).join('');}
  function renderWater(){ $('#waterGrid').innerHTML=data.water.map((x,i)=>`<article class="data-card"><p class="data-label">${x.label}</p><div class="data-number"><strong>${fmt(x.value,i<2?2:1)}</strong><small>${x.unit}</small></div>${spark(x.series,x.color)}</article>`).join(''); }
  function lineChartMarkup({w=500,h=162,labels,series,max,step=500,unit='m³/h'}){
    const observed=Math.max(0,...series.flatMap(item=>item.values).filter(Number.isFinite));
    max=Math.max(max||0,Math.ceil(observed*1.15/step)*step,step);
    const p={l:39,r:13,t:28,b:25},pw=w-p.l-p.r,ph=h-p.t-p.b;
    let markup=`<text class="chart-unit" x="5" y="13">${unit}</text>`;
    for(let val=0;val<=max;val+=step){const y=p.t+(max-val)/max*ph;markup+=`<line class="chart-grid-line" x1="${p.l}" x2="${w-p.r}" y1="${y}" y2="${y}"/><text class="chart-axis" x="${p.l-7}" y="${y+3}" text-anchor="end">${fmt(val)}</text>`;}
    labels.forEach((label,i)=>{const x=p.l+i/(labels.length-1)*pw;markup+=`<line class="chart-grid-line" x1="${x}" x2="${x}" y1="${p.t}" y2="${h-p.b}"/>`;if(i%(w<360?3:2)===0||i===labels.length-1)markup+=`<text class="chart-axis" text-anchor="middle" x="${x}" y="${h-6}">${label}</text>`;});
    series.forEach(({values,color,id})=>{if(values.every(x=>x==null))return;const pts=values.map((v,i)=>[p.l+i/(values.length-1)*pw,p.t+(max-(v||0))/max*ph]);let d=pts.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
      markup+=`<defs><linearGradient id="${id}-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${color}" stop-opacity=".2"/><stop offset="1" stop-color="${color}" stop-opacity=".015"/></linearGradient></defs><path d="${d}L${pts.at(-1)[0]} ${h-p.b}H${p.l}Z" fill="url(#${id}-fill)"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>`;
      markup+=pts.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="1.9" fill="${color}" stroke="#c0eeff" stroke-width=".3"/>`).join('');
    });return markup;
  }
  function renderFlow(){ const svg=$('#flowChart'),w=Math.max(240,svg.clientWidth),h=Math.max(120,svg.clientHeight);svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.innerHTML=lineChartMarkup({w,h,labels:data.flow.labels,series:[{values:data.flow.inlet,color:'#23baff',id:'flow-inlet'},{values:data.flow.outlet,color:'#25dabc',id:'flow-outlet'}]}); }
  function renderEnergy(){
    const cfg=data.energy[state.energyPeriod],w=Math.max(240,$('#energyChart').clientWidth),h=Math.max(120,$('#energyChart').clientHeight),p={l:43,r:14,t:28,b:25},pw=w-p.l-p.r,ph=h-p.t-p.b;
    let s=`<defs><linearGradient id="bar-fill" x1="0" x2=".25" y1="0" y2="1"><stop stop-color="#36d8ff"/><stop offset=".48" stop-color="#149ae9"/><stop offset="1" stop-color="#1555c6" stop-opacity=".68"/></linearGradient><linearGradient id="bar-highlight" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#68e8ff"/><stop offset="1" stop-color="#158cd7"/></linearGradient></defs><text class="chart-unit" x="5" y="13">${cfg.unit}</text>`;
    [0,cfg.max/2,cfg.max].forEach(v=>{const y=p.t+(cfg.max-v)/cfg.max*ph;s+=`<line class="chart-grid-line" x1="${p.l}" x2="${w-p.r}" y1="${y}" y2="${y}"/><text class="chart-axis" text-anchor="end" x="${p.l-7}" y="${y+3}">${fmt(v)}</text>`;});
    const step=pw/cfg.values.length;
    cfg.values.forEach((v,i)=>{const x=p.l+i*step+step*.21,bw=step*.4,y=p.t+(cfg.max-v)/cfg.max*ph,bh=h-p.b-y;s+=`<line class="chart-grid-line" x1="${x+bw/2}" x2="${x+bw/2}" y1="${p.t}" y2="${h-p.b}"/><rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="1.1" fill="url(#${i===cfg.values.length-1?'bar-highlight':'bar-fill'})"/><path d="M${x} ${y+.5}h${bw}" stroke="#91edff" stroke-opacity=".55"/><text class="chart-axis" x="${x+bw/2}" y="${h-6}" text-anchor="middle">${cfg.labels[i]}</text><rect class="bar-hit" data-bar="${i}" x="${p.l+i*step}" y="${p.t}" width="${step}" height="${ph}"/>`;});
    $('#energyChart').setAttribute('viewBox',`0 0 ${w} ${h}`);$('#energyChart').innerHTML=s;setSegments('#energyPeriod',state.energyPeriod);
  }
  function chartTooltips(){
    const svg=$('#flowChart'),tip=$('#flowTooltip');
    svg.addEventListener('pointermove',e=>{const rect=svg.getBoundingClientRect(),w=svg.viewBox.baseVal.width,x=(e.clientX-rect.left)/rect.width*w,i=Math.max(0,Math.min(11,Math.round((x-39)/(w-39-13)*11)));tip.innerHTML=`<small>模拟时点 · ${data.flow.labels[i]}</small><div><b style="background:#23baff"></b>进水 <strong>${fmt(data.flow.inlet[i])}</strong></div><div><b style="background:#25dabc"></b>出水 <strong>${fmt(data.flow.outlet[i])}</strong> <small>m³/h</small></div>`;tip.hidden=false;const px=x/w*$('#flowChartWrap').clientWidth;tip.style.left=Math.min(Math.max(px-38,8),$('#flowChartWrap').clientWidth-155)+'px';tip.style.top='6px';});svg.addEventListener('pointerleave',()=>tip.hidden=true);
    $('#energyChart').addEventListener('pointermove',e=>{const rect=$('#energyChart').getBoundingClientRect(),w=$('#energyChart').viewBox.baseVal.width,x=(e.clientX-rect.left)/rect.width*w,i=Math.max(0,Math.min(6,Math.floor((x-43)/(w-43-14)*7))),cfg=data.energy[state.energyPeriod],t=$('#energyTooltip');t.innerHTML=`<small>${cfg.labels[i]} · 模拟值</small><div><strong>${fmt(cfg.values[i],state.energyPeriod==='day'?0:1)}</strong> ${cfg.unit}</div>`;t.hidden=false;t.style.left=Math.min(Math.max(x-80,7),$('#energyChartWrap').clientWidth-139)+'px';t.style.top='10px';});$('#energyChart').addEventListener('pointerleave',()=>$('#energyTooltip').hidden=true);
  }
  function renderPlan(){
    let s=`<svg viewBox="0 0 900 420" role="img" aria-label="四台水泵的概念平面布置图"><defs><pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#125472" stroke-width=".5" opacity=".35"/></pattern></defs><rect x="34" y="39" width="831" height="335" rx="3" fill="url(#floor-grid)" stroke="#387d9e" stroke-width="2"/><path d="M24 29H875 M24 25v8 M875 25v8" stroke="#38677e"/><text x="450" y="21" text-anchor="middle" fill="#507e99" font-size="10">概念布置 · 不按比例</text><path d="M55 109H844 M55 296H844" stroke="#0b537f" stroke-width="15"/><path d="M55 109H844 M55 296H844" stroke="#31b8ed" stroke-width="2"/><text x="70" y="91" fill="#6fb3d4" font-size="12">进水母管</text><text x="716" y="321" fill="#6fb3d4" font-size="12">出水母管</text><path d="m115 104 8 5-8 5 M785 291l8 5-8 5" fill="none" stroke="#9eeaff" stroke-width="2"/>`;
    data.devices.forEach((d,i)=>{const x=154+i*197,c=META[d.status].color,sel=d.id===state.selectedId;s+=`<g class="plan-device" data-select="${d.id}" role="button" tabindex="0" aria-label="选择${d.name}"><path d="M${x} 109V296" stroke="#155f86" stroke-width="10"/><path d="M${x} 109V296" stroke="#54b2d1" stroke-width="1.6"/><path d="m${x-9} 135 18 14h-18l18-14Z" stroke="#639bad" fill="#08253a"/><rect class="device-outline" x="${x-57}" y="173" width="114" height="78" rx="5" stroke="${sel?'#84e9ff':c}" stroke-width="${sel?2:1}" fill="${sel?'#0b4565':'#062238'}"/><rect x="${x-41}" y="193" width="44" height="31" rx="3" fill="#125781" stroke="#5399bd"/><path d="M${x-35} 196v25 M${x-29} 196v25 M${x-23} 196v25 M${x-17} 196v25" stroke="#86bbcf" opacity=".65"/><circle cx="${x+18}" cy="209" r="20" fill="#12557c" stroke="#62bfdb"/><circle cx="${x+18}" cy="209" r="9" fill="#03213a" stroke="#51afd0"/><circle cx="${x+40}" cy="184" r="3" fill="${c}"/><text x="${x}" y="237" text-anchor="middle" fill="#bfe7f8" font-size="10">${d.id}</text><text x="${x}" y="340" text-anchor="middle" fill="#c1e7f5" font-size="14">${d.name}</text><text x="${x}" y="359" text-anchor="middle" fill="${c}" font-size="11">${META[d.status].text} · ${fmt(d.flow)} m³/h</text></g>`;});
    s+='<path d="M430 374v-11 M480 374v-11" stroke="#70a6bd" stroke-width="2"/><text x="450" y="402" text-anchor="middle" fill="#4b7c99" font-size="10">教学示意资料 · 空间尺寸与管道连接需结合真实项目复核</text></svg>';$('#planView').innerHTML=s;
  }
  function renderProcess(){
    if(state.scope==='campus')return;
    let s=`<svg viewBox="0 0 900 420" role="img" aria-label="四台水泵并联的管路示意图"><path d="M86 207H217 M217 81V328 M645 81V328 M645 207H816" fill="none" stroke="#116495" stroke-width="10"/><path d="M86 207H217 M217 81V328 M645 81V328 M645 207H816" fill="none" stroke="#26c3ee" stroke-width="1.8"/><rect x="44" y="153" width="133" height="107" rx="5" fill="#082c47" stroke="#2093bf"/><text x="110" y="181" text-anchor="middle" fill="#b3d8eb" font-size="14">进水母管</text><text x="110" y="214" text-anchor="middle" fill="#6be1ff" font-size="23">${fmt(totalInlet())}</text><text x="110" y="236" text-anchor="middle" fill="#6599b8" font-size="11">m³/h · 模拟</text><rect x="724" y="153" width="133" height="107" rx="5" fill="#082c47" stroke="#2093bf"/><text x="790" y="181" text-anchor="middle" fill="#b3d8eb" font-size="14">出水母管</text><text x="790" y="214" text-anchor="middle" fill="#6be1ff" font-size="23">${fmt(totalFlow())}</text><text x="790" y="236" text-anchor="middle" fill="#6599b8" font-size="11">m³/h · 模拟</text>`;
    data.devices.forEach((d,i)=>{const y=81+i*82,c=META[d.status].color,selected=d.id===state.selectedId;s+=`<path d="M217 ${y}H645" stroke="#104c6d" stroke-width="7"/><path d="M217 ${y}H645" stroke="${d.status==='running'?'#36c5eb':'#39576c'}" stroke-width="1.7"/><g class="plan-device" role="button" tabindex="0" data-select="${d.id}" aria-label="选择${d.name}"><rect class="device-outline" x="323" y="${y-26}" width="157" height="52" rx="5" fill="${selected?'#0c4561':'#07273f'}" stroke="${selected?'#93e9ff':c}" stroke-width="${selected?2:1}"/><circle cx="342" cy="${y}" r="4" fill="${c}"/><text x="357" y="${y-5}" fill="#d4e9f5" font-size="13">${d.name} / ${d.id}</text><text x="357" y="${y+14}" fill="${c}" font-size="10">${META[d.status].text} · ${fmt(d.flow)} m³/h</text></g><path d="m544 ${y-10} 23 20h-23l23-20Z" fill="#07243b" stroke="#7ba4bb"/><path d="M555.5 ${y-11}v-9 M549 ${y-20}h13" stroke="#789fb7"/>`;if(d.status==='running')s+=`<path d="m267 ${y-4} 7 4-7 4 M602 ${y-4}l7 4-7 4" fill="none" stroke="#7be8ff" stroke-width="1.5"/>`;});
    s+='<text x="450" y="394" text-anchor="middle" fill="#54819b" font-size="10">四泵并联管路示意 · 不包含水力计算</text></svg>';$('#processView').innerHTML=s;
  }
  function setView(view){
    if(!['scene','plan','process'].includes(view))return;
    if(state.scope==='campus'&&view==='process')view='scene';
    const campus=state.scope==='campus',interactiveView=view==='scene'||(campus&&view==='plan'),showModel=!!state.adapter&&interactiveView;
    state.view=view;$('#dashboard').dataset.sceneView=view;$('#sceneGraphic').hidden=view!=='scene'||!!state.adapter;$('#planView').hidden=campus||view!=='plan';$('#processView').hidden=view!=='process';$('#modelMount').hidden=!showModel;
    $('.scene-panel').classList.toggle('has-model',showModel);
    $('.scene-panel').classList.toggle('scene-view-blueprint',!interactiveView);
    $('.scene-caption h2').textContent=campus?data.plant.name:'送水机房';
    $('#sceneViewCaption').textContent=campus?{scene:'CAMPUS / 厂区三维总览',plan:'CAMPUS / 厂区俯视布局'}[view]:{scene:state.adapter?'PUMP STATION / 可交互三维场景':'PUMP STATION / 场景效果预览',plan:'LAYOUT / 泵房平面布置',process:'PIPEWORK / 四泵并联管路'}[view];
    $('.scene-demo-badge').textContent=campus?'照片重建':view==='scene'?(state.adapter?'CAD · 3D':'静态素材'):'代码绘制';
    $('.scene-footnote').textContent=campus?'点击区域查看数据 · 送水机房可进入':view==='scene'&&state.adapter?'拖动旋转 · 滚轮缩放 · 点击选中 · 双击定位':'点击设备标签，查看对应数据';
    $('#sceneSourceLabel').textContent=campus?'实拍重建厂区 · 演示模型':'CAD 泵房 · 部件交互';
    const viewLabels=campus?{scene:'厂区三维',plan:'厂区俯视',process:'管路图'}:{scene:'泵房三维',plan:'泵房平面',process:'管路图'};
    $$('.scene-tabs button').forEach(button=>{let label=$('span',button);if(!label){[...button.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).forEach(node=>node.remove());label=document.createElement('span');button.append(label);}label.textContent=viewLabels[button.dataset.view];button.setAttribute('aria-label',viewLabels[button.dataset.view]);button.hidden=campus&&button.dataset.view==='process';});
    $('[data-nav="process"]').textContent='管路图';$('[data-nav="process"]').hidden=campus;
    $('[data-nav="overview"]').textContent=campus?'厂区总览':'泵房总览';
    $('.scene-panel').setAttribute('aria-label',campus?'厂区三维总览与功能区域选择':'送水机房场景与设备选择');
    $$('.scene-tabs button').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('#zoomIn').disabled=!interactiveView;$('#zoomOut').disabled=!interactiveView;$('#toggleLabels').disabled=!interactiveView;$('#resetView').disabled=!interactiveView;
    if(!campus&&view==='plan')renderPlan();if(view==='process')renderProcess();
    if(view==='scene')drawHotspotFrames();
    setNav(view==='process'?'process':'overview');
    state.adapter?.setView?.(view);
  }
  function setNav(key){$$('[data-nav]').forEach(b=>{const a=b.dataset.nav===key;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});}
  // 三维点击通过 onSelect 把设备编号传到这里：同一个编号连接卡片与模型高亮。
  // renderDevice() 更新详情 UI；adapter.selectDevice() 更新模型的选中表现。
  function selectDevice(id){deviceById(id);state.selectedId=id;if(state.scope==='campus')state.adapter?.enterPump?.();renderHotspots();renderDevice();if(state.view==='plan')renderPlan();if(state.view==='process')renderProcess();state.adapter?.selectDevice?.(id);emit('water:device-selected',{id});}
  function setTab(tab){if(!['live','trend','history'].includes(tab))return;state.tab=tab;$$('.data-tabs button').forEach(b=>{const a=b.dataset.tab===tab;b.classList.toggle('active',a);b.setAttribute('aria-selected',String(a));b.tabIndex=a?0:-1;});$('#liveData').hidden=tab!=='live';$('#deviceTrend').hidden=tab!=='trend';$('#deviceHistory').hidden=tab!=='history';}
  function setZoom(value){state.zoom=Math.max(state.adapter ? .7 : 1,Math.min(state.adapter?3.5:1.65,value));$('#sceneGraphic').style.transform=`scale(${state.zoom})`;state.adapter?.zoom?.(state.zoom);}
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前浏览器未允许全屏，可使用浏览器的全屏菜单。');}}
  function showModal(title,content,{wide=false}={}){
    focusBeforeModal=document.activeElement;$('#modalTitle').textContent=title;$('#modalContent').innerHTML=content;$('#modal').classList.toggle('wide',wide);fillIcons($('#modalContent'));$('#modalBackdrop').hidden=false;$('#closeModal').focus();
  }
  function closeModal(){ $('#modalBackdrop').hidden=true;focusBeforeModal?.focus?.();setNav(state.view==='process'?'process':'overview'); }
  function archive(){const d=device();showModal(`${d.name} · 设备档案`,`<div class="modal-note">这是供教学演示使用的设备台账。设备模型为示意资产，未使用生产厂家型号参数或真实维护数据。</div><dl class="modal-facts">${[['设备编号',d.id],['设备名称',d.name],['设备类型','卧式离心泵'],['安装区域',data.plant.area||'送水机房'],['当前状态',META[d.status].text],['数据来源','本地模拟器']].map(([k,v])=>`<div class="modal-fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><div class="modal-note" style="margin-bottom:0">模型接入标识：<strong>${d.id}</strong><br>对应 CAD 与 Blender 模型中的同名设备；尺寸依据演示图纸，外观采用简化工业造型。</div>`);}
  function simulate(){const d=device();showModal(`${d.name} · 状态演示`,`<div class="modal-note">仅改变本地演示数据，不向现场设备发送指令。设备标签、模型状态、管道流向、统计和详情会同步更新。</div><div class="simulation-options">${['running','stopped','alarm','offline'].map(k=>`<label class="simulation-option"><input type="radio" name="simState" value="${k}" ${d.status===k?'checked':''}><span style="--choice-color:${META[k].color}"><i></i>${META[k].text}</span></label>`).join('')}</div><div class="modal-buttons"><button class="outline-button" id="cancelSimulation">取消</button><button class="outline-button primary" id="applySimulation">应用演示状态</button></div>`);
    $('#cancelSimulation').onclick=closeModal;$('#applySimulation').onclick=()=>{const next=$('input[name="simState"]:checked');if(!next)return;applySimulation(d.id,next.value);closeModal();toast(`${d.name}已切换为${META[next.value].text}（本地演示）`);};
  }
  function applySimulation(id,status){
    const d=deviceById(id),base=originalDevices.find(x=>x.id===id);d.status=status;
    if(status==='offline'){for(const k of ['flow','head','pressure','current','rpm','temperature'])d[k]=null;}
    else if(status==='running'){Object.assign(d,{flow:d.baseFlow,head:42.8,pressure:data.plant.pressure??.36,current:base.current||132.6,rpm:1480,temperature:base.status==='alarm'?60.5:base.temperature});}
    else Object.assign(d,{flow:0,head:0,pressure:data.plant.pressure??.36,current:0,rpm:0,temperature:status==='alarm'?86.3:29.2});
    if(status==='alarm'&&!state.alarms.some(a=>a.deviceId===id&&a.level==='high'))state.alarms.unshift({id:`AL-SIM-${Date.now()}`,deviceId:id,device:d.shortName,time:timeString(),title:'模拟温度告警',level:'high',value:'86.3 ℃',description:'通过本地状态演示面板创建的模拟告警。',acknowledged:false});
    if(status!=='alarm')state.alarms=state.alarms.filter(a=>a.deviceId!==id||a.level!=='high');
    state.lastUpdated=new Date();renderAllData();renderAlarms();state.adapter?.updateDevice?.(clone(d));emit('water:device-updated',d);
  }
  function renderAlarms(){
    const latest=state.alarms.slice(0,4);$('#alarmTable').innerHTML=latest.length?latest.map(a=>`<tr class="${a.level==='high'?'critical':''}"><td>${esc(a.time)}</td><td>${esc(a.device)}</td><td><button class="alarm-row-button" data-alarm="${esc(a.id)}" title="查看${esc(a.title)}详情">${esc(a.title)}</button></td><td><span class="severity ${a.level==='high'?'high':a.level==='low'?'low':''}">${a.level==='high'?'高':a.level==='medium'?'中':'提示'}</span></td></tr>`).join(''):'<tr><td colspan="4">暂无演示告警</td></tr>';
    $('#alertCount').textContent=state.alarms.length;$('#navAlarmCount').textContent=state.alarms.length;
  }
  function allAlarms(){setNav('alarms');showModal('告警中心 · 演示记录',`<div class="modal-note">当前展示 ${state.alarms.length} 条样例告警。确认操作仅修改页面记录；设备状态由独立的模拟情景管理。</div><table class="modal-table"><thead><tr><th>时间</th><th>设备</th><th>告警内容</th><th>采样值</th><th>操作</th></tr></thead><tbody>${state.alarms.map(a=>`<tr><td style="font-family:var(--mono)">${esc(a.time)}</td><td>${esc(a.device)}</td><td>${esc(a.title)}<span class="table-detail">${a.level==='high'?'高级':a.level==='medium'?'中级':'提示'} · 模拟记录</span></td><td>${esc(a.value)}</td><td><button data-ack="${esc(a.id)}" ${a.acknowledged?'disabled':''}>${a.acknowledged?'已确认':'确认告警'}</button></td></tr>`).join('')}</tbody></table>`,{wide:true});
    $$('[data-ack]',$('#modalContent')).forEach(b=>b.onclick=()=>{const a=state.alarms.find(x=>x.id===b.dataset.ack);a.acknowledged=true;b.textContent='已确认';b.disabled=true;renderAlarms();});
  }
  function alarmDetail(id){
    const a=state.alarms.find(x=>x.id===id);if(!a)return;
    const knownPump=data.devices.some(d=>d.id===a.deviceId), temperatureAlarm=knownPump&&a.title.includes('温度');
    const facts=[['设备',a.deviceId],['模拟发生时间',a.time],['采样值',a.value],...(a.thresholdText?[['演示阈值',a.thresholdText],['越限量',a.excessText||a.excess]]:[]),['确认状态',a.acknowledged?'已确认':'待确认']];
    showModal(`${a.device} · ${a.title}`,`<div class="modal-note">${esc(a.description)}${temperatureAlarm?`<br>此模拟温度告警关联电机外壳测点。演示规则：温度 ≥${DEMO_TEMPERATURE_ALARM.threshold}℃；本条采样 ${esc(a.value)}。进入模型可查看测点，内部零件尚未诊断损坏。`:''}</div><dl class="modal-facts">${facts.map(([k,v])=>`<div class="modal-fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><div class="modal-buttons">${knownPump?`<button class="outline-button" id="locateAlarm">${temperatureAlarm?'查看异常部件':'定位设备'}</button>`:a.zoneId?'<button class="outline-button" id="locateAreaAlarm">定位厂区区域</button>':''}<button class="outline-button primary" id="ackAlarm" ${a.acknowledged?'disabled':''}>${a.acknowledged?'已确认':'确认告警'}</button></div>`);
    $('#ackAlarm').onclick=()=>{a.acknowledged=true;renderAlarms();closeModal();toast('已确认这条模拟告警，设备状态保持不变。');};
    if($('#locateAlarm'))$('#locateAlarm').onclick=()=>{
      selectDevice(a.deviceId);setView('scene');closeModal();
      if(temperatureAlarm&&typeof state.adapter?.openInspection==='function')state.adapter.openInspection(a.deviceId,'motor');
      else state.adapter?.focusDevice?.(a.deviceId);
    };
    if($('#locateAreaAlarm'))$('#locateAreaAlarm').onclick=()=>{state.adapter?.enterCampus?.({zoneId:a.zoneId,focus:true});closeModal();};
  }
  function equipmentList(){setNav('equipment');showModal('设备监测 · 送水机房',`<div class="modal-note">当前示范场景包含四台水泵。选择设备后，场景标签与右侧详情同步定位。</div><div class="equipment-rows">${data.devices.map(d=>`<button data-choose-device="${d.id}"><span>${d.name} <small>${d.id}</small></span><span style="color:${META[d.status].color}">${META[d.status].text}</span><small>${fmt(d.flow)} m³/h　→</small></button>`).join('')}</div>`);$$('[data-choose-device]').forEach(b=>b.onclick=()=>{selectDevice(b.dataset.chooseDevice);setView('scene');state.adapter?.focusDevice?.(b.dataset.chooseDevice);closeModal();});}
  function plantModal(){state.adapter?.enterCampus?.({zoneId:'workshop'});}
  function analytics(){
    setNav('analytics');
    const p=data.plant.today;
    const chart=lineChartMarkup({w:760,h:205,labels:data.flow.labels,series:[
      {values:data.flow.inlet,color:'#23baff',id:'analysis-inlet'},
      {values:data.flow.outlet,color:'#25dabc',id:'analysis-outlet'}
    ]});
    showModal('数据分析 · 运行概览',`<div class="modal-note">当前数值与大屏共享同一组本地模拟数据。以下趋势为演示样本，不代表真实生产记录。</div>
      <dl class="modal-facts">
        <div class="modal-fact"><dt>今日供水量</dt><dd>${fmt(p.supply)} <small>m³</small></dd></div>
        <div class="modal-fact"><dt>当前出水流量</dt><dd>${fmt(totalFlow())} <small>m³/h</small></dd></div>
        <div class="modal-fact"><dt>今日用电量</dt><dd>${fmt(p.energy,1)} <small>kWh</small></dd></div>
        <div class="modal-fact"><dt>单位供水能耗</dt><dd>${fmt(p.intensity,3)} <small>kWh/m³</small></dd></div>
      </dl>
      <div class="nav-analysis-chart"><div class="nav-analysis-legend"><span><i style="--series-color:#23baff"></i>进水流量</span><span><i style="--series-color:#25dabc"></i>出水流量</span></div><svg viewBox="0 0 760 205" role="img" aria-label="本地模拟进出水流量趋势">${chart}</svg></div>`,{wide:true});
  }
  function help(){showModal('操作说明与演示范围',`<div class="modal-note">厂区依据实拍照片推演外观与布局，送水机房沿用 CAD 重建模型，所有读数为本地演示数据。设备通信和生产控制尚未接入。</div><div class="help-grid"><div><h3>从厂区进入泵房</h3><p>点击建筑或区域选择器查看区域数据。选中送水机房后点击“进入泵房”，继续查看四台泵及部件、零件；“返回厂区”会回到关联机房区域。</p></div><div><h3>选择设备与部件</h3><p>点击三维水泵、关联阀门或标签，或使用右侧下拉框；设备详情会同步切换。双击水泵下钻部件；结构查看支持拆解与透视，关联支路可查看进出水阀与管道。</p></div><div><h3>演示状态变化</h3><p>使用“状态演示”切换运行、停机、告警与离线。模型指示灯、告警颜色、流向动画、数字与标签同步联动。</p></div><div><h3>查看不同视图</h3><p>左键默认旋转；选择“平移”后左键拖动可移动模型，也可使用 Shift + 拖动或右键。滚轮缩放。厂区可切换三维与俯视；进入泵房后可查看泵房平面及四台泵的管路图。</p></div><div><h3>查看与检查</h3><p>图表支持悬停读数；能耗可切换日、月、年。告警支持查看、确认与定位；泵温度告警可直接查看关联电机部件。</p></div></div><div class="modal-note" style="margin-top:16px;margin-bottom:0">顶部暂停按钮可停止模拟刷新。内部结构、平面与工艺图用于教学示意，均未进行工程或水力校核。</div>`);}
  function renderAllData(){data.flow.outlet[data.flow.outlet.length-1]=totalFlow();data.flow.inlet[data.flow.inlet.length-1]=totalInlet();renderStats();renderHotspots();renderDevice();renderFlow();if(state.scope==='pump'&&state.view==='plan')renderPlan();if(state.view==='process')renderProcess();}
  function simulateTick(){
    if(!state.simulating)return;state.tick++;
    data.devices.forEach((d,i)=>{if(d.status!=='running')return;d.flow=Math.round(d.baseFlow+Math.sin(state.tick*.37+i*1.1)*3);d.current=+(132+i*.3+Math.sin(state.tick*.22+i)*.5).toFixed(1);});
    state.lastUpdated=new Date();data.flow.outlet[data.flow.outlet.length-1]=totalFlow();data.flow.inlet[data.flow.inlet.length-1]=totalInlet();renderAllData();data.devices.forEach(d=>state.adapter?.updateDevice?.(clone(d)));emit('water:telemetry',data.devices);
  }
  function setSimulation(playing){state.simulating=!!playing;$('#dashboard').classList.toggle('simulation-paused',!playing);const b=$('#simulationToggle');b.innerHTML=icon(playing?'pause':'play');b.title=playing?'暂停模拟刷新':'恢复模拟刷新';b.setAttribute('aria-label',b.title);}
  function bind(){
    addEventListener('resize',fit);document.addEventListener('fullscreenchange',fit);
    $('#deviceSelect').addEventListener('change',e=>selectDevice(e.target.value));
    bindPicker();
    $('#sceneViewport').addEventListener('click',e=>{const target=e.target.closest('[data-select]');if(target)selectDevice(target.dataset.select);});
    $('#sceneViewport').addEventListener('keydown',e=>{if(e.target.matches('g[data-select]')&&['Enter',' '].includes(e.key)){e.preventDefault();selectDevice(e.target.dataset.select);}});
    $$('.scene-tabs button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    $('#toggleLabels').onclick=()=>{state.labels=!state.labels;$('#deviceHotspots').hidden=!state.labels;if(state.labels)drawHotspotFrames();$('#toggleLabels').classList.toggle('active',state.labels);$('#toggleLabels').setAttribute('aria-pressed',String(state.labels));state.adapter?.setLabelsVisible?.(state.labels);};
    $('#zoomIn').onclick=()=>setZoom(state.zoom+.15);$('#zoomOut').onclick=()=>setZoom(state.zoom-.15);$('#resetView').onclick=()=>{setZoom(1);state.adapter?.reset?.();toast('视图已复位');};
    $('#fullscreenButton').onclick=fullscreen;
    $('#deviceArchive').onclick=archive;$('#deviceSimulation').onclick=simulate;
    $$('.data-tabs button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
    $('.data-tabs').addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const buttons=$$('.data-tabs button'),i=buttons.indexOf(document.activeElement);let n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;setTab(buttons[n].dataset.tab);buttons[n].focus();});
    $$('#metricPeriod button').forEach(b=>b.onclick=()=>{state.metricPeriod=b.dataset.period;renderMetricPeriod();});
    $$('#energyPeriod button').forEach(b=>b.onclick=()=>{state.energyPeriod=b.dataset.period;renderEnergy();$('#energyTooltip').hidden=true;});
    $('#simulationToggle').onclick=()=>{setSimulation(!state.simulating);toast(state.simulating?'已恢复本地模拟刷新':'已暂停本地模拟刷新');};
    $('#viewAlarms').onclick=allAlarms;$('#alarmTable').onclick=e=>{const t=e.target.closest('[data-alarm]');if(t)alarmDetail(t.dataset.alarm);};
    $('#plantExpand').onclick=plantModal;$('#plantPreview').onclick=plantModal;$('#helpButton').onclick=help;
    const navActions={overview:()=>setView('scene'),process:()=>setView('process'),analytics,equipment:equipmentList,alarms:allAlarms,help:()=>{setNav('help');help();}};
    $$('[data-nav]').forEach(b=>b.onclick=()=>{const action=navActions[b.dataset.nav];if(action)action();});
    $('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target===$('#modalBackdrop'))closeModal();};
    document.addEventListener('keydown',e=>{if($('#modalBackdrop').hidden)return;if(e.key==='Escape'){e.preventDefault();closeModal();}if(e.key==='Tab'){const focusable=$$('button:not([disabled]),input,select,[tabindex="0"]',$('#modal')).filter(el=>el.offsetParent!==null),first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    chartTooltips();
  }

  // Public bridge. Business data remains local; geometry is loaded from /models/.
  window.WaterDashboard = {
    getState:()=>clone({selectedId:state.selectedId,scope:state.scope,zoneId:state.zoneId,view:state.view,simulating:state.simulating,devices:data.devices,counts:counts(),alarms:state.alarms}),
    enterCampus:options=>state.adapter?.enterCampus?.(options),enterPump:options=>state.adapter?.enterPump?.(options),selectZone:(id,options)=>state.adapter?.selectZone?.(id,options),
    selectDevice,setView,setTab,inspectScene:()=>state.adapter?.inspect?.(),inspectDeviceModel:()=>deviceModel?.inspect(),pauseSimulation:()=>setSimulation(false),resumeSimulation:()=>setSimulation(true),
    openInspection(id,component=null){selectDevice(id);setView('scene');if(typeof state.adapter?.openInspection==='function')return state.adapter.openInspection(id,component);return state.adapter?.focusDevice?.(id);},
    updateDevice(id,patch){
      const d=deviceById(id);if(!patch||typeof patch!=='object')throw new TypeError('patch must be an object');
      if(patch.status&&!META[patch.status])throw new TypeError('Unknown status');
      const allowed=['status','flow','head','pressure','current','rpm','temperature'];
      for(const key of allowed){if(!(key in patch))continue;if(key!=='status'&&patch[key]!==null&&(typeof patch[key]!=='number'||!Number.isFinite(patch[key])))throw new TypeError(`${key} must be a finite number or null`);}
      for(const key of allowed)if(key in patch)d[key]=patch[key];
      state.lastUpdated=new Date();data.flow.outlet[data.flow.outlet.length-1]=totalFlow();data.flow.inlet[data.flow.inlet.length-1]=totalInlet();
      renderAllData();state.adapter?.updateDevice?.(clone(d));emit('water:device-updated',d);
    },
    async mountScene(adapter){
      // 页面把 HTML 容器、设备数据、选中事件交给场景模块。
      // mountScene 不直接建模，它只负责把网页与 Three.js 显示模块接起来。
      if(!adapter||typeof adapter.mount!=='function')throw new TypeError('Scene adapter must provide mount(container, context)');
      state.adapter?.dispose?.();state.adapter=null;$('#modelMount').replaceChildren();
      $('#modelMount').hidden=false;
      state.adapter=adapter;
      try { await adapter.mount($('#modelMount'),{devices:clone(data.devices),onSelect:selectDevice}); }
      catch(error) { adapter.dispose?.();state.adapter=null;$('#modelMount').hidden=true;$('#modelMount').replaceChildren();setView('scene');throw error; }
      state.adapter=adapter;state.scope=adapter.getScope?.()||'pump';setView(state.view);if(state.scope==='pump')adapter.selectDevice?.(state.selectedId);adapter.setLabelsVisible?.(state.labels);return ()=>{adapter.dispose?.();state.adapter=null;$('#modelMount').replaceChildren();setView('scene');};
    }
  };
  fillIcons();fit();renderMetricPeriod();renderAllData();renderEnergy();renderWater();renderAlarms();clock();setSimulation(state.simulating);bind();
  setInterval(clock,1000);setInterval(simulateTick,5000);
  function ensureDeviceModel(){
    if(deviceModelPromise)return deviceModelPromise;
    deviceModelPromise=import('./device-model.js').then(async({createDeviceModel})=>{
      deviceModel=createDeviceModel({container:$('.device-illustration'),onInspect:id=>window.WaterDashboard.openInspection(id,getPumpAlert(deviceById(id))?.component||null)});
      deviceModel.updateDevice(clone(device()));await deviceModel.ready;deviceModel.updateDevice(clone(device()));
    }).catch(error=>console.error('设备详情三维模型加载失败，保留图片回退',error));
    return deviceModelPromise;
  }
  // 当前先进入厂区；campus-integration.js 负责在同一大屏中切到泵房。
  window.WaterDashboard.mountScene(createCampusIntegration({
    getTotalFlow:totalFlow,
    onScopeChange(scope,view){state.scope=scope;state.zoom=1;renderDevice();renderStats();setView(view);if(scope==='pump')ensureDeviceModel();},
    onZoneSelect(id){state.zoneId=id;emit('water:zone-selected',{id});},
    onError(error){console.error('厂区与泵房场景加载失败',error);toast('三维模型未能加载，请刷新页面重试。');},
  })).catch(error=>{console.error('厂区三维场景加载失败',error);toast('三维模型未能加载，请刷新页面重试。');});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)clock();});
})();
