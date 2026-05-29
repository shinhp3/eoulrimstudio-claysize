(function(){
'use strict';

const D = window.ClaySizeData;
const wetToFired = D.wetToFired;
const getClayById = D.getClayById;

let SESSION = null;
let shrinkageRate = 12;
let clayInfo = null;
let studioInited = false;

const PRESET_LABELS = {
  cylinder: '원통',
  vase: '화병',
  plate: '접시',
  ricebowl: '밥그릇',
};

// 데스크톱: 넓은 화면 + 마우스(정밀 포인터·hover). 그 외는 모바일 UI.
const MQ_DESKTOP = '(min-width: 1025px) and (hover: hover) and (pointer: fine)';
const desktopMq = window.matchMedia(MQ_DESKTOP);

function updateLayoutMode() {
  document.documentElement.classList.toggle('layout-desktop', desktopMq.matches);
}

function isMobileLayout() {
  return !document.documentElement.classList.contains('layout-desktop');
}

updateLayoutMode();
desktopMq.addEventListener('change', updateLayoutMode);
window.addEventListener('resize', updateLayoutMode);
window.addEventListener('orientationchange', updateLayoutMode);

const canvas = document.getElementById('c');

function canvasRect() {
  return canvas.getBoundingClientRect();
}

function resizeRenderer() {
  const r = canvasRect();
  const w = Math.max(1, r.width);
  const h = Math.max(1, r.height);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// ── Scene (Toss TDS palette) ─────────────────────────────────────────────────
const BG = 0xf9fafb;
const CLAY = 0x082a52;    // clay blue (deeper)
const ACCENT = 0x3182f6;
const GUIDE = 0x1d4ed8;   // size box outline (darker than accent)
const WALL_THICKNESS_CM = 0.3; // fixed 3mm

const SIZE_MIN = 0.5;
const SIZE_LIMIT = 40;
let SIZE_MAX = SIZE_LIMIT;
let H_MAX = SIZE_LIMIT;
let W_MAX = SIZE_LIMIT;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.004);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
resizeRenderer();

window.addEventListener('resize', resizeRenderer);
window.addEventListener('orientationchange', () => setTimeout(resizeRenderer, 150));

// mode를 ResizeObserver보다 먼저 선언 — 콜백이 동기 실행될 때 TDZ 방지
let mode = 'idle'; // 'sculpt' | 'orbit' | 'pinch'

const viewportEl = document.getElementById('viewport');
if (viewportEl) {
  new ResizeObserver(() => {
    resizeRenderer();
    if (mode === 'idle') fitCamera();
  }).observe(viewportEl);
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => {
    viewportEl.addEventListener(ev, e => e.preventDefault(), { passive: false });
  });
}

// ── Lights ────────────────────────────────────────────────────────────────────
// 주변광: 낮게 유지해야 그림자가 살아남
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// 하늘/바닥 반사광 (부드러운 bounce light)
const hemi = new THREE.HemisphereLight(0xdbeafe, 0xf2f4f6, 0.6);
scene.add(hemi);

// 키 라이트 (DirectionalLight — SpotLight보다 일관된 그림자)
const key = new THREE.DirectionalLight(0xffffff, 2.8);
key.position.set(25, 50, 35);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.001;
key.shadow.normalBias = 0.02;
key.shadow.camera.near = 1;
key.shadow.camera.far = 200;
key.shadow.camera.left   = -60;
key.shadow.camera.right  =  60;
key.shadow.camera.top    =  60;
key.shadow.camera.bottom = -60;
scene.add(key);

// 보조광 (반대편 부드럽게 채우기)
const fill = new THREE.DirectionalLight(0xe8f3ff, 0.6);
fill.position.set(-20, 10, -15);
scene.add(fill);

// ── Scale: 1 Three.js unit = 1 cm ───────────────────────────────────────────
const N = 30, SEG = 80;
const MIN_R = 0.05;
let MAX_R = SIZE_LIMIT / 2;

function clampDim(cm, min, max) {
  return Math.max(min, Math.min(max, Math.round(cm * 2) / 2));
}

function getActualSize() {
  const ys = profile.map(p => p.y);
  const rs = profile.map(p => p.r);
  const height = Math.max(...ys) - Math.min(...ys);
  const diameter = Math.max(...rs) * 2;
  return { height, diameter, maxR: Math.max(...rs) };
}

// ── Presets (가로 cm × 높이 cm) ─────────────────────────────────────────────
const PRESETS = {
  cylinder: { widthCm: 10,  heightCm: 10 },
  vase:     { widthCm: 7.5, heightCm: 13 },
  plate:    { widthCm: 19,  heightCm: 2.5 },
  ricebowl: { widthCm: 11,  heightCm: 6 },
};

// 사용자 조각 접시 (19×2.5 cm) — exportClayProfile() 로보낸 형태
const PLATE_PROFILE_BAKED = [
  { r: 6.826, y: -1.25 }, { r: 6.916, y: -1.164 }, { r: 7.007, y: -1.078 },
  { r: 7.101, y: -0.991 }, { r: 7.198, y: -0.905 }, { r: 7.299, y: -0.819 },
  { r: 7.405, y: -0.733 }, { r: 7.516, y: -0.647 }, { r: 7.633, y: -0.56 },
  { r: 7.756, y: -0.474 }, { r: 7.883, y: -0.388 }, { r: 8.013, y: -0.302 },
  { r: 8.146, y: -0.216 }, { r: 8.28, y: -0.129 }, { r: 8.414, y: -0.043 },
  { r: 8.546, y: 0.043 }, { r: 8.674, y: 0.129 }, { r: 8.797, y: 0.216 },
  { r: 8.915, y: 0.302 }, { r: 9.027, y: 0.388 }, { r: 9.132, y: 0.474 },
  { r: 9.231, y: 0.56 }, { r: 9.325, y: 0.647 }, { r: 9.413, y: 0.733 },
  { r: 9.497, y: 0.819 }, { r: 9.577, y: 0.905 }, { r: 9.655, y: 0.991 },
  { r: 9.731, y: 1.078 }, { r: 9.806, y: 1.164 }, { r: 9.88, y: 1.25 }
];

// 사용자 조각 밥그릇 (11×6 cm) — exportClayProfile() 로보낸 형태
const RICEBOWL_PROFILE_BAKED = [
  { r: 2.887, y: -3 }, { r: 3.063, y: -2.7 }, { r: 3.24, y: -2.425 },
  { r: 3.418, y: -2.18 }, { r: 3.597, y: -1.945 }, { r: 3.772, y: -1.716 },
  { r: 3.941, y: -1.492 }, { r: 4.1, y: -1.271 }, { r: 4.249, y: -1.054 },
  { r: 4.385, y: -0.839 }, { r: 4.51, y: -0.625 }, { r: 4.624, y: -0.414 },
  { r: 4.729, y: -0.205 }, { r: 4.826, y: 0.003 }, { r: 4.915, y: 0.21 },
  { r: 4.998, y: 0.415 }, { r: 5.074, y: 0.619 }, { r: 5.145, y: 0.822 },
  { r: 5.21, y: 1.024 }, { r: 5.271, y: 1.225 }, { r: 5.326, y: 1.425 },
  { r: 5.378, y: 1.625 }, { r: 5.425, y: 1.823 }, { r: 5.469, y: 2.021 },
  { r: 5.509, y: 2.218 }, { r: 5.546, y: 2.415 }, { r: 5.58, y: 2.61 },
  { r: 5.612, y: 2.805 }, { r: 5.643, y: 3 }
];

function cloneProfile(pts) {
  return pts.map(p => ({ r: p.r, y: p.y }));
}

function lerpKeyframes(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

// Celadon pear vase: 받침 → 하부 볼록(최대 직경) → S자 어깨·목 → 얇은 입술
function vaseShape(t) {
  return lerpKeyframes(t, [
    [0,    0.36],
    [0.04, 0.40],
    [0.08, 0.44],
    [0.16, 0.72],
    [0.26, 0.94],
    [0.32, 1.00],
    [0.42, 0.90],
    [0.54, 0.76],
    [0.64, 0.58],
    [0.74, 0.40],
    [0.82, 0.28],
    [0.90, 0.26],
    [0.96, 0.30],
    [1.0,  0.34],
  ]);
}

function smoothProfileOnce(pts) {
  const last = pts.length - 1;
  return pts.map((p, i, a) => ({
    ...p,
    r: i === 0 || i === last
      ? p.r
      : a[i - 1].r * 0.25 + p.r * 0.5 + a[i + 1].r * 0.25
  }));
}

function smoothProfile(pts, passes = 1) {
  let out = pts;
  for (let k = 0; k < passes; k++) out = smoothProfileOnce(out);
  return out;
}

const REFINE_STRENGTH = 1.5;

/** 다듬기: 1회 스무딩 방향으로 strength배만큼 반영 (끝단 고정) */
function refineProfile(pts, strength = REFINE_STRENGTH) {
  const smoothed = smoothProfileOnce(pts);
  const last = pts.length - 1;
  return pts.map((p, i) => ({
    y: p.y,
    r: i === 0 || i === last
      ? p.r
      : Math.max(MIN_R, Math.min(MAX_R, p.r + strength * (smoothed[i].r - p.r)))
  }));
}

function makeProfile(type) {
  if (type === 'plate') return cloneProfile(PLATE_PROFILE_BAKED);
  if (type === 'ricebowl') return cloneProfile(RICEBOWL_PROFILE_BAKED);

  const baseR = widthCm / 2;
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = i/(N-1), y = -PHT/2 + t*PHT;
    let mul = 1;
    if (type === 'vase') mul = vaseShape(t);
    out.push({ r: Math.max(MIN_R, baseR * mul), y });
  }
  if (type === 'vase') return smoothProfile(out, 2);
  return out;
}

let widthCm = PRESETS.cylinder.widthCm;
let heightCm = PRESETS.cylinder.heightCm;
let PHT = heightCm;
let profile = makeProfile('cylinder');
let lastPreset = 'cylinder';

const HISTORY_MAX = 40;
const undoStack = [];
const redoStack = [];

function captureHistoryState() {
  return {
    profile: cloneProfile(profile),
    widthCm,
    heightCm,
    PHT,
    lastPreset
  };
}

function applyHistoryState(snap) {
  profile = cloneProfile(snap.profile);
  widthCm = snap.widthCm;
  heightCm = snap.heightCm;
  PHT = snap.heightCm;
  lastPreset = snap.lastPreset;
  createClay();
  syncUI();
  updateActualSizeDisplay();
  updateFloor();
}

function updateHistoryButtons() {
  const undoDisabled = undoStack.length === 0;
  const redoDisabled = redoStack.length === 0;
  ['btnUndo', 'btnUndoM'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = undoDisabled;
  });
  ['btnRedo', 'btnRedoM'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = redoDisabled;
  });
}

