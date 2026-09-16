import { courseOrder } from './tutorial-order.js';
import { explorer } from './tutorial-widgets.js';
import { relationshipDiagram, interfaceDiagram, translationDiagram, executionDiagram } from './tutorial-diagrams.js';

export function createCourse(image) {
  const pic=(file,caption)=>`<figure class="course-visual"><button type="button" data-image="${file}" aria-label="放大：${caption}"><img src="${image(file)}" alt="${caption}" loading="lazy" decoding="async"></button><figcaption>${caption}</figcaption></figure>`;
  const points=items=>`<div class="course-points">${items.map(([title,text])=>`<div><h4>${title}</h4><p>${text}</p></div>`).join('')}</div>`;
  const split=(visual,text)=>`<div class="course-split">${visual}<div>${text}</div></div>`;
  const chain=items=>`<ol class="course-chain">${items.map(([title,text])=>`<li><strong>${title}</strong><span>${text}</span></li>`).join('')}</ol>`;
  const code=(label,body)=>`<div class="course-code"><span>${label}</span><pre><code>${body}</code></pre></div>`;
  const block=(title,lead,body)=>`<div class="course-block"><h3>${title}</h3>${lead?`<p class="block-lead">${lead}</p>`:''}${body}</div>`;
  const controls=explorer('controls','脚本控制的内容',[
    {label:'形状与重复',html:split(pic('script-geometry.png','Blender 实际生成的教学泵'),points([['几何 · 物体的形状','点和面组成泵壳、底座和管道，决定轮廓与体积。'],['Blender 中','添加网格、编辑形状、复制物体。'],['脚本中','调用同样的建模功能，把底座、泵壳、电机组合成设备；用循环生成重复零件。']])+code('例如：添加一个立方体','bpy.ops.mesh.primitive_cube_add()'))},
    {label:'尺寸与位置',html:split(pic('bpy-repeat.png','独立教学示例 · 同一形状，按规则排列'),points([['Blender 中','在变换面板设置位置、旋转和尺寸。'],['脚本中','把大小和间距写成参数，计算每个物体的位置。']])+code('已有物体 block 的尺寸与位置','block.dimensions = (1.6, 0.9, 0.3)\nblock.location = (0, 0, 0.15)'))},
    {label:'材质',html:split(pic('script-material.png','同一套几何，设置颜色与金属质感'),points([['材质 · 表面的样子','颜色、光滑程度和金属感；表面图片可以作为贴图。'],['Blender 中','在材质属性与着色器中设置颜色、粗糙度、金属度。'],['脚本中','创建材质，连接所需节点，再指定给物体。']])+code('将已有材质 mat 加给物体 obj','obj.data.materials.append(mat)'))},
    {label:'名称与层级',html:split(`<div class="course-tree"><span>泵房</span><div><b>P-01</b><div>泵体</div><div><b>电机</b><div>机壳</div><div>转子与主轴</div></div></div></div>`,points([['Blender 中','在大纲视图中管理对象，设置名称与父子关系。'],['脚本中','给设备和零件编号，保留独立对象，方便网页逐层选择。']])+code('把已有零件归到电机对象下','part.parent = motor'))},
    {label:'相机与灯光',html:split(pic('script-light.png','改变主灯位置后的实际预览图'),points([['Blender 中','放置相机、移动灯光、调整强度。'],['脚本中','设置相机方向、投影方式和灯光参数，生成用于查看效果的图片。']]))},

  ]);
  const command=explorer('command','Blender 启动命令',[
    {label:'blender',html:`<div class="command-copy"><h4>启动本机的 Blender</h4><p>这是程序名称示意。实际执行时，Codex 需要找到已安装的 Blender 可执行文件。</p></div>`},
    {label:'--background',html:`<div class="command-copy"><h4>软件运行，但不显示主窗口</h4><p>Blender 仍会创建物体、设置属性、保存文件。图形界面没有出现，建模程序仍在工作。</p></div>`},
    {label:'--python',html:`<div class="command-copy"><h4>在 Blender 中执行 Python</h4><p>这个选项指定要运行的脚本；Blender 内部的 Python 环境能够调用 bpy。</p></div>`},
    {label:'build_pump_room.py',html:`<div class="command-copy"><h4>执行哪份指令文件</h4><p>脚本必须已经保存。本案例的完整脚本包含建模、保存场景和导出模型的步骤。</p></div>`},
  ]);
  const glb=explorer('asset','模型交接的内容',[
    {label:'几何与层级',html:split(pic('script-wireframe.png','模型的真实网格边线'),points([['几何保存形状','点、面和空间位置描述物体。'],['层级组织对象','设备、部件、零件各有名称与归属。']]))},
    {label:'材质与贴图',html:split(pic('script-material.png','同一模型的材质效果'),points([['材质','保存颜色、金属度、粗糙度等表面参数。'],['贴图','可以把表面图片打包在 GLB 中。本项目厂区有贴图，泵房使用材质参数。']]))},
    {label:'动画与交互',html:`${chain([['GLB 保留部件','模型有哪些对象'],['网页响应操作','选中了哪台设备'],['代码改变状态','拆解、透明、切换详情']])}<p class="inline-note">GLB 可以保存动画。本项目泵房没有内置动画，爆炸拆解由网页代码移动零件实现。</p>`},
  ]);
  const render=explorer('render','相机和光照的效果',[
    {label:'初始画面',html:split(pic('script-material.png','同一教学泵 · Blender 实际渲染图'),points([['模型','场景里有什么。'],['相机','从哪里看。'],['光照与材质','物体表面怎样显现。']]))},
    {label:'换相机',html:split(pic('script-camera.png','只改变相机方向'),points([['同一模型，不同视角','模型没有重建，相机变化会改变构图与遮挡。'],['网页中的旋转','鼠标操作更新相机，再渲染新的画面。']]))},
    {label:'换灯光',html:split(pic('script-light.png','恢复原相机，只改变主灯位置'),points([['同一几何，不同明暗','反光和阴影随灯的位置改变。'],['两个渲染环境','Blender 与网页的灯光、材质支持和色彩设置可能不同，需要分别设置。']]))},
  ]);
  // Demonstrate first, then explain the observed work using the same cases.
  const sections = [
    {id:'workflow',phase:'theory',nav:'AI、软件与网页',title:'回看两个案例：谁完成了哪一步？',lead:'刚才看到的脚本、Blender 模型和大屏结果，来自三方协作。先把各自负责的事情分清。',body:
      block('谁负责制作，谁负责展示？','Blender 是三维制作软件。我们用 Codex 这类 AI 工具组织制作，再把模型放进网页。',relationshipDiagram(image)),
      takeaway:'先记住三个角色：AI 组织制作，Blender 创建模型，网页展示模型并响应操作。'},
    {id:'methods',phase:'theory',nav:'AI 的两种操作方式',title:'为什么刚才主要使用脚本？',lead:'AI 可以操作屏幕上的菜单，也可以编写脚本。两个案例主要走了脚本这条路径。',body:
      `<div class="course-methods course-topic" data-topic="电脑控制与脚本"><article><div><small>操作可见界面</small><h3>电脑控制</h3></div>${chain([['观察屏幕','读取当前界面'],['点击与输入','操作菜单、填写数值'],['观察结果','再决定下一步']])}</article><article><div><small>把操作写进文件</small><h3>脚本</h3></div>${chain([['写下指令','例如创建、移动、复制'],['软件执行','按顺序或规则完成操作'],['得到模型','保存创建好的场景']])}</article></div>`+
      block('脚本，就是保存下来的一组程序指令','AI 可以把建模要求写成这样的文件。软件读取并执行后，场景里才会出现物体。',
        `<div class="instruction-strip"><div><span>人的要求</span><strong>四台泵并排放置</strong></div><span aria-hidden="true">→</span><div><span>脚本记录的操作 · 中文示意</span><strong>创建一台泵 → 复制 → 按间距摆放</strong></div></div>`)+
      block('回到水泵和厂区，脚本的优势在哪里？','水泵的零件、厂房的门窗、道路旁的树木，都有可以重复使用的规则。',
        `<div class="course-benefits">${points([['重复结构','同一套规则生成多台设备。'],['调整参数','参数是尺寸、数量这类可调整的值。改值后再次运行。'],['过程保留','制作方法留在文件里，可以复用。']])}</div>`),
      takeaway:'电脑控制操作界面，脚本调用软件功能。两种方式可以配合，本课主要演示脚本。'},
    {id:'script',phase:'theory',nav:'脚本怎样执行',title:'脚本怎样生成刚才的模型？',lead:'刚才生成的 .py 文件使用 Python，一种编程语言。Blender 内置执行环境，能把这些代码落实为建模操作。',body:
      block('软件通过接口，把功能开放给程序','接口（API）是程序使用软件功能的入口，规定调用方式与参数。bpy 是 Blender 提供给 Python 脚本的接口工具包。',
        interfaceDiagram()+`<p class="source-line">这里的 API 调用本机 Blender 的功能，无需网络服务。</p>`)+
      block('AI 把要求写成代码，Blender 执行代码','例如，想添加一个立方体：AI 选择对应的功能名称，把边长写成参数。',
        translationDiagram()+`<p class="source-line">执行前用 import bpy 引入 Blender 的接口模块；图中为创建结果示意。<a href="https://docs.blender.org/api/main/index.html" target="_blank" rel="noreferrer">Blender Python API</a></p>`)+
      block('脚本能控制什么？','许多界面里能完成的操作，都有对应的程序调用方式。',
        controls+`<p class="source-line">以上代码用于展示功能对应；一行代码未必只等于一次点击。</p>`)+
      block('泵为什么可以选中、下钻和拆解？','建模时保留独立部件与归属关系，展示时才能分别操作。',
        explorer('model-structure','泵的结构与拆解原理',[
          {label:'独立部件',html:split(`<div class="course-tree"><span>设备 P-02</span><div><b>电机</b><div>端盖与风扇罩</div><div>机壳与散热片</div><div>转子与主轴</div><div>定子与铜绕组</div></div></div>`,points([['创建时分开','零件各有几何、名称与父节点。'],['编号连接层级','从整台泵找到电机，再找到某个零件。']]))},
          {label:'爆炸拆解',html:split(pic('exploded.png','实际大屏截图 · P-02 电机爆炸拆解'),points([['先有零件','机壳、端盖、转子和定子已在模型中。'],['再改变位置','沿预设方向拉开，保留各自的形状。'],['本项目怎样做','建模脚本保存拆解偏移，展示代码按比例移动零件。']]))},
          {label:'单看零件',html:split(pic('rotor.png','实际大屏截图 · 转子与主轴'),points([['下钻','显示选中的零件，隐藏无关部分。'],['和放大不同','能独立操作，是因为模型里有这个独立对象。'],['内部结构','本例内部零件为示意补建，并非制造级还原。']]))},
        ]))+
      block('厂区怎样从一张图变成空间结构？','回看第二个案例：图片提供参考，AI 组织建模规则，Blender 执行这些规则。',
      explorer('photo-analysis','照片到模型的分析过程',[
        {label:'识别对象',html:split(`<figure class="course-visual"><div class="photo-regions"><img src="${image('factory-photo.png')}" alt="工厂照片中的建筑、水池、储罐与入口" loading="lazy"><span style="left:30%;top:43%">建筑</span><span style="left:72%;top:40%">水池</span><span style="left:44%;top:24%">储罐</span><span style="left:62%;top:73%">入口</span></div><figcaption>可见对象的识别示意</figcaption></figure>`,points([['找主要类别','建筑、水池、罐体、道路、植被。'],['结合你的要求','保留厂区，忽略远山、河流与天空。']]))},
        {label:'理解关系',html:split(pic('factory-photo.png','从图像观察前后、相邻与连通关系'),points([['前后与相邻','办公楼在前，水池在右后方，罐区在更后方。'],['道路与入口','把门卫、停车区和建筑之间的路线连起来。'],['比例与遮挡','近大远小影响观感，背面与内部需要假设。']]))},
        {label:'写成建模规则',html:`<div class="analysis-mapping"><div><span>照片中的对象</span><span>脚本采用的建模方式</span></div><div><strong>建筑</strong><p>楼体与屋顶的体块，再补门窗。</p></div><div><strong>储罐、水池</strong><p>圆柱、池壁、水面与栏杆。</p></div><div><strong>道路、树木</strong><p>道路路线与宽度，树干和树冠的组合。</p></div><div><strong>草地、路面</strong><p>大块几何表面，配合材质与贴图。</p></div></div><p class="source-line">用于说明本案例的工作方式，不代表可以观察到 AI 内部的全部推理过程。</p>`},
        {label:'生成效果',html:split(pic('factory-model.png','根据照片编写脚本生成的厂区模型'),points([['执行建模规则','Blender 根据脚本生成建筑、道路和厂内布局。'],['从平面参考到三维场景','模型有空间结构，之后可以换角度观察。'],['结果的性质','照片推演与演示建模，非实测扫描。']]))},
      ]))+
      block('草地和路面的细节，为什么交给贴图？','几何决定轮廓和体积，材质与贴图补充表面细节。',
        explorer('factory-surfaces','厂区的几何与表面',[
          {label:'几何与图片',html:`<div class="material-examples"><div class="texture-pair">${pic('grass-texture.jpg','厂区使用的草地颜色贴图')}${pic('road-texture.jpg','厂区使用的路面颜色贴图')}</div>${points([['需要体积','建筑、路缘、树干和树冠要建出形状。'],['表面细节','草地与路面的大块表面铺上图片，补充纹理。']])}</div>`},
          {label:'图片怎样贴上去',html:chain([['几何表面','草坪、道路、树干'],['UV 坐标','规定图片对应表面哪里'],['材质节点','连接颜色与凹凸信息'],['模型效果','受灯光与观察距离影响']])+points([['平铺尺度','同一张草地图重复使用；比例太大，草叶就会显得过大。'],['法线贴图','改变光照计算中的表面方向，表现细小凹凸；不会自动长出草叶几何。']])},
          {label:'脚本与软件对应',html:points([['Blender 中','创建材质，载入图片，连接着色节点，设置表面坐标。'],['脚本中','调用同一套数据与节点接口，把图片、材质和几何关联。'],['本项目','草地、沥青、树皮使用颜色与法线图片；树冠仍需要自己的几何。']])},
        ]))+
      block('谁启动它？为什么可以不显示窗口？','终端是输入文字命令的工具。Codex 可以通过终端启动 Blender，让它运行已保存的 Python 脚本（.py 文件）。',
        `<div class="command-route">${chain([['终端发出命令','启动 Blender，指定脚本'],['Blender 在后台运行','不显示主窗口，仍执行建模'],['保存结果','输出场景与模型文件']])}</div><div class="command-widget">${command}</div><p class="source-line">上面四段合起来是一条启动命令；实际执行需使用本机程序与脚本路径。<a href="https://developer.blender.org/docs/handbook/testing/python/" target="_blank" rel="noreferrer">Blender 官方示例</a></p>`)+
      block('现在，把 AI 的执行过程串起来','GPT 负责理解要求、生成代码；Codex 把这些能力与读写文件、运行程序的工具连接起来。',
        executionDiagram()+`<p class="inline-note">本案例先执行完整脚本，再根据日志和预览修改。一次执行可以包含许多建模操作。</p>`),
      takeaway:'AI 编写指令，终端启动程序，Blender 通过 Python 和 bpy 执行建模；没有主窗口也能工作。'},
    {id:'dashboard',phase:'theory',nav:'保存、导出与显示',title:'模型做好后，留下什么、怎样显示？',lead:'模型先保存为文件；网页读取文件，把三维内容绘制成屏幕上的画面，这一步叫渲染。',body:
      block('先分清会得到的三种文件','脚本保存制作方法，Blender 场景保存可编辑结果，GLB 是适合交给网页的三维文件格式。',
        `<div class="course-files"><article><code>.py</code><h4>制作脚本</h4><p>记录怎么建。修改指令，可以重新生成。</p></article><article><code>.blend</code><h4>Blender 场景</h4><p>在 Blender 中打开，查看和编辑物体、材质与场景。</p></article><article><code>.glb</code><h4>网页使用的模型</h4><p>把几何、材质和对象层级等信息交给网页。</p></article></div>`)+
      block('GLB 里能带走什么？','它保存三维内容；按钮、数据面板和点击后的业务行为，由网页实现。',glb)+
      block('渲染，就是把三维场景变成屏幕画面','场景把模型、相机和灯光组织在一起。相机决定从哪里看，灯光与材质影响表面效果；观察角度改变时，需要重新绘制。',render)+
      block('最后一步：把模型显示在现成模板中','Three.js 是网页处理三维场景的工具库。这里认识模型交付的最后一段即可。',
        chain([['加载模型','读取 GLB 中的形状与材质'],['安排视角','设置相机、灯光和位置'],['绘制画面','调用浏览器的图形能力显示模型']])+`<p class="source-line">界面布局和业务按钮沿用模板，页面开发不在本课主线中。<a href="https://threejs.org/manual/en/creating-a-scene.html" target="_blank" rel="noreferrer">Three.js 场景与渲染</a></p>`),
      takeaway:'到这里，完整路径就清楚了：AI 写脚本 → Blender 建模 → 导出 GLB → 网页加载并渲染。'},
    {id:'cad',phase:'practice',nav:'实操一 · CAD 泵房',title:'从空模型模板开始，做一个泵房',lead:'页面已经做好，中央模型区留空。给 AI 图纸和要求，直接开始制作模型。',body:
      `<div class="practice-start">${pic('empty-template.png','现有大屏模板 · 中央模型区留空')}${chain([['已有模板','保留页面与数据卡片'],['提供图纸','提出设备与部件要求'],['查看产物','脚本、Blender 场景和最终效果']])}</div>`+
      `<div class="practice-prompt"><span>案例要求</span><p>根据这份泵房图纸，用 Blender 脚本建立模型，保留设备编号与独立部件；保存场景，导出 GLB，接入现有大屏。</p></div>`+
      block('先看输入：图纸为什么有用？','CAD 是计算机辅助设计。本例提供一份 DXF 格式的图纸文件，里面有线条、图层、尺寸标注和设备编号。',
        explorer('inputs','建模依据',[
          {label:'有 CAD 图纸',html:split(pic('cad-plan.svg','本案例 DXF 图纸 · 原创演示，非施工图'),points([['提供具体依据','房间尺寸、设备位置、编号和管道关系。'],['AI 如何利用','通过文件读取工具提取信息，再写入建模脚本。'],['未画出的部分','外形细节与内部零件可能需要示意补建。']]))},
          {label:'也可以直接描述',html:split(`<div class="description-card"><small>文字要求示例</small><p>做一个泵房，四台蓝色离心泵并排，两侧连接总管，可以单独选中每台泵。</p></div>`,points([['没有图纸也能开始','文字可以指定对象、数量、外观和交互要求。'],['为什么增加图纸','让尺寸和布局有明确依据，减少 AI 需要补充设计的部分。']]))},
        ]))+
      block('边做边看：脚本、模型与最终效果','先观察 AI 写了什么、生成了什么，再试着查看模型的独立部件。原理在后半部分回讲。',
        explorer('cad-results','泵房案例的三个产物',[
          {label:'AI 写出的脚本',html:points([['可见文件 · build_pump_room.py','记录房间、泵、管道的创建规则，以及场景保存与模型导出操作。'],['这里关注什么','哪些要求被写进了脚本，改哪个参数能改变数量、尺寸或布局。']])},
          {label:'Blender 中的模型',html:split(pic('pump-blender.png','pump-room.blend · Blender 剖切预览（隐藏上部墙体）'),points([['可编辑文件 · pump-room.blend','打开后可以查看设备、零件、材质与对象层级。'],['后台创建也能打开','先通过脚本完成制作，之后仍可打开 Blender 查看和编辑。']]))},
          {label:'大屏里的模型',html:split(pic('dashboard.png','同一泵房接入大屏后的效果'),points([['交付文件 · pump-room.glb','网页加载导出的模型，安排视角和灯光。'],['模型与界面相连','点击 P-01，根据设备编号显示相应详情。']]))},
          {label:'拆解与零件',html:split(pic('exploded.png','泵房结果 · 电机部件可以拆开查看'),points([['先看结果','选择设备，进入电机，再查看内部零件。'],['暂时记住问题','这些部件为什么能分别移动？后面回到模型层级解释。'],['结果边界','内部结构为示意补建，不作为制造图。']]))},
        ])),
      takeaway:'图纸提供尺寸与布局依据，AI 生成脚本和模型。接下来换成图片，继续使用同一套模板。'},
    {id:'photo',phase:'practice',nav:'实操二 · 照片厂区',title:'换一张参考图，做出厂区模型',lead:'继续使用空模型的大屏模板。这次提供图片，观察 AI 从参考画面到三维场景的制作结果。',body:
      `<div class="practice-prompt"><span>案例要求</span><p>参考图片建立厂区模型，保留建筑、水池、储罐、道路和绿化，忽略远山、河流和天空。使用 Blender 制作，保存可编辑文件，并把模型放入模板。</p></div>`+
      block('从参考图到厂区结果','本例参考图由 GPT 生成，用来模拟只有现场照片的输入情形。',
        explorer('photo-result','厂区实操的输入与结果',[
          {label:'参考图片',html:split(pic('factory-photo.png','GPT 生成的虚拟厂区参考图'),points([['给 AI 什么','图片与要保留的对象范围。'],['观察什么','建筑、水池、道路、入口的布局。'],['哪些信息不确定','真实尺寸、背面与内部结构。']]))},
          {label:'生成的厂区',html:split(pic('factory-model.png','本项目根据参考图生成的厂区模型'),points([['整体看布局','建筑和道路形成完整厂区。'],['近看表面','草地、路面与树木有不同表现。'],['结果的边界','按图推演的演示模型，非实测还原。']]))},
        ])),takeaway:'两次实操用同一个模板，输入分别是图纸与图片。接下来回看：AI 做了什么，Blender 又实际执行了什么？'},
  ];
  return courseOrder.map(id=>sections.find(section=>section.id===id));
}
