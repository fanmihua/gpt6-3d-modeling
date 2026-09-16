"""从用户厂区实拍照片推演可编辑的厂区模型，非测绘或工程竣工模型。
运行：/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_factory_campus.py
几何采用 Blender Z-up，GLB 与 manifest 采用 Web Y-up [x, z, -y]。
不包含照片中的天空、远山、河流和场外城市；可见建筑细节为照片比例推演。
"""
import bpy, math, json, random
from pathlib import Path
from collections import defaultdict
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'public/models'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(28)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for pool in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
    for item in list(pool):
        if not item.users: pool.remove(item)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
# All primitive geometry goes directly into material batches instead of thousands of objects.
batches=defaultdict(lambda: [[],[]])
zone_defs=[
 ('admin','综合管理楼',(-48,-40,10),(66,30,20)),
 ('sedimentation','沉淀处理区',(40,-8,3.5),(64,32,7)),
 ('filtration','深度过滤区',(40,35,4.5),(64,34,9)),
 ('tanks','储罐与供水区',(-20,63,12.5),(54,29,25)),
 ('dosing','加药与消毒区',(-62,25,9),(64,69,18)),
 ('workshop','送水泵房',(83,-45,7),(42,24,14)),
 ('utilities','动力配电区',(80,64,9),(42,24,18)),
 ('gate','厂区出入口',(30,-79,4.5),(27,14,9)),
]
parents={}
for zid,name,c,size in zone_defs:
    ob=bpy.data.objects.new('ZONE_'+zid,None); scene.collection.objects.link(ob)
    ob['zoneId']=zid; ob['label']=name; ob['source']='single-photo-reconstruction'
    parents[zid]=ob
site=bpy.data.objects.new('Site_Infrastructure',None); scene.collection.objects.link(site)
parents['site']=site

def mat(name,rgb,rough=.65,metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if p is None:
        p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled'); output=m.node_tree.nodes.new('ShaderNodeOutputMaterial'); m.node_tree.links.new(p.outputs['BSDF'],output.inputs['Surface'])
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    return m
M={
 'wall':mat('建筑 · 浅灰石材',(.67,.73,.73),.78),
 'white':mat('建筑 · 银白收边',(.85,.90,.89),.58,.08),
 'seam':mat('立面 · 石材分缝',(.36,.45,.46),.8),
 'roof':mat('屋面 · 青灰防水',(.39,.48,.49),.82),
 'glass':mat('幕墙 · 深青蓝玻璃',(.035,.19,.24),.19,.55),
 'glassLight':mat('幕墙 · 天光玻璃',(.09,.31,.36),.22,.45),
 'frame':mat('幕墙 · 银色铝框',(.43,.56,.57),.37,.65),
 'asphalt':mat('道路 · 深灰沥青',(.115,.16,.18),.94),
 'paving':mat('铺装 · 灰色透水砖',(.47,.55,.54),.93),
 'curb':mat('道路 · 花岗岩路缘',(.62,.70,.67),.81),
 'mark':mat('道路 · 白色标线',(.87,.91,.84),.81),
 'yellow':mat('道路 · 黄色标线',(.81,.65,.24),.82),
 'soil':mat('地块 · 深色断面',(.085,.14,.15),.88),
 'grass':mat('景观 · 青绿草坪',(.115,.24,.16),.97),
 'grassLight':mat('景观 · 草坪亮区',(.18,.31,.19),.97),
 'leaf':mat('树冠 · 阴影深绿',(.018,.069,.014),.91),
 'leafLight':mat('树冠 · 自然中绿',(.045,.135,.022),.89),
 'leafTip':mat('树冠 · 日照新叶',(.091,.214,.029),.87),
 'trunk':mat('树干 · 深棕',(.23,.24,.17),.99),
 'water':mat('工艺池 · 青蓝水面',(.075,.39,.47),.19,.35),
 'waterLight':mat('工艺池 · 反光水纹',(.22,.55,.60),.3,.23),
 'tank':mat('罐体 · 银灰钢板',(.70,.77,.77),.44,.37),
 'steel':mat('钢构 · 镀锌钢',(.49,.66,.67),.4,.68),
 'pipe':mat('管线 · 淡青涂装',(.20,.50,.55),.48,.35),
 'dark':mat('设备 · 炭灰',(.055,.105,.12),.64,.2),
 'blue':mat('标识 · 深蓝',(.025,.27,.42),.47,.3),
 'red':mat('旗帜 · 中国红',(.71,.085,.065),.75),
 'carWhite':mat('车辆 · 珍珠白',(.78,.84,.84),.35,.24),
 'carBlue':mat('车辆 · 石墨蓝',(.085,.20,.25),.3,.45),
}


# 摄影 PBR 图像来自 Poly Haven，CC0 来源与下载摘要见 docs/texture-sources.md。
# 导出的 glTF 只使用标准纹理、UV 与 normal map；不依赖 Blender 专属程序化节点。
TEXTURE_DIR=ROOT/'public/assets/textures'
TEXTURE_MAPPING={
    'grass':('leafy_grass',2.0,.38),
    'grassLight':('leafy_grass',2.0,.38),
    'asphalt':('asphalt_02',3.0,.24),
    'trunk':('bark_brown_02',1.0,.6),
}
images={}
for key,(asset,tile_size,normal_strength) in TEXTURE_MAPPING.items():
    m=M[key];nodes=m.node_tree.nodes;links=m.node_tree.links
    bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    for suffix in ('diff','nor_gl'):
        file=TEXTURE_DIR/f'{asset}_{suffix}_1k.jpg'
        if not file.exists():raise FileNotFoundError(f'缺少 CC0 材质文件: {file}')
        if str(file) not in images:
            im=bpy.data.images.load(str(file),check_existing=True)
            im.colorspace_settings.name='Non-Color' if suffix=='nor_gl' else 'sRGB'
            im.pack();images[str(file)]=im
        tex=nodes.new('ShaderNodeTexImage');tex.image=images[str(file)];tex.extension='REPEAT'
        tex.interpolation='Linear';tex.label=f'{asset} / {suffix} / CC0'
        if suffix=='diff':
            if key in ('grass','grassLight'):
                tint=nodes.new('ShaderNodeMix');tint.data_type='RGBA';tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
                tint.inputs[7].default_value=(.34,.74,.31,1)
                links.new(tex.outputs['Color'],tint.inputs[6]);links.new(tint.outputs[2],bs.inputs['Base Color'])
            else:links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        else:
            normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=normal_strength
            links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    m['source']='https://polyhaven.com/a/'+asset;m['license']='CC0-1.0';m['tileSizeMeters']=tile_size


def poly(verts,faces,ma,zone='site',layer='infrastructure'):
    vv,ff=batches[(zone,ma,layer)]; n=len(vv); vv.extend(verts); ff.extend([tuple(n+i for i in f) for f in faces])

def box(p,s,ma,zone='site',layer='infrastructure',rot=0):
    x,y,z=p; a,b,c=[v/2 for v in s]; cs=math.cos(rot); sn=math.sin(rot)
    verts=[(x+dx*cs-dy*sn,y+dx*sn+dy*cs,z+dz) for dx,dy,dz in [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]]
    poly(verts,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],ma,zone,layer)

