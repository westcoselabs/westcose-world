"""Pack one runtime GLB: the base rig's mesh + skin + texture, and every clip retargeted onto it.

Each Meshy rigging job binds the same mesh with slightly different joint orientations, so a clip
can't simply be copied between rigs. Per bone, the source's world-space motion relative to its own
bind pose is reapplied to the base's bind pose:  W_base(t) = W_src(t) * Rb_src^-1 * Rb_base.

usage: python docs/design/character-v1/pipeline/retarget_pack.py out.glb texture_size base.glb:Name [src.glb:Name ...]
The base's own clip is kept (renamed); sources contribute their single clip.
"""
import io, json, struct, sys
import numpy as np
from PIL import Image

def load(path):
    data = open(path, 'rb').read()
    n = struct.unpack_from('<I', data, 12)[0]; g = json.loads(data[20:20 + n]); off = 20 + n + 8
    def acc(i):
        a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]
        comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]; sz = np.dtype(dt).itemsize
        s = off + v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride') or comps * sz
        raw = np.frombuffer(data[s:s + st * a['count']], np.uint8).reshape(a['count'], st)
        return raw[:, :comps * sz].copy().view(dt).reshape(a['count'], comps)
    def image(i):
        v = g['bufferViews'][g['images'][i]['bufferView']]; s = off + v.get('byteOffset', 0)
        return Image.open(io.BytesIO(data[s:s + v['byteLength']])).convert('RGB')
    return g, acc, image

