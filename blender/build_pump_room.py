"""用 Blender 后台执行：读取本项目 DXF，生成可编辑场景与网页 GLB。

尺寸与设备编号来自 CAD；泵组外观与内部叶轮、电机转子等为交互演示细化。
内部结构按通用离心泵构造补建，不代表某个厂家的工程装配或检修指导。
不执行 DXF 中的文本。仅支持本图使用的 ASCII DXF 实体与 MIHUA_DEMO 数据。
"""
# 【阅读路线】先看 box() 怎样创建一个物体，再看 for asset in cad['pumps']
# 怎样反复调用这些函数，最后看文件末尾的 save_as_mainfile / export_scene.gltf。
# 逐段说明见 docs/model-code/从脚本到大屏-代码导读.md。
# bpy 是 Blender 提供的 Python 模块；本脚本由 Blender 内置 Python 执行。
# import 只把工具引入；真正创建物体的是后面的函数调用。
import bpy
import json
import math
import hashlib
from pathlib import Path
from mathutils import Vector
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'reference/pump_room_demo.dxf'
OUT = ROOT / 'public/models'
OUT.mkdir(parents=True, exist_ok=True)


def read_cad():
    # 输入阶段：把这份特定 DXF 的文字与图元读成 Python 字典/列表。
    # 返回值 cad 里是数据，如尺寸、编号、坐标；读取文件本身还没有创建模型。
    lines = SOURCE.read_text(encoding='utf-8').splitlines()
    pairs = [(int(lines[i].strip()), lines[i+1].strip()) for i in range(0, len(lines)-1, 2)]
    entities, current, section = [], [], None
    for i, (code, value) in enumerate(pairs):
        if code == 0 and value == 'SECTION':
            section = pairs[i+1][1]
            current = []
            continue
        if code == 0 and value == 'ENDSEC':
            if section == 'ENTITIES' and current:
                entities.append(current)
            section, current = None, []
            continue
        if section != 'ENTITIES':
            continue
        if code == 0:
            if current:
                entities.append(current)
            current = [(code, value)]
        elif current:
            current.append((code, value))
    assets = []
    for e in entities:
        d = dict(e)
        if d[0] == 'INSERT' and d.get(1001) == 'MIHUA_DEMO':
            asset = json.loads(d[1000])
            asset['cadLayer'] = d[8]
            assets.append(asset)
    texts = [dict(e).get(1, '') for e in entities if dict(e)[0] == 'TEXT']
    def after(label):
        return texts[texts.index(label)+1]
    room = [float(v.strip()) / 1000 for v in after('房间净尺寸 / L × W × H').split('×')]
    base = [float(v.strip()) / 1000 for v in after('设备基础 / W × L × H').split('×')]
    pumps = [a for a in assets if a['kind'] == 'pump']
    valves = [a for a in assets if a['kind'] == 'isolation_valve']
    assert len(pumps) == 4 and len(valves) == 8
    centers = []
    for e in entities:
        d = dict(e)
        if d.get(8) != 'CENTER':
            continue
        points = []
        if d[0] == 'LINE':
            points = [[float(d[10])/1000, float(d[20])/1000], [float(d[11])/1000, float(d[21])/1000]]
        elif d[0] == 'LWPOLYLINE':
            for j, (c, v) in enumerate(e):
                if c == 10:
                    points.append([float(v)/1000, float(e[j+1][1])/1000])
        # 图纸右侧另有侧视示意，不能把它的中心线叠入平面。
        if points and max(p[0] for p in points) < 14:
            centers.append(points)
    walls=[]
    for e in entities:
        d=dict(e)
        if d[0]=='LWPOLYLINE' and d.get(8)=='A_WALL':
            xs=[float(v)/1000 for c,v in e if c==10]
            ys=[float(v)/1000 for c,v in e if c==20]
            walls.append([min(xs),min(ys),max(xs),max(ys)])
    return dict(pumps=pumps, valves=valves, room=room, base=base, centers=centers, walls=walls)


cad = read_cad()
# 执行阶段从这里开始：清空当前 Blender 场景，然后重建。
# 因此不要把整份脚本直接运行在尚未保存的重要场景中。
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
    for block in list(datablocks):
        if block.users == 0:
            datablocks.remove(block)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1


def material(name, color, metal=0, rough=.45, emission=0):
    # def 定义可复用的操作；只有调用 material(...) 时，这一段才会执行。
    # 材质决定表面反射；metal 是金属度，rough 是粗糙度，color 是 RGB 数值。
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bs is None:
        bs = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(bs.outputs['BSDF'], output.inputs['Surface'])
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    if emission:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = emission
    return m