def cyl(a,b,r,ma,zone='site',layer='infrastructure',n=12,r2=None):
    a,b=Vector(a),Vector(b); axis=(b-a).normalized(); u=axis.cross(Vector((0,0,1)))
    if u.length<.001:u=axis.cross(Vector((0,1,0)))
    u.normalize(); v=axis.cross(u); r2=r if r2 is None else r2
    verts=[tuple(q+(u*math.cos(2*math.pi*i/n)+v*math.sin(2*math.pi*i/n))*rad) for q,rad in [(a,r),(b,r2)] for i in range(n)]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    poly(verts,faces,ma,zone,layer)

def sphere(p,r,ma,zone='site',layer='greenery',seg=10,rings=6,scale=(1,1,1),hemi=False):
    x,y,z=p; verts=[]; end=math.pi/2 if hemi else math.pi
    for j in range(rings+1):
        theta=end*j/rings
        for i in range(seg):
            phi=2*math.pi*i/seg
            verts.append((x+r*math.sin(theta)*math.cos(phi)*scale[0],y+r*math.sin(theta)*math.sin(phi)*scale[1],z+r*math.cos(theta)*scale[2]))
    faces=[]
    for j in range(rings):
        for i in range(seg):faces.append((j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i))
    if hemi:faces.append(tuple(reversed(range(rings*seg,(rings+1)*seg))))
    poly(verts,faces,ma,zone,layer)

def line(a,b,r=.075,ma='steel',zone='site',layer='infrastructure'):
    cyl(a,b,r,ma,zone,layer,8)

def rail(a,b,z,zone,layer='buildings',height=1.2):
    ax,ay=a; bx,by=b; length=math.hypot(bx-ax,by-ay)
    for zz in (z+.55,z+height):line((ax,ay,zz),(bx,by,zz),.055,'steel',zone,layer)
    count=max(1,math.ceil(length/3))
    for i in range(count+1):
        t=i/count; x=ax+(bx-ax)*t; y=ay+(by-ay)*t
        line((x,y,z),(x,y,z+height),.065,'steel',zone,layer)

def parapet(x,y,w,d,h,zone,th=.3):
    for yy in (y-d/2,y+d/2):box((x,yy,h+.4),(w+.5,th,.8),'wall',zone,'buildings')
    for xx in (x-w/2,x+w/2):box((xx,y,h+.4),(th,d,.8),'wall',zone,'buildings')