function pushUndoState() {
  undoStack.push(captureHistoryState());
  if (undoStack.length > HISTORY_MAX) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function clearHistoryStacks() {
  undoStack.length = 0;
  redoStack.length = 0;
  updateHistoryButtons();
}

function undoProfile() {
  if (!undoStack.length) return;
  redoStack.push(captureHistoryState());
  if (redoStack.length > HISTORY_MAX) redoStack.shift();
  applyHistoryState(undoStack.pop());
  updateHistoryButtons();
  setStatus('되돌아가기');
}

function redoProfile() {
  if (!redoStack.length) return;
  undoStack.push(captureHistoryState());
  if (undoStack.length > HISTORY_MAX) undoStack.shift();
  applyHistoryState(redoStack.pop());
  updateHistoryButtons();
  setStatus('되돌리기');
}

// ── Clay meshes: outer + inner wall (5mm) + solid bottom cap ────────────────
const clayMat = new THREE.MeshStandardMaterial({
  color: CLAY, roughness: 0.55, metalness: 0.0,
});

let clayGroup = null;
let clayWall = null;
let clayBottom = null;

function innerRadius(outerR) {
  return Math.max(0.02, outerR - WALL_THICKNESS_CM);
}

// Closed cross-section: outer wall → top rim → inner wall → bottom rim (5mm wall)
function makeWallShellPoints() {
  const pts = [];
  profile.forEach(p => pts.push(new THREE.Vector2(p.r, p.y)));
  for (let i = profile.length - 1; i >= 0; i--) {
    pts.push(new THREE.Vector2(innerRadius(profile[i].r), profile[i].y));
  }
  return pts;
}

function disposeClayPart(mesh) {
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.material.dispose();
}

function getClayPickTargets() {
  return [clayWall, clayBottom].filter(Boolean);
}

function buildClayMeshes() {
  if (clayGroup) {
    scene.remove(clayGroup);
    disposeClayPart(clayWall);
    disposeClayPart(clayBottom);
    clayGroup = null;
  }

  clayGroup = new THREE.Group();

  const wallGeo = new THREE.LatheGeometry(makeWallShellPoints(), SEG);
  wallGeo.computeVertexNormals();
  const wallMat = clayMat.clone();
  wallMat.side = THREE.FrontSide;
  clayWall = new THREE.Mesh(wallGeo, wallMat);

  const yMin = profile.reduce((m, p) => Math.min(m, p.y), Infinity);
  const bottomPts = profile.filter(p => p.y <= yMin + 1e-5);
  const bottomR = bottomPts.length
    ? Math.max(...bottomPts.map(p => p.r))
    : profile[0].r;
  const bottomMat = clayMat.clone();
  bottomMat.side = THREE.DoubleSide;
  clayBottom = new THREE.Mesh(new THREE.CircleGeometry(bottomR, SEG), bottomMat);
  clayBottom.rotation.x = -Math.PI / 2;
  clayBottom.position.y = yMin;

  [clayWall, clayBottom].forEach(m => {
    m.castShadow = true;
    m.receiveShadow = true;
    clayGroup.add(m);
  });

  scene.add(clayGroup);
  applyVisualScale();
}

function updateActualSizeDisplay() {
  const firedWidthEl = document.getElementById('firedWidth');
  const firedHeightEl = document.getElementById('firedHeight');
  const wetWidthEl = document.getElementById('wetWidth');
  const wetHeightEl = document.getElementById('wetHeight');
  if (!firedWidthEl) return;
  const { diameter, height } = getActualSize();
  const factor = getShrinkFactor();
  wetWidthEl.textContent = diameter.toFixed(1);
  wetHeightEl.textContent = height.toFixed(1);
  firedWidthEl.textContent = (diameter * factor).toFixed(1);
  firedHeightEl.textContent = (height * factor).toFixed(1);
}

function syncUI() {
  const { diameter, height } = getActualSize();
  const hS = document.getElementById('heightSlider');
  const hI = document.getElementById('heightInput');
  const wS = document.getElementById('widthSlider');
  const wI = document.getElementById('widthInput');
  if (hS && hI) {
    hS.value = height;
    hI.value = height.toFixed(1);
    hS.style.setProperty('--pct', ((height - SIZE_MIN) / (H_MAX - SIZE_MIN) * 100).toFixed(1) + '%');
  }
  if (wS && wI) {
    wS.value = diameter;
    wI.value = diameter.toFixed(1);
    wS.style.setProperty('--pct', ((diameter - SIZE_MIN) / (W_MAX - SIZE_MIN) * 100).toFixed(1) + '%');
  }
  widthCm = diameter;
  heightCm = height;
  PHT = height;
  updateActualSizeDisplay();
}

function createClay() {
  buildClayMeshes();
  updateSizeGuide();
  updateActualSizeDisplay();
}

function updateClayFast() {
  buildClayMeshes();
  updateSizeGuide();
  updateActualSizeDisplay();
}

// Floor + cm grid (scaled to model size)
const FLOOR_BASE = 80;
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(FLOOR_BASE, 64),
  new THREE.MeshStandardMaterial({ color:0xf2f4f6, roughness:1 })
);
floor.rotation.x = -Math.PI/2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(FLOOR_BASE, 80, 0xc9e2ff, 0xe5e8eb);
grid.position.y = 0.01;
scene.add(grid);