M = {
    'blue': material('涂装 · 深海蓝', (.012,.065,.22), .55, .27),
    'blueEdge': material('涂装 · 法兰蓝', (.025,.14,.35), .5, .3),
    'steel': material('不锈钢 · 管线', (.43,.57,.66), .78, .27),
    'dark': material('底座 · 深色钢', (.035,.075,.11), .65, .4),
    'bolt': material('镀锌紧固件', (.55,.66,.72), .82, .25),
    'floor': material('环氧地坪', (.035,.065,.095), .2, .63),
    'slab': material('平台断面', (.055,.10,.15), .1, .7),
    'concrete': material('设备混凝土基础', (.13,.18,.23), .06, .77),
    'wall': material('建筑面板', (.07,.13,.20), .28, .52),
    'seam': material('地坪分缝', (.045,.095,.13), .2, .6),
    'yellow': material('安全标线', (.8,.51,.12), .1, .58),
    'black': material('橡胶与格栅', (.012,.022,.03), .15, .7),
    'white': material('设备铭牌', (.68,.83,.89), .3, .4),
    'glow': material('指示灯', (.03,.65,.85), .1, .25, 2),
    'copper': material('内部 · 铜绕组', (.61,.25,.075), .78, .3),
    'impeller': material('内部 · 叶轮合金', (.55,.39,.13), .8, .26),
    'rotor': material('内部 · 转子叠片', (.22,.29,.34), .86, .26),
}
groups = {}
merge = defaultdict(list)
interaction_nodes = []
interaction_pivots = {}


def group(name, kind, device=None):
    # 创建无可见几何的父节点，类似 Blender 大纲视图里的组织容器。
    # ob['deviceId'] 是我们自定义的属性；导出后进入 GLB 的 extras，
    # 网页 GLTFLoader 再把 extras 放进 object.userData，供识别设备使用。
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob['kind'] = kind
    if device:
        ob['deviceId'] = device
    groups[name] = ob
    return ob


def component(parent, key, label, pivot):
    ob = group(parent.name + '::' + key, 'component', parent['deviceId'])
    ob.parent = parent
    ob['componentKey'] = key
    ob['label'] = label
    interaction_nodes.append(ob)
    interaction_pivots[ob.name] = pivot
    return ob


def part(parent, key, label, pivot, offset=(0, 0, 0), internal=False, description=''):
    ob = group(parent.name + '::' + key, 'part', parent['deviceId'])
    ob.parent = parent
    ob['componentKey'] = parent['componentKey']
    ob['partKey'] = key
    ob['label'] = label
    ob['internal'] = internal
    # Custom extras are not transformed by the glTF exporter: these are already Y-up metres.
    ob['explodeOffset'] = list(offset)
    ob['description'] = description
    ob['geometrySource'] = 'demonstration'
    interaction_nodes.append(ob)
    interaction_pivots[ob.name] = pivot
    return ob


room = group('Architecture', 'architecture')
upper = group('UpperWalls', 'upperWalls')
floor = group('Floor', 'floor')
inlet = group('InletHeader', 'inlet')
outlet = group('OutletHeader', 'outlet')


def finish(ob, name, mat, parent, bevel=0, smooth=False, mergeable=True):
    # 我们自己写的收尾函数：命名、附加材质、设置父节点、应用倒角。
    # M[mat] 根据 'blue' / 'dark' 等键取出之前创建的材质。
    ob.name = name
    ob.data.materials.append(M[mat])
    ob.parent = parent
    if smooth:
        for poly in ob.data.polygons:
            poly.use_smooth = True
    if bevel:
        mod = ob.modifiers.new('制造倒角', 'BEVEL')
        mod.width, mod.segments = bevel, 2
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = ob.modifiers.new('加权法线', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if mergeable:
        merge[(parent.name, mat)].append(ob)
    return ob


def pos(p):
    # 图纸原点在房间角落；减去半个房间尺寸，让模型围绕中心摆放。
    # 这里仍是 Blender 的 Z 轴朝上，导出时再由 glTF 导出器转换轴向。
    return Vector((p[0]-6, p[1]-4, p[2]))


def box(name, p, size, mat, parent, bevel=.02):
    # box 是本项目定义的函数，不是 Blender 自带命令。
    # name=名称，p=位置，size=长宽高，mat=材质键，parent=所属节点。
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos(p))
    # 上一句实际创建立方体；bpy.context.object 取得刚创建的对象。
    ob = bpy.context.object
    # Python 的 = 表示赋值：把收到的长宽高写到物体尺寸属性里。
    ob.dimensions = size
    # 应用缩放，把缩放结果落实到几何，方便后续倒角与导出。
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(ob, name, mat, parent, bevel)


