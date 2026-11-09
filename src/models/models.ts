// Procedural power-plant models – port of Component.turbine / buildModel / ghost / setConstruction
// from reference/Main.dc.html (Three.js). Units: 1 model unit = one "game km" of the old scene,
// scaled to metres by the custom layer depending on zoom. y is up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlantType } from '../sim/constants';

export interface ModelData { rotors: THREE.Object3D[]; emit: { p: THREE.Vector3; smoke: boolean }[]; r: number }

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(h: string, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = h + JSON.stringify(o, (k, v) => (k === 'side' ? String(v) : v));
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: h, roughness: 0.85, metalness: 0, ...o }); matCache.set(key, m); }
  return m;
}

function taper(g: THREE.BufferGeometry, k: number) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const f = 1 - k * Math.max(0, y) / 1.45; p.setZ(i, p.getZ(i) * f); p.setX(i, p.getX(i) * (0.6 + 0.4 * f)); }
  g.computeVertexNormals(); return g;
}

function turbine() {
  const T = THREE; const g = new T.Group();
  const white = mat('#F3F4F2', { roughness: 0.45 }), grey = mat('#D7DCDD', { roughness: 0.5 });
  g.add(new T.Mesh(new T.CylinderGeometry(0.24, 0.3, 0.12, 14), mat('#B9B6AE')));
  const tower = new T.Mesh(new T.CylinderGeometry(0.055, 0.115, 3.2, 18), white); tower.position.y = 1.65; g.add(tower);
  const nac = new T.Mesh(new T.BoxGeometry(0.46, 0.17, 0.17), white); nac.position.set(0.07, 3.33, 0); g.add(nac);
  const nac2 = new T.Mesh(new T.BoxGeometry(0.14, 0.06, 0.1), grey); nac2.position.set(0.22, 3.44, 0); g.add(nac2);
  const rotor = new T.Group(); rotor.position.set(-0.19, 3.33, 0); g.add(rotor);
  const hub = new T.Mesh(new T.SphereGeometry(0.075, 16, 12), grey); hub.scale.set(1.4, 1, 1); rotor.add(hub);
  for (let i = 0; i < 3; i++) {
    const bg = taper(new T.BoxGeometry(0.022, 1.45, 0.1).translate(0, 0.725, 0), 0.7);
    const bl = new T.Mesh(bg, white); bl.rotation.x = i * Math.PI * 2 / 3; bl.position.x = -0.03; rotor.add(bl);
  }
  rotor.rotation.x = Math.random() * 6;
  return { g, rotor };
}

