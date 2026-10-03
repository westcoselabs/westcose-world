"""Repaint the high-top ankle patches by projecting a decal in 3D: every texel of a triangle near a
patch is mapped back to its point on the shoe; inside the patch disc it becomes cream, and a small
wave along the foot is inked across it. Seams in the UV atlas don't matter this way."""
import io, json, struct, sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
data = bytearray(open(src, 'rb').read())
jlen = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + jlen]); bin_off = 20 + jlen + 8

def accessor(i):
    a = gltf['accessors'][i]; v = gltf['bufferViews'][a['bufferView']]
    comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dtype = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
    start = bin_off + v.get('byteOffset', 0) + a.get('byteOffset', 0); size = np.dtype(dtype).itemsize
    stride = v.get('byteStride') or comps * size
    raw = np.frombuffer(bytes(data[start:start + stride * a['count']]), np.uint8).reshape(a['count'], stride)
    return raw[:, :comps * size].copy().view(dtype).reshape(a['count'], comps)

prim = gltf['meshes'][0]['primitives'][0]
pos, nor, uv = accessor(prim['attributes']['POSITION']), accessor(prim['attributes']['NORMAL']), accessor(prim['attributes']['TEXCOORD_0'])
tri = accessor(prim['indices']).reshape(-1, 3)
view = gltf['bufferViews'][gltf['images'][0]['bufferView']]
img0 = bin_off + view.get('byteOffset', 0)
tex = np.asarray(Image.open(io.BytesIO(bytes(data[img0:img0 + view['byteLength']]))).convert('RGB')).copy()
H, W, _ = tex.shape

# Texel -> 3D for every triangle in the foot region (y < 0.22), as dense point samples.
foot = np.where(pos[tri].max(axis=1)[:, 1] < .22)[0]
samples_xyz, samples_px, samples_n = [], [], []
for t in foot:
    q = uv[tri[t]] * [W, H]; p = pos[tri[t]]; n = nor[tri[t]].mean(axis=0)
    x0, x1 = int(np.floor(q[:, 0].min())), int(np.ceil(q[:, 0].max())); y0, y1 = int(np.floor(q[:, 1].min())), int(np.ceil(q[:, 1].max()))
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
    T = np.array([[q[1, 0] - q[0, 0], q[2, 0] - q[0, 0]], [q[1, 1] - q[0, 1], q[2, 1] - q[0, 1]]])
    if abs(np.linalg.det(T)) < 1e-9: continue
    inv = np.linalg.inv(T); d = np.stack([xs.ravel() - q[0, 0], ys.ravel() - q[0, 1]])
    b1, b2 = inv @ d; b0 = 1 - b1 - b2
    inside = (b0 >= -.02) & (b1 >= -.02) & (b2 >= -.02)
    if not inside.any(): continue
    xyz = b0[inside, None] * p[0] + b1[inside, None] * p[1] + b2[inside, None] * p[2]
    px = np.stack([np.clip(xs.ravel()[inside].astype(int), 0, W - 1), np.clip(ys.ravel()[inside].astype(int), 0, H - 1)], 1)
    samples_xyz.append(xyz); samples_px.append(px); samples_n.append(np.repeat(n[None] / (np.linalg.norm(n) + 1e-9), len(xyz), 0))
xyz, px, nrm = np.concatenate(samples_xyz), np.concatenate(samples_px), np.concatenate(samples_n)
col = tex[px[:, 1], px[:, 0]].astype(np.float32) / 255; lum = col.mean(axis=1)

# Patch centres: light, sideways-facing texels on the ankle collar, clustered per shoe side.
light = (lum > .8) & (xyz[:, 1] > .09) & (xyz[:, 1] < .17) & (np.abs(nrm[:, 0]) > .65) & (np.abs(xyz[:, 2]) < .06)
centres = []
for side in (-1, 1):
    for facing in (-1, 1):
        m = light & (np.sign(xyz[:, 0]) == side) & (np.sign(nrm[:, 0]) == facing)
        if m.sum() < 40: continue
        c = np.median(xyz[m], axis=0)
        # Refine on the light texels within 4cm, which is the disc itself.
        near = m & (np.linalg.norm(xyz - c, axis=1) < .04)
        if near.sum() < 30: continue
        # Settle on the disc: recentre on the light texels around the current centre a few times.
        for _ in range(6):
            near = m & (np.linalg.norm(xyz - c, axis=1) < .035)
            c = xyz[near].mean(axis=0)
        r = np.percentile(np.linalg.norm(xyz[near] - c, axis=1), 92)
        centres.append((c, facing, min(max(r, .02), .03) + .006))
print('patches', [(c.round(3).tolist(), f, round(r, 3)) for c, f, r in centres])

cream = np.array([238, 232, 216], np.uint8); ink = np.array([42, 50, 54], np.uint8)
for c, facing, r in centres:
    on_side = (np.sign(nrm[:, 0]) == facing) & (np.abs(nrm[:, 0]) > .45)
    rel = xyz - c; dist = np.sqrt(rel[:, 1] ** 2 + rel[:, 2] ** 2)   # distance across the shoe side (y-z plane)
    disc = on_side & (dist < r) & (np.abs(rel[:, 0]) < .03)
    # The generated disc sits a little off ours: blank its leftover rim with the shoe's own canvas black.
    around = on_side & (dist >= r) & (dist < r + .016) & (np.abs(rel[:, 0]) < .03) & (rel[:, 1] < r + .012)
    canvas = np.median(col[around & (lum < .3)], axis=0) * 255 if (around & (lum < .3)).sum() > 20 else np.array([22, 22, 24])
    rim = around & (lum > .35)
    tex[px[rim, 1], px[rim, 0]] = canvas.astype(np.uint8)
    tex[px[disc, 1], px[disc, 0]] = cream
    # Wave along the foot (z) across the disc: y = A sin(k z).
    s = rel[:, 2] / r; wave = disc & (np.abs(s) < .72) & (np.abs(rel[:, 1] - .22 * r * np.sin(s * np.pi * 1.4)) < .11 * r)
    tex[px[wave, 1], px[wave, 0]] = ink
    print('painted', disc.sum(), 'texels, wave', wave.sum(), 'rim', rim.sum(), 'canvas', canvas.round())

buf = io.BytesIO(); Image.fromarray(tex).save(buf, 'JPEG', quality=92); new = buf.getvalue()
binary = bytes(data[bin_off:bin_off + struct.unpack_from('<I', data, 20 + jlen)[0]])
binary += b'\x00' * ((-len(binary)) % 4)
view['byteOffset'] = len(binary); view['byteLength'] = len(new); binary += new + b'\x00' * ((-len(new)) % 4)
gltf['buffers'][0]['byteLength'] = len(binary)
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
open(dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(binary)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binary), b'BIN\x00') + binary)
print('written', dst)