def building(x,y,w,d,h,zone,floors=2,front=True):
    box((x,y,h/2+.4),(w,d,h),'wall',zone,'buildings')
    box((x,y,.35),(w+1.4,d+1.4,.6),'paving',zone,'buildings')
    box((x,y,h+.44),(w-.35,d-.35,.16),'roof',zone,'buildings'); parapet(x,y,w,d,h+.35,zone)
    # Stone cladding grid and slender roof cap.
    for xx in range(math.ceil(x-w/2),math.floor(x+w/2),5):
        for yy in (y-d/2-.018,y+d/2+.018):box((xx,yy,h/2),(.038,.035,h),'seam',zone,'buildings')
    for zz in [3.2*i for i in range(1,math.ceil(h/3.2))]:
        for yy in (y-d/2-.04,y+d/2+.04):box((x,yy,zz),(w,.045,.04),'seam',zone,'buildings')
    for side in (-1,1):
        for f in range(floors):
            zz=2.5+f*(h-2)/floors
            for xx in [x-w/2+3.1+i*4.2 for i in range(int((w-3)/4.2))]:
                box((xx,y+side*(d/2+.035),zz),(2.75,.065,1.6),'glass',zone,'buildings')
                box((xx,y+side*(d/2+.075),zz),(.09,.055,1.65),'frame',zone,'buildings')
                box((xx,y+side*(d/2+.075),zz-.86),(2.92,.18,.12),'white',zone,'buildings')
    for sx in (-1,1):
        for f in range(floors):
            zz=2.5+f*(h-2)/floors
            for yy in [y-d/2+3+i*4 for i in range(int((d-3)/4))]:
                box((x+sx*(w/2+.04),yy,zz),(.07,2.5,1.55),'glass',zone,'buildings')
    # roof equipment, ducts, fan housings
    for i in range(max(2,int(w/14))):
        xx=x-w/2+7+i*12
        box((xx,y+2,h+1.15),(4.3,3,1.25),'white',zone,'buildings')
        box((xx,y+2,h+1.83),(3.8,2.6,.14),'dark',zone,'buildings')
        for q in (-.9,.9):cyl((xx+q,y+2,h+1.87),(xx+q,y+2,h+1.98),.6,'steel',zone,'buildings',16)
    box((x,y-3,h+.8),(w*.55,.8,.7),'steel',zone,'buildings')

# Rectangular raised cutaway plinth, no backdrop.
box((0,0,-1.5),(224,184,3),'soil')
box((0,0,.025),(220,180,.25),'grass')
box((0,-97,-.1),(224,13,.45),'asphalt')
for x in range(-108,111,12):box((x,-99,.15),(5,.18,.025),'mark')
box((0,-94,.15),(222,.15,.025),'yellow')
# Internal asphalt road network and sidewalks.
for ri,(p,s) in enumerate([((-101,0,.19),(11,177,.25)),((101,0,.19),(11,177,.25)),((0,79,.19),(203,11,.25)),((0,-75,.19),(203,13,.25)),((-4,0,.19),(13,154,.25)),((46,12,.19),(111,9,.25)),((-54,-18,.19),(91,9,.25)),((-54,46,.19),(91,8,.25)),((50,-32,.19),(101,8,.25))]):
    box((p[0],p[1],p[2]+ri*.002),s,'asphalt')
# Court in front of main office and entry road.
box((-41,-62,.2),(86,29,.28),'asphalt')
box((7,-84,.21),(18,25,.3),'asphalt')
for x in (-108,-94,94,108):box((x,0,.34),(1.5,174,.2),'paving')
for y in (-83.5,-67,71,87):box((0,y,.34),(190,1.5,.2),'paving')
for y in range(-64,73,10):
    for x in (-101,101,-4):box((x,y,.34),(.14,4,.025),'yellow')
for x in range(-89,94,11):
    for y in (-75,79):box((x,y,.34),(4.4,.14,.025),'yellow')
for x in range(10,98,11):
    for y in (12,-32):box((x,y,.34),(4,.13,.03),'mark')
for xx in range(-3,18,3):box((xx,-88,.18),(1.35,9,.025),'mark')
# Grass islands and curb perimeter pads.
def lawn(x,y,w,d):
    box((x,y,.5),(w+1,d+1,.4),'curb')
    box((x,y,.72),(w,d,.09),'grassLight',layer='greenery')
for args in [(-49,-57,51,3.5),(-76,-66,3,10),(-24,-65,3,10),(52,-60,43,12),(75,-19,2,18),(-78,67,29,22),(-63,-4,53,3),(-63,42,55,2),(45,58,57,3),(82,34,4,38),(24,-80,9,6)]:lawn(*args)

# Dominant administrative building: three-storey facade with recessed glass atrium.
building(-48,-40,66,27,18,'admin',3)
# Front facade cladding bays; extended curtain-wall glazing.
for xx in (-74,-62,-34,-22):
    box((xx,-53.58,8.35),(5.9,.12,12.8),'glass','admin','buildings')
    for dz in (4,8,12):box((xx,-53.67,dz),(6,.09,.13),'frame','admin','buildings')
    box((xx,-53.70,8.4),(.12,.11,12.9),'frame','admin','buildings')
