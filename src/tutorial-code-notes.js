import glbSample from '../docs/model-code/pump-room.binary-sample.json';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const p = text => `<p>${text}</p>`;
const heading = text => `<h4>${text}</h4>`;
const code = (file, language, text) => `<figure class="code-note-code"><figcaption><span>${escape(file)}</span><small>${escape(language)}</small></figcaption><pre tabindex="0" aria-label="${escape(file)}代码"><code>${text.split('\n').map(line => /^\s*(#|\/\/|<!--)/.test(line)?`<span class="code-note-comment">${escape(line)}</span>`:escape(line)).join('\n')}</code></pre></figure>`;
const table = (heads, rows) => `<div class="code-note-table" tabindex="0" role="region" aria-label="${escape(heads.join('、'))}对照表"><table><thead><tr>${heads.map(cell=>`<th scope="col">${escape(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const note = (id, target, title, body) => ({id,target,title,body});

// These are optional reading notes. They do not create chapters or narrator passages.
export const codeNotes = [
  note('python-reading','script-part-2','读懂 Python 的几种基本写法',
    p('下面用项目里的几行代码解释符号。代码中的名称用于引用具体对象；软件执行到这些语句时，才会创建或修改场景。')+
    code('blender/build_pump_room.py · 语句节选','Python',`# 引入 Blender 提供的 Python 接口模块
import bpy

# 调用接口：在场景中创建一个立方体
bpy.ops.mesh.primitive_cube_add(size=1, location=pos(p))

# 用变量 ob 记住刚创建的物体
ob = bpy.context.object

# 把 size 中的长宽高写入这个物体的尺寸属性
ob.dimensions = size`)+
    table(['写法','怎么理解'],[
      ['=','赋值：把右边的值写到左边。'],['ob.dimensions','点号表示访问对象里的属性；这里是物体的尺寸。'],
      ['bpy.ops.mesh…','沿着 Blender 的接口找到网格操作。'],['函数名(...)','括号表示调用函数，括号里的内容是参数。'],
      ["'泵组钢底座'",'引号包住的是文字。'],['(1.11, 2.18, .11)','把三个数放在一组；本例用来表达长宽高。'],
      ['def box(...):','定义一种可复用的操作方法；调用 box(...) 时才执行函数体。'],
    ])+p('这里的 <code>pos(p)</code> 是项目自定义的坐标转换函数。<code>p</code>、<code>size</code> 等值由外围函数传入；这些语句用于阅读功能对应，不是一份独立可运行的脚本。')),
  note('python-box','script-part-3','一块钢底座，是怎样用 Python 创建的？',
    p('先看项目里真的使用过的一行：创建钢底座，指定位置、长宽高、材质、所属零件和倒角。')+
    code('blender/build_pump_room.py · 创建钢底座','Python',`box('泵组钢底座', (x,y+.7,.355), (1.11,2.18,.11), 'dark', base_part, .02)`)+
    table(['参数','这次传入的值','作用'],[
      ['name',"'泵组钢底座'",'给对象命名。'],['p','(x, y+.7, .355)','以当前泵的坐标为依据，设置位置偏移。'],
      ['size','(1.11, 2.18, .11)','三个方向的尺寸；本脚本按米建模。'],['mat',"'dark'",'从材质表中取深色钢材质。'],
      ['parent','base_part','把物体归到基础零件下面。'],['bevel','.02','倒角宽度，让边缘不那么生硬。'],
    ])+heading('box() 是我们自己组合的一组 Blender 操作')+
    code('blender/build_pump_room.py · box()','Python',`def box(name, p, size, mat, parent, bevel=.02):
    # 1. 通过 Blender 接口实际创建立方体
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos(p))
    # 2. 取得刚创建的对象
    ob = bpy.context.object
    # 3. 设置长宽高
    ob.dimensions = size
    # 4. 应用缩放，方便后续倒角和导出
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # 5. 命名、附加材质、设置父节点、应用倒角
    return finish(ob, name, mat, parent, bevel)`)+
    p('<code>box()</code> 和 <code>finish()</code> 是本项目定义的函数；<code>bpy.ops.mesh.primitive_cube_add()</code> 来自 Blender 接口。我们把底层操作组织成工具函数，再用不同参数重复调用。')+
    p('<code>pos(p)</code> 把以房间角落为基准的图纸坐标移到以房间中心为参考的位置。底座、楼板、墙体都可以复用类似的创建方法。')),
  note('model-export','dashboard-part-1','保存场景、导出 GLB，代码分别做了什么？',
    code('blender/build_pump_room.py · 保存与导出','Python',`# 保存可以继续编辑的 Blender 工程
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/pump-room.blend'))

# 导出网页要用的模型资产
bpy.ops.export_scene.gltf(
    filepath=str(OUT/'pump-room.glb'),
    export_format='GLB',
    export_extras=True,      # 保留设备编号、部件名称等自定义属性
    export_cameras=False,   # 本项目由网页设置相机
    export_lights=False,    # 本项目由网页设置灯光
    export_animations=False,# 本项目交互动画由网页代码实现
    export_yup=True         # 由导出器转换到 glTF 的 Y 轴朝上约定
)`)+
    p('<code>ROOT</code>、<code>OUT</code> 是脚本前面定义的目录。保存 <code>.blend</code> 与导出 <code>.glb</code> 是两个动作：前者保留可编辑场景，后者交付网页需要的内容。')+
    p('我们写 Python 来创建物体；Blender 导出器根据已经存在的对象、几何和材质，生成 GLB 的结构与二进制数据。GLB 不保存“原来用了哪个 Python 循环”的制作过程。')+
    p('本次没有导出相机、灯光和动画，不代表 GLB 格式只能保存静态几何。自定义属性中的坐标也需要自行约定含义，不能认为所有数值都会自动完成轴向转换。')),
  note('glb-inside','dashboard-part-2','拆开这份 GLB：P-01、材质和顶点数据',
    p(`从项目的 <code>public/models/pump-room.glb</code> 直接读取：文件大小为 <strong>${glbSample.header.fileBytes.toLocaleString('en-US')} 字节</strong>。GLB 是二进制资产文件，内部的 JSON 描述结构，BIN 数据块保存大量几何数值。`)+
    table(['内容','数量','含义'],[
      ['nodes',glbSample.counts.nodes,'对象、分组和父子关系。'],['meshes',glbSample.counts.meshes,'具体的几何内容，供节点引用。'],
      ['materials',glbSample.counts.materials,'颜色、金属度、粗糙度等表面参数。'],['images',glbSample.counts.images,'这份泵房模型没有内嵌图片贴图。'],
      ['animations',glbSample.counts.animations,'没有导出的动画片段。'],['cameras',glbSample.counts.cameras,'没有导出的相机。'],
    ])+heading('真实的 P-01 节点')+
    code('pump-room.glb 内部 · nodes[74]','JSONC',`{
  // children 中的数字是 nodes 数组的下标，从 0 开始数
  "children": [29, 36, 41, 57, 73],
  "extras": {
    "kind": "pump",
    "deviceId": "P-01",                 // Python 附加的设备编号
    "cadOriginMM": [2400, 3300, 0],
    "axisHeight": 0.85
  },
  "name": "P-01"
}`)+
    p('<code>children</code> 中的 29 表示去找 <code>nodes[29]</code>，不是坐标，也不代表有29个孩子。<code>extras</code> 保存了我们在 Python 中附加的业务标记。')+
    code('P-01 的一条真实对象路径','结构',`nodes[74]  P-01
 └─ nodes[29]  P-01::base              设备基础部件
     └─ nodes[28]  P-01::base::base    基础零件分组
         └─ nodes[24]  …__bolt        紧固件网格节点
             └─ meshes[20]           引用的几何`)+
    heading('几何在哪里？沿着下标继续找')+
    code('pump-room.glb 内部 · meshes[20] 的 primitive','JSONC',`{
  "attributes": {
    "POSITION": 83,    // 去 accessors[83] 读取顶点位置
    "NORMAL": 84,      // 表面方向，供光照计算使用
    "TEXCOORD_0": 85   // 贴图坐标；存在坐标不等于用了图片贴图
  },
  "indices": 86,       // 顶点索引，描述哪些点组成三角形
  "material": 0        // 使用 materials[0]：镀锌紧固件
}`)+
    p('<code>accessor</code> 是数值的读取说明，<code>bufferView</code> 指明数值所在的字节区间。这个 POSITION accessor 有496组数，每组是 x、y、z 三个32位浮点数。')+
    code('从 BIN 真正解出的前三个顶点 · 保留六位小数','数据',JSON.stringify(glbSample.positionSample.firstValues.map(row=>row.map(n=>Number(n.toFixed(6)))),null,2))+
    code('从 BIN 解出的前三个三角形 · 每组三个顶点下标','数据',JSON.stringify(glbSample.firstTriangles,null,2))+
    p('例如 <code>[0, 4, 5]</code> 表示把第0、4、5号顶点连成三角形，并不是只使用上面展示的三个顶点。顶点还要结合当前节点与父节点的位置、旋转等变换，才能放到场景中。')+
    table(['容易混淆的两份 JSON','实际作用'],[
      ['GLB 内部的 JSON','描述节点、网格、材质和二进制数据位置。'],
      ['public/models/pump-room.json','项目额外输出的设备清单，供标签、定位和管道流向使用。'],
    ])),
  note('web-rendering','dashboard-part-4','HTML 怎样加载并渲染这份模型？',
    p('HTML 提供显示位置，JavaScript 创建三维场景并绘制。下面按阅读顺序摘出真实项目中的关键语句；外围变量和完整函数已省略。')+
    code('demo.html · 模型显示区域','HTML',`<!-- 这个 div 只提供位置；后续 JS 会在里面挂载三维画布 -->
<div id="modelMount" class="model-mount" hidden></div>

<!-- 开发版从这个入口启动大屏 -->
<script type="module" src="/src/dashboard.js"></script>`)+
    code('当前项目的启动关系','结构',`index.html
 → dashboard.js 挂载大屏逻辑
 → campus-integration.js 先显示厂区
 → 进入泵房时调用 pump-scene.js 的 mount()
 → 创建画布、加载 GLB、开始绘制`)+
    code('src/pump-scene.js · 画布、相机与操作','JavaScript',`// 创建三维场景与渲染器
scene = new THREE.Scene();
renderer = new THREE.WebGLRenderer({
  antialias: true, alpha: true, powerPreference: 'high-performance'
});
// domElement 是渲染器创建的 canvas，放进 HTML 中才有显示位置
container.append(renderer.domElement);
// 使用正交相机，并把鼠标操作交给 OrbitControls
camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 120);
camera.position.copy(homeTarget).add(homeOffset);
controls = new OrbitControls(camera, renderer.domElement);`)+
    p('同一段初始化代码还会设置环境反射、主光、轮廓光、阴影和色彩处理。这些配置影响画面观感；模型的几何可以保持不变。')+
    code('src/pump-scene.js · 加载并加入场景','JavaScript',`// 同时读取模型资产和项目的设备清单
const [gltf, metadataResponse] = await Promise.all([
  new GLTFLoader().loadAsync('./models/pump-room.glb'),
  fetch('./models/pump-room.json'),
]);
manifest = await metadataResponse.json();
// GLTFLoader 已将二进制转换成 Three.js 对象树
model = gltf.scene;
// 默认隐藏上部墙体；原 GLB 仍保留完整墙体
model.getObjectByName('UpperWalls').visible = false;
scene.add(model);`)+
    code('src/pump-scene.js · animate() 中的两个关键操作','JavaScript',`// 请求下一帧继续执行 animate
frame = requestAnimationFrame(animate);

// 中间还会更新相机控制、流向粒子、标签和交互状态
// 按当前相机观察场景，把结果绘制到 canvas
renderer.render(scene, camera);`)+
    p('浏览器拖动视角时，会更新相机并重新绘制。这里运行的是网页 JavaScript 与图形渲染，不需要重新执行 Python，也不需要浏览器打开 Blender。')),
  note('web-selection','dashboard-part-4','点击 P-01，为什么能更新设备卡片？',
    code('同一编号跨过的几个环节','结构',`Python: ob['deviceId'] = 'P-01'
  ↓ export_extras=True
GLB: extras.deviceId = 'P-01'
  ↓ GLTFLoader 解析
网页: object.userData.deviceId === 'P-01'
  ↓ 点击命中网格，从父节点查找所属设备
context.onSelect('P-01')
  ↓ dashboard.js 的 selectDevice()
更新详情卡片，并更新模型的选中效果`)+
    code('src/pump-scene.js · 找到点击物体所属的设备','JavaScript',`function metadata(object) {
  // 命中的可能是一个螺栓，所以沿父节点向上查找
  for (let node = object; node; node = node.parent) {
    if (node.userData.deviceId) return node.userData;
  }
  return null;
}

// select() 中，将编号交回大屏
context.onSelect(id);`)+
    p('点击命中的对象由 <code>Raycaster</code> 计算：它从鼠标对应的相机位置发出虚拟射线，找到碰到的表面。大屏收到编号后，更新选中状态、设备详情和模型高亮。')+
    table(['内容','由谁提供'],[
      ['物体形状、部件层级、设备编号','建模脚本写入，再由 GLB 保留。'],
      ['当前流量、温度、告警状态','dashboard-data.js 等网页数据与状态逻辑。'],
      ['点击后的卡片和高亮','网页交互代码按设备编号关联。'],
    ])+p('GLB 本身没有不断变化的传感器数据。模型身份、业务数据和网页代码配合，才形成可交互的大屏。')),
  note('standalone-html','dashboard-part-4','为什么一个独立 HTML 就能带走模型？',
    p('开发时，HTML、JS、CSS、GLB 分开保存。交付时，<code>scripts/build-standalone.mjs</code> 把 JavaScript（包含 Three.js）、样式和资产一起嵌入 HTML。')+
    code('独立大屏的打包与打开过程','结构',`打包时：GLB / JSON 原始字节 → Base64 文字 → 放进 HTML
打开时：Base64 文字 → 原始字节 → Blob → blob: 内存地址
                                          ↓
                                GLTFLoader 继续加载模型`)+
    code('scripts/build-standalone.mjs · 内嵌资产恢复逻辑节选','JavaScript',`// file 来自打包时嵌入的资产表，包含 base64 和文件类型
const binary = atob(file.base64);
const bytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) {
  bytes[i] = binary.charCodeAt(i);
}
// 恢复原始字节，为浏览器中的资产创建临时地址
window.__OFFLINE_ASSETS__[url] = URL.createObjectURL(
  new Blob([bytes], { type: file.type })
);`)+
    p('Base64 是二进制转文字的编码方式，方便把资产放进 HTML。它不会把 GLB 变成制作脚本。打包器会把原来的模型加载路径替换成这个资产表里的地址。')+
    p('所以独立版仍然要加载和渲染模型，只是所有资源已经随文件带走。此处解释的是<strong>运营大屏</strong>的模型打包；当前<strong>图文课件</strong>内嵌配图、文字和交互代码，没有载入整套三维资产。')),
  note('cad-loop','cad-part-1','图纸数据怎样进入四台泵的创建循环？',
    code('blender/build_pump_room.py · 循环节选','Python',`# cad['pumps'] 是读取本例 DXF 后得到的泵列表
for asset in cad['pumps']:
    # 每次取出一台泵的数据
    id = asset['id']
    # 将本图纸中的毫米数换成脚本使用的米
    x,y,_ = [v/1000 for v in asset['origin_mm']]
    z = asset['axis_z']/1000
    # 创建属于这台泵的父节点
    pump = group(id, 'pump', id)
    # 后续继续创建基础、泵壳、电机与管道等内容`)+
    p('本例列表有四项，循环执行四次。<code>asset</code> 每次代表一台泵；设备编号和位置变了，创建零件的方法可以复用。')+
    code('group() 的核心操作 · 以 P-01 为例','Python',`# name='P-01'，kind='pump'，device='P-01'
# None 表示先创建一个无可见几何的组织节点
ob = bpy.data.objects.new(name, None)
bpy.context.collection.objects.link(ob)
ob['kind'] = kind
if device:
    ob['deviceId'] = device`)+
    p('完整脚本的顺序是：读取本项目 DXF → 清空当前场景 → 准备材质和工具函数 → 创建房间、设备、管道 → 设置预览用相机灯光 → 保存和导出。读图方法针对这份演示文件编写，换图纸时需要根据实际内容调整。')+
    p('原建模脚本会清空当前 Blender 场景；阅读这些节选不需要执行脚本。')),
  note('project-files','cad-part-2','对照真实文件：想改效果，应该改哪里？',
    table(['文件','在项目里的作用','建议先看'],[
      ['blender/build_pump_room.py','创建泵房的 Python 脚本。','box()、创建泵组的循环、末尾保存与导出。'],
      ['public/models/pump-room.glb','网页使用的几何与材质资产。','P-01 节点、children、extras 与 mesh 引用。'],
      ['public/models/pump-room.json','额外的设备清单。','编号、定位点、标签锚点与管道路径。'],
      ['src/pump-scene.js','加载、照亮、显示模型，接入交互。','mount() 初始化，animate() 每帧绘制。'],
      ['index.html / src/dashboard.js','大屏结构、数据和模型连接入口。','modelMount、mountScene()、selectDevice()。'],
      ['scripts/build-standalone.mjs','把大屏和资产装进独立 HTML。','模型路径替换、Base64 和 Blob。'],
    ])+heading('从想要的变化，反查修改位置')+
    table(['想改变什么','主要修改位置','需要重新导出模型吗？'],[
      ['数量、外形、零件、布局','建模 Python 脚本。','通常需要，重新执行并导出。'],
      ['观察角度、灯光、阴影','pump-scene.js。','不需要。'],
      ['完整墙体或剖切显示','网页可见性逻辑。','不需要，现有模型已保留墙体。'],
      ['标题、卡片、页面布局','HTML、CSS 与 dashboard.js。','不需要。'],
      ['流量、温度、演示告警','网页数据与状态逻辑。','不需要。'],
      ['部件选择、零件拆解','模型层级与 pump-inspection.js。','模型缺少独立部件时需补建。'],
      ['发给别人的独立文件','完成修改后重新打包。','需要更新独立 HTML。'],
    ])+p('只换一个 GLB 路径，能解决读取新模型。要保留标签、点击详情和拆解，新模型的编号与层级、设备清单和网页逻辑还需要对应。')+
    p('第一次阅读可以沿着这条短路线：<code>box()</code> 创建底座 → <code>group()</code> 写入 P-01 → GLB 的 <code>nodes[74]</code> → <code>loadAsync()</code> → <code>scene.add()</code> → <code>renderer.render()</code> → <code>onSelect()</code>。')),
];

export function appendCodeNotes(root) {
  for (const item of codeNotes) {
    const target=root.querySelector(`#${item.target}`);
    if(!target)throw new Error(`找不到代码补充对应的小节：${item.target}`);
    target.insertAdjacentHTML('beforeend',`<details class="code-note" id="note-${item.id}"><summary><span class="code-note-kicker">代码补充</span><span>${escape(item.title)}</span><span class="code-note-sign" aria-hidden="true"></span></summary><div class="code-note-body">${item.body}</div></details>`);
  }
}