export function buildModel(type: PlantType): THREE.Group {
  const T = THREE; const root = new T.Group();
  const ud: ModelData = { emit: [], rotors: [], r: 3 };
  root.userData = ud as any;
  if (type === 'wind') {
    [[0, 0], [2.3, 0.9], [-2.2, 1.0], [1.1, -2.0], [-1.3, -2.1]].forEach((p) => { const t = turbine(); t.g.position.set(p[0], 0, p[1]); root.add(t.g); ud.rotors.push(t.rotor); });
    ud.r = 3.4;
  } else if (type === 'hydro') {
    const conc = mat('#CFCAC0', { roughness: 0.75 }), conc2 = mat('#B8B2A6', { roughness: 0.8 });
    const R = 3.1, segs = 14, span = 1.5;
    for (let i = 0; i < segs; i++) {
      const a0 = -span / 2 + span * i / segs, a1 = -span / 2 + span * (i + 1) / segs, am = (a0 + a1) / 2;
      const len = 2 * R * Math.sin((a1 - a0) / 2) + 0.02;
      const m = new T.Mesh(new T.BoxGeometry(0.5, 2.2, len), i % 2 ? conc : conc2);
      m.position.set(-Math.cos(am) * R + R, 0.3, Math.sin(am) * R); m.rotation.y = -am; root.add(m);
      const top = new T.Mesh(new T.BoxGeometry(0.62, 0.08, len), mat('#E7E3DB')); top.position.set(m.position.x, 1.44, m.position.z); top.rotation.y = -am; root.add(top);
    }
    const resv = new T.Mesh(new T.CircleGeometry(1, 40, Math.PI / 2, Math.PI), mat('#2F78B5', { roughness: 0.1, metalness: 0.1 }));
    resv.rotation.x = -Math.PI / 2; resv.scale.set(3.6, 3.0, 1); resv.position.set(-0.05, 1.05, 0); root.add(resv);
    const ph = new T.Mesh(new T.BoxGeometry(1.3, 0.8, 2.0), mat('#E6E0D5')); ph.position.set(1.2, 0.0, 0); root.add(ph);
    const roof = new T.Mesh(new T.BoxGeometry(1.36, 0.08, 2.06), mat('#59666E')); roof.position.set(1.2, 0.44, 0); root.add(roof);
    const win = new T.Mesh(new T.BoxGeometry(0.02, 0.18, 1.6), mat('#3C4E5A', { roughness: 0.3 })); win.position.set(1.86, 0.12, 0); root.add(win);
    const spill = new T.Mesh(new T.PlaneGeometry(1.2, 0.8), mat('#B9E3F5', { transparent: true, opacity: 0.85, roughness: 0.2, side: T.DoubleSide }));
    spill.rotation.set(0, Math.PI / 2, -0.95); spill.position.set(0.55, 0.85, 0); root.add(spill);
    const foam = new T.Mesh(new T.BoxGeometry(0.9, 0.08, 1.0), mat('#F4FBFE')); foam.position.set(0.9, 0.42, 0); root.add(foam);
    const tail = new T.Mesh(new T.PlaneGeometry(2.4, 1.0), mat('#2F78B5', { roughness: 0.12 }));
    tail.rotation.x = -Math.PI / 2; tail.position.set(2.2, 0.3, 0); root.add(tail);
    [[1.6, 1.5], [1.6, -1.5]].forEach((p) => {
      const pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.06, 1.6, 6), mat('#8A9096', { metalness: 0.4 })); pole.position.set(p[0], 0.8, p[1]); root.add(pole);
      const arm = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 0.6), mat('#8A9096', { metalness: 0.4 })); arm.position.set(p[0], 1.5, p[1]); root.add(arm);
    });
    ud.r = 3.4;
  } else if (type === 'nuclear') {
    const conc = mat('#E6E2DA', { roughness: 0.7 }), conc2 = mat('#CFC8BC'), roofM = mat('#79828A'), dark = mat('#4B5860', { roughness: 0.4 });
    const pad = new T.Mesh(new T.BoxGeometry(10.5, 2, 7.6), mat('#A8A497', { roughness: 1 })); pad.position.y = -0.98; root.add(pad);
    const prof = [[2.0, 0], [1.66, 0.9], [1.36, 2.1], [1.26, 3.0], [1.31, 3.7], [1.44, 4.25]].map((q) => new T.Vector2(q[0], q[1]));
    [[-2.9, -1.9], [-2.9, 2.0]].forEach((p) => {
      const ct = new T.Mesh(new T.LatheGeometry(prof, 48), mat('#DAD4CB', { side: T.DoubleSide, roughness: 0.9 })); ct.position.set(p[0], -0.05, p[1]); root.add(ct);
      const rim = new T.Mesh(new T.TorusGeometry(1.44, 0.04, 6, 48), mat('#B7B0A4')); rim.rotation.x = Math.PI / 2; rim.position.set(p[0], 4.2, p[1]); root.add(rim);
      ud.emit.push({ p: new T.Vector3(p[0], 4.3, p[1]), smoke: false });
      ud.emit.push({ p: new T.Vector3(p[0] + 0.5, 4.3, p[1] - 0.4), smoke: false });
    });
    [[1.2, -1.5], [1.2, 1.5]].forEach((p) => {
      const cyl = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 1.7, 40), conc); cyl.position.set(p[0], 0.85, p[1]); root.add(cyl);
      const dome = new T.Mesh(new T.SphereGeometry(1.0, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), conc); dome.position.set(p[0], 1.7, p[1]); root.add(dome);
      const ring = new T.Mesh(new T.CylinderGeometry(1.02, 1.02, 0.12, 40), mat('#B9B3A8')); ring.position.set(p[0], 1.2, p[1]); root.add(ring);
    });
    const hall = new T.Mesh(new T.BoxGeometry(1.7, 1.2, 5.0), conc2); hall.position.set(3.3, 0.6, 0); root.add(hall);
    const hroof = new T.Mesh(new T.BoxGeometry(1.76, 0.1, 5.06), roofM); hroof.position.set(3.3, 1.25, 0); root.add(hroof);
    const ws = new T.Mesh(new T.BoxGeometry(0.02, 0.18, 4.4), dark); ws.position.set(4.16, 0.75, 0); root.add(ws);
    const stack = new T.Mesh(new T.CylinderGeometry(0.1, 0.16, 4.8, 14), mat('#ECE8E2')); stack.position.set(1.2, 2.4, 0); root.add(stack);
    [0.94, 0.84].forEach((f) => { const band = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.2, 14), mat('#B8432F')); band.position.set(1.2, 4.8 * f, 0); root.add(band); });
    const yard = new T.Mesh(new T.BoxGeometry(1.2, 0.08, 2.4), mat('#8E9398', { metalness: 0.3 })); yard.position.set(4.7, 0.05, -2.6); root.add(yard);
    for (let i = 0; i < 3; i++) { const tr = new T.Mesh(new T.BoxGeometry(0.4, 0.45, 0.5), mat('#6D7A84', { metalness: 0.3 })); tr.position.set(4.7, 0.3, -3.4 + i * 0.8); root.add(tr); }
    ud.r = 5.2;
  } else if (type === 'battery') {
    const pad = new T.Mesh(new T.BoxGeometry(6.2, 0.12, 3.4), mat('#B9B6AE', { roughness: 1 })); pad.position.y = 0.0; root.add(pad);
    const cont = new T.BoxGeometry(0.95, 0.5, 0.42), contM = mat('#E9EDEF', { roughness: 0.5 }), ventM = mat('#5B6870', { roughness: 0.5 }), vent = new T.BoxGeometry(0.7, 0.12, 0.02);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) {
      const x = -2.3 + c * 1.1, z = -0.7 + r * 1.3;
      const b = new T.Mesh(cont, contM); b.position.set(x, 0.31, z); root.add(b);
      const v = new T.Mesh(vent, ventM); v.position.set(x, 0.4, z + (r ? 0.22 : -0.22)); root.add(v);
    }
    const tr = new T.Mesh(new T.BoxGeometry(0.6, 0.55, 0.6), mat('#7C8A93', { metalness: 0.3 })); tr.position.set(2.75, 0.33, 0); root.add(tr);
    [-1.4, 1.4].forEach((z) => { const pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.05, 1.3, 6), mat('#8A9096', { metalness: 0.4 })); pole.position.set(2.75, 0.7, z); root.add(pole); });
    ud.r = 3.2;
  } else if (type === 'pumped') {
    const mound = new T.Mesh(new T.CylinderGeometry(2.7, 3.6, 1.5, 40), mat('#7C8F5A', { roughness: 1 })); mound.position.set(-1.5, 0.6, 0); root.add(mound);
    const rim = new T.Mesh(new T.CylinderGeometry(2.6, 2.7, 0.35, 48, 1, true), mat('#CFCAC0', { side: T.DoubleSide })); rim.position.set(-1.5, 1.5, 0); root.add(rim);
    const up = new T.Mesh(new T.CircleGeometry(2.55, 48), mat('#2F78B5', { roughness: 0.1, metalness: 0.1 })); up.rotation.x = -Math.PI / 2; up.position.set(-1.5, 1.6, 0); root.add(up);
    const pipe = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 3.6, 16), mat('#6E7A82', { metalness: 0.5, roughness: 0.4 })); pipe.position.set(1.4, 0.85, 0); pipe.rotation.z = 1.18; root.add(pipe);
    const ph = new T.Mesh(new T.BoxGeometry(1.4, 0.8, 1.6), mat('#E6E0D5')); ph.position.set(3.2, 0.25, 0); root.add(ph);
    const roof = new T.Mesh(new T.BoxGeometry(1.46, 0.08, 1.66), mat('#59666E')); roof.position.set(3.2, 0.68, 0); root.add(roof);
    const low = new T.Mesh(new T.CircleGeometry(1.2, 40), mat('#2F78B5', { roughness: 0.1 })); low.rotation.x = -Math.PI / 2; low.position.set(4.7, 0.08, 0); root.add(low);
    ud.r = 4.6;
  } else if (type === 'solar') {
    const panelG = new T.BoxGeometry(0.92, 0.04, 0.62), legG = new T.BoxGeometry(0.05, 1, 0.05);
    const panelM = mat('#1F3B60', { roughness: 0.22, metalness: 0.55 }), frameM = mat('#B9BEC2', { metalness: 0.5, roughness: 0.4 });
    for (let rz = -2; rz <= 2; rz++) {
      const row = new T.Group(); row.position.set(0, 0, rz * 1.05);
      for (let cx = -3; cx <= 2; cx++) {
        const x = cx * 1.0 + 0.5;
        const pn = new T.Mesh(panelG, panelM); pn.position.set(x, 0.5, 0); pn.rotation.x = 0.55; row.add(pn);
        const back = new T.Mesh(legG, frameM); back.scale.y = 0.62; back.position.set(x, 0.31, -0.2); row.add(back);
        const front = new T.Mesh(legG, frameM); front.scale.y = 0.34; front.position.set(x, 0.17, 0.2); row.add(front);
      }
      root.add(row);
    }
    const inv = new T.Mesh(new T.BoxGeometry(0.6, 0.55, 0.9), mat('#E3E6E8')); inv.position.set(3.8, 0.27, 0); root.add(inv);
    const invT = new T.Mesh(new T.BoxGeometry(0.64, 0.06, 0.94), mat('#8A9399')); invT.position.set(3.8, 0.58, 0); root.add(invT);
    ud.r = 4.0;
  } else {
    const wall = mat('#CEC7BB'), wall2 = mat('#BAB2A6'), dark = mat('#4B5860', { roughness: 0.4 }), roofM = mat('#79828A');
    const pad = new T.Mesh(new T.BoxGeometry(8, 2, 5.6), mat('#A39E90', { roughness: 1 })); pad.position.y = -0.98; root.add(pad);
    const hall = new T.Mesh(new T.BoxGeometry(3.4, 1.3, 1.7), wall); hall.position.set(0.6, 0.65, 0.4); root.add(hall);
    const hr = new T.Mesh(new T.BoxGeometry(3.46, 0.1, 1.76), roofM); hr.position.set(0.6, 1.33, 0.4); root.add(hr);
    const boiler = new T.Mesh(new T.BoxGeometry(1.5, 2.3, 1.5), wall2); boiler.position.set(1.4, 1.15, -1.2); root.add(boiler);
    const br = new T.Mesh(new T.BoxGeometry(1.56, 0.1, 1.56), roofM); br.position.set(1.4, 2.33, -1.2); root.add(br);
    const ws = new T.Mesh(new T.BoxGeometry(3.0, 0.16, 0.02), dark); ws.position.set(0.6, 0.85, 1.26); root.add(ws);
    const ws2 = new T.Mesh(new T.BoxGeometry(3.0, 0.16, 0.02), dark); ws2.position.set(0.6, 0.45, 1.26); root.add(ws2);
    [[0.4, -1.5], [2.5, -1.4]].forEach((p, i) => {
      const hgt = i ? 4.4 : 5.4;
      const ch = new T.Mesh(new T.CylinderGeometry(0.15, 0.24, hgt, 18), mat('#ECE8E2')); ch.position.set(p[0], hgt / 2, p[1]); root.add(ch);
      [0.92, 0.8, 0.68].forEach((f) => { const band = new T.Mesh(new T.CylinderGeometry(0.17 + (1 - f) * 0.09, 0.17 + (1 - f) * 0.09, 0.22, 18), mat('#B8432F')); band.position.set(p[0], hgt * f, p[1]); root.add(band); });
      ud.emit.push({ p: new T.Vector3(p[0], hgt + 0.1, p[1]), smoke: true });
    });
    const prof = [[1.3, 0], [1.08, 0.6], [0.9, 1.4], [0.84, 2.0], [0.87, 2.45], [0.95, 2.8]].map((q) => new T.Vector2(q[0], q[1]));
    [[-2.4, 1.0], [-2.4, -1.4]].forEach((p) => {
      const ct = new T.Mesh(new T.LatheGeometry(prof, 40), mat('#D9D3CA', { side: T.DoubleSide, roughness: 0.9 })); ct.position.set(p[0], -0.05, p[1]); root.add(ct);
      const rim = new T.Mesh(new T.TorusGeometry(0.95, 0.03, 6, 40), mat('#B7B0A4')); rim.rotation.x = Math.PI / 2; rim.position.set(p[0], 2.75, p[1]); root.add(rim);
      ud.emit.push({ p: new T.Vector3(p[0], 2.8, p[1]), smoke: false });
    });
    [[3.0, 1.6, 0.9], [3.3, 0.2, 0.7]].forEach((p) => { const pile = new T.Mesh(new T.ConeGeometry(p[2], p[2] * 0.7, 9), mat('#242528', { roughness: 0.95, flatShading: true })); pile.position.set(p[0], p[2] * 0.35, p[1]); root.add(pile); });
    const conv = new T.Mesh(new T.BoxGeometry(1.7, 0.08, 0.14), mat('#6A6157')); conv.position.set(2.5, 0.9, -0.3); conv.rotation.z = -0.5; root.add(conv);
    ud.r = 4.2;
  }
  mergeStatic(root);
  return root;
}

