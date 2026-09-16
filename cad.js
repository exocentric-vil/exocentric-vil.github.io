/* Interactive view of the handheld gripper CAD assembly.

   The mesh is baked from the STEP assembly into cad/handheld_gripper.glb, one
   node per functional group, so a part can be isolated without a second file.
   The 2 MB payload is deferred until the section scrolls into view -- it must
   not compete with the teaser video for the opening bandwidth. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL = 'cad/handheld_gripper.glb?v=2';

/* Keys match the node names written by the GLB builder. The blurb is what the
   part contributes to the pipeline, not what it is. */
const PARTS = [
  {
    key: 'aruco', label: 'ArUco plate', swatch: '#eceef2',
    blurb: 'A marker board carried by the gripper and read by the exocentric camera. '
      + 'It supplies the end-effector pose through the final approach, where ORB-SLAM3 '
      + 'turns fragile against a close, low-context surface.'
  },
  {
    key: 'camera', label: 'Camera mount', swatch: '#4b93c9',
    blurb: 'Carries the egocentric camera that travels with the gripper.'
  },
  {
    key: 'trigger', label: 'Trigger', swatch: '#a7b1c0',
    blurb: 'An infrared sensor in the handle reads trigger travel and maps it to '
      + 'gripper width. That scalar is the gripper action label, so no fingertip '
      + 'markers are needed to measure the opening.'
  },
  {
    key: 'linkage', label: 'Parallel linkage', swatch: '#6f7d90',
    blurb: 'A four-bar linkage per side, copied from the Robotiq 2F-85, holds the '
      + 'fingertips parallel across the full 80 mm stroke &mdash; so one recorded width '
      + 'reproduces the same grasp on the robot.'
  },
  {
    key: 'fingertip', label: 'Fingertips', swatch: '#ffcb05',
    blurb: 'The only parts not 3D printed: '
      + 'metal is kept for tactile fidelity. They are identical to the robot\'s, '
      + 'which is what makes a demonstration grasp transfer unchanged.'
  },
  {
    key: 'frame', label: 'Frame', swatch: '#c9ced6',
    blurb: 'Upper and lower base plates tie the linkage to the handle.'
  },
  {
    key: 'holder', label: 'Handle', swatch: '#5f6e80',
    blurb: 'Where the operator grips the rig, and where the trigger sensor lives.'
  }
];

const INTRO = 'The rig weighs 550&nbsp;g at 300&nbsp;&times;&nbsp;155&nbsp;&times;&nbsp;255&nbsp;mm '
  + 'and streams images and gripper width at 30&nbsp;Hz.';

const REDUCED = window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const host = document.getElementById('cad');
if (host) init(host);

function init(root) {
  const stage = root.querySelector('.cad-stage');
  const canvas = root.querySelector('#cad-canvas');
  const status = root.querySelector('#cad-status');
  const chips = root.querySelector('#cad-parts');
  const caption = root.querySelector('#cad-caption');
  const spin = root.querySelector('#cad-spin');

  caption.innerHTML = INTRO;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    /* No WebGL: the section still has to say what the thing is, and the
       download link below it still works. */
    status.textContent = 'This browser cannot display the 3D model.';
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.70;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#012a4f');

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;

  /* Ambient fill comes first and does not depend on the environment map: if
     PMREM fails on a given GPU the parts must still be lit, not silhouettes. */
  scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x0b2237, 1.1));

  /* The fill alone leaves the printed parts flat, so a soft key picks out the
     linkage edges. All of these stay low: PBR plus ACES clips fast, and the
     light greys are already near the top of the range. */
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(-2, 2.5, -2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd4ea, 0.3);
  fill.position.set(3, 0.5, 2);
  scene.add(fill);
  /* Behind the model relative to the opening camera: it outlines the darker
     parts, which would otherwise sink into a navy stage of the same value. */
  const rim = new THREE.DirectionalLight(0x9fc4e4, 0.5);
  rim.position.set(-1.7, -0.8, 1.9);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  camera.position.set(0.97, 0.45, -1.11);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.6;
  controls.maxDistance = 3.2;
  controls.autoRotateSpeed = 1.1;
  controls.autoRotate = !REDUCED;

  /* Grabbing the model is a statement of intent -- keep it where the reader
     left it rather than drifting out from under them. */
  controls.addEventListener('start', () => setSpin(false));

  function setSpin(on) {
    controls.autoRotate = on;
    spin.innerHTML = on ? '&#10074;&#10074;' : '&#9654;';
    spin.setAttribute('aria-label', on ? 'Pause rotation' : 'Rotate model');
  }
  spin.addEventListener('click', () => setSpin(!controls.autoRotate));
  setSpin(!REDUCED);

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  /* ------------------------------------------------------- part selection */

  /* Ghosted parts stack a dozen transparent surfaces along every ray, so the
     per-surface opacity has to stay very low or the body as a whole ends up
     brighter than the part being isolated. */
  const ghost = new THREE.MeshStandardMaterial({
    color: 0x4a6b8c, roughness: 1, metalness: 0,
    transparent: true, opacity: 0.035, depthWrite: false
  });
  const nodes = new Map();
  let picked = null;

  function select(k) {
    picked = picked === k ? null : k;
    nodes.forEach((node, name) => {
      const dim = picked && name !== picked;
      node.mesh.material = dim ? ghost : node.material;
      node.mesh.renderOrder = dim ? -1 : 0;
    });
    Array.from(chips.children).forEach((b) => {
      const on = b.dataset.part === picked;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const part = PARTS.find((p) => p.key === picked);
    caption.innerHTML = part
      ? '<b>' + part.label + '.</b> ' + part.blurb
      : INTRO;
  }

  PARTS.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cad-chip';
    b.dataset.part = p.key;
    b.setAttribute('aria-pressed', 'false');
    const dot = document.createElement('i');
    dot.style.background = p.swatch;
    b.appendChild(dot);
    b.appendChild(document.createTextNode(p.label));
    b.addEventListener('click', () => select(p.key));
    chips.appendChild(b);
  });

  /* ------------------------------------------------------------ deferred load */

  let started = false;
  const io = new IntersectionObserver((entries) => {
    if (started || !entries.some((e) => e.isIntersecting)) return;
    started = true;
    io.disconnect();
    load();
  }, { rootMargin: '400px' });
  io.observe(root);

  function load() {
    new GLTFLoader().load(MODEL, (gltf) => {
      /* A single-primitive glTF node collapses into one Mesh that inherits the
         node name, but a multi-primitive one would nest under it -- so accept
         the name from either level, and only if it is a part key. */
      const keys = new Set(PARTS.map((p) => p.key));
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const name = keys.has(o.name) ? o.name
          : (o.parent && keys.has(o.parent.name) ? o.parent.name : null);
        if (!name) return;
        o.material.envMapIntensity = 0.7;
        nodes.set(name, { mesh: o, material: o.material });
      });
      scene.add(gltf.scene);

      const box = new THREE.Box3().setFromObject(gltf.scene);
      const c = box.getCenter(new THREE.Vector3());
      controls.target.copy(c);
      camera.position.copy(c).add(new THREE.Vector3(0.97, 0.45, -1.11));
      controls.update();

      status.hidden = true;
      stage.classList.add('is-ready');
    }, (e) => {
      if (e.lengthComputable) {
        status.textContent = 'Loading model … '
          + Math.round((e.loaded / e.total) * 100) + '%';
      }
    }, () => {
      status.textContent = 'The 3D model could not be loaded.';
    });
  }
}