function updateFloor() {
  const span = getObjectSpan();
  const floorSize = Math.max(FLOOR_BASE, span * 5);
  const s = floorSize / FLOOR_BASE;
  floor.scale.set(s, 1, s);
  grid.scale.set(s, 1, s);
  const y = -PHT / 2 - 0.15;
  floor.position.y = y;
  grid.position.y = y + 0.01;
}

// sizeCompareOn / cardCompareGroup — updateFloor() → getObjectSpan() 보다 먼저 선언
let cardCompareGroup = null;
let sizeCompareOn = false;
let shrinkPreviewOn = false;

function getShrinkFactor() {
  return 1 - shrinkageRate / 100;
}

function getVisualScale() {
  return shrinkPreviewOn ? getShrinkFactor() : 1;
}

function applyVisualScale() {
  const s = getVisualScale();
  if (clayGroup) clayGroup.scale.set(s, s, s);
  if (sizeGuide) sizeGuide.scale.set(s, s, s);
  if (sizeCompareOn) updateCardComparePosition();
}

updateFloor();

// Size guide — wireframe box matching heightCm × widthCm exactly
let sizeGuide = null;
function disposeSizeGuide() {
  if (!sizeGuide) return;
  scene.remove(sizeGuide);
  sizeGuide.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
  sizeGuide = null;
}
function makeGuideEdges(w, h, d, opacity) {
  const box = new THREE.BoxGeometry(w, h, d);
  const edges = new THREE.EdgesGeometry(box);
  box.dispose();
  return new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: GUIDE, transparent: true, opacity, linewidth: 2
  }));
}
function updateSizeGuide() {
  disposeSizeGuide();
  const { height, diameter } = getActualSize();
  const g = new THREE.Group();
  g.add(makeGuideEdges(diameter * 1.006, height * 1.006, diameter * 1.006, 0.26));
  g.add(makeGuideEdges(diameter, height, diameter, 0.58));
  sizeGuide = g;
  scene.add(sizeGuide);
  applyVisualScale();
  if (sizeCompareOn) updateCardComparePosition();
}