box((-48,-53.63,8.2),(18.3,.16,12.7),'glass','admin','buildings')
for xx in (-57.2,-52.6,-48,-43.4,-38.8):box((xx,-53.76,8.2),(.18,.14,12.8),'frame','admin','buildings')
for zz in (2,5.3,8.6,11.9,14.55):box((-48,-53.77,zz),(18.5,.15,.13),'frame','admin','buildings')
for xx in (-59.1,-36.9):box((xx,-54.5,8.7),(2.1,2,16.8),'white','admin','buildings')
# Glazed entrance canopy and four shallow entrance steps.
box((-48,-56.2,5.1),(15,5.8,.33),'frame','admin','buildings')
box((-48,-56.2,5.31),(14.65,5.5,.1),'glassLight','admin','buildings')
for xx in (-54.9,-41.1):line((xx,-58.7,.5),(xx,-58.7,5.1),.115,'frame','admin','buildings')
for i in range(4):box((-48,-54.4-i*.65,.25+(4-i)*.18),(17+i*.5,1.25,.35+(4-i)*.18),'paving','admin','buildings')
# Lettering is real extruded geometry, never a baked photographic plane.
def text_geo(body,p,size,ma,zone,rotation=(math.pi/2,0,0)):
    c=bpy.data.curves.new('Sign_'+body,'FONT'); c.body=body; c.size=size; c.align_x='CENTER'; c.extrude=.025; c.bevel_depth=.006
    try:c.font=bpy.data.fonts.load('/System/Library/Fonts/Hiragino Sans GB.ttc')
    except RuntimeError:pass
    ob=bpy.data.objects.new('Sign_'+body,c); scene.collection.objects.link(ob); ob.location=p; ob.rotation_euler=rotation
    bpy.context.view_layer.objects.active=ob; ob.select_set(True); bpy.ops.object.convert(target='MESH'); ob.select_set(False)
    ob.data.materials.append(M[ma]); ob.parent=parents[zone]; ob['zoneId']=zone; ob['layer']='buildings'
    return ob
text_geo('绿色水务  服务民生',(-48,-53.72,15.6),2.5,'blue','admin')
# Left processing buildings behind the office and domed storage building.
building(-61,-1,60,19,9,'dosing',1)
building(-66,26,51,18,7.5,'dosing',1)
building(-83,62,24,19,12,'dosing',2)
cyl((-58,62,.4),(-58,62,4.5),9.2,'wall','dosing','buildings',48)
sphere((-58,62,4.5),9.2,'tank','dosing','buildings',48,16,hemi=True)
# Dome radial standing seams and base ring.
for i in range(12):
    angle=i*math.tau/12
    pts=[(-58+9.24*math.sin(k*math.pi/24)*math.cos(angle),62+9.24*math.sin(k*math.pi/24)*math.sin(angle),4.5+9.24*math.cos(k*math.pi/24)) for k in range(13)]
    for a,b in zip(pts,pts[1:]):line(a,b,.035,'white','dosing','buildings')

# Two independent pool groups: open basins, divider walls, galleries and steel bridges.
def pool(x,y,w,d,z,zone,columns,rows):
    box((x,y,z/2),(w,d,z),'wall',zone,'buildings')
    box((x,y,z+.035),(w-1.4,d-1.4,.1),'water',zone,'buildings')
    for xx in (x-w/2,x+w/2):box((xx,y,z+.4),(.65,d+1.1,.85),'white',zone,'buildings')
    for yy in (y-d/2,y+d/2):box((x,yy,z+.4),(w+.5,.65,.85),'white',zone,'buildings')
    for i in range(1,columns):
        xx=x-w/2+i*w/columns
        box((xx,y,z+.38),(.75,d,.9),'white',zone,'buildings')
    for j in range(1,rows):
        yy=y-d/2+j*d/rows
        box((x,yy,z+.36),(w,.75,.85),'white',zone,'buildings')
    # Individual water shimmer lines stay subtle from aerial view.
    for j in range(16):
        yy=y-d/2+1.5+j*(d-3)/16
        for k in range(5):
            xx=x-w/2+2+k*(w-4)/5+random.random()*1.7
            box((xx,yy,z+.102),(random.uniform(2,7),.045,.013),'waterLight',zone,'buildings')
    # Walkways and continuous thin railings at the outer perimeter.
    for yy in (y-d/2-1,y+d/2+1):
        box((x,yy,z+.33),(w+3,1.35,.28),'paving',zone,'buildings')
        rail((x-w/2-1,yy),(x+w/2+1,yy),z+.48,zone)
    for xx in (x-w/2-1,x+w/2+1):
        box((xx,y,z+.33),(1.35,d+3,.28),'paving',zone,'buildings')
        rail((xx,y-d/2-1),(xx,y+d/2+1),z+.48,zone)
    for yy in (y-d*.23,y+d*.23):
        box((x,yy,z+.76),(w+2,1.25,.3),'steel',zone,'buildings')
        for offset in (-.63,.63):rail((x-w/2-1,yy+offset),(x+w/2+1,yy+offset),z+.9,zone, height=1.1)
        for xx in (x-w*.25,x+w*.25):
            box((xx,yy,z+1.35),(2.3,1.6,1.1),'pipe',zone,'buildings')
            cyl((xx,yy,z+1.9),(xx,yy,z+2.2),.5,'dark',zone,'buildings',16)
    # Clerestory panes along the south basin service gallery.
    for xx in range(int(x-w/2+2),int(x+w/2-2),4):box((xx,y-d/2-.34,z*.48),(2.6,.07,1.25),'glass',zone,'buildings')
    # Visible external access stair, handrails.
    for i in range(8):box((x-w/2-3,y-d/2+1+i*.5,(i+1)*z/8/2),(3,.7,(i+1)*z/8),'paving',zone,'buildings')
    line((x-w/2-4.5,y-d/2+1,1.3),(x-w/2-4.5,y-d/2+5,z+1.3),.055,'steel',zone,'buildings')