/** merges meshes that share a material into one mesh (per group: root and each rotor) → few draw calls */
function mergeStatic(root: THREE.Group) {
  const groups: THREE.Object3D[] = [root, ...(root.userData as ModelData).rotors];
  root.updateMatrixWorld(true);
  for (const g of groups) {
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const byMat = new Map<THREE.Material, THREE.Mesh[]>();
    g.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      // owner group of this mesh = the nearest ancestor in `groups`
      let q: THREE.Object3D | null = m.parent; while (q && !groups.includes(q)) q = q.parent;
      if (q !== g) return;
      const k = m.material as THREE.Material; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k)!.push(m);
    });
    for (const [material, meshes] of byMat) {
      if (meshes.length < 2) continue;
      const geos = meshes.map((m) => { const gg = m.geometry.index ? m.geometry.clone() : m.geometry.clone(); gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); return gg; });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      meshes.forEach((m) => m.parent!.remove(m));
      g.add(new THREE.Mesh(merged, material));
    }
  }
  // remove now-empty helper groups (solar rows)
  root.children.filter((c) => c.type === 'Group' && c.children.length === 0).forEach((c) => root.remove(c));
}

// ---------- ghost (drag preview), construction look, smoke ----------
export const ghostMat = new THREE.MeshStandardMaterial({ color: '#3BD16F', emissive: '#1A7A43', emissiveIntensity: 0.5, transparent: true, opacity: 0.6, depthWrite: false });
export const consMat = new THREE.MeshStandardMaterial({ color: '#E8D9B5', transparent: true, opacity: 0.8, roughness: 0.9 });
export const alarmMat = new THREE.MeshBasicMaterial({ color: '#E5533D', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });

