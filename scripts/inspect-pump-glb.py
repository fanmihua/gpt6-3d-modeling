"""只读拆解已有 GLB，生成便于学习的 JSON 和二进制取样；不修改模型。
运行：python3 scripts/inspect-pump-glb.py
GLB 是数据容器：12 字节文件头 + 带长度/类型的 JSON、BIN 数据块。
"""
import json
import struct
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/models/pump-room.glb'
OUT = ROOT / 'docs/model-code'
OUT.mkdir(parents=True, exist_ok=True)
raw = SOURCE.read_bytes()
magic, version, total = struct.unpack_from('<4sII', raw)
assert magic == b'glTF' and version == 2 and total == len(raw)
chunks = []
offset = 12
while offset < total:
    length, kind = struct.unpack_from('<II', raw, offset)
    start = offset + 8
    assert length % 4 == 0 and start + length <= total
    chunks.append({'type': kind, 'dataOffset': start, 'length': length})
    offset = start + length
assert offset == total and chunks[0]['type'] == 0x4E4F534A
meta_chunk = chunks[0]
doc = json.loads(raw[meta_chunk['dataOffset']:meta_chunk['dataOffset'] + meta_chunk['length']])
bin_chunk = next(c for c in chunks if c['type'] == 0x004E4942)
(OUT / 'pump-room.glb.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')

# JSON 中的编号都是数组下标，从 0 开始。查找本项目的 P-01，再沿 children 找真实网格。
pump_index = next(i for i, n in enumerate(doc['nodes']) if n.get('extras', {}).get('kind') == 'pump' and n['extras']['deviceId'] == 'P-01')
def first_mesh(index, trail):
    trail = trail + [index]
    if 'mesh' in doc['nodes'][index]:
        return trail
    for child in doc['nodes'][index].get('children', []):
        found = first_mesh(child, trail)
        if found:
            return found
trail = first_mesh(pump_index, [])
leaf = doc['nodes'][trail[-1]]
mesh_index = leaf['mesh']
primitive = doc['meshes'][mesh_index]['primitives'][0]

# accessor 描述怎样解释字节；bufferView 描述从 BIN 的哪里开始、占多少字节。
# 此取样器仅用于这份未经压缩、无 sparse accessor 的资产。
formats = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def sample(accessor_index, limit):
    a = doc['accessors'][accessor_index]
    assert 'sparse' not in a and not a.get('normalized', False)
    view = doc['bufferViews'][a['bufferView']]
    assert view['buffer'] == 0 and 'extensions' not in view
    fmt, size = formats[a['componentType']]
    width = widths[a['type']]
    stride = view.get('byteStride', width * size)
    relative = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    assert a.get('byteOffset', 0) + (a['count'] - 1) * stride + width * size <= view['byteLength']
    file_offset = bin_chunk['dataOffset'] + relative
    values = [list(struct.unpack_from('<' + fmt * width, raw, file_offset + i * stride)) for i in range(min(limit, a['count']))]
    return {'accessorIndex': accessor_index, 'accessor': a, 'bufferViewIndex': a['bufferView'], 'bufferView': view,
            'fileByteOffsetOfFirstValue': file_offset, 'firstValues': values}
positions = sample(primitive['attributes']['POSITION'], 3)
indices = sample(primitive['indices'], 9)
assert primitive.get('mode', 4) == 4  # TRIANGLES：每连续三个索引组成一个三角形。
summary = {
    'source': str(SOURCE.relative_to(ROOT)), 'sha256': hashlib.sha256(raw).hexdigest(),
    'header': {'magic': magic.decode(), 'version': version, 'fileBytes': total}, 'chunks': chunks,
    'counts': {key: len(doc.get(key, [])) for key in ['nodes', 'meshes', 'materials', 'accessors', 'bufferViews', 'images', 'animations', 'cameras']},
    'selectedPath': [{'index': i, 'name': doc['nodes'][i].get('name')} for i in trail],
    'meshIndex': mesh_index, 'materialIndex': primitive['material'],
    'positionSample': positions, 'indexSample': indices,
    'firstTriangles': [sum(indices['firstValues'][i:i+3], []) for i in range(0, 9, 3)],
}
(OUT / 'pump-room.binary-sample.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')

def fragment(key, label, data):
    return '  // ' + label + '\n  ' + json.dumps(key, ensure_ascii=False) + ': ' + json.dumps(data, ensure_ascii=False, indent=2).replace('\n', '\n  ')
parts = [fragment('overview', '文件头和各类内容数量（从本地文件读取）', {'header': summary['header'], 'counts': summary['counts']})]
for i in trail:
    parts.append(fragment(f'nodes[{i}]', 'children 指向子节点下标；extras 是我们写入的业务标记。', doc['nodes'][i]))
parts += [
    fragment(f'meshes[{mesh_index}]', 'POSITION、NORMAL 等值是 accessor 下标，不是坐标；material 是材质下标。', doc['meshes'][mesh_index]),
    fragment(f'materials[{primitive["material"]}]', '颜色是 RGBA；metallicFactor 为金属度，roughnessFactor 为粗糙度。', doc['materials'][primitive['material']]),
    fragment('positionSample', 'POSITION 对应的 accessor 和 bufferView；5126 表示 32 位浮点数，VEC3 表示一组 x、y、z。', positions),
    fragment('firstTriangles', '从 BIN 真正解码出的前三个三角形；数字是 POSITION 列表中的顶点下标。', summary['firstTriangles']),
]
(OUT / 'pump-room.glb-reading.jsonc').write_text('// 真实 GLB 的节选；方括号中的编号是原始数组下标。\n// 外层键为阅读时添加；这份节选不能代替完整 GLB。\n{\n' + ',\n\n'.join(parts) + '\n}\n')
print(json.dumps({k: summary[k] for k in ['header', 'counts', 'selectedPath', 'meshIndex', 'materialIndex']}, ensure_ascii=False, indent=2))
