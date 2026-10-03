"""Summarise a GLB without dependencies: meshes, triangles, skins and bones, animations, images."""
import json, struct, sys

def read(path):
    data = open(path, 'rb').read()
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF', 'not a GLB'
    offset, chunks = 12, {}
    while offset < length:
        size, kind = struct.unpack_from('<I4s', data, offset)
        chunks[kind] = data[offset + 8: offset + 8 + size]
        offset += 8 + size
    return json.loads(chunks[b'JSON']), chunks.get(b'BIN\x00', b''), len(data)

def main(path):
    gltf, binary, size = read(path)
    acc = gltf.get('accessors', [])
    print(f'file {size / 1e6:.2f} MB, generator: {gltf.get("asset", {}).get("generator")}')
    triangles = 0
    for mesh in gltf.get('meshes', []):
        for prim in mesh['primitives']:
            count = acc[prim['indices']]['count'] // 3 if 'indices' in prim else acc[prim['attributes']['POSITION']]['count'] // 3
            triangles += count
            print(f'mesh {mesh.get("name")!r}: {count} tris, attributes {sorted(prim["attributes"])}, material {prim.get("material")}')
    print('total triangles', triangles)
    print('materials', [(m.get('name'), list(m.get('pbrMetallicRoughness', {}).keys())) for m in gltf.get('materials', [])])
    for image in gltf.get('images', []):
        view = gltf['bufferViews'][image['bufferView']] if 'bufferView' in image else None
        blob = binary[view.get('byteOffset', 0): view.get('byteOffset', 0) + view['byteLength']] if view else b''
        dims = struct.unpack('>II', blob[16:24]) if blob[:8] == b'\x89PNG\r\n\x1a\n' else None
        print(f'image {image.get("name")!r} {image.get("mimeType")} {len(blob) / 1e6:.2f} MB dims {dims}')
    nodes = gltf.get('nodes', [])
    for skin in gltf.get('skins', []):
        names = [nodes[j].get('name') for j in skin['joints']]
        print(f'skin {skin.get("name")!r}: {len(names)} joints')
        print('  joints', names)
    for anim in gltf.get('animations', []):
        inputs = [acc[s['input']] for s in anim['samplers']]
        duration = max(i.get('max', [0])[0] for i in inputs) if inputs else 0
        print(f'animation {anim.get("name")!r}: {len(anim["channels"])} channels, {duration:.2f}s')
    # Bind-pose bounds of the first position accessor, for scale.
    for mesh in gltf.get('meshes', []):
        pos = acc[mesh['primitives'][0]['attributes']['POSITION']]
        print('position bounds', pos.get('min'), pos.get('max'))
        break
    roots = [nodes[i].get('name') for i in gltf.get('scenes', [{}])[0].get('nodes', [])]
    print('scene roots', roots, 'root transforms', [{k: nodes[i][k] for k in ('scale', 'rotation', 'translation') if k in nodes[i]} for i in gltf.get('scenes', [{}])[0].get('nodes', [])])

if __name__ == '__main__':
    main(sys.argv[1])