pool(39,-8,61,30,3.4,'sedimentation',3,2)
pool(39,35,61,33,5.4,'filtration',3,2)

# Cylindrical tank farm: staggered heights, segmented roofs, rings and ladders.
def tank(x,y,r,h):
    zid='tanks'; cyl((x,y,.4),(x,y,h),r,'tank',zid,'buildings',48)
    cyl((x,y,h),(x,y,h+1.3),r,'white',zid,'buildings',48,r2=.75)
    cyl((x,y,h+1.25),(x,y,h+1.85),.8,'steel',zid,'buildings',20)
    for zz in (1.2,h*.33,h*.66,h-.5):
        for j in range(48):
            a=j*math.tau/48;b=(j+1)*math.tau/48
            line((x+(r+.035)*math.cos(a),y+(r+.035)*math.sin(a),zz),(x+(r+.035)*math.cos(b),y+(r+.035)*math.sin(b),zz),.04,'frame',zid,'buildings')
    for i in range(12):
        a=i*math.tau/12
        line((x+(r+.04)*math.cos(a),y+(r+.04)*math.sin(a),1),(x+(r+.04)*math.cos(a),y+(r+.04)*math.sin(a),h),.035,'frame',zid,'buildings')
    # Rail rings around tank roof.
    for i in range(36):
        a=i*math.tau/36;b=(i+1)*math.tau/36
        line((x+r*.9*math.cos(a),y+r*.9*math.sin(a),h+1.2),(x+r*.9*math.cos(b),y+r*.9*math.sin(b),h+1.2),.055,'steel',zid,'buildings')
        if i%3==0:line((x+r*.9*math.cos(a),y+r*.9*math.sin(a),h+.2),(x+r*.9*math.cos(a),y+r*.9*math.sin(a),h+1.2),.06,'steel',zid,'buildings')
    for dx in (-.48,.48):line((x+dx,y-r-.28,.6),(x+dx,y-r-.28,h+.75),.055,'steel',zid,'buildings')
    for zz in range(1,int(h)+1):line((x-.5,y-r-.29,zz),(x+.5,y-r-.29,zz),.045,'steel',zid,'buildings')
for args in [(-33,60,7.8,17),(-14,64,9.2,22),(6,65,7.5,20),(-36,77,4.2,23)]:tank(*args)
# Twin pipe racks linking tanks and process basins; elbow approximations are geometric.
for yy in (48,51):
    line((-42,yy,3.0),(64,yy,3.0),.55,'pipe','tanks','buildings')
    for xx in range(-40,65,13):
        box((xx,yy,.8),(1.4,1.4,1.6),'wall','tanks','buildings')
        box((xx,yy,2.4),(1.5,2.1,.25),'steel','tanks','buildings')
for xx in (-33,-14,6):line((xx,54,3),(xx,49,3),.5,'pipe','tanks','buildings')

# Right-side buildings: low pump house, tall power building, rear service wing.
building(83,-45,41,23,11.5,'workshop',1)
for xx in (68,75):
    box((xx,-56.6,3.05),(4.8,.12,5.3),'dark','workshop','buildings')
    for zz in (1,1.6,2.2,2.8,3.4,4,4.6):box((xx,-56.71,zz),(4.65,.045,.045),'steel','workshop','buildings')
