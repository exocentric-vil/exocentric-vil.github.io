"""STEP assembly -> GLB, one node per logical part group.

Regenerates cad/handheld_gripper.glb, the mesh behind the 3D viewer in the
Handheld Gripper section. Run from the repository root:

    pip install gmsh numpy
    python3 tools/build_glb.py

Bump the ?v= on MODEL in cad.js afterwards, or browsers keep the old mesh.

The STEP is the only source with assembly poses -- the per-part STLs are all
print-oriented at the origin -- so the viewer mesh is built from it. Solids are
grouped by the volume match against the STL parts (see GROUPS).

Two things need care:

  * Winding. gmsh winds each face's triangles to that face's own parametric
    orientation, which has nothing to do with which side of the solid the face
    bounds, so roughly half of them come out facing inward. Backface culling
    then eats those patches and the part looks like it has holes. Adjacent
    faces do share global node tags, so orientation is propagated across each
    shell and pinned by the sign of the enclosed volume.

  * Normals. They are averaged per CAD face rather than across the whole solid,
    so patch seams stay sharp and fillets stay smooth with no angle threshold.
"""
import gmsh, numpy as np, json, struct
from collections import defaultdict

STEP = "cad/handheld_gripper.STEP"
OUT = "cad/handheld_gripper.glb"

# solid tag -> group key, resolved by matching gmsh solid volumes against the
# volumes of the individually exported STL parts. Colours are authored in sRGB
# hex (they double as the chip swatches on the page) and converted below --
# glTF baseColorFactor is linear, so writing sRGB straight in blows every part
# out to white.
GROUPS = [
    ("frame",     "Frame",            [1, 11],                            "#c9ced6", 0.05, 0.62),
    ("linkage",   "Parallel linkage", [2, 3, 4, 5, 6, 7, 12, 13, 14, 15], "#6f7d90", 0.10, 0.55),
    ("fingertip", "Fingertips",       [19, 20, 21, 22],                   "#ffcb05", 0.65, 0.34),
    ("trigger",   "Trigger",          [8, 9, 10],                         "#a7b1c0", 0.08, 0.58),
    ("holder",    "Handle",           [17],                               "#5f6e80", 0.06, 0.66),
    ("camera",    "Camera mount",     [16],                               "#4b93c9", 0.08, 0.58),
    ("aruco",     "ArUco plate",      [18],                               "#eceef2", 0.03, 0.72),
]

# Mesh density is per pass, not global: the moving parts need fine curvature
# sampling, while the ArUco plate is a big flat board whose engraved pattern
# would otherwise dominate the triangle budget.
PASSES = [
    (["linkage", "fingertip", "trigger", "camera"], 1.0, 6.0, 8),
    (["frame", "holder"], 2.5, 14.0, 4),
    (["aruco"], 4.0, 25.0, 3),
]

pos = None


