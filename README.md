# GPT6 3D建模测评

范米花儿的网页课件与完整案例源码。先完成 CAD 泵房、图片厂区两个案例，再回看 AI、Blender、脚本和网页渲染之间的关系。

| 内容 | 在线入口 | 对应源码 |
| --- | --- | --- |
| 网页课件，含逐字稿与折叠代码笔记 | [阅读课件](https://fanmihua.github.io/gpt6-3d-modeling/) | `index.html`、`src/tutorial-*.js` |
| 可交互的厂区与泵房演示 | [效果预览](https://fanmihua.github.io/gpt6-3d-modeling/demo.html) | `demo.html`、`src/dashboard.js` |
| 空模型大屏模板 | [打开模板](https://fanmihua.github.io/gpt6-3d-modeling/template/) | `template/` |
| 完整项目 | 本仓库 → **Code → Download ZIP**，或 `git clone` | 网页、建模脚本、`.blend`、`.glb`、参考素材 |

## 本地查看与修改

安装 Node.js 22 或更新版本，在项目根目录执行：

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:4210/` 阅读课件，`/demo.html` 查看演示，`/template/` 打开空模型模板。

页面展示使用仓库中已经导出的 GLB，**浏览课件和运行网页不需要安装 Blender**。模型会从本地静态服务读取，无需 API Key，也没有后端服务。演示适合桌面浏览器，需要支持 WebGL。

```sh
npm test          # 检查模型结构、设备映射与演示告警逻辑
npm run build    # 三个页面统一构建到 dist/
npm run preview  # 预览生产构建，端口 4211
```

## 修改模型

只有重新执行建模脚本时，才需要安装 Blender。脚本使用 Blender 自带的 Python 和 `bpy` 接口，本项目的建模脚本不要求另外安装系统 Python 或 Blender MCP。

在项目根目录执行（Blender 已加入 PATH 时）：

```sh
blender --background --python blender/build_pump_room.py
blender --background --python blender/build_factory_campus.py
```

macOS 默认安装路径示例：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python blender/build_pump_room.py
```

`--background` 表示 Blender 在后台执行，不显示主窗口。脚本通过 `bpy` 创建场景、保存 `.blend`，并导出网页使用的 `.glb` 和设备/区域清单 `.json`。脚本会覆盖仓库内对应的模型输出；修改前可先提交一份 Git 记录。模型也可以直接在 Blender 中打开编辑。

重新导出模型或修改配图后，执行 `npm run optimize:assets` 更新网页压缩资源，再运行测试和构建。原始 GLB 保留供编辑；网页加载 `*-web.glb.gz`，浏览器解压后使用 Meshopt 解码。图片使用 WebP，课件配图按可见区域加载。压缩保留模型部件层级与交互数据。

- **泵房**：`reference/pump_room_demo.dxf` → `blender/build_pump_room.py` → `public/models/pump-room.glb`。
- **厂区**：`reference/factory-campus-source.png` 为布局参考；`blender/build_factory_campus.py` 中的参数和规则生成厂区。该脚本本身不读取图片做自动识别。
- **网页**：Three.js 读取 GLB，设置灯光、相机与显示状态；设备层级和零件信息用于下钻、爆炸拆解、透视与关联支路展示。

建模脚本在 Blender 5.2.1 LTS 环境生成现有资产。其他版本的接口或导出设置可能需要调整。

## 文件组织

```text
index.html                 课件主页
demo.html                  完整交互演示
src/                       页面、交互、样式、课件和逐字稿
public/models/             已导出的 GLB 与模型清单
public/assets/             大屏素材与建模纹理
public/tutorial/           课件使用的案例图片
blender/                   两个建模脚本与可编辑 .blend
reference/                 CAD 样例与厂区参考图
template/                  按组件拆分的空模型大屏
scripts/                   独立 HTML 导出与 GLB 查看脚本
docs/                      纹理来源与课件所需的模型数据摘录
tests/                     模型结构及业务映射验证
.github/workflows/         GitHub Pages 自动部署
```

空模型模板保留原大屏布局、下拉菜单、图表和模拟数据，移除三维模型与相关操作。HTML 分块位于 `template/src/components/`，样式位于 `template/src/styles/`。

## 导出单个 HTML

```sh
npm run export:all
```

生成 `exports/GPT6 3D建模测评.html`、`exports/绿源净水厂-三维运营演示.html` 和 `template/exports/dashboard-template.html`。图片、脚本和必要模型会内嵌，可独立打开；完整模型演示的文件较大。课件中的项目入口在离线文件中指向公开网站。

GitHub Pages 使用按需加载的静态资产版本，避免每次阅读课件都下载模型。构建产物不提交到仓库。

## 发布与迁移

仓库的 **Settings → Pages → Source** 选择 **GitHub Actions**。推送 `main` 后，工作流运行测试、构建并部署 `dist/`。

三个页面使用相对资源路径，可将 `dist/` 整体放到其他静态站点的子目录中。课件顶部入口配置在 `src/course-links.js`；迁移到自己的站点时可调整离线文件使用的公开地址。

## 案例与许可

页面里的业务数据、告警阈值和内部零件均用于教学演示。CAD 是演示图纸；厂区参考图由 AI 生成，用来模拟只有照片的输入场景，不对应真实厂区测绘结果。当前工厂和泵房也没有连接真实设备。

项目代码与自制案例素材采用 [MIT License](LICENSE)。第三方纹理来自 Poly Haven，按 CC0 使用，详见 [纹理来源](docs/texture-sources.md)。依赖的开源库按各自许可证使用，详见 [第三方说明](THIRD_PARTY_NOTICES.md)。作者头像及署名不代表对衍生项目的背书。