// ── 신용카드 크기 비교 (86×54mm, 세로 8.6cm) ─────────────────────────────────
const CARD_HEIGHT_CM = 8.6;
const CARD_WIDTH_CM = 5.4;
const CARD_THICK_CM = 0.076;
const CARD_GAP_CM = 1.2;
// cardCompareGroup, sizeCompareOn — 위(updateFloor 직전)에서 선언됨

function buildCreditCardMesh() {
  const group = new THREE.Group();
  // 카메라 정면(z축)에서 카드의 넓은 면(가로×세로)이 보이도록 z를 두께축으로 둔다.
  const geom = new THREE.BoxGeometry(CARD_WIDTH_CM, CARD_HEIGHT_CM, CARD_THICK_CM);
  const body = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.38,
    metalness: 0.22,
    emissive: 0x0a1a30,
    emissiveIntensity: 0.08
  }));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0x8b95a1, transparent: true, opacity: 0.75 })
  );
  group.add(edge);
  return group;
}

function updateCardComparePosition() {
  if (!cardCompareGroup) return;
  const { maxR } = getActualSize();
  const visualMaxR = maxR * getVisualScale();
  const yMin = profile.reduce((m, p) => Math.min(m, p.y), Infinity);
  cardCompareGroup.position.set(
    visualMaxR + CARD_GAP_CM + CARD_WIDTH_CM / 2,
    yMin + CARD_HEIGHT_CM / 2,
    0
  );
}