def cylinder(name, a, b, r, mat, parent, vertices=32, bevel=.008):
    a, b = pos(a), pos(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=r, depth=(b-a).length, location=(a+b)*.5)
    ob = bpy.context.object
    ob.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return finish(ob, name, mat, parent, bevel, True)


def torus(name, p, radius, minor, mat, parent, axis=(0,0,1), segments=40, rings=8):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=rings, location=pos(p), major_radius=radius, minor_radius=minor)
    ob = bpy.context.object
    ob.rotation_euler = Vector(axis).to_track_quat('Z','Y').to_euler()
    return finish(ob, name, mat, parent, smooth=True)


def tube(name, a, b, radius, bore, mat, parent, segments=48, volute=0):
    """Closed thick wall with a real bore; supports opened housings without a solid cylinder core."""
    a, b = Vector(a), Vector(b)
    axis = (b-a).normalized()
    u = axis.cross(Vector((0, 0, 1)))
    if u.length < .1:
        u = Vector((1, 0, 0))
    u.normalize()
    v = axis.cross(u).normalized()
    vertices = []
    for point, inner in [(a, False), (b, False), (a, True), (b, True)]:
        for j in range(segments):
            angle = math.tau*j/segments
            # Slightly eccentric volute is an illustrative casing, kept within the CAD envelope.
            r = bore if inner else radius + volute*(1+math.cos(angle))*.5
            vertices.append(pos(point+(u*math.cos(angle)+v*math.sin(angle))*r))
    faces = []
    for j in range(segments):
        k = (j+1) % segments
        faces.extend([(j,k,segments+k,segments+j),
                      (2*segments+k,2*segments+j,3*segments+j,3*segments+k),
                      (k,j,2*segments+j,2*segments+k),
                      (segments+j,segments+k,3*segments+k,3*segments+j)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    return finish(ob, name, mat, parent, bevel=.004, smooth=True)


def impeller_blades(name, p, parent):
    """Eight curved, thick radial blades around the pump axis, not a texture or a decal."""
    x,y,z = p
    vertices, faces = [], []
    steps = 12
    for blade in range(8):
        start = len(vertices)
        for j in range(steps+1):
            t = j/steps
            radius = .075+.216*t
            angle = blade*math.tau/8+.88*t
            # Blade thickness is measured across the radial direction.
            for yy, side in [(y-.105,-1),(y-.105,1),(y+.045,-1),(y+.045,1)]:
                a = angle+side*.010/radius
                vertices.append(pos((x+radius*math.cos(a),yy,z+radius*math.sin(a))))
        for j in range(steps):
            a, b = start+j*4, start+(j+1)*4
            faces.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),
                          (a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
        faces.extend([(start,start+1,start+3,start+2),
                      (start+steps*4,start+steps*4+2,start+steps*4+3,start+steps*4+1)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    return finish(ob,name,'impeller',parent,bevel=.003,smooth=True)


def path(name, points, radius, mat, parent):
    # 对折线路径做局部二次圆角，保持直线段、阀门中心和两端接点。
    pts = [Vector(p) for p in points]
    rounded = [pts[0]]
    for i in range(1,len(pts)-1):
        pre, cur, nex = pts[i-1:i+2]
        cut = min(.24, (cur-pre).length*.35, (nex-cur).length*.35)
        a, b = cur+(pre-cur).normalized()*cut, cur+(nex-cur).normalized()*cut
        for j in range(9):
            t = j/8
            rounded.append((1-t)**2*a+2*(1-t)*t*cur+t*t*b)
    rounded.append(pts[-1])
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions, curve.bevel_depth, curve.bevel_resolution = '3D', radius, 3
    spline = curve.splines.new('POLY')
    spline.points.add(len(rounded)-1)
    for target, p in zip(spline.points, rounded):
        target.co = (*pos(p),1)
    ob = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH')
    finish(ob, name, mat, parent, smooth=True)
    return [list(p) for p in rounded]


def flange(p, axis, r, parent):
    p, axis = Vector(p), Vector(axis).normalized()
    cylinder('法兰盘', p-axis*.033, p+axis*.033, r, 'steel', parent)
    torus('密封垫', p, r*.91, .009, 'black', parent, axis)
    u = axis.cross(Vector((0,0,1))).normalized()
    if u.length < .1:
        u = Vector((1,0,0))
    v = axis.cross(u).normalized()
    for i in range(8):
        a = math.tau*i/8
        point = p+(u*math.cos(a)+v*math.sin(a))*r*.79
        cylinder('法兰螺栓', point-axis*.048, point+axis*.048, .016, 'bolt', parent, 6, 0)


def text(name, string, p, size, parent, rotation=(0,0,0), mat='white'):
    curve = bpy.data.curves.new(name,'FONT')
    curve.body, curve.size, curve.extrude = string, size, .0007
    curve.align_x='CENTER'
    ob=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(ob)
    ob.location, ob.rotation_euler=pos(p),rotation
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH')
    finish(ob,name,mat,parent)


box('12m × 8m 地坪', (6,4,-.12), (12.4,8.4,.24), 'floor', floor, .04)
box('悬浮展示基座', (6,4,-.35), (12.55,8.55,.23), 'slab', floor, .05)
for x in range(13):
    box('地坪伸缩缝', (x,4,.001), (.014,8,.002), 'seam', floor, 0)
for y in range(9):
    box('地坪伸缩缝', (6,y,.002), (12,.014,.002), 'seam', floor, 0)
for y in [.72,7.28]:
    box('通道边界', (6,y,.005), (11.5,.045,.008), 'yellow', floor, 0)
for x0,y0,x1,y1 in cad['walls']:
    x,y=(x0+x1)/2,(y0+y1)/2
    box('CAD 剖切墙基', (x,y,.15), (x1-x0,y1-y0,.3), 'wall', room,.008)
    box('CAD 完整墙体', (x,y,2.4), (x1-x0,y1-y0,4.2), 'wall', upper,.008)
# 门洞宽 1.6m 来自平面，门高 2.4m 为展示假设。穿墙孔按管径和标高补齐上下墙。
box('门洞过梁',(-.1,5.8,3.45),(.2,1.6,2.1),'wall',upper,.008)
for x,y,width,low,high in [(-.1,1.5,.5,.6,1.1),(12.1,6.6,.4,2.0,2.4)]:
    box('穿墙孔下墙基',(x,y,.15),(.2,width,.3),'wall',room,.008)
    box('穿墙孔下墙',(x,y,(low+.3)/2),(.2,width,low-.3),'wall',upper,.008)
    box('穿墙孔上墙',(x,y,(4.5+high)/2),(.2,width,4.5-high),'wall',upper,.008)
upper.hide_render = True
upper.hide_viewport = True
# 后场设备柜、扶手与维护排水沟均为展示细节。
for x in [1.0,2.0,3.0]:
    box('配电柜', (x,.4,.85), (.7,.46,1.4), 'wall', room)
    box('柜门', (x,.635,.85), (.59,.025,1.23), 'dark', room, .006)
    box('仪表屏', (x,.654,1.17), (.23,.015,.14), 'glow', room, .002)
    cylinder('柜门把手', (x+.2,.675,.75), (x+.2,.675,.97), .013, 'bolt', room)
for x in [.5,4.1,7.8,11.5]:
    cylinder('护栏立柱', (x,7.7,.15), (x,7.7,1.08), .027,'steel',room)
for z in [.59,1.08]:
    cylinder('维护通道护栏', (.5,7.7,z),(11.5,7.7,z),.022,'steel',room)
for x in [1.25,3.6,6,8.4,10.8]:
    box('排水沟', (x,4.2,.01), (.26,2.3,.028), 'black', floor, .006)
    for j in range(22):
        box('排水格栅', (x,3.12+j*.102,.031), (.24,.02,.016), 'steel', floor, 0)

in_line = next(p for p in cad['centers'] if len(p)==2 and p[0][0]<0)
out_line = next(p for p in cad['centers'] if len(p)==2 and p[-1][0]>12)
path('进水总管 DN500', [[*p,.85] for p in in_line], .25, 'steel', inlet)
path('出水总管 DN400', [[*p,2.2] for p in out_line], .2, 'steel', outlet)
for y,z,r,g in [(1.5,.85,.33,inlet),(6.6,2.2,.28,outlet)]:
    for x in [1.8,4.2,6.6,9.0,11.1]:
        if y==1.5 and x>10.55:
            continue
        flange((x,y,z),(1,0,0),r,g)
        box('管道支座底板', (x,y,.04), (.42,.46,.08),'dark',g)
        box('管道支架', (x,y,(z-.27)/2), (.1,.16,z-.27),'steel',g)
        torus('管道抱箍', (x,y,z),r-.05,.022,'dark',g,(1,0,0))
text('进水标识','IN / DN500',(1.0,1.0,.015),.18,floor)
text('出水标识','OUT / DN400',(10.5,7.03,.015),.18,floor)

manifest = dict(source='pump_room_demo.dxf', sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                units='metres', room=cad['room'], pumpBase=cad['base'], pumps=[], valves=[],
                interactionSchema=1, explodeCoordinates='glTF Y-up metres',
                assumptions=['泵壳、阀体、法兰、散热片和设备柜为演示细化。',
                             '叶轮、转轴、电机转子和定子绕组为通用结构演示补建；未来源于 CAD，不代表厂家工程装配。',
                             '出水支管按照平面及侧视关系，以圆角弯头连接至 2.2m 标高。',
                             '网页采用建筑剖切展示；完整墙体保留于 UpperWalls。',
                             '门洞位置与宽度来自 CAD，门高按 2.4m 演示设定。'])
for asset in cad['pumps']:
    # 本 CAD 有四台泵，所以这个循环执行四次；asset 每次是一台泵的数据。
    # 先读取该泵的编号和位置，再组装它的基础、泵壳、电机、管道等零件。
    id=asset['id']
    x,y,_=[v/1000 for v in asset['origin_mm']]
    z=asset['axis_z']/1000
    pump=group(id,'pump',id)
    # 第一台这里得到 name='P-01'、kind='pump'、deviceId='P-01' 的父节点。
    pump['cadOriginMM']=asset['origin_mm']
    pump['axisHeight']=z
    assemblies = {
        'pump': component(pump,'pump','离心泵',(x,y,z)),
        'motor': component(pump,'motor','驱动电机',(x,y+1.17,z)),
        'coupling': component(pump,'coupling','联轴器',(x,y+.49,z)),
        'base': component(pump,'base','设备基础',(x,y+.7,.355)),
        'gauge': component(pump,'gauge','压力仪表',(x-.2,y,z+.6)),
    }
    base_part = part(assemblies['base'],'base','钢底座与混凝土基础',(x,y+.7,.25),(0,-.38,0),
        description='设备基础位置和外包络依据 CAD，地脚螺栓为展示细化。')
    # 基础坐标与 CAD 的 PUMP_UNIT_PLAN 块一致。
    box('混凝土设备基础', (x,y+.7,.15),cad['base'],'concrete',base_part,.035)
    box('泵组钢底座', (x,y+.7,.355),(1.11,2.18,.11),'dark',base_part,.02)
    # 上一行：在该泵坐标附近放一个 1.11×2.18×0.11 米的长方体，
    # 指定深色材质，归到 base_part，边缘做 0.02 米倒角。
    # 同一个 box() 也能做楼板、墙体、支架；不同参数产生不同结果。
    for dx in [-.495,.495]:
        for dy in [-.32,1.72]:
            cylinder('地脚螺栓',(x+dx,y+dy,.35),(x+dx,y+dy,.44),.026,'bolt',base_part,6,.003)
    text('设备编号',id,(x,y+1.69,.416),.16,base_part)

    shell = part(assemblies['pump'],'shell','泵壳',(x,y,z),(.55,.36,0),
        description='具有实际壁厚和空腔的演示蜗壳，包围叶轮并连接进出水口。')
    cover = part(assemblies['pump'],'cover','泵前盖与吸水口',(x,y-.3,z),(0,0,1.0),
        description='可拆分前盖、吸水短管和紧固件；展开后露出内部叶轮。')
    wheel = part(assemblies['pump'],'impeller','叶轮',(x,y,z),(0,0,.48),True,
        '八片弯曲叶片、轮盘和轮毂组成的演示叶轮，位于泵壳内部。')
    bearing = part(assemblies['pump'],'bearing','轴承与密封座',(x,y+.3,z),(0,0,-.4),
        description='轴承与密封区域的概念几何，不用于实际维修装配。')
    tube('空心蜗壳',(x,y-.22,z),(x,y+.205,z),.385,.321,'blue',shell,64,.034)
    tube('蜗壳后壁',(x,y+.205,z),(x,y+.24,z),.397,.071,'blue',shell,64)
    torus('泵壳前缘',(x,y-.221,z),.37,.025,'blueEdge',shell,(0,1,0))
    for dx in [-.26,.26]:
        box('泵机脚',(x+dx,y,.48),(.17,.19,.22),'blue',shell,.025)
    tube('出水口',(x+.3,y,z),(x+.51,y,z),.075,.06,'blue',shell)
    tube('可拆泵前盖',(x,y-.29,z),(x,y-.225,z),.356,.10,'blueEdge',cover,48)
    torus('前盖密封边',(x,y-.291,z),.334,.011,'steel',cover,(0,1,0))
    for j in range(8):
        a=j*math.tau/8
        dx,dz=math.cos(a)*.298,math.sin(a)*.298
        cylinder('前盖紧固螺栓',(x+dx,y-.316,z+dz),(x+dx,y-.275,z+dz),.021,'bolt',cover,6,.002)
    tube('吸水口',(x,y-.47,z),(x,y-.29,z),.10,.079,'blue',cover)
    cylinder('叶轮后盘',(x,y+.045,z),(x,y+.065,z),.301,'impeller',wheel,64,.004)
    cylinder('叶轮轮毂',(x,y-.12,z),(x,y+.09,z),.071,'impeller',wheel,40,.008)
    cylinder('叶轮紧固螺母',(x,y-.14,z),(x,y-.115,z),.039,'bolt',wheel,6,.002)
    impeller_blades('叶轮曲面叶片',(x,y,z),wheel)
    tube('轴承座',(x,y+.24,z),(x,y+.4,z),.15,.063,'blueEdge',bearing)
    torus('轴封',(x,y+.258,z),.068,.012,'black',bearing,(0,1,0))
    torus('轴承内圈',(x,y+.375,z),.085,.018,'steel',bearing,(0,1,0))

    guard = part(assemblies['coupling'],'guard','联轴器防护罩',(x,y+.49,z),(0,.62,0),
        description='可单独移开的安全护罩，打开后查看内部联轴器和连接轴。')
    shaft = part(assemblies['coupling'],'shaft','联轴器与连接轴',(x,y+.46,z),(0,0,0),True,
        '演示两半联轴器、弹性连接环与泵轴，默认装配时位于护罩内部。')
    tube('联轴器防护罩',(x,y+.4,z),(x,y+.59,z),.142,.121,'yellow',guard,40)
    cylinder('泵轴',(x,y-.06,z),(x,y+.70,z),.048,'bolt',shaft,32,.005)
    for yy in [y+.435,y+.54]:
        cylinder('联轴器半体',(x,yy-.035,z),(x,yy+.035,z),.106,'steel',shaft)
    cylinder('弹性连接环',(x,y+.47,z),(x,y+.506,z),.095,'black',shaft,32,.004)
    for j in range(6):
        a=j*math.tau/6
        cylinder('联轴器螺栓',(x+.08*math.cos(a),y+.42,z+.08*math.sin(a)),
            (x+.08*math.cos(a),y+.565,z+.08*math.sin(a)),.013,'bolt',shaft,6,0)

    # 电机 620 × 1150；沿 CAD +Y 方向延伸，内部构造为补建的演示件。
    housing = part(assemblies['motor'],'housing','电机机壳与散热片',(x,y+1.14,z),(0,.68,-.15),
        description='带壁厚的电机外壳与一体散热片，可隐藏以查看定子和转子。')
    endcap = part(assemblies['motor'],'endcap','电机端盖与风扇罩',(x,y+1.72,z),(0,0,-.90),
        description='可轴向分离的后端盖、风扇和保护格栅。')
    rotor = part(assemblies['motor'],'rotor','电机转子与主轴',(x,y+1.15,z),(0,0,-.30),True,
        '转子叠片、鼠笼导条和主轴的概念几何，用于观察装配关系。')
    stator = part(assemblies['motor'],'stator','定子与铜绕组',(x,y+1.13,z),(-.65,0,-.16),True,
        '环形定子、定子齿和铜绕组的演示几何，未按厂家电机电磁参数建模。')
    tube('电机空心机身',(x,y+.65,z),(x,y+1.64,z),.285,.245,'blue',housing,64)
    tube('电机前端盖',(x,y+.6,z),(x,y+.655,z),.285,.053,'blueEdge',housing,48)
    for j in range(20):
        angle=j*math.tau/20
        fin=box('电机轴向散热片',(x+.296*math.cos(angle),y+1.17,z+.296*math.sin(angle)),(.035,.86,.052),'blueEdge',housing,.006)
        fin.rotation_euler.y=math.pi/2-angle
    for yy in [y+.91,y+1.55]:
        for dx in [-.26,.26]:
            box('电机机脚',(x+dx,yy,.48),(.17,.19,.22),'blue',housing,.025)
    box('接线盒',(x+.37,y+1.12,z+.08),(.3,.32,.27),'blue',housing,.025)
    box('电机铭牌',(x,y+1.1,z+.31),(.21,.28,.015),'white',housing,.003)
    tube('电机可拆端盖',(x,y+1.64,z),(x,y+1.71,z),.31,.055,'blueEdge',endcap)
    tube('风扇保护罩',(x,y+1.71,z),(x,y+1.79,z),.257,.239,'blueEdge',endcap)
    cylinder('冷却风扇毂',(x,y+1.714,z),(x,y+1.747,z),.060,'black',endcap)
    for j in range(8):
        a=j*math.tau/8
        blade=box('冷却风扇叶片',(x+.125*math.cos(a),y+1.742,z+.125*math.sin(a)),(.15,.022,.04),'black',endcap,.005)
        blade.rotation_euler.y=-a
    for r in [.08,.14,.20,.24]:
        torus('风扇罩环',(x,y+1.798,z),r,.008,'steel',endcap,(0,1,0))
    for j in range(8):
        a=j*math.tau/8
        cylinder('风扇罩辐条',(x,y+1.802,z),(x+.24*math.cos(a),y+1.802,z+.24*math.sin(a)),.008,'steel',endcap,8,0)
    cylinder('电机主轴',(x,y+.52,z),(x,y+1.73,z),.045,'bolt',rotor)
    cylinder('电机转子叠片',(x,y+.79,z),(x,y+1.49,z),.148,'rotor',rotor,48,.008)
    for yy in [y+.77,y+1.51]:
        torus('转子端环',(x,yy,z),.145,.012,'copper',rotor,(0,1,0))
    for j in range(20):
        a=j*math.tau/20
        cylinder('转子导条',(x+.149*math.cos(a),y+.79,z+.149*math.sin(a)),
            (x+.149*math.cos(a+.08),y+1.49,z+.149*math.sin(a+.08)),.006,'copper',rotor,8,0)
    tube('定子铁芯',(x,y+.755,z),(x,y+1.55,z),.239,.184,'rotor',stator,64)
    for j in range(12):
        a=j*math.tau/12
        fin=box('定子齿',(x+.174*math.cos(a),y+1.15,z+.174*math.sin(a)),(.04,.72,.035),'rotor',stator,.004)
        fin.rotation_euler.y=-a
        for yy in [y+.73,y+1.57]:
            torus('铜线圈端部',(x+.204*math.cos(a),yy,z+.204*math.sin(a)),.03,.009,'copper',stator,(0,1,0),segments=16,rings=6)
        cylinder('定子铜绕组',(x+.209*math.cos(a),y+.73,z+.209*math.sin(a)),
            (x+.209*math.cos(a),y+1.57,z+.209*math.sin(a)),.018,'copper',stator,12,.002)

    gauge_part = part(assemblies['gauge'],'gauge','压力表与引压管',(x-.2,y,z+.6),(0,.65,.1),
        description='表壳、表盘、刻度与指针为展示细化，无独立实时遥测。')
    cylinder('压力表立管',(x-.2,y,z+.3),(x-.2,y,z+.59),.018,'steel',gauge_part)
    cylinder('压力表',(x-.2,y+.035,z+.6),(x-.2,y+.105,z+.6),.105,'steel',gauge_part)
    cylinder('表盘',(x-.2,y+.107,z+.6),(x-.2,y+.11,z+.6),.087,'white',gauge_part)
    torus('表盘边框',(x-.2,y+.113,z+.6),.093,.008,'steel',gauge_part,(0,1,0))
    for j in range(13):
        a=math.pi*.75+j*math.pi*1.5/12
        cylinder('表盘刻度',(x-.2+.069*math.cos(a),y+.115,z+.6+.069*math.sin(a)),
            (x-.2+.08*math.cos(a),y+.115,z+.6+.08*math.sin(a)),.0018,'dark',gauge_part,6,0)
    cylinder('表针',(x-.2,y+.115,z+.6),(x-.245,y+.115,z+.65),.004,'dark',gauge_part,8,0)
    branch=group(id+'_Pipes','branch',id)
    suction=path('吸水支管 DN200',[(x,1.5,z),(x,y-.47,z)],.1,'steel',branch)
    # 管道中心由 DXF CENTER 折线确定；高度由侧视参数给定。
    discharge_plan=next(p for p in cad['centers'] if len(p)==3 and abs(p[0][0]-(x+.51))<.001)
    dx=discharge_plan[1][0]
    discharge=path('出水支管 DN150',[(x+.51,y,z),(dx,y,z),(dx,y,2.2),(dx,6.6,2.2)],.075,'steel',branch)
    flange((x,y-.47,z),(0,1,0),.18,branch)
    flange((x+.51,y,z),(1,0,0),.15,branch)
    for yy in [4.1,6.25]:
        flange((dx,yy,2.2),(0,1,0),.15,branch)
    manifest['pumps'].append(dict(id=id,cadOriginMM=asset['origin_mm'],
        anchor=[x-6,1.65,-(y+.85-4)], focus=[x-6,.85,-(y+.7-4)],
        suction=suction, discharge=discharge,
        components=[dict(key=key,label=ob['label'],node=ob.name,
            parts=[dict(key=child['partKey'],label=child['label'],node=child.name,
                internal=bool(child['internal']),explodeOffset=list(child['explodeOffset']),
                description=child['description']) for child in ob.children if child.get('kind')=='part'])
            for key,ob in assemblies.items()]))

for asset in cad['valves']:
    x,y,z=[v/1000 for v in asset['xyz_mm']]
    id=asset['id']; parent_id='P-'+id.split('-')[1]
    valve=group(id,'valve',parent_id)
    valve['assetId']=id
    valve['cadOriginMM']=asset['xyz_mm']
    r=.1 if id.endswith('S') else .075
    cylinder('阀体',(x,y-.18,z),(x,y+.18,z),r*1.5,'blue',valve)
    for yy in [y-.21,y+.21]:
        flange((x,yy,z),(0,1,0),r+.08,valve)
    cylinder('阀盖',(x,y,z),(x,y,z+.22),r*.7,'blueEdge',valve)
    cylinder('阀杆',(x,y,z+.2),(x,y,z+.46),.018,'bolt',valve)
    torus('阀门手轮',(x,y,z+.46),.17,.016,'blueEdge',valve)
    for j in range(4):
        a=math.tau*j/4
        cylinder('手轮辐条',(x,y,z+.46),(x+.16*math.cos(a),y+.16*math.sin(a),z+.46),.01,'steel',valve,8,0)
    manifest['valves'].append(dict(id=id,pumpId=parent_id,position=[x-6,z,-(y-4)],diameter=200 if id.endswith('S') else 150))

# 按独立零件及材质合并，保留总成/零件层级以支持下钻、剖看和爆炸拆解。
for (name,mat), objects in merge.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    ob=bpy.context.object
    ob.name=name+'__'+mat
    if mat == 'concrete' and '::base::base' in name:
        ob.name=name.split('::')[0]+'__concrete'  # Stable CAD test anchor.
    ob['partMaterial']=mat

# Move empty origins onto meaningful assembly pivots without moving geometry.
# Components occur before their parts, so child-local transforms remain valid.
bpy.context.view_layer.update()
for node in interaction_nodes:
    children_world = [(child, child.matrix_world.copy()) for child in node.children]
    world = node.matrix_world.copy()
    world.translation = pos(interaction_pivots[node.name])
    node.matrix_world = world
    bpy.context.view_layer.update()
    for child, matrix in children_world:
        child.matrix_world = matrix
    bpy.context.view_layer.update()

# 源文件带灯光和默认相机；网页使用独立的实时照明。
world=bpy.context.scene.world or bpy.data.worlds.new('泵房环境')
bpy.context.scene.world=world
world.use_nodes=True
background=next((n for n in world.node_tree.nodes if n.type=='BACKGROUND'),None)
if background is None:
    background=world.node_tree.nodes.new('ShaderNodeBackground')
    output=world.node_tree.nodes.new('ShaderNodeOutputWorld')
    world.node_tree.links.new(background.outputs[0],output.inputs['Surface'])
background.inputs[0].default_value=(.06,.11,.18,1)
background.inputs[1].default_value=.5
for p,power,size in [((0,0,12),2200,10),((8,6,8),1800,8),((-8,-4,6),1300,7)]:
    bpy.ops.object.light_add(type='AREA',location=p)
    ob=bpy.context.object
    ob.data.energy,ob.data.shape,ob.data.size=power,'DISK',size
    ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(13,17,15))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.5))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=17
bpy.context.scene.camera=camera
bpy.context.scene.render.engine='CYCLES'
bpy.context.scene.cycles.samples=32
bpy.context.scene.render.resolution_x=1600
bpy.context.scene.render.resolution_y=1100
bpy.context.scene.render.resolution_percentage=100
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=18
            area.spaces.active.region_3d.view_location=(0,0,0)
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/pump-room.blend'))
# 上一句保存可编辑的 Blender 工程；下面另行导出网页需要的模型数据。
# 导出完整模型；在客户端按 UpperWalls 层级实现剖切。
upper.hide_viewport=False
# export_extras=True 保留 deviceId / kind / partKey 等自定义属性。
# 本项目明确不导出相机、灯光和动画；网页在 src/pump-scene.js 自己设置。
# 导出器把 Blender 场景转换成 JSON 结构与二进制几何数据，封装成 GLB。
bpy.ops.export_scene.gltf(filepath=str(OUT/'pump-room.glb'),export_format='GLB',export_extras=True,
    export_cameras=False,export_lights=False,export_animations=False,export_yup=True)
manifest['meshCount']=len([ob for ob in bpy.data.objects if ob.type=='MESH'])
manifest['triangles']=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in bpy.data.objects if ob.type=='MESH')
# 这个 JSON 是本项目额外生成的设备清单，供网页做标签、定位和管道流向。
# 它不是从 GLB 取出的内部 JSON；两者的结构和用途不同。
(OUT/'pump-room.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('PUMP_ROOM_EXPORT',json.dumps({'meshes':manifest['meshCount'],'triangles':manifest['triangles'],'glbBytes':(OUT/'pump-room.glb').stat().st_size}))
