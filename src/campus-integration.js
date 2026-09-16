import { createFactoryScene } from './factory-scene.js';
import { FACTORY, ZONES } from './factory-data.js';
import './pump-scene.css';
import './model-navigation.css';
import './campus-integration.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = value => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—';

/** 在原大屏内衔接厂区、送水机房以及既有泵部件检查，不重新建立页面布局。 */
export function createCampusIntegration({ onScopeChange, onZoneSelect, onError, getTotalFlow } = {}) {
  let container, context, campusLayer, pumpLayer, campus, pump, pumpPromise, scopeBar, areaPanel, areaData, areaMenu;
  let scope = 'campus', zoneId = 'workshop', view = 'scene', selectedDevice = 'P-01', labels = true, disposed = false;
  let lastZoom = 1, interactionMode = 'rotate';
  const devices = new Map();
  const initialDevices = new Map();
  const removers = [];
  let pickerIndex = 0;
  const $ = selector => document.querySelector(selector);
  const currentZone = () => ZONES.find(zone => zone.id === zoneId) || ZONES[0];

  function zoneStatus(zone) {
    if (zone.id === 'workshop') return [...devices.values()].some(device => device.status === 'alarm') ? 'attention' : 'normal';
    return zone.status;
  }

  const summaries = {
    admin:'厂区运行管理与日常办公', sedimentation:'原水沉淀处理与池体运行监测',
    filtration:'滤池运行与反冲洗监测', tanks:'储量调节与供水缓冲',
    dosing:'药剂储存与定量投加', workshop:'出厂供水与压力调节 · 4 台泵组',
    utilities:'厂区供电与动力保障', gate:'人员、车辆通行与厂区安防',
  };
  function equipmentFor(zone) {
    const result = {...zone.equipment};
    if (zone.id !== 'workshop') return result;
    const key = state => ({running:'running',stopped:'standby',alarm:'alarm',maintenance:'maintenance',offline:'offline'}[state]);
    devices.forEach((device,id)=>{
      const before=key(initialDevices.get(id)?.status), after=key(device.status);
      if(before && after && before!==after){result[before]=(result[before]||0)-1;result[after]=(result[after]||0)+1;}
    });
    return result;
  }
  function positionZoneMenu() {
    if (!areaMenu || areaMenu.hidden) return;
    const trigger=areaPanel.querySelector('.campus-zone-trigger').getBoundingClientRect();
    const board=$('#dashboard').getBoundingClientRect();
    const width=areaMenu.offsetWidth;
    areaMenu.style.left=`${Math.max(12,Math.min(board.width-width-12,trigger.right-board.left-width))}px`;
    areaMenu.style.top=`${trigger.bottom-board.top+6}px`;
  }
  function closeZoneMenu(restore=false) {
    if (!areaMenu) return;
    areaMenu.hidden=true;
    const trigger=areaPanel?.querySelector('.campus-zone-trigger');
    trigger?.setAttribute('aria-expanded','false');
    trigger?.removeAttribute('aria-activedescendant');
    if(restore)trigger?.focus();
  }
  function renderZoneMenu() {
    const colors={normal:'#54cbb3',attention:'#ff8191',maintenance:'#b095d0'};
    areaMenu.innerHTML=`<div class="device-menu-heading"><span>厂区分区</span><small>8 个区域</small></div><div role="listbox" id="campusZoneOptions" aria-label="厂区分区">${ZONES.map((zone,i)=>`<div role="option" id="campus-option-${zone.id}" class="device-option ${zone.id===zoneId?'is-selected':''} ${i===pickerIndex?'is-highlighted':''}" aria-selected="${zone.id===zoneId}" data-zone-option="${zone.id}" style="--status-color:${colors[zoneStatus(zone)]}"><span class="campus-option-code">${zone.code}</span><span class="device-option-copy"><strong>${escape(zone.name)}</strong><small>${escape(zone.category)}</small></span><span class="device-option-state"><b></b></span><span class="device-option-check" aria-hidden="true">${zone.id===zoneId?'✓':''}</span></div>`).join('')}</div>`;
    areaPanel.querySelector('.campus-zone-trigger')?.setAttribute('aria-activedescendant',`campus-option-${ZONES[pickerIndex].id}`);
  }
  function openZoneMenu() {
    pickerIndex=ZONES.findIndex(zone=>zone.id===zoneId);
    areaMenu.hidden=false;
    areaPanel.querySelector('.campus-zone-trigger').setAttribute('aria-expanded','true');
    renderZoneMenu();positionZoneMenu();
  }
  function refreshViewControls() {
    if (!scopeBar) return;
    const process = view === 'process';
    campusLayer.hidden = scope !== 'campus' || process;
    pumpLayer.hidden = scope !== 'pump' || view !== 'scene';
    scopeBar.dataset.view = view;
    const back = scopeBar.querySelector('[data-campus-back]');
    back.hidden = scope === 'campus' && view === 'scene';
    back.textContent = scope === 'campus' ? '← 返回厂区三维' : '← 返回厂区';
    scopeBar.querySelector('.campus-mode-buttons').hidden = scope !== 'campus' || process;
    scopeBar.querySelector('[data-campus-enter]').hidden = scope !== 'campus' || process || zoneId !== 'workshop';
  }
  function renderArea() {
    if (!areaPanel) return;
    const zone = currentZone(), status = zoneStatus(zone), equipment=equipmentFor(zone);
    const statusText = { normal: '正常运行', attention: '运行关注', maintenance: '计划检修' }[status] || '正常运行';
    const metrics = zone.metrics.map(metric => ({ ...metric }));
    if (zone.id === 'workshop' && typeof getTotalFlow === 'function') metrics[0].value = getTotalFlow();
    const contentKey = `${zoneId}/${status}`;
    if (areaPanel.dataset.contentKey !== contentKey) {
      closeZoneMenu();
      areaPanel.dataset.contentKey = contentKey;
      const chevron=$('#devicePickerTrigger .picker-chevron')?.innerHTML || $('#plantExpand .icon')?.outerHTML || '';
      areaPanel.innerHTML = `<header class="panel-heading"><h2>区域详情</h2><button type="button" class="device-picker-trigger campus-zone-trigger" role="combobox" aria-label="选择厂区区域" aria-haspopup="listbox" aria-controls="campusZoneOptions" aria-expanded="false"><span class="picker-name">${escape(zone.name)}</span><span class="picker-chevron">${chevron}</span></button></header><div class="campus-zone-body"><div class="campus-zone-heading"><div><div class="device-eyebrow">${escape(zone.code)} / ${escape(zone.category)}</div><h3>${escape(zone.name)}</h3></div><span class="status-badge ${status === 'attention' ? 'alarm' : status === 'maintenance' ? 'maintenance' : 'running'}"><b></b>${statusText}</span></div><p class="campus-zone-description">${escape(summaries[zone.id])}</p><div class="campus-zone-summary"><span>区域设备 <strong>${equipment.total}</strong><small>台</small></span><span>运行 <strong data-campus-running>${equipment.running}</strong><small>台</small></span></div></div><div class="device-actions campus-zone-actions"><button type="button" class="outline-button" data-campus-focus>定位区域</button>${zone.id === 'workshop' ? '<button type="button" class="outline-button primary" data-campus-enter>进入泵房 <span>→</span></button>' : '<span class="campus-zone-kind">区域运行概览</span>'}</div>`;
      const trigger=areaPanel.querySelector('.campus-zone-trigger');
      trigger.onclick=()=>areaMenu.hidden?openZoneMenu():closeZoneMenu();
      trigger.onkeydown=event=>{
        if(!['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'].includes(event.key))return;
        event.preventDefault();
        if(event.key==='Escape'){closeZoneMenu(true);return;}
        if(areaMenu.hidden){openZoneMenu();return;}
        if(event.key==='Enter'||event.key===' '){selectZone(ZONES[pickerIndex].id,{focus:true});closeZoneMenu(true);return;}
        pickerIndex=event.key==='Home'?0:event.key==='End'?ZONES.length-1:(pickerIndex+(event.key==='ArrowDown'?1:ZONES.length-1))%ZONES.length;
        renderZoneMenu();
        areaMenu.querySelector('.is-highlighted')?.scrollIntoView({block:'nearest'});
      };
      areaPanel.querySelector('[data-campus-focus]').onclick = () => view==='process'?enterCampus({zoneId,focus:true}):campus?.selectZone(zoneId, { focus: true });
      const enter = areaPanel.querySelector('[data-campus-enter]');
      if (enter) enter.onclick = () => enterPump();
    }
    areaPanel.querySelector('[data-campus-running]').textContent=equipment.running;
    campus?.updateZone?.('workshop',{status:zoneStatus(ZONES.find(zone=>zone.id==='workshop'))});
    const extra = [
      { label: '运行设备', value: equipment.running, unit: '台' },
      { label: '备用设备', value: equipment.standby, unit: '台' },
      { label: '告警设备', value: equipment.alarm, unit: '台' },
    ];
    areaData.innerHTML = `<div class="campus-area-data-heading">区域运行数据 <span>${escape(zone.code)}</span></div><div class="live-data-grid">${[...metrics, ...extra].map(metric => `<article class="data-card"><p class="data-label">${escape(metric.label)}</p><div class="data-number"><strong>${number(metric.value)}</strong><small>${escape(metric.unit)}</small></div></article>`).join('')}</div>`;
    refreshViewControls();
  }

  function notifyScope(next, nextView) {
    closeZoneMenu();
    scope = next;
    view = nextView;
    lastZoom = 1;
    $('#dashboard').dataset.sceneScope = scope;
    container.dataset.scope = scope;
    refreshViewControls();
    const menu = $('#deviceMenu');
    if (menu) menu.hidden = true;
    onScopeChange?.(scope, view);
  }

  async function ensurePump() {
    // 第一次进入泵房才加载它的 Three.js 模块，并复用大屏的设备数据与回调。
    // pump-scene.js 的 mount() 随后读取 pump-room.glb，建立画布、相机和灯光。
    if (pump) return pump;
    if (pumpPromise) return pumpPromise;
    pumpLayer.innerHTML = '<div class="model-loading" role="status"><span></span>正在载入送水机房</div>';
    pumpPromise = import('./pump-scene.js').then(async ({ createPumpScene }) => {
      const instance = createPumpScene();
      await instance.mount(pumpLayer, { devices: [...devices.values()].map(device => ({ ...device })), onSelect: context.onSelect });
      if (disposed) { instance.dispose(); return null; }
      pump = instance;
      pump.selectDevice(selectedDevice);
      pump.setLabelsVisible(labels);
      pump.setView(scope === 'pump' ? view : 'campus');
      return pump;
    }).catch(error => {
      pumpPromise = null;
      pumpLayer.innerHTML = '<div class="model-loading" role="alert">泵房模型未能加载，请返回厂区后重试。</div>';
      onError?.(error);
      return null;
    });
    return pumpPromise;
  }

  function enterPump({ view: nextView = 'scene' } = {}) {
    if (disposed) return Promise.resolve(null);
    if (scope !== 'pump' || view !== nextView) notifyScope('pump', nextView);
    return ensurePump().then(instance => {
      if (scope === 'pump') instance?.setView(view);
      return instance;
    });
  }

  function enterCampus({ zoneId: nextZone = 'workshop', focus = false, view: nextView = 'scene' } = {}) {
    if (disposed) return;
    nextView = nextView === 'plan' ? 'plan' : 'scene';
    pump?.setView('campus');
    notifyScope('campus', nextView);
    campus?.setView(nextView === 'plan' ? 'top' : 'bird');
    selectZone(nextZone, { focus });
  }

  function selectZone(id, { focus = false } = {}) {
    if (!ZONES.some(zone => zone.id === id)) return;
    zoneId = id;
    if (scope !== 'campus') { enterCampus({ zoneId: id, focus }); return; }
    campus?.selectZone(id, { focus: focus && view !== 'process' });
    renderArea();
    onZoneSelect?.(id);
  }

  return {
    async mount(element, sceneContext) {
      container = element;
      context = sceneContext;
      context.devices.forEach(device => {devices.set(device.id, { ...device });initialDevices.set(device.id,{...device});});
      container.classList.add('campus-integration');
      campusLayer = document.createElement('div');
      campusLayer.className = 'campus-model-layer';
      pumpLayer = document.createElement('div');
      pumpLayer.className = 'campus-pump-layer';
      pumpLayer.hidden = true;
      scopeBar = document.createElement('div');
      scopeBar.className = 'campus-scope-bar';
      scopeBar.innerHTML = '<button type="button" class="campus-back-button" data-campus-back hidden>← 返回厂区</button><div class="campus-mode-buttons"><button type="button" data-campus-mode="rotate" aria-pressed="true">旋转</button><button type="button" data-campus-mode="pan" aria-pressed="false">平移</button></div><button type="button" class="campus-enter-button" data-campus-enter>进入送水机房 →</button>';
      scopeBar.querySelector('[data-campus-back]').onclick = () => enterCampus({zoneId:scope==='campus'?zoneId:'workshop'});
      scopeBar.querySelector('[data-campus-enter]').onclick = () => enterPump();
      scopeBar.querySelectorAll('[data-campus-mode]').forEach(button => {
        button.onclick = () => {
          interactionMode = button.dataset.campusMode;
          campus?.setMode(interactionMode);
          scopeBar.querySelectorAll('[data-campus-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        };
      });
      container.append(campusLayer, pumpLayer);
      container.parentElement.append(scopeBar);
      areaPanel = document.createElement('div');
      areaPanel.className = 'campus-area-panel';
      $('.device-panel').append(areaPanel);
      areaData = document.createElement('div');
      areaData.className = 'campus-area-data';
      $('.live-panel').append(areaData);
      areaMenu=document.createElement('div');areaMenu.id='campusZoneMenu';areaMenu.className='device-menu campus-zone-menu';areaMenu.hidden=true;
      $('#dashboard').append(areaMenu);
      areaMenu.addEventListener('click',event=>{const option=event.target.closest('[data-zone-option]');if(option){selectZone(option.dataset.zoneOption,{focus:true});closeZoneMenu(true);}});
      const outside=event=>{if(!areaMenu.contains(event.target)&&!event.target.closest('.campus-zone-trigger'))closeZoneMenu();};
      document.addEventListener('pointerdown',outside);removers.push(()=>document.removeEventListener('pointerdown',outside));
      const focusOutside=event=>{if(!areaMenu.contains(event.target)&&!event.target.closest('.campus-zone-trigger'))closeZoneMenu();};
      document.addEventListener('focusin',focusOutside);removers.push(()=>document.removeEventListener('focusin',focusOutside));
      window.addEventListener('resize',positionZoneMenu);removers.push(()=>window.removeEventListener('resize',positionZoneMenu));
      document.addEventListener('scroll',positionZoneMenu,true);removers.push(()=>document.removeEventListener('scroll',positionZoneMenu,true));
      notifyScope('campus', 'scene');
      renderArea();
      campus = await createFactoryScene({ container: campusLayer, zones: ZONES.map(zone => ({ ...zone, status: zoneStatus(zone) })), onSelect: id => selectZone(id), onError });
      if (disposed) { campus.dispose(); return; }
      campus.selectZone(zoneId);
      campus.setLabels(labels);
      container.dataset.modelReady = String(campus.getState().ready);
    },
    enterPump, enterCampus, selectZone,
    getScope: () => scope,
    refreshArea: renderArea,
    selectDevice(id) {
      selectedDevice = id;
      const operation = scope === 'pump' ? ensurePump() : enterPump();
      return operation.then(instance => instance?.selectDevice(id));
    },
    updateDevice(device) {
      devices.set(device.id, { ...device });
      pump?.updateDevice(device);
      if (scope === 'campus' && zoneId === 'workshop') renderArea();
    },
    focusDevice(id) {
      selectedDevice = id;
      return enterPump().then(instance => instance?.focusDevice(id));
    },
    openInspection(id = selectedDevice, component = null) {
      selectedDevice = id;
      return enterPump().then(instance => instance?.openInspection(id, component));
    },
    setView(nextView) {
      view = scope === 'campus' && nextView === 'process' ? 'scene' : nextView;
      refreshViewControls();
      if (scope === 'campus') {
        campus?.setView(view === 'plan' ? 'top' : 'bird');
      } else pump?.setView(nextView);
    },
    setLabelsVisible(value) {
      labels = !!value;
      campus?.setLabels(labels);
      pump?.setLabelsVisible(labels);
    },
    zoom(value) {
      if (scope === 'campus') campus?.zoom(value / lastZoom);
      else pump?.zoom(value);
      lastZoom = value;
    },
    reset() {
      lastZoom = 1;
      if (scope === 'campus') campus?.setView(view === 'plan' ? 'top' : 'bird');
      else pump?.reset();
    },
    inspect() {
      return scope === 'pump'
        ? { scope, zoneId: 'workshop', ...(pump?.inspect() || { loading: !!pumpPromise }) }
        : { scope, zoneId, ...campus?.getState(), view };
    },
    dispose() {
      disposed = true;
      campus?.dispose();
      pump?.dispose();
      removers.forEach(remove=>remove());
      areaMenu?.remove();
      areaPanel?.remove();
      areaData?.remove();
      scopeBar?.remove();
      campusLayer?.remove();
      pumpLayer?.remove();
      delete $('#dashboard').dataset.sceneScope;
    },
  };
}
