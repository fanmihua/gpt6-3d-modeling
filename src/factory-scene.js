import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './factory-scene.css';

const MODEL_URL = './models/factory-campus.glb';
const MANIFEST_URL = './models/factory-campus.json';
const VIEW_OFFSETS = {
  // 等轴测鸟瞰：水平 45°、俯角约 35.264°，底板两组边线保持对称。
  bird: new THREE.Vector3(-185, 185, 185),
  top: new THREE.Vector3(0, 300, 0.01),
  front: new THREE.Vector3(-40, 110, 285),
};
const ALARM_STATES = new Set(['warning', 'alarm', 'alert', 'attention']);
const isAlarm = zone => ALARM_STATES.has(zone?.status);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** 厂区 GLB 查看器。几何和区域边界来自 Blender，业务数据由页面传入。 */
export async function createFactoryScene({ container, zones = [], onSelect, onReady, onError } = {}) {
  if (!(container instanceof HTMLElement)) throw new Error('厂区三维场景缺少容器。');

  let renderer, scene, camera, controls, model, manifest, environmentTarget, resizeObserver;
  let disposed = false, ready = false, frame = 0, focusMotion = null, pointerDown = null;
  let selectedId = null, currentView = 'bird', mode = 'rotate', labelsVisible = true;
  let width = 1, height = 1, lastHoverTime = 0, baselineHalfHeight = 110;
  const removers = [], pickables = [], materialRecords = [], materialCache = new Map();
  const tags = new Map(), zoneMap = new Map(), activePointers = new Set();
  const layerState = { greenery: true, buildings: true, infrastructure: true };
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const homeTarget = new THREE.Vector3(0, 5, 0), modelBounds = new THREE.Box3();
  const colorSelected = new THREE.Color('#2489ad');
  const colorAlert = new THREE.Color('#bd763e');
  const uiRoot = document.createElement('div');
  const labelsRoot = document.createElement('div');
  const tooltip = document.createElement('div');
  const status = document.createElement('div');
  let selectionOutline, selectionFloor;

  container.classList.add('factory-scene-host');
  container.dataset.sceneReady = 'false';
  uiRoot.className = 'factory-scene-ui';
  labelsRoot.className = 'factory-scene-labels';
  labelsRoot.setAttribute('aria-label', '厂区功能分区');
  tooltip.className = 'factory-scene-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  status.className = 'factory-scene-status';
  status.setAttribute('role', 'status');
  status.innerHTML = '<span class="factory-scene-spinner" aria-hidden="true"></span><strong>正在构建厂区视图</strong><span>载入建筑、道路与工艺设施</span>';
  uiRoot.append(labelsRoot, tooltip, status);
  container.append(uiRoot);

  function listen(target, event, callback, options) {
    target.addEventListener(event, callback, options);
    removers.push(() => target.removeEventListener(event, callback, options));
  }

  function requestRender() {
    if (disposed || frame || !renderer) return;
    frame = requestAnimationFrame(render);
  }

  function render(time) {
    frame = 0;
    if (disposed || !renderer) return;
    if (focusMotion) {
      const progress = clamp((time - focusMotion.started) / 640, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      controls.target.lerpVectors(focusMotion.targetFrom, focusMotion.targetTo, eased);
      camera.position.lerpVectors(focusMotion.cameraFrom, focusMotion.cameraTo, eased);
      camera.zoom = THREE.MathUtils.lerp(focusMotion.zoomFrom, focusMotion.zoomTo, eased);
      camera.updateProjectionMatrix();
      if (progress >= 1) focusMotion = null;
    }
    controls.update();
    camera.updateMatrixWorld();
    updateLabels();
    renderer.render(scene, camera);
    if (focusMotion) requestRender();
  }

  function flushControls() {
    const previous = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = previous;
  }

  function fitFrustum() {
    if (!camera || modelBounds.isEmpty()) return;
    const fitting = new THREE.PerspectiveCamera();
    fitting.position.copy(homeTarget).add(VIEW_OFFSETS[currentView]);
    fitting.lookAt(homeTarget);
    fitting.updateMatrixWorld();
    let extentX = 1, extentY = 1;
    for (const x of [modelBounds.min.x, modelBounds.max.x]) {
      for (const y of [modelBounds.min.y, modelBounds.max.y]) {
        for (const z of [modelBounds.min.z, modelBounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).applyMatrix4(fitting.matrixWorldInverse);
          extentX = Math.max(extentX, Math.abs(corner.x));
          extentY = Math.max(extentY, Math.abs(corner.y));
        }
      }
    }
    const aspect = width / height;
    // 窄桌面为右侧工具栏预留空间，避免等轴测底板的右角被工具遮挡。
    const toolbarGutter = width < 700 ? 64 : 0;
    const usableAspect = (width - toolbarGutter) / height;
    baselineHalfHeight = Math.max(extentY / 0.87, extentX / (usableAspect * 0.93));
    const horizontalOffset = baselineHalfHeight * toolbarGutter / height;
    camera.left = -baselineHalfHeight * aspect + horizontalOffset;
    camera.right = baselineHalfHeight * aspect + horizontalOffset;
    camera.top = baselineHalfHeight;
    camera.bottom = -baselineHalfHeight;
    camera.updateProjectionMatrix();
  }

  function resize() {
    if (!renderer || disposed) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(width, height, false);
    fitFrustum();
    container.dataset.viewport = `${Math.round(width)}x${Math.round(height)}`;
    requestRender();
  }

  function zoneIdOf(object) {
    for (let current = object; current; current = current.parent) {
      if (current.userData.zoneId && zoneMap.has(current.userData.zoneId)) return current.userData.zoneId;
    }
    return null;
  }

  function layerOf(object) {
    for (let current = object; current; current = current.parent) {
      if (current.userData.layer) return current.userData.layer;
    }
    return null;
  }

  function isVisible(object) {
    for (let current = object; current; current = current.parent) if (!current.visible) return false;
    return true;
  }

  function hit(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    // 第一个实际表面决定选择，隐藏的建筑以及墙后的设施不会误触。
    const result = raycaster.intersectObjects(pickables.filter(isVisible), false)[0];
    return result ? zoneIdOf(result.object) : null;
  }

  function paintSelection({ updateFootprint = true } = {}) {
    for (const record of materialRecords) {
      const selected = record.zoneId === selectedId;
      record.material.emissive.copy(record.emissive);
      record.material.emissiveIntensity = record.intensity;
      if (selected) {
        record.material.emissive.copy(isAlarm(zoneMap.get(selectedId)) ? colorAlert : colorSelected);
        record.material.emissiveIntensity = 0.22;
      }
    }
    for (const [id, item] of tags) {
      item.button.classList.toggle('is-selected', id === selectedId);
      item.button.setAttribute('aria-pressed', String(id === selectedId));
    }
    const zone = zoneMap.get(selectedId);
    if (selectionOutline) selectionOutline.visible = !!zone;
    if (selectionFloor) selectionFloor.visible = !!zone;
    if (zone) {
      if (updateFootprint) {
      const center = zone.center || [0, 0, 0];
      const size = zone.size || [25, 10, 25];
      const x = Math.max(size[0] / 2 + 2, 8);
      const z = Math.max(size[2] / 2 + 2, 8);
      const corner = Math.min(x, z) * 0.26;
      const lines = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        lines.push(sx * (x - corner), 0, sz * z, sx * x, 0, sz * z,
          sx * x, 0, sz * z, sx * x, 0, sz * (z - corner));
      }
      selectionOutline.geometry.dispose();
      selectionOutline.geometry = new THREE.BufferGeometry();
      selectionOutline.geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      selectionOutline.position.set(center[0], 0.46, center[2]);
      selectionFloor.position.set(center[0], 0.42, center[2]);
      selectionFloor.scale.set(x * 2, z * 2, 1);
      }
      const color = isAlarm(zone) ? '#eaa961' : '#5fd6f2';
      selectionOutline.material.color.set(color);
      selectionFloor.material.color.set(color);
    }
    requestRender();
  }

  function selectZone(id, { focus = false } = {}) {
    if (!ready || !zoneMap.has(id)) return;
    selectedId = id;
    container.dataset.selectedZone = id;
    paintSelection();
    if (focus) focusZone(id);
  }

  function updateZone(id, patch) {
    const zone = zoneMap.get(id);
    if (disposed || !zone || !patch || typeof patch !== 'object') return false;
    if (typeof patch.status === 'string' && patch.status !== zone.status && !('statusLabel' in patch)) zone.statusLabel = '';
    for (const key of ['status', 'statusLabel', 'name']) {
      if (typeof patch[key] === 'string' && (key !== 'name' || patch[key].trim())) zone[key] = patch[key];
    }
    const tag = tags.get(id);
    if (tag) {
      const { button } = tag;
      const statusText = zone.statusLabel || (isAlarm(zone) ? '运行关注' : zone.status === 'maintenance' ? '计划检修' : '正常运行');
      button.classList.toggle('has-alarm', isAlarm(zone));
      button.classList.toggle('has-maintenance', zone.status === 'maintenance');
      button.dataset.status = zone.status;
      button.querySelector('.factory-model-tag-name').textContent = zone.name;
      button.title = `${zone.name} · ${statusText}`;
      button.setAttribute('aria-label', `查看${zone.name}，${statusText}`);
      if (!tooltip.hidden && tooltip.dataset.zoneId === id) tooltip.textContent = `${zone.name} · 点击查看区域`;
    }
    // 更新业务状态只刷新标签与材质，厂区模型与选区几何保持不变。
    paintSelection({ updateFootprint: false });
    return true;
  }

  function activateZone(id, source) {
    if (!id) return;
    selectZone(id);
    onSelect?.(id, { source });
  }

  function focusZone(id) {
    const zone = zoneMap.get(id);
    if (!zone) return;
    flushControls();
    const target = new THREE.Vector3(...zone.center);
    target.y = Math.min(target.y, 12);
    const offset = camera.position.clone().sub(controls.target);
    const extent = Math.max(zone.size?.[0] || 40, zone.size?.[2] || 40);
    focusMotion = {
      started: performance.now(), targetFrom: controls.target.clone(), targetTo: target,
      cameraFrom: camera.position.clone(), cameraTo: target.clone().add(offset),
      zoomFrom: camera.zoom, zoomTo: clamp(130 / extent, 1.55, 2.5),
    };
    requestRender();
  }

  function setView(view) {
    if (!camera || !VIEW_OFFSETS[view]) return;
    focusMotion = null;
    flushControls();
    currentView = view;
    controls.target.copy(homeTarget);
    camera.position.copy(homeTarget).add(VIEW_OFFSETS[view]);
    camera.up.set(0, 1, 0);
    camera.zoom = 1;
    camera.lookAt(homeTarget);
    controls.update();
    fitFrustum();
    container.dataset.view = view;
    requestRender();
  }

  function setMode(value) {
    if (!controls) return;
    mode = value === 'pan' ? 'pan' : 'rotate';
    controls.mouseButtons.LEFT = mode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE = mode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    container.dataset.interactionMode = mode;
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.setAttribute('aria-label', `可交互厂区三维模型。当前${mode === 'pan' ? '平移' : '旋转'}模式，左键拖动${mode === 'pan' ? '平移' : '旋转'}，Shift 加拖动或右键平移，滚轮缩放。点击建筑查看区域数据。`);
    tooltip.hidden = true;
  }

  function setLabels(value) {
    labelsVisible = !!value;
    labelsRoot.hidden = !labelsVisible;
    container.dataset.labels = String(labelsVisible);
    requestRender();
  }

  function setLayer(name, value) {
    if (!(name in layerState)) return;
    layerState[name] = !!value;
    model?.traverse(object => {
      if (object.userData.layer === name) object.visible = !!value;
    });
    tooltip.hidden = true;
    requestRender();
  }

  function zoom(factor) {
    if (!camera || !Number.isFinite(factor) || factor <= 0) return;
    focusMotion = null;
    camera.zoom = clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix();
    requestRender();
  }

  function reset() { setView('bird'); }

  function buildLabels() {
    for (const [index, zone] of [...zoneMap.values()].entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `factory-model-tag${isAlarm(zone) ? ' has-alarm' : ''}${zone.status === 'maintenance' ? ' has-maintenance' : ''}`;
      button.dataset.zoneId = zone.id;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `查看${zone.name}`);
      button.innerHTML = '<svg viewBox="0 0 148 40" aria-hidden="true"><path d="M6 1H141L147 7V28L142 33H81L74 39L67 33H6L1 28V6Z"/></svg><span class="factory-model-tag-content"><i></i><span class="factory-model-tag-name"></span></span>';
      button.querySelector('.factory-model-tag-name').textContent = zone.shortName || zone.name;
      const statusText = zone.statusLabel || (isAlarm(zone) ? '运行关注' : zone.status === 'maintenance' ? '计划检修' : '正常运行');
      button.title = `${zone.name} · ${statusText}`;
      listen(button, 'click', event => {
        event.stopPropagation();
        activateZone(zone.id, 'label');
      });
      const center = zone.center || [0, 0, 0];
      const anchor = new THREE.Vector3(center[0], center[1] + (zone.size?.[1] || 8) / 2 + 2, center[2]);
      tags.set(zone.id, { button, anchor, index, zone });
      labelsRoot.append(button);
    }
  }

  function updateLabels() {
    if (!ready || !labelsVisible) return;
    const placed = [];
    const projected = new THREE.Vector3();
    const ordered = [...tags.values()].sort((a, b) =>
      (Number(b.zone.id === selectedId) * 10 + Number(isAlarm(b.zone))) -
      (Number(a.zone.id === selectedId) * 10 + Number(isAlarm(a.zone))));
    for (const tag of ordered) {
      const button = tag.button;
      projected.copy(tag.anchor).project(camera);
      const centerX = (projected.x * 0.5 + 0.5) * width;
      const anchorY = (-projected.y * 0.5 + 0.5) * height;
      const inFrame = projected.z >= -1 && projected.z <= 1 && centerX > 18 && centerX < width - 18 && anchorY > 24 && anchorY < height - 22;
      if (!inFrame || layerState.buildings === false) {
        button.hidden = true;
        continue;
      }
      const labelWidth = width < 700 ? 126 : 148;
      const labelHeight = 40;
      button.style.width = `${labelWidth}px`;
      const x = clamp(centerX - labelWidth / 2, 12, width - labelWidth - 12);
      const y = clamp(anchorY - labelHeight - 5, 26, height - labelHeight - 48);
      const candidates = [
        [x, y], [x, y - 38], [x, y + 38], [x - 72, y - 12], [x + 72, y - 12],
        [x, y - 76], [x - 100, y + 28], [x + 100, y + 28],
      ];
      let location = null;
      for (const [left, top] of candidates) {
        if (left < 10 || left + labelWidth > width - 10 || top < 22 || top + labelHeight > height - 32) continue;
        const box = { left, top, right: left + labelWidth, bottom: top + labelHeight };
        if (placed.some(other => box.left < other.right + 5 && box.right + 5 > other.left && box.top < other.bottom + 2 && box.bottom + 2 > other.top)) continue;
        location = box;
        break;
      }
      button.hidden = !location;
      if (!location) continue;
      placed.push(location);
      button.style.transform = `translate3d(${Math.round(location.left)}px,${Math.round(location.top)}px,0)`;
      button.style.zIndex = tag.zone.id === selectedId ? '4' : '2';
    }
  }

  function showHover(event) {
    if (pointerDown || mode === 'pan' || event.shiftKey || event.ctrlKey || event.metaKey) {
      tooltip.hidden = true;
      renderer.domElement.style.cursor = pointerDown ? 'grabbing' : 'grab';
      return;
    }
    if (performance.now() - lastHoverTime < 55) return;
    lastHoverTime = performance.now();
    const id = hit(event), zone = zoneMap.get(id);
    renderer.domElement.style.cursor = zone ? 'pointer' : 'grab';
    tooltip.hidden = !zone;
    if (!zone) return;
    tooltip.dataset.zoneId = id;
    tooltip.textContent = `${zone.name} · 点击查看区域`;
    const rect = container.getBoundingClientRect();
    tooltip.style.left = `${clamp(event.clientX - rect.left + 14, 12, width - 214)}px`;
    tooltip.style.top = `${clamp(event.clientY - rect.top - 40, 18, height - 70)}px`;
  }

  function installPointers() {
    const canvas = renderer.domElement;
    listen(canvas, 'pointerdown', event => {
      activePointers.add(event.pointerId);
      focusMotion = null;
      tooltip.hidden = true;
      if (activePointers.size > 1) {
        if (pointerDown) pointerDown.cancelled = true;
        return;
      }
      pointerDown = {
        id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0,
        cancelled: event.button !== 0 || mode === 'pan' || event.shiftKey || event.ctrlKey || event.metaKey,
      };
      canvas.style.cursor = 'grabbing';
    });
    listen(canvas, 'pointermove', event => {
      if (pointerDown?.id === event.pointerId) {
        pointerDown.moved = Math.max(pointerDown.moved, Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y));
      }
      showHover(event);
    });
    listen(canvas, 'pointerup', event => {
      activePointers.delete(event.pointerId);
      if (pointerDown?.id !== event.pointerId) return;
      const start = pointerDown;
      pointerDown = null;
      canvas.style.cursor = 'grab';
      const distance = Math.max(start.moved, Math.hypot(event.clientX - start.x, event.clientY - start.y));
      if (start.cancelled || distance > 5 || event.button !== 0 || activePointers.size) return;
      activateZone(hit(event), 'model');
    });
    listen(canvas, 'pointercancel', event => {
      activePointers.delete(event.pointerId);
      if (pointerDown?.id === event.pointerId) pointerDown = null;
      tooltip.hidden = true;
      canvas.style.cursor = 'grab';
    });
    listen(canvas, 'pointerleave', () => { tooltip.hidden = true; });
    listen(canvas, 'contextmenu', event => event.preventDefault());
    listen(canvas, 'keydown', event => {
      if (event.key === 'Home') { event.preventDefault(); reset(); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.16); }
      if (event.key === '-') { event.preventDefault(); zoom(1 / 1.16); }
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    removers.forEach(remove => remove());
    controls?.dispose();
    const materials = new Set(), geometries = new Set(), textures = new Set();
    scene?.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    environmentTarget?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
    uiRoot.remove();
    container.dataset.sceneReady = 'false';
  }

  const api = {
    selectZone, updateZone, setView, setMode, setLabels, setLayer, zoom, reset, dispose,
    getState: () => ({
      ready, selectedId, view: currentView, mode, labels: labelsVisible,
      layers: { ...layerState }, zoom: camera?.zoom || 1,
      camera: camera?.position.toArray() || null, target: controls?.target.toArray() || null,
      model: model ? { meshes: pickables.length, zones: zoneMap.size, triangles: renderer?.info.render.triangles || 0 } : null,
      viewport: { width: Math.round(width), height: Math.round(height) },
    }),
  };

  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor('#071a27', 0);
    renderer.domElement.className = 'factory-scene-canvas';
    renderer.domElement.tabIndex = 0;
    container.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-140, 140, 110, -110, 0.1, 1500);
    camera.position.copy(homeTarget).add(VIEW_OFFSETS.bird);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(homeTarget);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minPolarAngle = 0.001;
    controls.maxPolarAngle = Math.PI / 2.13;
    controls.minZoom = 0.6;
    controls.maxZoom = 4;
    controls.zoomSpeed = 0.85;
    controls.rotateSpeed = 0.55;
    controls.panSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => { focusMotion = null; tooltip.hidden = true; });
    controls.update();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(room, 0.04);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.34;
    room.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight('#d8eef7', '#516875', 1.5));
    const keyLight = new THREE.DirectionalLight('#fff6e8', 2.2);
    keyLight.position.set(-130, 230, 140);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -170;
    keyLight.shadow.camera.right = 170;
    keyLight.shadow.camera.top = 150;
    keyLight.shadow.camera.bottom = -150;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 620;
    keyLight.shadow.normalBias = 0.12;
    keyLight.shadow.bias = -0.0002;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight('#9cdef1', 0.65);
    fillLight.position.set(150, 90, -100);
    scene.add(fillLight);

    const [gltf, json] = await Promise.all([
      new GLTFLoader().loadAsync(MODEL_URL, progress => {
        if (progress.total > 0) status.querySelector('span:last-child').textContent = `载入建筑、道路与工艺设施 · ${Math.round(progress.loaded / progress.total * 100)}%`;
      }),
      fetch(MANIFEST_URL).then(response => {
        if (!response.ok) throw new Error(`厂区区域数据加载失败 (${response.status})`);
        return response.json();
      }),
    ]);
    if (disposed) return api;
    manifest = json;
    if (!Array.isArray(manifest.zones) || !manifest.zones.length) throw new Error('厂区模型缺少功能分区数据。');
    const zoneData = new Map((Array.isArray(zones) ? zones : Object.values(zones)).map(zone => [zone.id, zone]));
    for (const zone of manifest.zones) zoneMap.set(zone.id, { ...zone, ...zoneData.get(zone.id), center: zone.center, size: zone.size });
    model = gltf.scene;
    model.name = 'FactoryCampus';
    model.traverse(object => {
      if (!object.isMesh) return;
      pickables.push(object);
      const zoneId = zoneIdOf(object);
      object.castShadow = !object.userData.noShadow && layerOf(object) !== 'water';
      object.receiveShadow = true;
      const adapt = original => {
        const cacheKey = `${original.uuid}:${zoneId || '-'}`;
        if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);
        const material = original.clone();
        materialCache.set(cacheKey, material);
        if (material.isMeshStandardMaterial) {
          material.envMapIntensity = 0.45;
          if (zoneId) materialRecords.push({ zoneId, material, emissive: material.emissive.clone(), intensity: material.emissiveIntensity });
        }
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(adapt) : adapt(object.material);
    });
    scene.add(model);
    model.updateMatrixWorld(true);
    if (manifest.bounds?.min && manifest.bounds?.max) {
      modelBounds.set(new THREE.Vector3(...manifest.bounds.min), new THREE.Vector3(...manifest.bounds.max));
    } else modelBounds.setFromObject(model);
    modelBounds.getCenter(homeTarget);
    homeTarget.y = Math.min(homeTarget.y, 7);
    selectionOutline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#5fd6f2', transparent: true, opacity: 0.95, depthWrite: false }));
    selectionOutline.visible = false;
    selectionFloor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#5fd6f2', transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }));
    selectionFloor.rotation.x = -Math.PI / 2;
    selectionFloor.visible = false;
    scene.add(selectionOutline, selectionFloor);
    ready = true;
    buildLabels();
    installPointers();
    setMode(mode);
    setView('bird');
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    renderer.render(scene, camera);
    status.hidden = true;
    container.dataset.sceneReady = 'true';
    container.dataset.modelZones = String(zoneMap.size);
    onReady?.(api, manifest);
    requestRender();
    return api;
  } catch (error) {
    ready = false;
    container.dataset.sceneReady = 'false';
    container.dataset.sceneError = error.message;
    status.hidden = false;
    status.classList.add('has-error');
    status.innerHTML = '<span class="factory-scene-error-icon" aria-hidden="true">!</span><strong>厂区模型暂时无法显示</strong><span>请确认浏览器支持 WebGL，并重新加载。</span><button type="button">重新加载</button>';
    listen(status.querySelector('button'), 'click', () => window.location.reload());
    onError?.(error);
    console.error('Factory scene:', error);
    return api;
  }
}
