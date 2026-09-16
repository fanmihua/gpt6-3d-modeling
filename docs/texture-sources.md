# 厂区自然材质来源

本页记录 `blender/build_factory_campus.py`、`blender/factory-campus.blend` 和 `public/models/factory-campus.glb` 使用的第三方纹理。核验日期：2026-09-16。

## 许可与来源

全部第三方纹理来自 **Poly Haven 官方资产库**，采用 **CC0 1.0**。原始资产可免费复制、修改和用于商业项目；本项目不声称拥有原始摄影材质的作者权利。

- [Poly Haven 官方许可](https://polyhaven.com/license)
- [官方 FAQ](https://docs.polyhaven.com/en/faq)
- [官方摄影纹理技术标准](https://docs.polyhaven.com/en/technical-standards/textures)

| 用途 | 官方资产 | 原作者 | 本地文件 |
| --- | --- | --- | --- |
| 草坪 | [Leafy Grass](https://polyhaven.com/a/leafy_grass) | Charlotte Baglioni | `public/assets/textures/leafy_grass_diff_1k.jpg`、`leafy_grass_nor_gl_1k.jpg` |
| 柏油路面 | [Asphalt 02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel | `public/assets/textures/asphalt_02_diff_1k.jpg`、`asphalt_02_nor_gl_1k.jpg` |
| 树干与树枝 | [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) | Rob Tuytel | `public/assets/textures/bark_brown_02_diff_1k.jpg`、`bark_brown_02_nor_gl_1k.jpg` |

## 本地处理与使用

- 使用每套材质的 1024 × 1024 albedo/diffuse 与 OpenGL normal 两张图，共 6 张；图像以 JPEG 重压缩，保留原始尺寸和内容，不改变裁切。
- 下载地址、下载校验用原始 MD5、本地压缩文件 SHA-256 与字节数均保存在 `public/assets/textures/sources.json`。
- 纹理按真实尺度重复平铺：草地约 2 m、沥青约 3 m、树皮约 1 m。道路仍采用深灰柏油外观。
- 草地在标准 PBR 基色系数中乘以绿色色调 `(0.34, 0.74, 0.31)`，使地面接近参考照片中的维护草坪；这是一项视觉调色，不代表对原始地表现场的复现。
- 使用克制的 normal 强度：草坪 0.38、沥青 0.24、树皮 0.6；不启用位移，不增加地面网格密度。
- 材质图像已打包到 `.blend` 并嵌入 `.glb`，网页运行时无需访问 Poly Haven 或其 API。

## 树冠建模边界

树干使用摄影树皮材质。树冠为本项目生成的分叉、不规则叶团和小叶几何，采用不透明深绿层次，避免透明叶卡的排序问题。树木不是摄影扫描模型，也未对应特定树种。树木种植位置与原厂区版本一致。

材质仍按区域、材质和图层批处理；保留 `zoneId` 与 `layer`，与区域选中和植被图层控制兼容。
