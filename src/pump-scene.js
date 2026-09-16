// 【阅读路线】先看末尾 mount()：创建画布 → 相机/灯光 → 加载 GLB → 加入场景。
// 再看 animate() 每帧绘制，以及 hit() / select() 怎样把点击传给大屏。
// GLB 保存建好的资产；这个 JS 才负责它在网页里怎样呈现与响应操作。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createInspection } from './pump-inspection.js';
import './pump-scene.css';
import './model-navigation.css';

const STATUS = {
  running: { color: '#29dfc0', text: '运行中' },
  stopped: { color: '#69a4ca', text: '停机' },
  alarm: { color: '#ff687c', text: '告警' },
  offline: { color: '#899eaf', text: '离线' },
  maintenance: { color: '#b292e6', text: '维护' },
};
const vector = a => new THREE.Vector3(...a);
const cadToWeb = p => new THREE.Vector3(p[0] - 6, p[2], 4 - p[1]);

/** Blender 资产适配器：几何来自 GLB，状态与交互由大屏统一管理。 */
export function createPumpScene() {
  let container, context, renderer, scene, camera, controls, model, manifest, observer;
  let labels, toolbar, navigation, tooltip, inspection, traceCard, frame = 0, selectedId, focusMotion, down;
  let interactionMode = 'rotate';
  let traceEnabled = false;
  let labelsVisible = true, active = true, disposed = false, flowVisible = true, elapsed = 0;
  let environment, baselineZoom = 1, lastTime = 0;
  const devices = new Map(), groups = new Map(), tags = new Map(), markers = new Map();
  const flows = [], pickables = [], removers = [];
  const activePointers = new Set();
  let recentPicks = [];
  const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
  const homeTarget = new THREE.Vector3(0, .55, 0);
  const homeOffset = new THREE.Vector3(11, 14, 17);

  function listen(target, event, fn, opts) {
    target.addEventListener(event, fn, opts);
    removers.push(() => target.removeEventListener(event, fn, opts));
  }
  function metadata(object) {
    // 点击命中的通常是螺栓等网格，从它向父节点寻找 deviceId。
    // Python 的 ob['deviceId'] → GLB 的 extras.deviceId → 这里的 userData.deviceId。
    for (let node = object; node; node = node.parent) {
      if (node.userData.deviceId) return node.userData;
    }
    return null;
  }
  function hit(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    // Raycaster 从鼠标对应的相机位置发出虚拟射线，计算碰到哪个表面。
    raycaster.setFromCamera(pointer, camera);
    // 所有可见表面参与遮挡测试，避免选中墙体/管线后面的设备。
    const visible = pickables.filter(mesh => {
      for (let p = mesh; p; p = p.parent) if (!p.visible) return false;
      return true;
    });
    const first = raycaster.intersectObjects(visible, false)[0];
    return first ? metadata(first.object) : null;
  }
  function showHover(event) {
    if (down || interactionMode === 'pan' || event.shiftKey || event.ctrlKey || event.metaKey) {
      renderer.domElement.style.cursor = down ? 'grabbing' : 'grab';
      tooltip.hidden = true;
      return;
    }
    const data = hit(event);
    renderer.domElement.style.cursor = data ? 'pointer' : 'grab';
    tooltip.hidden = !data || !!down;
    if (!data || down) return;
    const device = devices.get(data.deviceId);
    const valve = data.kind === 'valve' && manifest.valves.find(v => v.id === data.assetId);
    tooltip.textContent = inspection?.active && data.label ? `${data.label}${data.internal?' · 内部示意零件':''}` : valve
      ? `${valve.id} · ${valve.id.endsWith('S') ? '进水' : '出水'}阀 · DN${valve.diameter}`
      : `${device.name} · ${STATUS[device.status].text}`;
    const rect = container.getBoundingClientRect();
    tooltip.style.left = `${Math.min(rect.width - 210, Math.max(10, event.clientX - rect.left + 14))}px`;
    tooltip.style.top = `${Math.max(60, Math.min(rect.height - 90, event.clientY - rect.top - 34))}px`;
  }
  function select(id, focus = false) {
    // 只把 'P-01' 这样的编号交回大屏；右侧卡片由 dashboard.js 更新。
    context.onSelect(id);
    if (focus) focusDevice(id);
  }
  function focusDevice(id) {
    if(inspection?.active){inspection.fit(true);return;}
    const item = manifest.pumps.find(p => p.id === id);
    if (!item) return;
    const target = vector(item.focus);
    focusMotion = { start: performance.now(), from: controls.target.clone(), to: target,
      zoomFrom: camera.zoom, zoomTo: 1.65 };
  }
  function reset() {
    if (!camera) return;
    focusMotion = null;
    // 清空上次拖动的阻尼余量，让复位镜头不会继续漂移。
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
    if(inspection?.active){inspection.fit(true);return;}
    controls.target.copy(homeTarget);
    camera.position.copy(homeTarget).add(homeOffset);
    camera.up.set(0, 1, 0);
    camera.zoom = baselineZoom = 1;
    controls.update();
    resize();
    toolbar.querySelector('[data-scene-action="top"]').setAttribute('aria-pressed', 'false');
  }
  function setInteractionMode(mode) {
    interactionMode = mode === 'pan' ? 'pan' : 'rotate';
    controls.enablePan = true;
    controls.mouseButtons.LEFT = interactionMode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE = interactionMode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    container.dataset.interactionMode = interactionMode;
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.setAttribute('aria-label', `CAD 泵房三维模型，当前为${interactionMode === 'pan' ? '平移' : '旋转'}模式。${interactionMode === 'pan' ? '左键或右键拖动平移' : '左键拖动旋转，Shift 加左键或右键拖动平移'}，滚轮缩放。`);
    navigation?.querySelectorAll('[data-navigation-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.navigationMode === interactionMode));
    });
    const hint = navigation?.querySelector('.model-navigation-hint');
    if (hint) hint.textContent = interactionMode === 'pan' ? '左键拖动平移 · 滚轮缩放' : 'Shift + 拖动 / 右键平移';
    recentPicks = [];
  }
  function makeNavigation() {
    navigation = document.createElement('div'); navigation.className = 'model-navigation';
    navigation.innerHTML = '<div class="model-navigation-buttons" role="group" aria-label="模型视角操作"><button data-navigation-mode="rotate" aria-pressed="true" title="左键拖动旋转；Shift + 左键或右键拖动平移">旋转</button><button data-navigation-mode="pan" aria-pressed="false" title="左键拖动平移模型">平移</button><button data-navigation-action="reset" title="复位当前泵房、设备或零件的视角">复位</button></div><small class="model-navigation-hint">Shift + 拖动 / 右键平移</small>';
    listen(navigation, 'click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.navigationMode) setInteractionMode(button.dataset.navigationMode);
      else reset();
    });
    container.append(navigation);
    setInteractionMode(interactionMode);
  }
  function pointerDown(event) {
    activePointers.add(event.pointerId);
    tooltip.hidden = true;
    if (activePointers.size > 1) {
      if (down) down.cancelled = true;
      recentPicks = [];
      return;
    }
    down = { x:event.clientX, y:event.clientY, pointer:event.pointerId, distance:0,
      cancelled:event.button !== 0 || interactionMode === 'pan' || event.shiftKey || event.ctrlKey || event.metaKey };
    renderer.domElement.style.cursor = 'grabbing';
  }
  function pointerMove(event) {
    if (down?.pointer === event.pointerId) {
      down.distance = Math.max(down.distance, Math.hypot(event.clientX - down.x, event.clientY - down.y));
      if (down.distance > 5) recentPicks = [];
    }
    showHover(event);
  }
  function pointerUp(event) {
    activePointers.delete(event.pointerId);
    if (down?.pointer !== event.pointerId) return;
    const start = down; down = null;
    renderer.domElement.style.cursor = 'grab';
    const distance = Math.max(start.distance, Math.hypot(event.clientX - start.x, event.clientY - start.y));
    if (start.cancelled || event.button !== 0 || distance > 5 || activePointers.size) {
      recentPicks = [];
      return;
    }
    const data = hit(event);
    if (!data) { recentPicks = []; return; }
    recentPicks.push({ id:data.deviceId, time:performance.now(), x:event.clientX, y:event.clientY });
    recentPicks = recentPicks.slice(-2);
    if (inspection.active) inspection.handlePick(data);
    else select(data.deviceId);
  }
  function cancelPointer(event) {
    activePointers.delete(event.pointerId);
    if (down?.pointer === event.pointerId) down = null;
    recentPicks = [];
    renderer.domElement.style.cursor = 'grab';
  }
  function resize() {
    if (!container || !camera) return;
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(width, height, false);
    container.dataset.viewport = `${Math.round(width)}x${Math.round(height)}`;
    if(inspection?.active){inspection.fit();return;}
    const aspect = width / height;
    // 以固定的默认镜头计算画幅，旋转时不重新缩放模型。
    const fitting = new THREE.PerspectiveCamera();
    fitting.position.copy(homeTarget).add(homeOffset);
    fitting.lookAt(homeTarget);
    fitting.updateMatrixWorld();
    let maxX = 0, maxY = 0;
    for (const x of [-7, 7]) for (const y of [-.6, 3]) for (const z of [-4.5, 4.5]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(fitting.matrixWorldInverse);
      maxX = Math.max(maxX, Math.abs(p.x)); maxY = Math.max(maxY, Math.abs(p.y));
    }
    const halfHeight = Math.max(maxY / .88, maxX / (aspect * .94));
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    container.dataset.viewport = `${Math.round(width)}x${Math.round(height)}`;
  }
  function updateDevice(device) {
    // device 来自网页的演示数据，不是从 GLB 读取的实时传感器数据。
    // 此函数把运行/告警状态反映到标签、颜色等显示上，不重建几何。
    devices.set(device.id, { ...device });
    const status = STATUS[device.status] || STATUS.offline;
    const item = tags.get(device.id);
    if (item) {
      item.style.setProperty('--status-color', status.color);
      item.querySelector('small').textContent = status.text;
      item.querySelector('.model-tag-value').textContent = device.flow == null ? '—' : Math.round(device.flow);
      item.setAttribute('aria-label', `${device.name}，${status.text}，查看设备详情`);
    }
    const marker = markers.get(device.id);
    if (marker) {
      marker.ring.material.color.set(device.id === selectedId ? '#79ddff' : status.color);
      marker.ring.material.opacity = device.id === selectedId ? .95 : device.status === 'alarm' ? .85 : .22;
      marker.led.material.color.set(status.color);
    }
    groups.get(device.id)?.traverse(object => {
      if (!object.isMesh) return;
      if (!['blue', 'blueEdge'].includes(object.userData.partMaterial)) return;
      object.material.emissive.set(device.status === 'alarm' ? '#e83f55' : device.status === 'running' ? '#0e68a9' : '#000000');
      object.material.emissiveIntensity = device.status === 'alarm' ? .3 : .12;
      object.material.color.copy(object.userData.baseColor);
      if (device.status === 'offline') object.material.color.lerp(new THREE.Color('#667681'), .7);
    });
    applyTrace();
    inspection?.updateTelemetry();
  }
  function selectDevice(id) {
    selectedId = id;
    tags.forEach((tag, key) => {
      tag.classList.toggle('selected', key === id);
      tag.setAttribute('aria-pressed', String(key === id));
    });
    devices.forEach(updateDevice);
    if (container) container.dataset.selectedDevice = id;
    if(inspection?.active&&inspection.deviceId!==id)inspection.enter(id);
    renderTrace();
  }
  function applyTrace(){
    if(!model)return;
    if(inspection?.active){inspection.refreshMaterials();return;}
    model.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const data=metadata(mesh),related=data?.deviceId===selectedId;
      mesh.material.transparent=traceEnabled&&!related;
      mesh.material.opacity=traceEnabled && !related ? .22 : 1;
      mesh.material.depthWrite=!mesh.material.transparent;
      if(['steel','bolt'].includes(mesh.userData.partMaterial)){
        mesh.material.color.copy(mesh.userData.baseColor);
        if(traceEnabled&&related)mesh.material.color.lerp(new THREE.Color('#46cce9'),.68);
      }
      mesh.material.needsUpdate=true;
    });
  }
  function renderTrace(){
    if(!traceCard)return;
    traceCard.hidden=!traceEnabled||!!inspection?.active;
    container.classList.toggle('is-tracing',traceEnabled);
    if(!selectedId)return;
    const suffix=selectedId.slice(2),d=devices.get(selectedId);
    traceCard.querySelector('.model-trace-path').textContent=`V-${suffix}-S  →  ${selectedId}  →  V-${suffix}-D`;
    traceCard.querySelector('small').textContent=`${d?.name||selectedId} · 进水阀 / 水泵 / 出水阀`;
  }
  function openInspection(id=selectedId,component=null){
    if(!inspection)return;
    focusMotion=null;
    context.onSelect(id);
    inspection.enter(id,component);
  }
  function createTags() {
    labels = document.createElement('div'); labels.className = 'model-labels';
    labels.setAttribute('aria-label', '三维设备标签'); container.append(labels);
    for (const p of manifest.pumps) {
      const tag = document.createElement('button');
      tag.className = 'model-tag'; tag.dataset.deviceId = p.id;
      tag.innerHTML = `<svg class="model-tag-shape" viewBox="0 0 102 60" preserveAspectRatio="none" aria-hidden="true"><path d="M.5 .5H101.5V51H58L51 59L44 51H.5Z"/></svg><span class="model-tag-head"><b></b><strong>${p.id}</strong><small></small></span><span class="model-tag-reading"><span class="model-tag-value"></span><em>m³/h</em></span>`;
      listen(tag, 'click', () => select(p.id));
      listen(tag, 'dblclick', () => openInspection(p.id));
      labels.append(tag); tags.set(p.id, tag);
      const [x, , z] = p.focus;
      const points = [[x-.7,.32,z-1.25],[x+.7,.32,z-1.25],[x+.7,.32,z+1.25],[x-.7,.32,z+1.25]].map(vector);
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#3bddbe', transparent: true, opacity: .5 }));
      scene.add(ring);
      const led = new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 8), new THREE.MeshBasicMaterial({ color: '#3bddbe' }));
      led.position.set(x, 1.25, z-.18); scene.add(led);
      markers.set(p.id, { ring, led });
      for (const [name, points, diameter] of [['suction', p.suction, .1], ['discharge', p.discharge, .075]]) {
        const curve = new THREE.CurvePath();
        const positions = points.map(cadToWeb);
        // 可视流向沿管顶偏移，避免被不透明管壁遮挡。
        positions.forEach(v => v.y += diameter + .028);
        for (let i = 1; i < positions.length; i++) curve.add(new THREE.LineCurve3(positions[i - 1], positions[i]));
        const material = new THREE.MeshBasicMaterial({ color: name === 'suction' ? '#54deff' : '#45e5c5' });
        const dots = [];
        for (let i = 0; i < 5; i++) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), material);
          scene.add(dot); dots.push(dot);
        }
        flows.push({ id: p.id, curve, dots });
      }
    }
  }
  function updateTags() {
    if (!labelsVisible||inspection?.active) return;
    const width = container.clientWidth, height = container.clientHeight;
    const used = [];
    // 固定编号顺序，重叠时只上移标签，保持投影与设备的对应关系。
    for (const p of manifest.pumps) {
      const tag = tags.get(p.id);
      const v = vector(p.anchor).project(camera);
      const x = (v.x * .5 + .5) * width, projectedY = (-v.y * .5 + .5) * height;
      const visible = v.z > -1 && v.z < 1 && x > 45 && x < width - 45 && projectedY > 65 && projectedY < height - 70;
      tag.hidden = !visible;
      if (!visible) continue;
      let y = projectedY;
      for (let i = 0; i < 4; i++) {
        if (used.some(a => Math.abs(a.x - x) < 101 && Math.abs(a.y - y) < 56)) y -= 56;
      }
      y = Math.max(112, y);
      used.push({ x, y });
      tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      tag.style.setProperty('--stem-height', `${Math.max(12, projectedY - y + 14)}px`);
    }
  }
  function animate(time) {
    if (disposed) return;
    // 请求浏览器下一帧继续调用此函数，形成持续更新的显示循环。
    frame = requestAnimationFrame(animate);
    const dt = Math.min((time - lastTime) / 1000, .05); lastTime = time;
    if (!active || document.hidden) return;
    elapsed += dt;
    if (focusMotion) {
      const t = Math.min(1, (time - focusMotion.start) / 650), ease = 1 - (1 - t) ** 3;
      const next = focusMotion.from.clone().lerp(focusMotion.to, ease);
      camera.position.add(next.clone().sub(controls.target)); controls.target.copy(next);
      camera.zoom = THREE.MathUtils.lerp(focusMotion.zoomFrom, focusMotion.zoomTo, ease);
      camera.updateProjectionMatrix();
      if (t === 1) focusMotion = null;
    }
    controls.update();
    inspection?.tick(dt);
    camera.updateMatrixWorld(true);
    for (const flow of flows) {
      const running = devices.get(flow.id)?.status === 'running';
      flow.dots.forEach((dot, i) => {
        dot.visible = !inspection?.active && flowVisible && running;
        if (dot.visible) dot.position.copy(flow.curve.getPoint((elapsed * .14 + i / flow.dots.length) % 1));
      });
    }
    markers.forEach((marker, id) => {
      if (devices.get(id)?.status === 'alarm') marker.led.scale.setScalar(1 + Math.sin(elapsed * 4) * .18);
      else marker.led.scale.setScalar(1);
    });
    updateTags();
    // 渲染发生在这里：按当前相机观察场景，把模型和光照绘制到 canvas。
    // 拖动视角、告警变化、流向粒子移动后，下一帧重新绘制；无需再次运行 Python。
    renderer.render(scene, camera);
  }
  function makeToolbar() {
    toolbar = document.createElement('div'); toolbar.className = 'model-actions';
    toolbar.innerHTML = '<button data-scene-action="trace" aria-pressed="false" title="高亮当前设备的进出水管与阀门">关联支路</button><button data-scene-action="inspect" title="下钻当前设备，查看部件与内部结构">结构查看</button><button data-scene-action="walls" aria-pressed="false" title="显示完整墙体">墙体</button><button data-scene-action="flow" aria-pressed="true" title="显示或隐藏管道流向">流向</button><button data-scene-action="top" aria-pressed="false" title="切换俯视角度">俯视</button><button data-scene-action="focus" title="靠近当前设备">定位</button>';
    listen(toolbar, 'click', event => {
      const button = event.target.closest('button'); if (!button) return;
      const key = button.dataset.sceneAction, pressed = button.getAttribute('aria-pressed') === 'true';
      if(key==='trace'){
        traceEnabled=!traceEnabled;button.setAttribute('aria-pressed',String(traceEnabled));applyTrace();renderTrace();
      }else if(key==='inspect')openInspection();
      else if (key === 'walls') {
        model.getObjectByName('UpperWalls').visible = !pressed;
        button.setAttribute('aria-pressed', String(!pressed));
      } else if (key === 'flow') {
        flowVisible = !pressed; button.setAttribute('aria-pressed', String(!pressed));
      } else if (key === 'top') {
        if (pressed) reset();
        else {
          focusMotion = null; controls.target.copy(homeTarget);
          camera.position.copy(homeTarget).add(new THREE.Vector3(0, 23, -.01));
          camera.zoom = 1.1; camera.updateProjectionMatrix(); controls.update();
          button.setAttribute('aria-pressed', 'true');
        }
      } else focusDevice(selectedId);
    });
    container.append(toolbar);
    traceCard=document.createElement('div');traceCard.className='model-trace-card';traceCard.hidden=true;
    traceCard.innerHTML='<div><small></small><strong class="model-trace-path"></strong></div><button>下钻查看</button>';
    listen(traceCard.querySelector('button'),'click',()=>openInspection());container.append(traceCard);
  }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); inspection?.dispose();removers.forEach(remove => remove());
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene?.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
    });
    materials.forEach(m => { Object.values(m).forEach(v => { if (v?.isTexture) textures.add(v); }); m.dispose(); });
    geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose());
    environment?.dispose(); renderer?.dispose();
    container?.classList.remove('pump-scene');
  }
  return {
    async mount(element, sceneContext) {
      // element 是 HTML 里用于放模型的区域；sceneContext 传入设备数据和选中回调。
      container = element; context = sceneContext;
      container.classList.add('pump-scene');
      container.innerHTML = '<div class="model-loading" role="status"><span></span>正在载入泵房模型</div>';
      try {
        // 1. 场景是容器，渲染器负责调用浏览器的图形能力。
        scene = new THREE.Scene();
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.setAttribute('aria-label', 'CAD 泵房三维模型，拖动旋转、滚轮缩放、点击设备选择');
        renderer.domElement.setAttribute('tabindex', '0');
        // renderer.domElement 是渲染器创建的 <canvas>，插入 HTML 后才有显示位置。
        container.append(renderer.domElement);
        // 2. 本项目采用正交相机；它和下面的灯光都由网页重新配置。
        camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 120);
        camera.position.copy(homeTarget).add(homeOffset);
        // 把鼠标/触摸操作连接到相机，提供旋转、缩放和平移。
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(homeTarget); controls.enableDamping = true; controls.dampingFactor = .09;
        controls.minZoom = .7; controls.maxZoom = 3.5;
        controls.maxPolarAngle = Math.PI / 2.03; controls.minPolarAngle = .005;
        controls.screenSpacePanning = true; controls.enablePan = true;
        controls.addEventListener('start', () => { focusMotion = null; });
        controls.update();
        // 环境反射、主光、轮廓光、阴影和色彩处理共同影响最终画面。
        // 因为 GLB 没带这份场景的灯光，载入模型后仍需要这些配置。
        const pmrem = new THREE.PMREMGenerator(renderer);
        const roomEnvironment = new RoomEnvironment();
        environment = pmrem.fromScene(roomEnvironment, .04);
        roomEnvironment.dispose(); pmrem.dispose();
        scene.environment = environment.texture; scene.environmentIntensity = .55;
        scene.add(new THREE.HemisphereLight('#c8eaff', '#24465f', .8));
        const key = new THREE.DirectionalLight('#e4f4ff', 2.6);
        key.position.set(4, 12, -5); key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .5, far: 40 });
        key.shadow.normalBias = .025; key.shadow.bias = -.0001;
        scene.add(key);
        const rim = new THREE.DirectionalLight('#57bbff', 1.2); rim.position.set(-8, 5, 6); scene.add(rim);
        // 3. 并行读取几何资产和本项目的额外设备清单。
        // 开发时 /models/... 对应 public/models/...；单文件版会改成内嵌资产地址。
        const [gltf, metadataResponse] = await Promise.all([
          new GLTFLoader().loadAsync('./models/pump-room.glb'), fetch('./models/pump-room.json'),
        ]);
        if (!metadataResponse.ok) throw new Error('无法加载 CAD 设备映射');
        // GLTFLoader 已把二进制解析成 Three.js 对象树；gltf.scene 是树的根。
        manifest = await metadataResponse.json(); model = gltf.scene;
        model.traverse(object => {
          if (object.userData.kind === 'pump') groups.set(object.userData.deviceId, object);
          if (object.isMesh) {
            object.castShadow = true; object.receiveShadow = true;
            object.material = object.material.clone();
            object.userData.baseColor = object.material.color.clone(); pickables.push(object);
          }
        });
        // 4. 网页调整展示方式：模型仍保留完整墙体，默认只隐藏上部墙体。
        model.getObjectByName('UpperWalls').visible = false;
        scene.add(model); makeToolbar(); createTags(); makeNavigation();
        inspection=createInspection({container,model,scene,camera,controls,groups,getDevice:id=>devices.get(id),onChange:entering=>{
          focusMotion=null;labels.hidden=entering||!labelsVisible;
          markers.forEach(marker=>{marker.ring.visible=marker.led.visible=!entering;});
          if(!entering){devices.forEach(updateDevice);reset();}
          renderTrace();
        }});
        tooltip = document.createElement('div'); tooltip.className = 'model-tooltip'; tooltip.hidden = true; container.append(tooltip);
        context.devices.forEach(updateDevice);
        listen(renderer.domElement, 'pointerdown', pointerDown);
        listen(renderer.domElement, 'pointerup', pointerUp);
        listen(renderer.domElement, 'pointercancel', cancelPointer);
        listen(renderer.domElement, 'pointermove', pointerMove);
        listen(renderer.domElement, 'pointerleave', () => { tooltip.hidden = true; });
        listen(renderer.domElement, 'dblclick', e => {
          if (interactionMode === 'pan' || inspection.active || e.shiftKey || e.ctrlKey || e.metaKey || recentPicks.length < 2) return;
          const [first, last] = recentPicks;
          if (first.id !== last.id || last.time - first.time > 650 || Math.hypot(last.x-first.x,last.y-first.y) > 5) return;
          const data = hit(e); if (data) openInspection(data.deviceId);
          recentPicks = [];
        });
        listen(renderer.domElement, 'keydown', e => {
          if (/^[1-4]$/.test(e.key)) { e.preventDefault(); select(`P-0${e.key}`); }
          if (e.key.toLowerCase() === 'r') { e.preventDefault(); reset(); }
          if(e.key==='Escape'&&inspection.active){e.preventDefault();inspection.exit();}
        });
        listen(renderer.domElement, 'webglcontextlost', e => {
          e.preventDefault(); active = false;
          const notice = document.createElement('div'); notice.className = 'model-loading'; notice.setAttribute('role','alert');
          notice.textContent = '三维显示已中断，请刷新页面重试'; container.append(notice);
        });
        observer = new ResizeObserver(resize); observer.observe(container);
        resize(); container.querySelector('.model-loading').remove();
        container.dataset.modelReady = 'true';
        // 5. 初始化完成后启动帧循环；animate() 中真正调用 renderer.render()。
        frame = requestAnimationFrame(animate);
      } catch (error) { dispose(); throw error; }
    },
    selectDevice, updateDevice, reset, focusDevice, openInspection, dispose,
    setLabelsVisible(visible) { labelsVisible = visible; if (labels) labels.hidden = !visible||!!inspection?.active; },
    setView(view) { active = view === 'scene';if(!active&&inspection?.active)inspection.exit(); if (active) requestAnimationFrame(resize); },
    zoom(value) {
      focusMotion = null;
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * value / baselineZoom, .7, 3.5);
      baselineZoom = value; camera.updateProjectionMatrix();
    },
    inspect() {
      camera?.updateMatrixWorld(true);
      let visiblePartCount=0;
      model?.traverse(node=>{if(node.userData.kind!=='part')return;for(let p=node;p;p=p.parent)if(!p.visible)return;visiblePartCount++;});
      const rect = renderer?.domElement.getBoundingClientRect();
      const screen = position => {
        const p = vector(position).project(camera);
        return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
      };
      return { selectedId, assetCount: groups.size, valveCount: manifest?.valves.length,
        inspection:inspection?.inspect(),traceEnabled,visiblePartCount,interactionMode,
        visiblePumpIds:[...groups].filter(([id,group])=>group.visible).map(([id])=>id),
        camera: camera?.position.toArray(), target: controls?.target.toArray(), zoom: camera?.zoom,
        labelsVisible, active, flowVisible, visibleFlowParticles: flows.reduce((sum,f) => sum+f.dots.filter(d=>d.visible).length,0),
        devices: [...devices.values()].map(d=>({id:d.id,status:d.status,flow:d.flow})),
        wallsVisible: model?.getObjectByName('UpperWalls')?.visible,
        pickTargets: manifest ? [
          ...manifest.pumps.map(p=>({id:p.id,pumpId:p.id,...screen([p.focus[0],1.06,p.focus[2]-.45])})),
          ...manifest.valves.map(v=>({id:v.id,pumpId:v.pumpId,...screen(v.position)})),
        ] : [],
        calls: renderer?.info.render.calls, triangles: renderer?.info.render.triangles };
    },
  };
}