building(80,64,41,24,15.5,'utilities',2)
building(27,72,30,15,8.8,'utilities',1)
# Rear lattice communications mast.
for xx,yy in [(94,80),(97,80),(94,83),(97,83)]:line((xx,yy,.4),(95.5+(xx-95.5)*.2,81.5+(yy-81.5)*.2,29),.13,'steel','utilities','buildings')
for zz in range(3,29,3):
    ratio=1-zz/36
    x1,x2=95.5-1.5*ratio,95.5+1.5*ratio;y1,y2=81.5-1.5*ratio,81.5+1.5*ratio
    for aa,bb in [((x1,y1,zz),(x2,y1,zz+2.5)),((x2,y1,zz),(x2,y2,zz+2.5)),((x2,y2,zz),(x1,y2,zz+2.5)),((x1,y2,zz),(x1,y1,zz+2.5))]:line(aa,bb,.065,'steel','utilities','buildings')
box((95.5,81.5,28),(3,3,.3),'steel','utilities','buildings')
line((95.5,81.5,28),(95.5,81.5,33),.09,'steel','utilities','buildings')
for xx in (94.6,96.4):box((xx,81.5,30),(0.45,.7,2.6),'white','utilities','buildings')

# Gatehouse, sliding fence, entrance sign, guard barrier.
building(32,-78,23,11,6.3,'gate',1)
box((32,-84.05,6.9),(26.5,14,.7),'white','gate','buildings')
for xx in (24.5,29,36,40.5):box((xx,-83.58,2.9),(3.1,.08,4.5),'glass','gate','buildings')
box((28,-87.5,.4),(26,5.8,.45),'paving','gate','buildings')
for i in range(12):
    xx=16-i*1.2
    line((xx,-83,.4),(xx,-83,2.1),.07,'steel','gate')
    line((xx,-83,.55),(xx-1.2,-83,2),.05,'steel','gate')
    line((xx,-83,2),(xx-1.2,-83,.55),.05,'steel','gate')
box((-22,-84,2.4),(22,1.4,4.3),'dark','gate','buildings')
text_geo('绿源水务 · 净水厂',(-22,-84.74,2.65),1.55,'white','gate')
box((17,-77,1.1),(1.15,1.15,2),'yellow','gate')
box((12,-77,2.13),(11,.24,.25),'mark','gate')
for xx in (8,10,12,14,16):box((xx,-77.14,2.13),(.55,.025,.26),'red','gate')
# Photo-style three flags on landscaped island.
lawn(-11,-64,9,3)
for i in range(3):
    xx=-14+i*3; h=12 if i==1 else 10.8
    line((xx,-64,.8),(xx,-64,h),.075,'steel','admin','buildings')
    poly([(xx,-64,h-.2),(xx+2.7,-64.15,h-.35),(xx+2.5,-64.1,h-1.9),(xx,-64,h-1.7)],[(0,1,2,3)],['white','red','blue'][i],'admin','buildings')

# Parking bays and compact detailed cars.
def car(x,y,ma,rot=0):
    box((x,y,1.05),(2.1,4.6,1.25),ma,rot=rot)
    box((x,y+.05,1.96),(1.85,2.8,.65),ma,rot=rot)
    box((x,y+.07,2.3),(1.65,2.25,.07),'glass',rot=rot)
    box((x,y-1.1,1.9),(1.74,.06,.55),'glass',rot=rot)
    box((x,y+1.23,1.9),(1.74,.06,.55),'glass',rot=rot)
    for xx in (-1.06,1.06):
        for yy in (-1.4,1.4):cyl((x+xx-.11,y+yy,.68),(x+xx+.11,y+yy,.68),.42,'dark',n=12)
    for xx in (-.72,.72):box((x+xx,y-2.33,1.1),(.5,.04,.25),'white')
for baseX,baseY,num in [(-67,-63,5),(-38,-63,4),(41,-57,5)]:
    for i in range(num):
        xx=baseX+i*3.2
        for dx in (-1.55,1.55):box((xx+dx,baseY,.37),(.08,6.3,.035),'mark')
        box((xx,baseY+3.15,.37),(3.1,.08,.035),'mark')
        if i%4!=2:car(xx,baseY,['carWhite','carBlue','dark'][i%3])
# Fence around the perimeter with stone piers and narrow pickets.
def fence(a,b):
    ax,ay=a;bx,by=b;dist=math.hypot(bx-ax,by-ay); count=math.ceil(dist/5)
    for i in range(count+1):
        t=i/count;x=ax+(bx-ax)*t;y=ay+(by-ay)*t
        box((x,y,1.65),(.7,.7,3.3),'wall')
        box((x,y,3.35),(.9,.9,.2),'white')
    line((ax,ay,.75),(bx,by,.75),.07,'steel');line((ax,ay,2.75),(bx,by,2.75),.07,'steel')
    for i in range(math.ceil(dist/.7)+1):
        t=min(i*.7/dist,1);x=ax+(bx-ax)*t;y=ay+(by-ay)*t
        line((x,y,.7),(x,y,2.9),.035,'steel')
