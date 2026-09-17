import { courseOrder } from './tutorial-order.js';
import { explorer } from './tutorial-widgets.js';
import { relationshipDiagram, interfaceDiagram, translationDiagram, executionDiagram } from './tutorial-diagrams.js';

export function createPreparation(image, templateUrl) {
  return `<div id="template" class="template-preparation"><div class="preview-heading"><h2>大屏模板</h2><a class="module-link" href="${templateUrl}" target="_blank" rel="noopener">打开大屏模板 ↗</a></div><div class="practice-start">
    <figure class="course-visual"><button type="button" data-image="empty-template.png" aria-label="放大大屏模板"><img src="${image('empty-template.png')}" alt="中央模型区留空的大屏模板" loading="lazy" decoding="async"></button></figure>
  </div></div>
  <section id="warmup" aria-labelledby="title-warmup"><div class="section-heading"><div><h2 id="title-warmup">只用一句话建模</h2><p class="section-lead">不提供图纸或图片，先看口述需求能生成什么。</p></div></div>
    <div class="description-card"><small>口述需求</small><p>做一个泵房，四台蓝色离心泵并排放置，两侧连接总管。</p></div>
  </section>
    <div class="practice-scenarios"><article><h3>有 CAD 图纸</h3><p>尺寸与布局有依据，适合具体设备与细节还原。</p></article><article><h3>只有现场图片</h3><p>按外观与布局推演，适合大屏中的场景展示。</p></article></div>`;
}