# --- quaternion helpers (x, y, z, w), vectorised over leading axes -------------------------------
def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0); bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)
def qinv(q): return q * np.array([-1, -1, -1, 1])
def qfrom_matrix(m):
    m = m[:3, :3] / np.linalg.norm(m[:3, :3], axis=0)
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1) * 2; return np.array([(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4])
    i = int(np.argmax(np.diag(m))); j, k = (i + 1) % 3, (i + 2) % 3
    s = np.sqrt(1 + m[i, i] - m[j, j] - m[k, k]) * 2; q = np.zeros(4)
    q[i] = s / 4; q[j] = (m[j, i] + m[i, j]) / s; q[k] = (m[k, i] + m[i, k]) / s; q[3] = (m[k, j] - m[j, k]) / s
    return q
def slerp_resample(times, values, new):
    """Linear glTF sampling of quaternion keys at new times (nlerp is plenty at 30 fps keys)."""
    idx = np.clip(np.searchsorted(times, new) - 1, 0, len(times) - 2) if len(times) > 1 else np.zeros(len(new), int)
    if len(times) == 1: return np.repeat(values[:1], len(new), 0)
    t0, t1 = times[idx], times[idx + 1]; f = np.clip((new - t0) / np.maximum(t1 - t0, 1e-9), 0, 1)[:, None]
    a, b = values[idx], values[idx + 1]; b = np.where((a * b).sum(-1, keepdims=True) < 0, -b, b)
    out = a * (1 - f) + b * f; return out / np.linalg.norm(out, axis=-1, keepdims=True)
def lerp_resample(times, values, new):
    if len(times) == 1: return np.repeat(values[:1], len(new), 0)
    return np.stack([np.interp(new, times, values[:, c]) for c in range(values.shape[1])], 1)

class Rig:
    def __init__(self, path):
        self.g, self.acc, self.image = load(path)
        skin = self.g['skins'][0]; self.joints = skin['joints']
        self.names = [self.g['nodes'][j]['name'] for j in self.joints]
        ibm = self.acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row
        self.bind_world = np.array([qfrom_matrix(np.linalg.inv(m)) for m in ibm])
        parent = {c: i for i, n in enumerate(self.g['nodes']) for c in n.get('children', [])}
        self.parent = [self.joints.index(parent[j]) if parent.get(j) in self.joints else -1 for j in self.joints]
        self.rest_t = np.array([self.g['nodes'][j].get('translation', [0, 0, 0]) for j in self.joints])
        self.rest_q = np.array([self.g['nodes'][j].get('rotation', [0, 0, 0, 1]) for j in self.joints])

    def clip(self):
        """The single animation as per-joint local rotations and translations on one shared timeline."""
        an = self.g['animations'][0]; ch = {}
        for c in an['channels']:
            s = an['samplers'][c['sampler']]
            if c['target']['node'] in self.joints:
                ch[(self.joints.index(c['target']['node']), c['target']['path'])] = (self.acc(s['input'])[:, 0], self.acc(s['output']))
        end = max(t[-1] for t, _ in ch.values()); times = np.round(np.arange(0, end + 1e-6, 1 / 30), 5)
        if times[-1] < end - 1e-4: times = np.append(times, end)
        q = np.stack([slerp_resample(*ch[(j, 'rotation')], times) if (j, 'rotation') in ch else np.repeat(self.rest_q[j][None], len(times), 0) for j in range(len(self.joints))], 1)
        t = np.stack([lerp_resample(*ch[(j, 'translation')], times) if (j, 'translation') in ch else np.repeat(self.rest_t[j][None], len(times), 0) for j in range(len(self.joints))], 1)
        return an.get('name', 'clip'), times, q, t

    def world(self, local):
        out = np.empty_like(local)
        for j, p in enumerate(self.parent):  # joints are listed parents-first by the exporter
            out[:, j] = local[:, j] if p < 0 else qmul(out[:, p], local[:, j])
        return out

def retarget(src, base):
    name, times, q, t = src.clip()
    order = [src.names.index(n) for n in base.names]
    q, t = q[:, order], t[:, order]
    rb_src, rb_base = src.bind_world[order], base.bind_world
    # Sources' parent chains match the base's (same names), so compose in base order.
    w_src = base.world(q)
    w_base = qmul(qmul(w_src, qinv(rb_src)[None]), rb_base[None])
    local = np.empty_like(w_base)
    for j, p in enumerate(base.parent):
        local[:, j] = w_base[:, j] if p < 0 else qmul(qinv(w_base[:, p]), w_base[:, j])
    # Root motion: keep the hips' displacement from the source's rest, on the base's rest.
    hips = base.names.index('Hips')
    hips_t = t[:, hips] - src.rest_t[order][hips] + base.rest_t[hips]
    return times, local, hips_t

def main():
    out, size, base_spec, sources = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4:]
    base_path, base_name = base_spec.split(':'); base = Rig(base_path)
    clips = []
    _, times, q, t = base.clip(); clips.append((base_name, times, q, t[:, base.names.index('Hips')]))
    for spec in sources:
        path, name = spec.split(':'); src = Rig(path)
        assert sorted(src.names) == sorted(base.names), path
        clips.append((name, *retarget(src, base)))
    g, acc = base.g, base.acc
    prim = g['meshes'][0]['primitives'][0]
    blobs, views, accessors = [], [], []
    def add(array, kind, target=None, minmax=False, normalized=False):
        array = np.ascontiguousarray(array); comps = 1 if array.ndim == 1 else array.shape[1]
        ctype = {np.dtype(np.float32): 5126, np.dtype(np.uint32): 5125, np.dtype(np.uint16): 5123, np.dtype(np.uint8): 5121}[array.dtype]
        offset = sum(len(b) for b in blobs); raw = array.tobytes(); blobs.append(raw + b'\0' * ((-len(raw)) % 4))
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(raw)}
        if target: view['target'] = target
        views.append(view)
        a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': len(array), 'type': kind}
        if normalized: a['normalized'] = True
        if minmax: a['min'] = array.reshape(len(array), -1).min(0).tolist(); a['max'] = array.reshape(len(array), -1).max(0).tolist()
        accessors.append(a); return len(accessors) - 1
    attrs = prim['attributes']
    joints = acc(attrs['JOINTS_0']); joints = joints.astype(np.uint8) if joints.max() < 256 else joints.astype(np.uint16)
    new_attrs = {
        'POSITION': add(acc(attrs['POSITION']).astype(np.float32), 'VEC3', 34962, minmax=True),
        'NORMAL': add(acc(attrs['NORMAL']).astype(np.float32), 'VEC3', 34962),
        'TEXCOORD_0': add(acc(attrs['TEXCOORD_0']).astype(np.float32), 'VEC2', 34962),
        'JOINTS_0': add(joints, 'VEC4', 34962),
        'WEIGHTS_0': add(acc(attrs['WEIGHTS_0']).astype(np.float32), 'VEC4', 34962),
    }
    indices = acc(prim['indices'])[:, 0]; indices = indices.astype(np.uint16 if indices.max() < 65536 else np.uint32)
    new_indices = add(indices, 'SCALAR', 34963)
    ibm = add(acc(g['skins'][0]['inverseBindMatrices']).astype(np.float32), 'MAT4')
    tex = base.image(0)
    if tex.width > size: tex = tex.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO(); tex.save(buf, 'JPEG', quality=88, optimize=True); jpg = buf.getvalue()
    blobs.append(jpg + b'\0' * ((-len(jpg)) % 4)); views.append({'buffer': 0, 'byteOffset': sum(len(b) for b in blobs[:-1]), 'byteLength': len(jpg)})
    image_view = len(views) - 1
    animations = []
    hips_node = base.joints[base.names.index('Hips')]
    for name, times, q, hips_t in clips:
        tin = add(times.astype(np.float32), 'SCALAR', minmax=True)
        samplers, channels = [], []
        for j, node in enumerate(base.joints):
            samplers.append({'input': tin, 'output': add(q[:, j].astype(np.float32), 'VEC4'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': node, 'path': 'rotation'}})
        samplers.append({'input': tin, 'output': add(hips_t.astype(np.float32), 'VEC3'), 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': hips_node, 'path': 'translation'}})
        animations.append({'name': name, 'samplers': samplers, 'channels': channels})
    nodes = json.loads(json.dumps(g['nodes']))
    for n in nodes: n.pop('extras', None)
    out_gltf = {
        'asset': {'version': '2.0', 'generator': 'westcose retarget_pack'},
        'scene': 0, 'scenes': [{'nodes': g['scenes'][0]['nodes']}], 'nodes': nodes,
        'meshes': [{'name': 'visitor', 'primitives': [{'attributes': new_attrs, 'indices': new_indices, 'material': 0}]}],
        'skins': [{'joints': base.joints, 'inverseBindMatrices': ibm, **({'skeleton': g['skins'][0]['skeleton']} if 'skeleton' in g['skins'][0] else {})}],
        'materials': [{'name': 'visitor', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1}}],
        'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
        'images': [{'bufferView': image_view, 'mimeType': 'image/jpeg'}],
        'animations': animations, 'accessors': accessors, 'bufferViews': views,
    }
    binary = b''.join(blobs); out_gltf['buffers'] = [{'byteLength': len(binary)}]
    js = json.dumps(out_gltf, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    open(out, 'wb').write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(binary)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binary), b'BIN\x00') + binary)
    print('written', out, f'{(28 + len(js) + len(binary)) / 1e6:.2f} MB', 'texture', f'{len(jpg) / 1e3:.0f} KB', 'clips', [(c[0], round(float(c[1][-1]), 2)) for c in clips])

main()