export function makeGhost(type: PlantType): THREE.Group {
  const g = buildModel(type);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = ghostMat; });
  const r = (g.userData as ModelData).r;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 56), ghostMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; g.add(ring);
  return g;
}
export function setGhostOk(ok: boolean) {
  ghostMat.color.set(ok ? '#3BD16F' : '#E5533D'); ghostMat.emissive.set(ok ? '#1A7A43' : '#8E2A17');
}

/** scaffolding look while a plant is being built (setConstruction) */
export function setConstruction(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || m.userData.alarm || m.userData.puff) return;
    if (on) { if (!m.userData.realMat) m.userData.realMat = m.material; m.material = consMat; }
    else if (m.userData.realMat) { m.material = m.userData.realMat; m.userData.realMat = null; }
  });
}

/** a red ring that blinks while a plant is (partly) shut down */
export function makeAlarm(r: number) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r * 1.04, 56), alarmMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; ring.userData.alarm = true; ring.visible = false;
  return ring;
}

/** steam / smoke puffs (camera-independent spheres instead of sprites) */
const puffGeo = new THREE.IcosahedronGeometry(1, 1);
export interface Puff { mesh: THREE.Mesh; base: THREE.Vector3; age: number; life: number; size: number; smoke: boolean }
export function makePuffs(root: THREE.Group): Puff[] {
  const out: Puff[] = [];
  for (const em of (root.userData as ModelData).emit) {
    for (let i = 0; i < 9; i++) {
      const m = new THREE.MeshLambertMaterial({ color: em.smoke ? '#8F949A' : '#FFFFFF', transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new THREE.Mesh(puffGeo, m); mesh.userData.puff = true; root.add(mesh);
      out.push({ mesh, base: em.p.clone(), age: (i / 9) * 4.5, life: 4.5, size: em.smoke ? 0.35 : 0.7, smoke: em.smoke });
    }
  }
  return out;
}
export function animatePuffs(puffs: Puff[], dt: number, on: boolean) {
  for (const s of puffs) {
    s.age += dt; if (s.age > s.life) s.age -= s.life;
    const k = s.age / s.life;
    s.mesh.position.set(s.base.x + k * 1.6, s.base.y + k * (s.smoke ? 2.6 : 2.0), s.base.z - k * 0.6);
    const scl = s.size * (0.5 + k * 1.6); s.mesh.scale.setScalar(scl);
    (s.mesh.material as THREE.MeshLambertMaterial).opacity = on ? (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88) * (s.smoke ? 0.55 : 0.75) : 0;
    s.mesh.visible = on;
  }
}
