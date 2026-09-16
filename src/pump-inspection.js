import * as THREE from 'three';
import { getPumpAlert } from './pump-alert.js';
import './pump-alert.css';

const LABELS = {pump:'泵体',motor:'电机',coupling:'联轴器',base:'基础与底座',gauge:'压力表'};
const STATUS = {running:'运行中',alarm:'告警',stopped:'停机',offline:'离线',maintenance:'维护'};
const number = (value, suffix) => value == null ? '—' : `${value}${suffix}`;

/** 几何部件的层级查看。所有零件均来自 Blender，内部件按示意属性显示。 */
export function createInspection({container,model,camera,controls,groups,getDevice,onChange}) {
  const components = new Map(), parts = [], rest = new Map(), visibility = new Map();
  const state = { active:false, deviceId:null, component:null, part:null, mode:'assembled', amount:0 };
  let actualAmount = 0, activeAlarm = null;
  const alarmAnchors = new Map();
  model.traverse(node => {
    if (node.userData.kind === 'component') components.set(`${node.userData.deviceId}:${node.userData.componentKey}`,node);
    if (node.userData.kind === 'part') {
      parts.push(node); rest.set(node,node.position.clone());
      if (node.userData.internal) node.visible=false;
    }
  });
  model.updateMatrixWorld(true);
  for(const part of parts){
    if(part.userData.componentKey!=='motor'||part.userData.partKey!=='housing')continue;
    const box=new THREE.Box3().setFromObject(part);
    const anchor=box.getCenter(new THREE.Vector3());anchor.y=box.max.y+.025;
    alarmAnchors.set(part.userData.deviceId,{part,local:part.worldToLocal(anchor)});
  }
  const hud=document.createElement('section');hud.className='inspection-hud';hud.hidden=true;
  hud.setAttribute('aria-label','模型结构查看');
  hud.innerHTML=`<header class="inspection-heading"><nav class="inspection-breadcrumb" aria-label="模型层级"></nav><span class="inspection-level">结构查看</span></header>
    <aside class="inspection-tree"><span class="inspection-eyebrow">部件目录</span><div class="inspection-items"></div></aside>
    <div class="inspection-selection" aria-live="polite"></div>
    <button class="inspection-alarm-pin" data-inspect-action="alarm" hidden aria-label="查看电机温度告警测点"><b></b><strong></strong><small>温度测点 · 示意</small></button>
    <footer class="inspection-footer"><div class="inspection-toolbar"><div class="inspection-modes" role="group" aria-label="结构查看方式"><button data-mode="assembled" aria-pressed="true">装配</button><button data-mode="exploded" aria-pressed="false">爆炸拆解</button><button data-mode="xray" aria-pressed="false">外壳透视</button></div><button data-inspect-action="refit">复位视角</button></div><label class="inspection-slider"><span>拆解程度</span><input type="range" min="0" max="100" value="0" aria-label="拆解程度"><output>0%</output></label><div class="inspection-alarm" hidden><div><strong></strong><span class="inspection-alarm-value"></span></div><p></p><button data-inspect-action="alarm">定位测点</button></div><div class="inspection-telemetry"></div><p>内部结构为示意补建 · 点击部件下钻 · 拖动可查看背面与底部</p></footer>`;
  container.append(hud);
  const breadcrumbs=hud.querySelector('.inspection-breadcrumb'), tree=hud.querySelector('.inspection-items');
  const selection=hud.querySelector('.inspection-selection'), telemetry=hud.querySelector('.inspection-telemetry');
  const slider=hud.querySelector('input'), sliderRow=hud.querySelector('.inspection-slider');
  const alarmCard=hud.querySelector('.inspection-alarm'),alarmPin=hud.querySelector('.inspection-alarm-pin');
  const visible = node => {for(let p=node;p;p=p.parent)if(!p.visible)return false;return true;};
  const relevantParts=()=>parts.filter(p=>p.userData.deviceId===state.deviceId&&(!state.component||p.userData.componentKey===state.component));
  function bounds() {
    model.updateMatrixWorld(true);
    const box=new THREE.Box3();
    groups.get(state.deviceId)?.traverse(node=>{
      if(!node.isMesh||!visible(node))return;
      node.geometry.computeBoundingBox();
      box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    });
    return box;
  }
  function fit(resetDirection=false) {
    if(!state.active)return;
    pose(state.amount);const box=bounds();pose(actualAmount);if(box.isEmpty())return;
    const center=box.getCenter(new THREE.Vector3());
    const offset=resetDirection?new THREE.Vector3(5,3.3,5):camera.position.clone().sub(controls.target).normalize().multiplyScalar(9);
    controls.target.copy(center);camera.position.copy(center).add(offset);camera.zoom=1;
    controls.update();camera.updateMatrixWorld(true);
    const width=container.clientWidth,height=container.clientHeight,aspect=width/height;
    let maxX=0,maxY=0;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
      maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));
    }
    const half=Math.max(maxY/(activeAlarm ? .53 : .63),maxX/(aspect*.68),.35);
    const shift=half*aspect*(width<650?.23:.17);
    camera.left=-half*aspect-shift;camera.right=half*aspect-shift;
    const verticalShift=activeAlarm?half*.07:0;
    camera.top=half-verticalShift;camera.bottom=-half-verticalShift;camera.updateProjectionMatrix();

  }
  function updateVisibility() {
    model.traverse(node=>{
      const d=node.userData;
      if(['architecture','upperWalls','floor','inlet','outlet','pump','branch','valve'].includes(d.kind)) node.visible=d.kind==='pump'&&d.deviceId===state.deviceId;
      if(d.kind==='component')node.visible=d.deviceId===state.deviceId&&(!state.component||d.componentKey===state.component);
      if(d.kind==='part')node.visible=d.deviceId===state.deviceId&&(!state.part||d.partKey===state.part)&&(!d.internal||state.mode!=='assembled'||!!state.part);
    });
    refreshMaterials();
  }
  function refreshMaterials() {
    if(!state.active)return;
    for(const part of relevantParts())part.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const transparent=state.mode==='xray'&&!state.part&&!part.userData.internal;
      mesh.material.transparent=transparent;
      mesh.material.opacity=transparent ? .15 : 1;
      mesh.material.depthWrite=!transparent;
      mesh.material.needsUpdate=true;
      mesh.material.color.copy(mesh.userData.baseColor);
      // 结构检查保留制造材质，告警通过摘要呈现，避免把零件染红误认为损伤。
      mesh.material.emissive?.set('#000000');
    });
  }
  function pose(amount) {
    for(const part of parts){
      const offset=part.userData.deviceId===state.deviceId&&!state.part?new THREE.Vector3(...(part.userData.explodeOffset||[0,0,0])):new THREE.Vector3();
      part.position.copy(rest.get(part)).addScaledVector(offset,amount);
    }
    model.updateMatrixWorld(true);
  }
  function render() {
    const device=getDevice(state.deviceId);
    breadcrumbs.replaceChildren();
    const crumb=(label,action)=>{const button=document.createElement('button');button.textContent=label;button.dataset.inspectAction=action;breadcrumbs.append(button);};
    crumb('泵房','exit');crumb(state.deviceId,'unit');
    if(state.component)crumb(LABELS[state.component]||state.component,'component');
    const current=parts.find(p=>p.userData.deviceId===state.deviceId&&p.userData.componentKey===state.component&&p.userData.partKey===state.part);
    if(current){const span=document.createElement('span');span.textContent=current.userData.label;breadcrumbs.append(span);}
    hud.querySelector('.inspection-level').textContent=state.part?'零件细节':state.component?'部件结构':'泵组总成';
    tree.replaceChildren();
    const entries=state.component?relevantParts():[...components.values()].filter(c=>c.userData.deviceId===state.deviceId);
    entries.forEach((node,index)=>{
      const button=document.createElement('button');const d=node.userData;
      button.dataset[d.kind==='part'?'partKey':'componentKey']=d.kind==='part'?d.partKey:d.componentKey;
      button.setAttribute('aria-pressed',String(d.kind==='part'&&d.partKey===state.part));
      const serial=document.createElement('small');serial.textContent=String(index+1).padStart(2,'0');
      const label=document.createElement('span');label.textContent=d.label||LABELS[d.componentKey];
      button.append(serial,label);tree.append(button);
    });
    selection.innerHTML='';
    const title=document.createElement('strong');title.textContent=current?.userData.label||(state.component?LABELS[state.component]:`${device.name} · 泵组总成`);
    const subtitle=document.createElement('span');subtitle.textContent=state.part?(current.userData.internal?'内部零件 · 示意结构':'独立零件 · 可全角度查看'):state.component?'选择目录中的零件继续下钻':'选择模型或部件目录进入内部结构';
    selection.append(title,subtitle);
    hud.querySelectorAll('[data-mode]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode));button.disabled=!!state.part;});
    sliderRow.hidden=state.mode!=='exploded'||!!state.part;
    slider.value=Math.round(state.amount*100);sliderRow.querySelector('output').textContent=`${slider.value}%`;
    updateTelemetry();
  }
  function updateTelemetry() {
    if(!state.active)return;
    const d=getDevice(state.deviceId);
    const data=state.component==='motor'?[['温度',number(d.temperature,' ℃')],['电流',number(d.current,' A')],['转速',number(d.rpm,' rpm')]]:[['流量',number(d.flow,' m³/h')],['扬程',number(d.head,' m')],['压力',number(d.pressure,' MPa')]];
    telemetry.replaceChildren();
    const badge=document.createElement('b');badge.className=d.status==='alarm'?'is-alarm':'';badge.textContent=`${state.deviceId} · ${STATUS[d.status]||d.status}`;telemetry.append(badge);
    for(const [label,value] of data){const span=document.createElement('span');span.textContent=`${label} ${value}`;telemetry.append(span);}
    const small=document.createElement('small');small.textContent='模拟数据';telemetry.append(small);
    activeAlarm=getPumpAlert(d);
    alarmCard.hidden=!activeAlarm;
    if(activeAlarm){
      alarmCard.querySelector('strong').textContent=`${activeAlarm.title} · 演示`;
      alarmCard.querySelector('.inspection-alarm-value').textContent=`${activeAlarm.value.toFixed(1)}℃ / 阈值 ≥${activeAlarm.threshold}℃`;
      alarmCard.querySelector('p').textContent=state.part&&state.part!=='housing'
        ? '告警关联电机测点；当前零件未诊断损坏。'
        : `高出 ${activeAlarm.excess.toFixed(1)}℃ · ${activeAlarm.location}`;
      alarmPin.querySelector('strong').textContent=`${activeAlarm.value.toFixed(1)}℃`;
    }
    updateAlarmPin();
  }
  function updateAlarmPin(){
    const anchor=alarmAnchors.get(state.deviceId);
    const show=state.active&&activeAlarm&&anchor&&visible(anchor.part);
    alarmPin.hidden=!show;
    if(!show)return;
    const point=anchor.part.localToWorld(anchor.local.clone()).project(camera);
    const x=(point.x+1)*container.clientWidth/2,y=(1-point.y)*container.clientHeight/2;
    alarmPin.hidden=point.z<-1||point.z>1||x<145||x>container.clientWidth-65||y<115||y>container.clientHeight-100;
    alarmPin.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
  }
  function openComponent(key) {
    if(!components.has(`${state.deviceId}:${key}`))return;
    state.component=key;state.part=null;updateVisibility();pose(actualAmount);render();fit(true);
  }
  function openPart(key) {
    if(!relevantParts().some(p=>p.userData.partKey===key))return;
    state.part=key;updateVisibility();pose(actualAmount);render();fit(true);
  }
  function mode(value) {
    state.mode=value;state.amount=value==='exploded'?1:0;
    updateVisibility();
    // 镜头按目标拆解姿态取景，模型随后平滑运动，滑块操作不会持续推拉镜头。
    pose(state.amount);fit();pose(actualAmount);render();
  }
  function enter(id,component=null) {
    if(!groups.has(id))return;
    if(!state.active)model.traverse(node=>visibility.set(node,node.visible));
    Object.assign(state,{active:true,deviceId:id,component:null,part:null,mode:'assembled',amount:0});actualAmount=0;
    if(component&&components.has(`${id}:${component}`))state.component=component;
    hud.hidden=false;container.classList.add('is-inspecting');container.closest('.scene-panel')?.classList.add('is-inspecting');
    controls.maxPolarAngle=Math.PI-.005;controls.minZoom=.35;controls.maxZoom=5;
    updateVisibility();pose(0);render();fit(true);onChange(true);
  }
  function exit() {
    if(!state.active)return;
    parts.forEach(part=>part.position.copy(rest.get(part)));
    model.traverse(node=>{
      if(visibility.has(node))node.visible=visibility.get(node);
      if(node.isMesh){node.material.transparent=false;node.material.opacity=1;node.material.depthWrite=true;node.material.needsUpdate=true;}
    });
    visibility.clear();Object.assign(state,{active:false,component:null,part:null,mode:'assembled',amount:0});actualAmount=0;activeAlarm=null;alarmPin.hidden=true;
    hud.hidden=true;container.classList.remove('is-inspecting');container.closest('.scene-panel')?.classList.remove('is-inspecting');
    controls.maxPolarAngle=Math.PI/2.03;controls.minZoom=.7;controls.maxZoom=3.5;onChange(false);
  }
  function click(event) {
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.componentKey)return openComponent(button.dataset.componentKey);
    if(button.dataset.partKey)return openPart(button.dataset.partKey);
    if(button.dataset.mode)return mode(button.dataset.mode);
    const action=button.dataset.inspectAction;
    if(action==='exit')exit();
    if(action==='unit'){state.component=state.part=null;updateVisibility();pose(actualAmount);render();fit(true);}
    if(action==='component'){state.part=null;updateVisibility();pose(actualAmount);render();fit(true);}
    if(action==='refit')fit(true);
    if(action==='alarm'){state.component='motor';state.part='housing';updateVisibility();pose(actualAmount);render();fit(true);}
  }
  hud.addEventListener('click',click);
  slider.addEventListener('input',()=>{state.amount=Number(slider.value)/100;sliderRow.querySelector('output').textContent=`${slider.value}%`;});
  return {
    get active(){return state.active;},get deviceId(){return state.deviceId;},
    enter,exit,fit,refreshMaterials,updateTelemetry,
    handlePick(data){
      if(!state.active||!data.componentKey)return;
      if(!state.component)openComponent(data.componentKey);
      else if(data.partKey)openPart(data.partKey);
    },
    tick(dt){
      if(!state.active)return;
      if(Math.abs(actualAmount-state.amount)>.001){actualAmount=THREE.MathUtils.damp(actualAmount,state.amount,9,dt);pose(actualAmount);}
      else if(actualAmount!==state.amount){actualAmount=state.amount;pose(actualAmount);}
      updateAlarmPin();
    },
    dispose(){hud.remove();},
    inspect(){
      model.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const rect=container.getBoundingClientRect();
      const targets=relevantParts().filter(visible).map(part=>{
        const box=new THREE.Box3().setFromObject(part);const point=box.getCenter(new THREE.Vector3()).project(camera);
        return {key:part.userData.partKey,component:part.userData.componentKey,internal:!!part.userData.internal,
          position:part.position.toArray(),rest:rest.get(part).toArray(),
          x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};
      });
      return {...state,actualAmount,alarm:activeAlarm,alarmPinVisible:!alarmPin.hidden,parts:targets,componentCount:[...components.values()].filter(c=>c.userData.deviceId===state.deviceId).length};
    },
  };
}
