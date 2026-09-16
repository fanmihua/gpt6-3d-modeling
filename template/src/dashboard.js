import { icon, fillIcons } from './components/icons.js';
import { drawFrames } from './components/panel-frame.js';
import './dashboard-data.js';
import { DEMO_TEMPERATURE_ALARM } from './pump-alert.js';

/* 从原页面保留的数据、图表、设备选择与弹窗交互。 */
export function initDashboard() {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n, digits = 0) => n == null || !Number.isFinite(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const data = clone(window.DEMO_DATA);
  const META = {
    running:{text:'运行中',color:'#23dfbf'}, stopped:{text:'停机',color:'#38a9f8'}, alarm:{text:'告警',color:'#ff697b'},
    maintenance:{text:'维护',color:'#a990e8'}, offline:{text:'离线',color:'#91adc7'}
  };
  const state = { selectedId:'P-01', tab:'live', metricPeriod:'today', energyPeriod:'day',
    simulating:!new URLSearchParams(location.search).has('still'), tick:0, lastUpdated:new Date(), alarms:data.alarms };
  const originalDevices = clone(data.devices);
  const residualCounts = {...data.plant.initialCounts};
  originalDevices.forEach(d => residualCounts[d.status]--);
  let toastTimer, focusBeforeModal;
  let pickerIndex = 0;


  function fit() {
    $('#dashboard').dataset.scale='1';
    drawFrames();renderFlow();renderEnergy();
    if (!$('#deviceMenu').hidden) positionPicker();
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
    $('#headerPressure').textContent=running?fmt(data.plant.pressure??.36,2):'0.00';$('#runningPumps').innerHTML=`${running}<span class="denominator"> / 4</span>`;
    const labels=['泵房进水流量','泵房出水流量','出水母管压力','当前运行机组'];
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
    const d=device(),m=META[d.status];$('#deviceSelect').value=d.id;renderPicker();$('#deviceName').textContent=d.name;$('#deviceId').textContent=d.id;$('#deviceCode').textContent=`PUMP / ${d.id}`;
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

  function setNav(key){$$('[data-nav]').forEach(b=>{const a=b.dataset.nav===key;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});}
  function selectDevice(id){deviceById(id);state.selectedId=id;renderDevice();emit('water:device-selected',{id});}
  function setTab(tab){if(!['live','trend','history'].includes(tab))return;state.tab=tab;$$('.data-tabs button').forEach(b=>{const a=b.dataset.tab===tab;b.classList.toggle('active',a);b.setAttribute('aria-selected',String(a));b.tabIndex=a?0:-1;});$('#liveData').hidden=tab!=='live';$('#deviceTrend').hidden=tab!=='trend';$('#deviceHistory').hidden=tab!=='history';}

  function showModal(title,content,{wide=false}={}){
    focusBeforeModal=document.activeElement;$('#modalTitle').textContent=title;$('#modalContent').innerHTML=content;$('#modal').classList.toggle('wide',wide);fillIcons($('#modalContent'));$('#modalBackdrop').hidden=false;$('#closeModal').focus();
  }
  function closeModal(){ $('#modalBackdrop').hidden=true;focusBeforeModal?.focus?.();setNav('overview'); }
  function archive(){const d=device();showModal(`${d.name} · 设备档案`,`<div class="modal-note">当前设备台账与运行状态。</div><dl class="modal-facts">${[['设备编号',d.id],['设备名称',d.name],['设备类型','卧式离心泵'],['安装区域',data.plant.area||'送水机房'],['当前状态',META[d.status].text],['数据来源','本地模拟器']].map(([k,v])=>`<div class="modal-fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`);}
  function simulate(){const d=device();showModal(`${d.name} · 状态演示`,`<div class="modal-note">仅改变本地演示数据，不向现场设备发送指令。统计和详情会同步更新。</div><div class="simulation-options">${['running','stopped','alarm','offline'].map(k=>`<label class="simulation-option"><input type="radio" name="simState" value="${k}" ${d.status===k?'checked':''}><span style="--choice-color:${META[k].color}"><i></i>${META[k].text}</span></label>`).join('')}</div><div class="modal-buttons"><button class="outline-button" id="cancelSimulation">取消</button><button class="outline-button primary" id="applySimulation">应用演示状态</button></div>`);
    $('#cancelSimulation').onclick=closeModal;$('#applySimulation').onclick=()=>{const next=$('input[name="simState"]:checked');if(!next)return;applySimulation(d.id,next.value);closeModal();toast(`${d.name}已切换为${META[next.value].text}（本地演示）`);};
  }
  function applySimulation(id,status){
    const d=deviceById(id),base=originalDevices.find(x=>x.id===id);d.status=status;
    if(status==='offline'){for(const k of ['flow','head','pressure','current','rpm','temperature'])d[k]=null;}
    else if(status==='running'){Object.assign(d,{flow:d.baseFlow,head:42.8,pressure:data.plant.pressure??.36,current:base.current||132.6,rpm:1480,temperature:base.status==='alarm'?60.5:base.temperature});}
    else Object.assign(d,{flow:0,head:0,pressure:data.plant.pressure??.36,current:0,rpm:0,temperature:status==='alarm'?86.3:29.2});
    if(status==='alarm'&&!state.alarms.some(a=>a.deviceId===id&&a.level==='high'))state.alarms.unshift({id:`AL-SIM-${Date.now()}`,deviceId:id,device:d.shortName,time:timeString(),title:'模拟温度告警',level:'high',value:'86.3 ℃',description:'通过本地状态演示面板创建的模拟告警。',acknowledged:false});
    if(status!=='alarm')state.alarms=state.alarms.filter(a=>a.deviceId!==id||a.level!=='high');
    state.lastUpdated=new Date();renderAllData();renderAlarms();emit('water:device-updated',d);
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
    const threshold=a.thresholdText||a.threshold;
    const facts=[['设备',a.deviceId],['模拟发生时间',a.time],['采样值',a.value],...(threshold?[['演示阈值',threshold],['越限量',a.excessText||a.excess]]:[]),['确认状态',a.acknowledged?'已确认':'待确认']];
    showModal(`${a.device} · ${a.title}`,`<div class="modal-note">${esc(a.description)}${temperatureAlarm?`<br>演示规则：温度 ≥${DEMO_TEMPERATURE_ALARM.threshold}℃；本条采样 ${esc(a.value)}。`:''}</div><dl class="modal-facts">${facts.map(([k,v])=>`<div class="modal-fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><div class="modal-buttons">${knownPump?'<button class="outline-button" id="locateAlarm">查看设备</button>':''}<button class="outline-button primary" id="ackAlarm" ${a.acknowledged?'disabled':''}>${a.acknowledged?'已确认':'确认告警'}</button></div>`);
    $('#ackAlarm').onclick=()=>{a.acknowledged=true;renderAlarms();closeModal();toast('已确认这条模拟告警，设备状态保持不变。');};
    if($('#locateAlarm'))$('#locateAlarm').onclick=()=>{selectDevice(a.deviceId);setTab('live');closeModal();};
  }
  function equipmentList(){setNav('equipment');showModal('设备监测 · 送水机房',`<div class="modal-note">当前示范场景包含四台水泵。选择设备后，右侧详情同步切换。</div><div class="equipment-rows">${data.devices.map(d=>`<button data-choose-device="${d.id}"><span>${d.name} <small>${d.id}</small></span><span style="color:${META[d.status].color}">${META[d.status].text}</span><small>${fmt(d.flow)} m³/h　→</small></button>`).join('')}</div>`);$$('[data-choose-device]').forEach(b=>b.onclick=()=>{selectDevice(b.dataset.chooseDevice);closeModal();});}
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
  function renderAllData(){data.flow.outlet[data.flow.outlet.length-1]=totalFlow();data.flow.inlet[data.flow.inlet.length-1]=totalInlet();renderStats();renderDevice();renderFlow();}
  function simulateTick(){
    if(!state.simulating)return;state.tick++;
    data.devices.forEach((d,i)=>{if(d.status!=='running')return;d.flow=Math.round(d.baseFlow+Math.sin(state.tick*.37+i*1.1)*3);d.current=+(132+i*.3+Math.sin(state.tick*.22+i)*.5).toFixed(1);});
    state.lastUpdated=new Date();data.flow.outlet[data.flow.outlet.length-1]=totalFlow();data.flow.inlet[data.flow.inlet.length-1]=totalInlet();renderAllData();emit('water:telemetry',data.devices);
  }
  function setSimulation(playing){state.simulating=!!playing;$('#dashboard').classList.toggle('simulation-paused',!playing);const b=$('#simulationToggle');b.innerHTML=icon(playing?'pause':'play');b.title=playing?'暂停模拟刷新':'恢复模拟刷新';b.setAttribute('aria-label',b.title);}
  function bind(){
    addEventListener('resize',fit);document.addEventListener('fullscreenchange',fit);
    $('#deviceSelect').addEventListener('change',e=>selectDevice(e.target.value));
    bindPicker();
    $('#deviceArchive').onclick=archive;$('#deviceSimulation').onclick=simulate;
    $$('.data-tabs button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
    $('.data-tabs').addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const buttons=$$('.data-tabs button'),i=buttons.indexOf(document.activeElement);let n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;setTab(buttons[n].dataset.tab);buttons[n].focus();});
    $$('#metricPeriod button').forEach(b=>b.onclick=()=>{state.metricPeriod=b.dataset.period;renderMetricPeriod();});
    $$('#energyPeriod button').forEach(b=>b.onclick=()=>{state.energyPeriod=b.dataset.period;renderEnergy();$('#energyTooltip').hidden=true;});
    $('#simulationToggle').onclick=()=>{setSimulation(!state.simulating);toast(state.simulating?'已恢复本地模拟刷新':'已暂停本地模拟刷新');};
    $('#viewAlarms').onclick=allAlarms;$('#alarmTable').onclick=e=>{const t=e.target.closest('[data-alarm]');if(t)alarmDetail(t.dataset.alarm);};
    const navActions={overview:()=>setNav('overview'),analytics,equipment:equipmentList,alarms:allAlarms};
    $$('[data-nav]').forEach(b=>b.onclick=()=>{const action=navActions[b.dataset.nav];if(action)action();});
    $('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target===$('#modalBackdrop'))closeModal();};
    document.addEventListener('keydown',e=>{if($('#modalBackdrop').hidden)return;if(e.key==='Escape'){e.preventDefault();closeModal();}if(e.key==='Tab'){const focusable=$$('button:not([disabled]),input,select,[tabindex="0"]',$('#modal')).filter(el=>el.offsetParent!==null),first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    chartTooltips();
  }

  window.WaterDashboard = {
    getState:()=>clone({selectedId:state.selectedId,tab:state.tab,metricPeriod:state.metricPeriod,energyPeriod:state.energyPeriod,simulating:state.simulating,devices:data.devices,counts:counts(),alarms:state.alarms}),
    selectDevice,setTab,pauseSimulation:()=>setSimulation(false),resumeSimulation:()=>setSimulation(true),
    updateDevice(id,patch){
      const d=deviceById(id);if(!patch||typeof patch!=='object')throw new TypeError('patch must be an object');
      if(patch.status&&!META[patch.status])throw new TypeError('Unknown status');
      const allowed=['status','flow','head','pressure','current','rpm','temperature'];
      for(const key of allowed){if(!(key in patch))continue;if(key!=='status'&&patch[key]!==null&&(typeof patch[key]!=='number'||!Number.isFinite(patch[key])))throw new TypeError(`${key} must be a finite number or null`);}
      for(const key of allowed)if(key in patch)d[key]=patch[key];
      state.lastUpdated=new Date();data.flow.outlet[data.flow.outlet.length-1]=totalFlow();data.flow.inlet[data.flow.inlet.length-1]=totalInlet();
      renderAllData();emit('water:device-updated',d);
    }
  };
  fillIcons();fit();renderMetricPeriod();renderAllData();renderEnergy();renderWater();renderAlarms();clock();setSimulation(state.simulating);bind();
  setInterval(clock,1000);setInterval(simulateTick,5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)clock();});
  return window.WaterDashboard;
}