function updateSizeCompareButtons() {
  const pressed = sizeCompareOn;
  ['btnSizeCompareM', 'btnSizeCompareDock'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('btn-toggle-on', pressed);
    el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });
}

function setSizeCompareVisible(on) {
  sizeCompareOn = on;
  if (on) {
    if (!cardCompareGroup) cardCompareGroup = buildCreditCardMesh();
    updateCardComparePosition();
    scene.add(cardCompareGroup);
    setStatus('카드 비교 8.6×5.4×0.076cm', true);
  } else if (cardCompareGroup) {
    scene.remove(cardCompareGroup);
    setStatus(shrinkPreviewOn ? '수축 미리보기 — 소성 후 크기' : READY_STATUS, shrinkPreviewOn);
  }
  updateSizeCompareButtons();
}

function updateShrinkPreviewButtons() {
  const pressed = shrinkPreviewOn;
  ['btnShrinkPreviewM', 'btnShrinkPreviewDock'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('btn-toggle-on', pressed);
    el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });
  const wrap = document.getElementById('profileWrap');
  if (wrap) wrap.classList.toggle('shrink-preview-on', pressed);
}

function setShrinkPreviewVisible(on) {
  shrinkPreviewOn = on;
  applyVisualScale();
  updateActualSizeDisplay();
  updateShrinkPreviewButtons();
  if (on) {
    setStatus('수축 미리보기 — 소성 후 크기', true);
  } else if (!sizeCompareOn) {
    setStatus(READY_STATUS);
  }
}

function toggleShrinkPreview() {
  setShrinkPreviewVisible(!shrinkPreviewOn);
}

function clearShrinkPreview() {
  if (shrinkPreviewOn) setShrinkPreviewVisible(false);
}

function toggleSizeCompare() {
  setSizeCompareVisible(!sizeCompareOn);
}

// Sculpt grip: 잡은 위치에만 붙는 원형 패치 (전체 둘레 도넛 X)
const hlMat = new THREE.MeshBasicMaterial({
  color: ACCENT, transparent: true, opacity: 0,
  side: THREE.DoubleSide, depthTest: true, depthWrite: false
});
const hlDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), hlMat);
scene.add(hlDisc);

let sculptTheta = 0;

// createClay() — initStudio()에서 loadPreset()으로 호출

// ── Camera orbit ──────────────────────────────────────────────────────────────
const orbit = { theta:0, phi:1.1, radius:14, targetY:0, zoomMin:6, zoomMax:120 };

function getObjectSpan() {
  const { height, diameter } = getActualSize();
  const s = getVisualScale();
  return Math.max(height * s, diameter * s, SIZE_MIN);
}

function fitCamera() {
  const span = getObjectSpan();
  const r = canvasRect();
  const aspect = r.width / Math.max(1, r.height);
  const tallView = aspect < 0.72;
  const fill = isMobileLayout()
    ? (tallView ? 2.85 : 3.15)
    : 3.5;
  orbit.radius = span * fill;
  orbit.zoomMin = span * 1.4;
  orbit.zoomMax = span * 15;
  if (isMobileLayout()) {
    orbit.phi = Math.min(1.15, Math.max(0.92, orbit.phi));
    orbit.theta = 0;
  }
  updateFloor();
  updateCamera();
}

function updateCamera() {
  const s = Math.sin(orbit.phi);
  camera.position.set(
    orbit.radius * s * Math.sin(orbit.theta),
    orbit.targetY + orbit.radius * Math.cos(orbit.phi),
    orbit.radius * s * Math.cos(orbit.theta)
  );
  camera.lookAt(0, orbit.targetY, 0);
}
fitCamera();

// ── Interaction ───────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
// mode는 위(ResizeObserver 직전)에서 선언됨
let selRing = -1, lastClientX = 0, lastClientY = 0, orbitLast = {x:0,y:0};
const pointers = new Map();
let pinchStartDist = 0;
let pinchStartRadius = 0;

const statusEl = document.getElementById('status');
const barDotEl = document.getElementById('barDot');

function getVbarH() {
  const wrap = document.getElementById('vSliderWrap');
  return wrap ? wrap.offsetHeight : 220;
}

function pointerSpan() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function startPinch() {
  mode = 'pinch';
  pinchStartDist = pointerSpan();
  pinchStartRadius = orbit.radius;
  if (pinchStartDist < 8) pinchStartDist = 8;
  setStatus('확대/축소 중', true);
}

