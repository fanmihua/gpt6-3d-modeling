import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './device-model.css';

const STATUS = {
  running: { text: '运行中', color: '#40d7be' },
  stopped: { text: '停机', color: '#8ab8d8' },
  alarm: { text: '告警', color: '#ff8390' },
  offline: { text: '离线', color: '#8d9da9' },
  maintenance: { text: '维护', color: '#b59cdb' },
};

/** 单设备模型：与泵房使用同一 GLB，按需重绘，只有明确按钮进入结构查看。 */
export function createDeviceModel({ container, onInspect, sourceScene = null }) {
  if (!container) throw new Error('缺少设备模型容器');
  let renderer, scene, camera, controls, environment, resizeObserver, visibilityObserver;
  let source, selected, currentDevice, frame = 0, disposed = false, ready = false, visible = true;
  const pumps = new Map(), clonedMaterials = new Set(), listeners = [];
  const originals = [...container.children];
  const root = document.createElement('div');
  root.className = 'device-model';
  root.innerHTML = `<div class="device-model-viewport"></div>
    <div class="device-model-label" aria-live="polite"><i></i><span>三维设备</span></div>
    <p class="device-model-loading" role="status">正在载入模型</p>
    <div class="device-model-controls"><button type="button" class="device-model-reset" title="复位设备模型视角" aria-label="复位设备模型视角">↺</button><button type="button" class="device-model-inspect" disabled>放大查看 <span aria-hidden="true">↗</span></button></div>
    <div class="device-model-hint">拖动旋转 · 右键平移</div>`;
  container.classList.add('has-device-model');
  container.append(root);
  const viewport = root.querySelector('.device-model-viewport');
  const label = root.querySelector('.device-model-label');
  const notice = root.querySelector('.device-model-loading');
  const inspectButton = root.querySelector('.device-model-inspect');
  const resetButton = root.querySelector('.device-model-reset');

  function listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  }
  function render() {
    if (disposed || !ready || !visible || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!disposed && ready && visible && !document.hidden) renderer.render(scene, camera);
    });
  }
  function fit(reset = false) {
    if (!camera || !selected) return;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    if (reset) {
      controls.target.set(0, 0, 0);
      camera.position.set(4.4, 3.4, 5.5);
      camera.zoom = 1;
      controls.update();
    }
    // 用可见几何的实际投影居中，避免包围盒空角把模型缩小并推向下方。
    const { minX, maxX, minY, maxY } = selected.userData.previewProjection;
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const aspect = width / height;
    const half = Math.max((maxY - minY) / (2 * .8), (maxX - minX) / (2 * aspect * .93), .6);
    camera.left = centerX - half * aspect; camera.right = centerX + half * aspect;
    camera.top = centerY + half; camera.bottom = centerY - half;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    render();
  }
  function clonePump(original) {
    const pump = original.clone(true);
    pump.visible = true;
    pump.traverse(node => {
      node.visible = !node.userData.internal;
      if (!node.isMesh) return;
      node.material = (Array.isArray(node.material) ? node.material : [node.material]).map(material => {
        const copy = material.clone();
        // 可接受主场景传入的原始资产，独立材质避免设备状态与透视互相污染。
        const baseColor = node.userData.baseColor;
        if (typeof baseColor === 'number') copy.color.setHex(baseColor);
        else if (baseColor) copy.color.copy(baseColor);
        copy.transparent = false; copy.opacity = 1; copy.depthWrite = true;
        copy.emissive?.set('#000000');
        clonedMaterials.add(copy);
        return copy;
      });
      if (node.material.length === 1) node.material = node.material[0];
    });
    pump.updateMatrixWorld(true);
    const box = new THREE.Box3();
    pump.traverseVisible(node => {
      if (!node.isMesh) return;
      node.geometry.computeBoundingBox();
      box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    });
    const center = box.getCenter(new THREE.Vector3());
    pump.position.sub(center);
    pump.updateMatrixWorld(true);
    const fitCamera = new THREE.PerspectiveCamera();
    fitCamera.position.set(4.4, 3.4, 5.5); fitCamera.lookAt(0, 0, 0); fitCamera.updateMatrixWorld();
    const projection = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    const point = new THREE.Vector3();
    pump.traverseVisible(node => {
      if (!node.isMesh) return;
      const vertices = node.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld).applyMatrix4(fitCamera.matrixWorldInverse);
        projection.minX = Math.min(projection.minX, point.x); projection.maxX = Math.max(projection.maxX, point.x);
        projection.minY = Math.min(projection.minY, point.y); projection.maxY = Math.max(projection.maxY, point.y);
      }
    });
    pump.userData.previewProjection = projection;
    return pump;
  }
  function updateDevice(device) {
    if (!device || disposed) return;
    const changed = currentDevice?.id !== device.id;
    currentDevice = { ...device };
    const status = STATUS[device.status] || STATUS.offline;
    label.style.setProperty('--model-status', status.color);
    label.querySelector('span').textContent = `${device.id} · ${status.text}`;
    root.dataset.deviceId = device.id;
    root.dataset.deviceStatus = device.status;
    inspectButton.setAttribute('aria-label', `放大查看${device.name || device.id}的部件结构`);
    if (!source || !camera) return;
    if (!pumps.has(device.id)) {
      let original;
      source.traverse(node => { if (node.userData.kind === 'pump' && node.userData.deviceId === device.id) original = node; });
      if (!original) return;
      pumps.set(device.id, clonePump(original));
    }
    const pump = pumps.get(device.id);
    if (selected !== pump) {
      if (selected) scene.remove(selected);
      selected = pump;
      scene.add(selected);
    }
    // 告警留在状态标记；单个遥测异常不能确诊内部零件损坏。
    if (changed || !ready) fit(true);
    inspectButton.disabled = false;
    render();
  }
  function releaseGraphics() {
    cancelAnimationFrame(frame); frame = 0;
    resizeObserver?.disconnect(); visibilityObserver?.disconnect(); controls?.dispose();
    clonedMaterials.forEach(material => material.dispose());
    // 外部传入的资产由调用方管理，独立加载的资产在此释放。
    if (source && !sourceScene) {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      source.traverse(node => {
        if (node.geometry) geometries.add(node.geometry);
        (Array.isArray(node.material) ? node.material : [node.material]).filter(Boolean).forEach(material => materials.add(material));
      });
      materials.forEach(material => {
        Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
        material.dispose();
      });
      geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose());
    }
    environment?.dispose(); renderer?.dispose(); renderer?.domElement.remove();
    pumps.clear(); selected = null; source = null;
  }
  function dispose() {
    disposed = true; ready = false;
    releaseGraphics(); listeners.forEach(remove => remove());
    root.remove(); container.classList.remove('has-device-model', 'device-model-ready');
    originals.forEach(node => { node.hidden = false; });
  }
  listen(inspectButton, 'click', () => { if (currentDevice) onInspect?.(currentDevice.id); });
  listen(resetButton, 'click', () => fit(true));
  listen(document, 'visibilitychange', render);

  const loading = (async () => {
    try {
      scene = new THREE.Scene();
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', '水泵三维模型，拖动旋转、滚轮缩放、Shift拖动或右键平移，方向键平移');
      renderer.domElement.title = '左键拖动旋转 · 滚轮缩放 · Shift + 拖动 / 右键拖动平移 · 方向键平移';
      viewport.append(renderer.domElement);
      camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .05, 60);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false; controls.enablePan = true; controls.screenSpacePanning = true;
      controls.minZoom = .6; controls.maxZoom = 3.6; controls.zoomSpeed = .7; controls.rotateSpeed = .75;
      controls.listenToKeyEvents(renderer.domElement);
      controls.addEventListener('change', render);
      listen(renderer.domElement, 'pointerdown', () => renderer.domElement.focus({ preventScroll: true }));
      listen(renderer.domElement, 'keydown', event => {
        if (event.key.toLowerCase() === 'r') { event.preventDefault(); fit(true); }
      });
      listen(renderer.domElement, 'webglcontextlost', event => {
        event.preventDefault(); ready = false;
        root.dataset.modelReady = 'false';
        root.classList.add('is-fallback');
        container.classList.remove('device-model-ready');
        originals.forEach(node => { node.hidden = false; });
        notice.hidden = false; notice.textContent = '模型显示已中断';
      });
      const generator = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
      environment = generator.fromScene(room, .06);
      room.dispose(); generator.dispose();
      scene.environment = environment.texture; scene.environmentIntensity = .7;
      scene.add(new THREE.HemisphereLight('#c6eaff', '#21394c', 1));
      const key = new THREE.DirectionalLight('#e9f8ff', 3); key.position.set(4, 7, 5); scene.add(key);
      const rim = new THREE.DirectionalLight('#66bfff', 2); rim.position.set(-4, 3, -5); scene.add(rim);
      source = sourceScene || (await new GLTFLoader().loadAsync('./models/pump-room.glb')).scene;
      if (disposed) { releaseGraphics(); return false; }
      updateDevice(currentDevice || { id: 'P-01', name: '1号水泵', status: 'running' });
      if (!selected) throw new Error('模型中未找到设备');
      ready = true;
      root.dataset.modelReady = 'true';
      notice.hidden = true;
      originals.forEach(node => { node.hidden = true; });
      container.classList.add('device-model-ready');
      resizeObserver = new ResizeObserver(() => fit()); resizeObserver.observe(viewport);
      visibilityObserver = new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) render();
      });
      visibilityObserver.observe(container);
      render();
      return true;
    } catch (error) {
      ready = false;
      releaseGraphics();
      if (disposed) return false;
      root.classList.add('is-fallback');
      notice.textContent = '三维暂不可用';
      notice.title = error.message;
      inspectButton.disabled = !currentDevice;
      return false;
    }
  })();
  return {
    ready: loading, updateDevice, dispose,
    inspect() {
      let meshCount = 0, internalVisible = 0;
      selected?.traverseVisible(node => {
        if (node.isMesh) meshCount++;
        if (node.userData.internal) internalVisible++;
      });
      return {
        ready, deviceId: currentDevice?.id || null, status: currentDevice?.status || null,
        meshCount, internalVisible, camera: camera?.position.toArray(), target: controls?.target.toArray(),
        zoom: camera?.zoom, canvas: renderer ? [renderer.domElement.width, renderer.domElement.height] : null,
      };
    },
  };
}