def linear(hexstr):
    """sRGB hex -> linear float triple, as glTF baseColorFactor wants."""
    out = []
    for i in (1, 3, 5):
        c = int(hexstr[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


def load(keep, mn, mx, curv):
    """Mesh only `keep` solids at the given density; fills the node table."""
    global pos
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    gmsh.model.occ.importShapes(STEP)
    gmsh.model.occ.synchronize()
    drop = [(3, t) for d, t in gmsh.model.getEntities(3) if t not in keep]
    if drop:
        gmsh.model.occ.remove(drop, recursive=True)
        gmsh.model.occ.synchronize()
    gmsh.option.setNumber("Mesh.MeshSizeMin", mn)
    gmsh.option.setNumber("Mesh.MeshSizeMax", mx)
    gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", curv)
    gmsh.option.setNumber("Mesh.MeshSizeFromPoints", 0)
    gmsh.option.setNumber("Mesh.Algorithm", 6)
    gmsh.model.mesh.generate(2)
    ntags, ncoord, _ = gmsh.model.mesh.getNodes()
    pos = np.zeros((int(ntags.max()) + 1, 3))
    pos[ntags.astype(int)] = ncoord.reshape(-1, 3)


def directed(tri, flipped):
    a, b, c = tri
    return ((b, a), (a, c), (c, b)) if flipped else ((a, b), (b, c), (c, a))


def oriented_shell(solid):
    """Boundary triangles of one solid as global node tags, wound outward.

    Returns (tris, face_id). Orientation is propagated breadth-first across
    shared edges, then each connected shell is flipped as a whole if its
    enclosed volume came out negative.
    """
    tris, faces = [], []
    for dim, tag in gmsh.model.getBoundary([(3, solid)], combined=False,
                                           oriented=False):
        et, _, nodes = gmsh.model.mesh.getElements(2, abs(tag))
        for e, nd in zip(et, nodes):
            if e == 2:
                t = nd.astype(np.int64).reshape(-1, 3)
                tris.append(t)
                faces.append(np.full(len(t), abs(tag), np.int64))
    T = np.vstack(tris)
    F = np.concatenate(faces)

    edge = defaultdict(list)
    for i, (a, b, c) in enumerate(T):
        for u, v in ((a, b), (b, c), (c, a)):
            edge[(u, v) if u < v else (v, u)].append(i)

    flip = np.zeros(len(T), bool)
    seen = np.zeros(len(T), bool)
    shells = []
    for start in range(len(T)):
        if seen[start]:
            continue
        seen[start] = True
        stack = [start]
        members = [start]
        while stack:
            i = stack.pop()
            for u, v in directed(T[i], flip[i]):
                for j in edge[(u, v) if u < v else (v, u)]:
                    if j == i or seen[j]:
                        continue
                    # a consistent pair meets the shared edge in opposite
                    # directions; the same direction means j faces the other way
                    if (u, v) in directed(T[j], flip[j]):
                        flip[j] = True
                    seen[j] = True
                    members.append(j)
                    stack.append(j)
        shells.append(np.array(members))

    out = np.where(flip[:, None], T[:, ::-1], T)
    for members in shells:
        a, b, c = (pos[out[members, k]] for k in range(3))
        if np.einsum('ij,ij->i', a, np.cross(b, c)).sum() < 0:
            out[members] = out[members][:, ::-1]
    return out, F


def island(tri):
    """One CAD face's triangles as a standalone (verts, normals, idx) block,
    so its normals never average across a seam into a neighbouring face."""
    uniq, inv = np.unique(tri.ravel(), return_inverse=True)
    v = pos[uniq]
    f = inv.reshape(-1, 3)
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    fn = np.cross(b - a, c - a)             # area-weighted, so big faces win
    n = np.zeros_like(v)
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return v, np.divide(n, ln, out=np.zeros_like(n), where=ln > 1e-12), f


built = {}
for keys, mn, mx, curv in PASSES:
    wanted = [g for g in GROUPS if g[0] in keys]
    load({t for g in wanted for t in g[2]}, mn, mx, curv)
    for key, label, solids, color, metal, rough in wanted:
        V, N, F, base = [], [], [], 0
        for s in solids:
            T, face = oriented_shell(s)
            for fid in np.unique(face):
                v, n, f = island(T[face == fid])
                V.append(v); N.append(n); F.append(f + base)
                base += len(v)
        built[key] = dict(key=key, label=label, color=color,
                          metal=metal, rough=rough,
                          v=np.vstack(V), n=np.vstack(N), f=np.vstack(F))
    gmsh.finalize()

parts = [built[g[0]] for g in GROUPS]

# CAD is Z-up with the jaws along +Y; glTF is Y-up. (x, y, z) -> (x, z, -y).
allv = np.vstack([p["v"] for p in parts])
allv = np.column_stack([allv[:, 0], allv[:, 2], -allv[:, 1]])
lo, hi = allv.min(0), allv.max(0)
mid = (lo + hi) / 2
scale = 1.0 / float((hi - lo).max())

buf = bytearray()
views, accs, meshes, nodes, mats = [], [], [], [], []


def view(data, target):
    while len(buf) % 4:
        buf.append(0)
    off = len(buf)
    buf.extend(data)
    views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data),
                  "target": target})
    return len(views) - 1


for p in parts:
    # the axis swap is orientation-preserving (det = +1), so winding survives it
    v = np.column_stack([p["v"][:, 0], p["v"][:, 2], -p["v"][:, 1]])
    v = ((v - mid) * scale).astype("<f4")
    n = np.column_stack([p["n"][:, 0], p["n"][:, 2], -p["n"][:, 1]]).astype("<f4")
    f = p["f"].astype("<u4")

    accs.append({"bufferView": view(v.tobytes(), 34962), "componentType": 5126,
                 "count": len(v), "type": "VEC3",
                 "min": v.min(0).tolist(), "max": v.max(0).tolist()})
    accs.append({"bufferView": view(n.tobytes(), 34962), "componentType": 5126,
                 "count": len(n), "type": "VEC3"})
    accs.append({"bufferView": view(f.tobytes(), 34963), "componentType": 5125,
                 "count": f.size, "type": "SCALAR"})

    mats.append({"name": p["label"], "pbrMetallicRoughness": {
        "baseColorFactor": linear(p["color"]) + [1.0],
        "metallicFactor": p["metal"], "roughnessFactor": p["rough"]}})
    meshes.append({"name": p["label"], "primitives": [{
        "attributes": {"POSITION": len(accs) - 3, "NORMAL": len(accs) - 2},
        "indices": len(accs) - 1, "material": len(mats) - 1}]})
    nodes.append({"name": p["key"], "mesh": len(meshes) - 1})

gltf = {"asset": {"version": "2.0", "generator": "VIL STEP->GLB"},
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes, "meshes": meshes, "materials": mats,
        "accessors": accs, "bufferViews": views,
        "buffers": [{"byteLength": len(buf)}]}

js = json.dumps(gltf, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
bn = bytes(buf) + b"\0" * (-len(buf) % 4)
glb = (struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn))
       + struct.pack("<II", len(js), 0x4E4F534A) + js
       + struct.pack("<II", len(bn), 0x004E4942) + bn)
open(OUT, "wb").write(glb)

print("tris", sum(len(p["f"]) for p in parts), "verts", sum(len(p["v"]) for p in parts))
for p in parts:
    print("  %-18s %7d tris" % (p["label"], len(p["f"])))
print("glb %.2f MB" % (len(glb) / 1e6))