function applyPinch() {
  const dist = pointerSpan();
  if (pinchStartDist < 8 || dist < 8) return;
  const scale = pinchStartDist / dist;
  orbit.radius = Math.max(
    orbit.zoomMin,
    Math.min(orbit.zoomMax, pinchStartRadius * scale)
  );
  updateCamera();
}

function zoomBy(factor) {
  orbit.radius = Math.max(orbit.zoomMin, Math.min(orbit.zoomMax, orbit.radius * factor));
  updateCamera();
}

function startSinglePointer(e) {
  raycaster.setFromCamera(ndcFromClient(e.clientX, e.clientY), camera);
  const hits = raycaster.intersectObjects(getClayPickTargets());
  if (hits.length) {
    clearShrinkPreview();
    pushUndoState();
    mode = 'sculpt';
    const pt = hits[0].point;
    selRing = getRing(pt.y);
    sculptTheta = Math.atan2(pt.z, pt.x);
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    setStatus(`조각 중 · ${selRing + 1}번째 줄`, true);
    updateHighlight();
  } else {
    mode = 'orbit';
    orbitLast = { x: e.clientX, y: e.clientY };
    setStatus('회전 중', true);
  }
}

function onPointerDown(e) {
  if (e.target !== canvas) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

  if (pointers.size >= 2) {
    e.preventDefault();
    startPinch();
    return;
  }
  if (pointers.size === 1) startSinglePointer(e);
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2) {
    e.preventDefault();
    if (mode !== 'pinch') startPinch();
    applyPinch();
    return;
  }

  if (pointers.size === 1 && mode === 'sculpt') {
    applySculptDrag(e.clientX, e.clientY);
  } else if (pointers.size === 1 && mode === 'orbit') {
    applyOrbitDrag(e.clientX, e.clientY);
  }
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

  if (pointers.size >= 2) {
    startPinch();
    return;
  }
  if (pointers.size === 0) endInteraction();
}

function ndcFromClient(clientX, clientY) {
  const r = canvasRect();
  const x = ((clientX - r.left) / r.width) * 2 - 1;
  const y = -((clientY - r.top) / r.height) * 2 + 1;
  return new THREE.Vector2(x, y);
}

function endInteraction() {
  mode = 'idle';
  selRing = -1;
  canvas.style.cursor = 'crosshair';
  hlMat.opacity = 0;
  barDotEl.style.opacity = '0';
  barDotEl.classList.remove('active');
  setStatus(READY_STATUS);
}

function applyOrbitDrag(clientX, clientY) {
  orbit.theta -= (clientX - orbitLast.x) * 0.008;
  orbit.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbit.phi - (clientY - orbitLast.y) * 0.008));
  orbitLast = { x: clientX, y: clientY };
  updateCamera();
}

function worldToClient(vec3) {
  const p = vec3.clone().project(camera);
  const r = canvasRect();
  return {
    x: (p.x * 0.5 + 0.5) * r.width + r.left,
    y: (-p.y * 0.5 + 0.5) * r.height + r.top
  };
}

/** 화면 드래그를 해당 지점의 반경(바깥) 방향으로 투영 — 좌/우 면 동일하게 동작 */
function applySculptDrag(clientX, clientY) {
  const dx = clientX - lastClientX;
  const dy = clientY - lastClientY;
  lastClientX = clientX;
  lastClientY = clientY;

  const pr = profile[selRing];
  const y = pr.y;
  const r0 = pr.r;
  const eps = 0.08;
  const c = Math.cos(sculptTheta);
  const s = Math.sin(sculptTheta);
  const v0 = new THREE.Vector3(r0 * c, y, r0 * s);
  const v1 = new THREE.Vector3((r0 + eps) * c, y, (r0 + eps) * s);
  const a = worldToClient(v0);
  const b = worldToClient(v1);
  let ux = b.x - a.x;
  let uy = b.y - a.y;
  const ulen = Math.hypot(ux, uy);
  if (ulen < 1e-4) {
    applyEdit(selRing, dx * 0.02);
    return;
  }
  ux /= ulen;
  uy /= ulen;
  const dragAlong = dx * ux + dy * uy;
  applyEdit(selRing, dragAlong * 0.02);
}

function setStatus(text, active = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('active', active);
}

const READY_STATUS = `준비됨 · 벽두께 ${(WALL_THICKNESS_CM * 10).toFixed(0)}mm`;

function getRing(wy) {
  let best=0, bestD=Infinity;
  profile.forEach((p,i)=>{ const d=Math.abs(p.y-wy); if(d<bestD){bestD=d;best=i;} });
  return best;
}

function applyEdit(idx, delta) {
  const sig = 2.9;
  profile.forEach((p,i)=>{
    const w = Math.exp(-((i-idx)*(i-idx))/(2*sig*sig));
    p.r = Math.max(MIN_R, Math.min(MAX_R, p.r + delta*w));
  });
  updateClayFast(); updateHighlight(); syncUI();
}