for args in [((-109,-89),(-35,-89)),((-9,-89),(-2,-89)),((45,-89),(109,-89)),((-109,-89),(-109,89)),((109,-89),(109,89)),((-109,89),(109,89))]:fence(*args)
# 非树种扫描：依据照片的行道树尺度，用分叉、疏密叶团和小叶几何构建自然轮廓。
# 树冠采用不透明几何，避免透明叶卡的排序穿帮；仍合并为三种叶色的少量 mesh。
def foliage_lobe(p,r,ma,rng,scale=(1,1,1)):
    x,y,z=p;seg=8;rings=5;verts=[]
    offsets=[rng.uniform(.81,1.18) for _ in range(seg)]
    for j in range(rings+1):
        theta=math.pi*j/rings
        for i in range(seg):
            phi=math.tau*i/seg;warp=offsets[i]*(1+.12*math.sin(j*2.2+i))
            rr=r*warp
            verts.append((x+rr*math.sin(theta)*math.cos(phi)*scale[0],y+rr*math.sin(theta)*math.sin(phi)*scale[1],z+r*math.cos(theta)*scale[2]))
    faces=[(j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i) for j in range(rings) for i in range(seg)]
    poly(verts,faces,ma,layer='greenery')

def leaflet(p,rad,ma,rng):
    center=Vector(p);a=rng.uniform(0,math.tau);tilt=rng.uniform(-.6,.65)
    long=Vector((math.cos(a),math.sin(a),tilt)).normalized()*rad
    short=Vector((-math.sin(a),math.cos(a),rng.uniform(-.2,.2)))*rad*.47
    # 四边叶片，轮廓由真实几何贡献，所有视角都不依赖透明混合。
    verts=[tuple(center-long),tuple(center+short),tuple(center+long),tuple(center-short)]
    poly(verts,[(0,1,2),(0,2,3)],ma,layer='greenery')

def tree(x,y,scale=1):
    # 独立随机源不扰动原有种植位置和外部随机序列。
    rng=random.Random(f'{x:.6f}:{y:.6f}')
    z=.65;h=3.1*scale;lean=Vector((rng.uniform(-.2,.2)*scale,rng.uniform(-.2,.2)*scale,0))
    top=Vector((x,y,z+h))+lean
    cyl((x,y,z),tuple(top),.19*scale,'trunk',layer='greenery',n=8,r2=.105*scale)
    crown=top+Vector((0,0,1.18*scale));lobes=[]
    foliage_lobe(tuple(crown),.66*scale,'leaf',rng,scale=(1.05,.96,1.15))
    for i in range(5):
        angle=math.tau*i/5+rng.uniform(-.24,.24);distance=rng.uniform(.8,1.35)*scale
        endpoint=crown+Vector((math.cos(angle)*distance,math.sin(angle)*distance,rng.uniform(-.5,.8)*scale))
        radius=rng.uniform(.85,1.18)*scale
        ma='leafLight' if i%3 else 'leaf'
        foliage_lobe(tuple(endpoint),radius*.47,ma,rng,scale=(rng.uniform(.9,1.1),rng.uniform(.9,1.1),rng.uniform(.9,1.2)))
        branchbase=top-Vector((0,0,.7*scale))
        cyl(tuple(branchbase),tuple(endpoint),.075*scale,'trunk',layer='greenery',n=6,r2=.026*scale)
        lobes.append((endpoint,radius))
    for endpoint,radius in lobes:
        for i in range(80):
            angle=rng.uniform(0,math.tau);zz=rng.uniform(-.75,.95);flat=math.sqrt(1-zz*zz)
            leafcenter=endpoint+Vector((math.cos(angle)*flat,math.sin(angle)*flat,zz))*radius*rng.uniform(.65,1.08)
            leaflet(tuple(leafcenter),rng.uniform(.22,.42)*scale,rng.choices(['leaf','leafLight','leafTip'],[3,6,2])[0],rng)
for yy in range(-79,85,9):
    for xx in (-90,89):tree(xx+random.uniform(-.4,.4),yy,random.uniform(.78,1.07))
for xx in range(-94,95,9):
    for yy in (-86,87):
        if yy==-86 and -33<xx<48:continue
        tree(xx,yy,random.uniform(.85,1.08))
for xx in range(-79,-16,9):
    for yy in (-56,-22,12,40):tree(xx,yy,.8)
for xx in range(12,74,10):
    for yy in (-26,57):tree(xx,yy,.76)
for xx in (38,47,56,65,73):tree(xx,-61,.9)
for xx,yy in [(-83,-58),(-83,-69),(-22,-60),(-23,-68),(-15,-56),(-18,35),(-18,18),(-85,74),(-73,76),(-65,-80),(-52,-79)]:tree(xx,yy,.9)
# Lighting poles with cantilever arms and LED head.
def light(x,y,side=1):
    cyl((x,y,.5),(x,y,7),.09,'white',n=8,r2=.065)
    line((x,y,6.8),(x+side*2.4,y,7.3),.065,'white')
    box((x+side*2.4,y,7.25),(1.1,.45,.16),'dark')
    box((x+side*2.4,y,7.15),(.85,.36,.05),'white')