export function createCourse(image) {
  const pic=(file,caption,showCaption=true)=>`<figure class="course-visual"><button type="button" data-image="${file}" aria-label="放大：${caption}"><img src="${image(file)}" alt="${caption}" loading="lazy" decoding="async"></button>${showCaption?`<figcaption>${caption}</figcaption>`:''}</figure>`;
  const points=items=>`<div class="course-points">${items.map(([title,text])=>`<div><h4>${title}</h4>${text?`<p>${text}</p>`:''}</div>`).join('')}</div>`;
  const split=(visual,text)=>`<div class="course-split">${visual}<div>${text}</div></div>`;
  const chain=items=>`<ol class="course-chain">${items.map(([title,text])=>`<li><strong>${title}</strong><span>${text}</span></li>`).join('')}</ol>`;
  const code=(label,body)=>`<div class="course-code"><span>${label}</span><pre><code>${body}</code></pre></div>`;
  const block=(title,lead,body)=>`<div class="course-block"><h3>${title}</h3>${lead?`<p class="block-lead">${lead}</p>`:''}${body}</div>`;
  const controls=explorer('controls','脚本控制的内容',[
    {label:'形状与重复',html:split(pic('script-geometry.png','Blender 实际生成的教学泵'),points([['几何','由点和面组成的形状。'],['Blender 中','添加网格、编辑形状、复制物体。'],['脚本中','创建并组合形状，循环生成重复零件。']])+code('例如：添加一个立方体','bpy.ops.mesh.primitive_cube_add()'))},
    {label:'尺寸与位置',html:split(pic('bpy-repeat.png','教学示例 · 重复排列'),points([['Blender 中','在变换面板设置位置、旋转和尺寸。'],['脚本中','把大小和间距写成参数，计算每个物体的位置。']])+code('已有物体 block 的尺寸与位置','block.dimensions = (1.6, 0.9, 0.3)\nblock.location = (0, 0, 0.15)'))},
    {label:'材质',html:split(pic('script-material.png','颜色与金属质感'),points([['材质','表面的颜色、光泽与质感。'],['Blender 中','在材质属性与着色器中设置颜色、粗糙度、金属度。'],['脚本中','创建材质，连接所需节点，再指定给物体。']])+code('将已有材质 mat 加给物体 obj','obj.data.materials.append(mat)'))},
    {label:'名称与层级',html:split(`<div class="course-tree"><span>泵房</span><div><b>P-01</b><div>泵体</div><div><b>电机</b><div>机壳</div><div>转子与主轴</div></div></div></div>`,points([['Blender 中','在大纲视图中管理对象，设置名称与父子关系。'],['脚本中','给设备和零件编号，保留独立对象，方便网页逐层选择。']])+code('把已有零件归到电机对象下','part.parent = motor'))},
    {label:'相机与灯光',html:split(pic('script-light.png','改变主灯位置后的实际预览图'),points([['Blender 中','放置相机、移动灯光、调整强度。'],['脚本中','设置相机方向、投影方式和灯光参数，生成用于查看效果的图片。']]))},

  ]);
  const command=explorer('command','Blender 启动命令',[
    {label:'blender',html:`<div class="command-copy"><h4>启动本机的 Blender</h4><p>实际运行需指向已安装的 Blender 程序。</p></div>`},
    {label:'--background',html:`<div class="command-copy"><h4>后台运行，不显示主窗口</h4></div>`},
    {label:'--python',html:`<div class="command-copy"><h4>用 Python 执行脚本</h4></div>`},
    {label:'build_pump_room.py',html:`<div class="command-copy"><h4>指定脚本文件</h4></div>`},
  ]);
  const glb=explorer('asset','模型交接的内容',[
    {label:'几何与层级',html:split(pic('script-wireframe.png','模型的真实网格边线'),points([['几何数据','顶点、面与空间位置。'],['对象层级','设备 → 部件 → 零件。']]))},
    {label:'材质与贴图',html:split(pic('script-material.png','材质效果'),points([['材质','保存颜色、金属度、粗糙度等表面参数。'],['贴图','可以把表面图片打包在 GLB 中。本项目厂区有贴图，泵房使用材质参数。']]))},
    {label:'动画与交互',html:`${chain([['GLB 保留部件','模型有哪些对象'],['网页响应操作','选中了哪台设备'],['代码改变状态','拆解、透明、切换详情']])}<p class="inline-note">GLB 可以保存动画。本项目泵房没有内置动画，爆炸拆解由网页代码移动零件实现。</p>`},
  ]);
  const render=explorer('render','相机和光照的效果',[
    {label:'初始画面',html:split(pic('script-material.png','Blender 渲染预览'),points([['模型','场景里有什么。'],['相机','从哪里看。'],['光照与材质','物体表面怎样显现。']]))},
    {label:'换相机',html:split(pic('script-camera.png','只改变相机方向'),points([['视角改变','构图与遮挡随之变化。'],['网页中的旋转','鼠标操作更新相机，再渲染新的画面。']]))},
    {label:'换灯光',html:split(pic('script-light.png','恢复原相机，只改变主灯位置'),points([['灯光改变','反光与阴影随之变化。'],['两个渲染环境','Blender 与网页的灯光、材质支持和色彩设置可能不同，需要分别设置。']]))},
  ]);
  // Demonstrate first, then explain the observed work using the same cases.
  const sections = [
    {id:'workflow',phase:'theory',nav:'AI、软件与网页',title:'AI、Blender 与网页的分工',lead:'',body:
      `<div class="course-block" data-topic="三个角色，一个作品">${relationshipDiagram(image)}</div>`,
      takeaway:''},
    {id:'methods',phase:'theory',nav:'AI 的两种操作方式',title:'界面操作与脚本调用',lead:'',body:
      `<div class="course-methods course-topic" data-topic="电脑控制与脚本"><article><div><small>操作可见界面</small><h3>电脑控制</h3></div>${chain([['找到控件','观察界面，定位按钮'],['点击与输入','逐项完成操作'],['确认结果','再观察，继续下一步']])}</article><article><div><small>把操作写进文件</small><h3>脚本</h3></div>${chain([['写下规则','创建、排列、设置材质'],['调用功能','直接执行，批量生成'],['查看结果','按需要修改脚本']])}</article></div>`+
      block('把操作写成脚本','脚本是一组程序指令，由软件执行。',
        `<div class="instruction-strip"><div><span>人的要求</span><strong>四台泵并排放置</strong></div><span aria-hidden="true">→</span><div><span>脚本记录的操作 · 中文示意</span><strong>创建一台泵 → 复制 → 按间距摆放</strong></div></div>`)+
      block('为什么优先用脚本','',
        `<div class="course-benefits">${points([['减少界面操作','省去反复定位、点击与确认。'],['批量执行','重复结构用循环一次生成。'],['统一修改','调整尺寸与数量后重新运行。']])}</div>`),
      takeaway:''},
    {id:'script',phase:'theory',nav:'脚本怎样执行',title:'脚本如何驱动 Blender',lead:'Blender 内置 Python 环境，负责执行 .py 建模脚本。',body:
      block('通过接口调用建模功能','API 是程序调用软件功能的入口。Blender 的 Python 接口叫 bpy。',
        interfaceDiagram()+``)+
      block('从一句要求到一个物体','',
        translationDiagram()+`<p class="source-line">执行前用 import bpy 引入 Blender 的接口模块；图中为创建结果示意。<a href="https://docs.blender.org/api/main/index.html" target="_blank" rel="noreferrer">Blender Python API</a></p>`)+
      block('脚本能控制什么？','',
        controls)+
      block('AI 怎样看图建模','',
      explorer('photo-analysis','照片到模型的分析过程',[
        {label:'识别对象',html:split(`<figure class="course-visual"><div class="photo-regions"><img src="${image('factory-photo.png')}" alt="工厂照片中的建筑、水池、储罐与入口" loading="lazy"><span style="left:30%;top:43%">建筑</span><span style="left:72%;top:40%">水池</span><span style="left:44%;top:24%">储罐</span><span style="left:62%;top:73%">入口</span></div><figcaption>可见对象的识别示意</figcaption></figure>`,points([['结合你的要求','保留厂区，忽略远山、河流与天空。']]))},
        {label:'理解关系',html:split(pic('factory-photo.png','从图像观察前后、相邻与连通关系'),points([['前后与相邻','办公楼在前，水池在右后方，罐区在更后方。'],['道路与入口','把门卫、停车区和建筑之间的路线连起来。'],['比例与遮挡','近大远小影响观感，背面与内部需要假设。']]))},
        {label:'写成建模规则',html:`<div class="analysis-mapping"><div><span>照片中的对象</span><span>脚本采用的建模方式</span></div><div><strong>建筑</strong><p>楼体与屋顶的体块，再补门窗。</p></div><div><strong>储罐、水池</strong><p>圆柱、池壁、水面与栏杆。</p></div><div><strong>道路、树木</strong><p>道路路线与宽度，树干和树冠的组合。</p></div><div><strong>草地、路面</strong><p>大块几何表面，配合材质与贴图。</p></div></div><p class="source-line">用于说明本案例的工作方式，不代表可以观察到 AI 内部的全部推理过程。</p>`},
        {label:'生成效果',html:split(pic('factory-model.png','厂区模型 · 图片推演'),points([['从平面参考到三维场景','模型有空间结构，之后可以换角度观察。'],['结果的性质','照片推演与演示建模，非实测扫描。']]))},
      ]))+
      block('用贴图补充表面细节','模型完成后，再为草地、路面和树皮补充纹理。',
        explorer('factory-surfaces','厂区的几何与表面',[
          {label:'几何与图片',html:`<div class="material-examples"><div class="texture-pair">${pic('grass-texture.jpg','厂区使用的草地颜色贴图')}${pic('road-texture.jpg','厂区使用的路面颜色贴图')}</div>${points([['需要体积','建筑、路缘、树干和树冠要建出形状。'],['表面细节','草地与路面的大块表面铺上图片，补充纹理。']])}</div>`},
          {label:'图片怎样贴上去',html:chain([['几何表面','草坪、道路、树干'],['UV 坐标','规定图片对应表面哪里'],['材质节点','连接颜色与凹凸信息'],['模型效果','受灯光与观察距离影响']])+points([['平铺尺度','同一张草地图重复使用；比例太大，草叶就会显得过大。'],['法线贴图','改变光照计算中的表面方向，表现细小凹凸；不会自动长出草叶几何。']])},
          {label:'脚本与软件对应',html:points([['Blender 中','创建材质，载入图片，连接着色节点，设置表面坐标。'],['脚本中','调用同一套数据与节点接口，把图片、材质和几何关联。'],['本项目','草地、沥青、树皮使用颜色与法线图片；树冠仍需要自己的几何。']])},
        ]))+
      block('后台执行，软件仍在运行','终端接收文字命令，启动 Blender 并运行脚本。',
        `<div class="command-route">${chain([['终端发出命令','启动 Blender，指定脚本'],['Blender 在后台运行','不显示主窗口，仍执行建模'],['保存结果','输出场景与模型文件']])}</div><div class="command-widget">${command}</div><p class="source-line"><a href="https://developer.blender.org/docs/handbook/testing/python/" target="_blank" rel="noreferrer">Blender 官方示例</a></p>`)+
      block('生成、执行、查看、修改','Codex 用 AI 编写代码，通过工具读写文件、运行程序。',
        executionDiagram()),
      takeaway:''},
    {id:'dashboard',phase:'theory',nav:'保存、导出与显示',title:'模型如何进入网页',lead:'',body:
      block('三种文件，三种用途','',
        `<div class="course-files"><article><code>.py</code><h4>制作脚本</h4><p>保存制作指令。</p></article><article><code>.blend</code><h4>Blender 场景</h4><p>保存可编辑场景。</p></article><article><code>.glb</code><h4>网页使用的模型</h4><p>交付三维资产。</p></article></div>`)+
      block('GLB 保存的三维内容','',glb)+
      block('相机与灯光决定画面','',render)+
      block('加载模型，显示到网页','Three.js 负责网页中的三维加载与显示。',
        chain([['加载模型','读取 GLB 中的形状与材质'],['安排视角','设置相机、灯光和位置'],['绘制画面','调用浏览器的图形能力显示模型']])+`<p class="source-line"><a href="https://threejs.org/manual/en/creating-a-scene.html" target="_blank" rel="noreferrer">Three.js 场景与渲染</a></p>`),
      takeaway:''},
    {id:'cad',phase:'practice',nav:'实操一 · CAD 泵房',title:'从 CAD 到泵房模型',lead:'',body:
      block('图纸提供建模依据','',
        split(pic('cad-plan.svg','本案例 DXF 图纸 · 原创演示，非施工图'),points([['DXF 图纸','尺寸、位置、编号与管道关系。'],['AI 如何利用','提取图纸信息，写入脚本。'],['未画出的细节','按演示需要补建。']]))),
      takeaway:''},
    {id:'photo',phase:'practice',nav:'实操二 · 照片厂区',title:'从图片到厂区模型',lead:'',body:
      block('参考图与生成结果','',
        explorer('photo-result','厂区实操的输入与结果',[
          {label:'参考图片',html:split(pic('factory-photo.png','GPT 生成的虚拟厂区参考图'),points([['哪些信息不确定','真实尺寸、背面与内部结构。']]))},
          {label:'生成的厂区',html:split(pic('factory-model.png','本项目根据参考图生成的厂区模型'),points([['结果的边界','按图推演的演示模型，非实测还原。']]))},
        ])),takeaway:''},
  ];
  return courseOrder.map(id=>sections.find(section=>section.id===id));
}