function surfaceNormalAtRing(idx, theta) {
  const i0 = Math.max(0, idx - 1);
  const i1 = Math.min(profile.length - 1, idx + 1);
  const p0 = profile[i0];
  const p1 = profile[i1];
  const dy = p1.y - p0.y || 1e-6;
  const dr = p1.r - p0.r;
  const ny = -dr / Math.hypot(dr, dy);
  const nr = dy / Math.hypot(dr, dy);
  const n = new THREE.Vector3(
    nr * Math.cos(theta),
    ny,
    nr * Math.sin(theta)
  );
  return n.lengthSq() > 1e-8 ? n.normalize() : new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
}

function updateHighlight() {
  if (selRing < 0) {
    hlMat.opacity = 0;
    barDotEl.style.opacity = '0';
    return;
  }
  const p = profile[selRing];
  const surfR = p.r * 1.012;
  const patchR = Math.max(0.45, Math.min(2.2, p.r * 0.2));
  const pos = new THREE.Vector3(
    surfR * Math.cos(sculptTheta),
    p.y,
    surfR * Math.sin(sculptTheta)
  );
  const normal = surfaceNormalAtRing(selRing, sculptTheta);
  pos.add(normal.clone().multiplyScalar(0.04));

  hlDisc.position.copy(pos);
  hlDisc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  hlDisc.scale.set(patchR, patchR, 1);
  hlMat.opacity = 0.72;

  const t = selRing / Math.max(1, profile.length - 1);
  barDotEl.style.top = ((1 - t) * getVbarH()) + 'px';
  barDotEl.style.opacity = '1';
  barDotEl.classList.add('active');
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomBy(1 + e.deltaY * 0.0012);
}, { passive: false });

// ── Height & Width controls ───────────────────────────────────────────────────
function applyHeightChange(cm) {
  clearShrinkPreview();
  const newCm = clampDim(cm, SIZE_MIN, H_MAX);
  const scale = newCm / heightCm;
  profile.forEach(p=>{ p.y *= scale; });
  PHT = newCm; heightCm = newCm;
  orbit.targetY = 0;
  createClay(); syncUI(); fitCamera();
}

function applyWidthChange(cm) {
  clearShrinkPreview();
  const newCm = clampDim(cm, SIZE_MIN, W_MAX);
  const scale = newCm / widthCm;
  profile.forEach(p=>{ p.r = Math.max(MIN_R, p.r * scale); });
  widthCm = newCm;
  updateClayFast(); syncUI(); fitCamera();
}

const pctH = (v)=>((v-SIZE_MIN)/(H_MAX-SIZE_MIN)*100).toFixed(1)+'%';
const pctW = (v)=>((v-SIZE_MIN)/(W_MAX-SIZE_MIN)*100).toFixed(1)+'%';

const hSl=document.getElementById('heightSlider'), hIn=document.getElementById('heightInput');
hSl.addEventListener('pointerdown', () => { clearShrinkPreview(); pushUndoState(); });
hSl.addEventListener('input',  ()=>{ hIn.value=hSl.value; hSl.style.setProperty('--pct',pctH(+hSl.value)); applyHeightChange(+hSl.value); });
hIn.addEventListener('focus', () => pushUndoState());
hIn.addEventListener('change', ()=>applyHeightChange(+hIn.value));
hIn.addEventListener('keydown',e=>{ if(e.key==='Enter')hIn.blur(); });

const wSl=document.getElementById('widthSlider'),  wIn=document.getElementById('widthInput');
wSl.addEventListener('pointerdown', () => { clearShrinkPreview(); pushUndoState(); });
wSl.addEventListener('input',  ()=>{ wIn.value=wSl.value; wSl.style.setProperty('--pct',pctW(+wSl.value)); applyWidthChange(+wSl.value); });
wIn.addEventListener('focus', () => pushUndoState());
wIn.addEventListener('change', ()=>applyWidthChange(+wIn.value));
wIn.addEventListener('keydown',e=>{ if(e.key==='Enter')wIn.blur(); });

// ── Buttons ───────────────────────────────────────────────────────────────────
function scaleProfileToSize(targetDiameter, targetHeight) {
  const { diameter, height } = getActualSize();
  if (diameter < 1e-6 || height < 1e-6) return;
  const scaleW = targetDiameter / diameter;
  const scaleH = targetHeight / height;
  profile.forEach((p) => {
    p.r *= scaleW;
    p.y *= scaleH;
  });
  const sized = getActualSize();
  widthCm = sized.diameter;
  heightCm = sized.height;
  PHT = sized.height;
}