for yy in range(-75,81,22):
    light(-96,yy,-1);light(96,yy,1)
for xx in (-77,-49,-20,50,79):light(xx,-81,-1)

# Emit one mesh per zone/material/layer. Each mesh carries zoneId for direct raycasting.
for (zid,ma,layer),(vertices,faces) in batches.items():
    mesh=bpy.data.meshes.new(f'{zid}_{ma}_{layer}');mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(ob);ob.data.materials.append(M[ma]);ob.parent=parents[zid]
    ob['layer']=layer
    if zid!='site':ob['zoneId']=zid
    ob['source']='single-photo-reconstruction'
    if ma in TEXTURE_MAPPING:
        # 世界尺寸平面 UV，地表保持真实平铺尺度，树皮按各面主轴展开。
        tile=TEXTURE_MAPPING[ma][1];uv=mesh.uv_layers.new(name='UVMap')
        for face in mesh.polygons:
            n=face.normal;axis=max(range(3),key=lambda i:abs(n[i]))
            for li in face.loop_indices:
                v=mesh.vertices[mesh.loops[li].vertex_index].co
                co=(v.x,v.y) if axis==2 else ((v.x,v.z) if axis==1 else (v.y,v.z))
                uv.data[li].uv=(co[0]/tile,co[1]/tile)
    if ma in ('leaf','leafLight','leafTip'):
        for face in mesh.polygons:face.use_smooth=True
# Camera and lighting live in the editable source, but never in exported glTF.
world=bpy.data.worlds.new('Studio_World') if not scene.world else scene.world
scene.world=world;world.use_nodes=True;bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.18,.23,.27,1);bg.inputs[1].default_value=.55
sun_data=bpy.data.lights.new('Sun','SUN');sun_data.energy=2.6;sun=bpy.data.objects.new('Sun',sun_data);scene.collection.objects.link(sun);sun.rotation_euler=(.45,-.5,-.65)
light_data=bpy.data.lights.new('Large_Fill','AREA');light_data.energy=80000;light_data.shape='DISK';light_data.size=150
fill=bpy.data.objects.new('Large_Fill',light_data);scene.collection.objects.link(fill);fill.location=(-60,-80,140)
camdata=bpy.data.cameras.new('Campus_Preview_Camera');cam=bpy.data.objects.new('Campus_Preview_Camera',camdata);scene.collection.objects.link(cam)
# 与网页默认等轴测视角一致：Web target=(0,7,5.75)、offset=(-185,185,185)。
camera_target=Vector((0,-5.75,7))
cam.location=camera_target+Vector((-185,-185,185));cam.rotation_euler=(camera_target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=330;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.view_settings.view_transform='AgX'
# Friendly initial Blender view.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=275
            area.spaces.active.region_3d.view_location=(0,0,0)
            area.spaces.active.clip_end=3000
mesh_objects=[o for o in scene.objects if o.type=='MESH']
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in mesh_objects)
verts=sum(len(o.data.vertices) for o in mesh_objects)
manifest={
 'source':'single-photo-reconstruction',
 'description':'依据单张实拍照片重建的可交互厂区；布局和体量为比例推演，建筑不可见面及内部设备不代表工程实测。',
 'coordinateSystem':'web-y-up',
 'bounds':{'min':[-112,-3,-92],'max':[112,33,103.5]},
 'zones':[{'id':zid,'name':name,'center':[c[0],c[2],-c[1]],'size':[s[0],s[2],s[1]]} for zid,name,c,s in zone_defs],
 'stats':{'meshObjects':len(mesh_objects),'materials':len(M),'vertices':verts,'triangles':tris,'zones':len(zone_defs)},
 'layers':['buildings','greenery','infrastructure'],
 'materialSources':{'provider':'Poly Haven','license':'CC0-1.0','assets':['leafy_grass','asphalt_02','bark_brown_02'],'resolution':1024,'maps':['albedo','normal-openGL'],'documentation':'docs/texture-sources.md'},
 'vegetation':{'geometry':'procedural branched trees, irregular opaque leaf clusters and individual leaflets','species':'unspecified','isPhotogrammetry':False},
 'limitations':['单张照片估算比例，非测绘模型','背面和不可见细节依据通用厂区结构补建','仅保留厂内建筑、池体、管线、道路和景观，不包含山河天空','工艺名称与运营数据由界面作演示映射']
}
(OUT/'factory-campus.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
# 暂时避免生成 .blend1，并立刻还原本次进程设置；不保存任何应用偏好。
saved_backup_count=bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/factory-campus.blend'))
finally:
    bpy.context.preferences.filepaths.save_version=saved_backup_count
bpy.ops.export_scene.gltf(filepath=str(OUT/'factory-campus.glb'),export_format='GLB',export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_yup=True,export_apply=True)
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'public/assets/factory-campus-preview.png')
bpy.ops.render.render(write_still=True)
print('FACTORY_CAMPUS_STATS '+json.dumps(manifest['stats']))
