// Semantic diagrams: labels and relationships remain selectable HTML/SVG text.
export function relationshipDiagram(image) {
  return `<div class="relationship-map"><svg class="relationship-edges" viewBox="0 0 900 460" preserveAspectRatio="none" aria-hidden="true"><path d="M377 122 228 313M523 122 672 313M281 362H619"/></svg><span class="relation-label label-build">组织建模</span><span class="relation-label label-page">开发页面</span><span class="relation-label label-asset">交付模型</span><div class="relation-node relation-ai"><span>本课使用 Codex</span><h3>AI 工具</h3><p>把要求落实为操作</p></div><div class="relation-node relation-blender"><span>实际执行建模</span><h3>Blender</h3><p>创建场景 · 保存与导出</p><small class="relation-running">后台运行 · 无主窗口</small></div><div class="relation-node relation-web"><span>展示环境</span><h3>网页</h3><p>显示模型，响应交互</p></div><figure class="relation-result"><img src="${image('script-material.png')}" alt="同一个作品中的三维泵模型"><figcaption>围绕同一个作品</figcaption></figure></div>
  <div class="background-execution" aria-label="本案例的后台执行过程">
    <p class="background-key"><strong>建模时，Blender 仍在运行</strong><span>后台运行：软件在执行，主窗口不显示。</span></p>
    <ol class="background-route">
      <li><strong>Codex 写脚本</strong><span>把操作指令保存成文件</span></li>
      <li><strong>终端启动 Blender</strong><span>用命令让软件运行脚本</span></li>
      <li><strong>Blender 建模并导出</strong><span>创建场景，保存 .blend / .glb</span></li>
      <li><strong>网页显示模型</strong><span>读取导出文件，绘制画面</span></li>
    </ol>
  </div>`;
}

export function interfaceDiagram() {
  return `<div class="interface-figure"><div class="interface-entry"><article><span class="entry-icon" aria-hidden="true">↖</span><div><h4>人用界面</h4><p>点菜单、填数值</p></div><b aria-hidden="true">→</b></article><article><span class="entry-icon code-icon" aria-hidden="true">{ }</span><div><h4>程序用接口</h4><p>调用功能、传入参数</p></div><b aria-hidden="true">→</b></article></div><div class="software-box"><div class="software-title"><strong>Blender</strong><span>同一个软件</span></div><div class="software-routes"><div class="software-port"><span>图形界面</span><b>菜单 / 属性面板</b></div><span class="port-arrow" aria-hidden="true">↘</span><div class="software-functions"><strong>建模功能</strong><div><span>创建物体</span><span>移动物体</span><span>设置材质</span></div></div><div class="software-port api-port"><span>Python API</span><b>bpy</b></div><span class="port-arrow lower-arrow" aria-hidden="true">↗</span></div></div></div><div class="interface-definition"><strong>接口 = 软件提供的调用规则</strong><span>有哪些功能</span><i>·</i><span>要传什么参数</span><i>·</i><span>执行后得到什么</span></div>`;
}

export function translationDiagram() {
  return `<div class="translation-visual"><div class="translation-request"><span>人的要求</span><p>添加一个边长为 2 的立方体</p></div><div class="translation-arrow"><span>AI 写成代码</span><b aria-hidden="true">↓</b></div><div class="translation-code"><div><span>调用名称</span><code>bpy.ops.mesh.primitive_cube_add</code></div><div><span>参数</span><code>(size=2)</code></div></div><div class="translation-execute"><div><span>Blender 内部</span><strong>Python 执行代码</strong><p>经 bpy 调用“创建立方体”</p></div><b aria-hidden="true">→</b><div class="cube-result"><svg viewBox="0 0 120 110" role="img" aria-label="场景中生成的立方体示意"><path d="M60 7 107 32 107 79 60 104 13 79 13 32Z" fill="#e8e8e2" stroke="#777" stroke-width="1.5"/><path d="M13 32 60 57 107 32 60 7Z" fill="#fafaf7" stroke="#777" stroke-width="1.5"/><path d="M60 57V104" stroke="#777" stroke-width="1.5"/></svg><span>场景里的物体</span></div></div></div>`;
}

export function executionDiagram() {
  return `<div class="execution-loop"><div class="execution-center"><strong>Codex</strong><span>结合 AI 与工具，根据结果继续执行</span></div><div class="execution-steps"><article><small>01</small><strong>读取资料</strong><span>获得建模依据</span></article><article><small>02</small><strong>编写脚本</strong><span>保存完整制作规则</span></article><article><small>03</small><strong>调用 Blender</strong><span>实际执行建模</span></article><article><small>04</small><strong>读取输出</strong><span>日志、模型与预览</span></article></div><div class="loop-feedback"><span>根据结果修改</span><span aria-hidden="true">↶</span></div></div>`;
}