function loadPreset(type, targetDiameter, targetHeight) {
  const preset = PRESETS[type];
  if (!preset) return;
  clearHistoryStacks();
  shrinkPreviewOn = false;
  updateShrinkPreviewButtons();
  widthCm = preset.widthCm;
  heightCm = preset.heightCm;
  PHT = heightCm;
  lastPreset = type;
  profile = makeProfile(type);
  if (targetDiameter != null && targetHeight != null) {
    scaleProfileToSize(targetDiameter, targetHeight);
  }
  createClay();
  syncUI();
  fitCamera();
}
function bindStudioControls() {
  document.getElementById('btnSmooth').addEventListener('click', onSmoothClick);
  document.getElementById('btnSmoothDock').addEventListener('click', onSmoothClick);
  document.getElementById('btnSizeCompareM').addEventListener('click', toggleSizeCompare);
  document.getElementById('btnSizeCompareDock').addEventListener('click', toggleSizeCompare);
  document.getElementById('btnShrinkPreviewM').addEventListener('click', toggleShrinkPreview);
  document.getElementById('btnShrinkPreviewDock').addEventListener('click', toggleShrinkPreview);
  document.getElementById('btnUndo').addEventListener('click', () => undoProfile());
  document.getElementById('btnRedo').addEventListener('click', () => redoProfile());
  document.getElementById('btnUndoM').addEventListener('click', () => undoProfile());
  document.getElementById('btnRedoM').addEventListener('click', () => redoProfile());
  document.getElementById('btnReset').addEventListener('click', openResetDialog);
  document.getElementById('btnResetDesk').addEventListener('click', openResetDialog);
  document.getElementById('resetDialogCancel').addEventListener('click', () => resetDialog.close());
  document.getElementById('resetDialogConfirm').addEventListener('click', () => {
    resetDialog.close();
    if (!SESSION) return;
    loadPreset(SESSION.preset || 'cylinder', SESSION.wetWidth, SESSION.wetHeight);
  });
  document.getElementById('btnBackSetup').addEventListener('click', () => {
    if (window.ClaySize && window.ClaySize.showSetup) window.ClaySize.showSetup();
  });
}

function applySession(session) {
  SESSION = session;
  shrinkageRate = session.shrinkageRate ?? 12;
  clayInfo = getClayById(session.clayId);
  shrinkPreviewOn = false;
  if (sizeCompareOn && cardCompareGroup) {
    scene.remove(cardCompareGroup);
    sizeCompareOn = false;
    updateSizeCompareButtons();
  }
  SIZE_MAX = SIZE_LIMIT;
  H_MAX = SIZE_LIMIT;
  W_MAX = SIZE_LIMIT;
  MAX_R = SIZE_LIMIT / 2;
  ['heightSlider', 'heightInput', 'widthSlider', 'widthInput'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.max = SIZE_LIMIT;
  });
  const preset = session.preset || 'cylinder';
  const brandPreset = document.getElementById('brandPreset');
  if (brandPreset) brandPreset.textContent = `${PRESET_LABELS[preset] ?? preset} · ${clayInfo.name}`;
  const clayLabel = document.getElementById('clayLabel');
  const shrinkRateEl = document.getElementById('shrinkRate');
  if (clayLabel) clayLabel.textContent = clayInfo.name;
  if (shrinkRateEl) shrinkRateEl.textContent = shrinkageRate;
  updateShrinkPreviewButtons();
  loadPreset(preset, session.wetWidth, session.wetHeight);
  requestAnimationFrame(() => {
    resizeRenderer();
    fitCamera();
    syncUI();
    updateHistoryButtons();
    setStatus(READY_STATUS);
  });
}

function initStudioOnce() {
  bindStudioControls();
  animate();
  studioInited = true;
}

window.ClaySize = window.ClaySize || {};
window.ClaySize.initStudio = function initStudio(session) {
  if (!studioInited) initStudioOnce();
  applySession(session);
};

function onSmoothClick() {
  pushUndoState();
  profile = refineProfile(profile, REFINE_STRENGTH);
  updateClayFast();
  syncUI();
}
const resetDialog = document.getElementById('resetDialog');
function openResetDialog() { resetDialog.showModal(); }

// ── Animate (no rotation) ─────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

window.exportClayProfile = function exportClayProfile() {
  const { diameter, height } = getActualSize();
  const data = {
    lastPreset,
    shrinkageRate,
    clayId: SESSION.clayId,
    wet: { widthCm: diameter, heightCm: height },
    fired: {
      widthCm: wetToFired(diameter, shrinkageRate),
      heightCm: wetToFired(height, shrinkageRate),
    },
    profile: profile.map(p => ({
      r: Math.round(p.r * 1000) / 1000,
      y: Math.round(p.y * 1000) / 1000
    }))
  };
  const json = JSON.stringify(data, null, 2);
  console.log(json);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(
      () => console.log('클립보드에 복사됨'),
      () => console.log('복사 실패 — 위 JSON을 직접 복사하세요')
    );
  }
  return data;
};

})();
