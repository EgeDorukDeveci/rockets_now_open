// Three.js sahnesi: prosedürel roket, rampa, alev/duman partikülleri, paraşüt,
// yörünge çizgisi, kamera modları. Oynatım store'daki telemetri örnekleriyle
// sürülür; sahne sadece "sunum" katmanıdır (fizik ayrıdır).

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { RocketConfig, StageConfig, FinConfig } from "../types";
import { RocketAssembly } from "../physics/rocket";
import { TelemetrySample } from "../physics/trajectory";
import { FlightEvent } from "../physics/events";
import { makeNoseLatheProfile, stackPineCanopies, followDistance, isStageVisible, rocketUpVector, swingUp } from "./geometry";
import { cachedGeom, disposeDeep, clearDisposed, downsample } from "./cache";

// ---------------------------------------------------------------------------
// Renk paleti
// ---------------------------------------------------------------------------

const BODY_COLORS = [0xf5f5f0, 0xcc3333, 0x3366cc, 0x226622, 0x995533, 0x333344];
const NOSE_COLORS = [0xcc3333, 0xf5f5f0, 0x3366cc, 0x995533, 0x111111, 0x226622];
const FIN_COLORS = [0xcc3333, 0xf5f5f0, 0x3366cc, 0x2244aa, 0x444444, 0x663333];

const FOG_COLOR = 0xdbe9f1;
const HORIZON_COLOR = "#dbe9f1";

/** Hareket hassasiyeti: OS "azaltılmış hareket" ayarı — CSS kurallarıyla uyumlu. */
const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

function steel(color: number, roughness = 0.45, metalness = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function concrete(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02 });
}

/** Rastgele ama sabit tuzlu üretici — sahne kurulumunda deterministik doku. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Kanat planformu (2B şekil) — üç düzlemli, gövdeye gömülü kök kiriş
// ---------------------------------------------------------------------------

function finShape(f: FinConfig, _bodyRadius: number): THREE.Shape {
  const cr = f.rootChordM;
  const ct = f.tipChordM;
  const s = f.semispanM;
  const sweep = (f.sweepDeg * Math.PI) / 180;
  const shape = new THREE.Shape();
  // Kök kiriş: gövdeye gömülü; ön kenar (x=0 üstte, +y aşağıya doğru açıklık)
  shape.moveTo(0, 0); // kök ön
  shape.lineTo(cr, 0); // kök arka
  shape.lineTo(cr - Math.max(0, (cr - ct) - s * Math.tan(sweep)), s); // uç arka
  if (f.geometry === "elliptical") {
    // Elips yayı: uç arka → uç ön
    shape.quadraticCurveTo(cr / 2, s * 1.15, s * Math.tan(sweep), s);
  } else {
    shape.lineTo(s * Math.tan(sweep) + (f.geometry === "delta" ? 0 : ct), s); // uç ön
  }
  shape.lineTo(0, 0); // kapama
  return shape;
}

// ---------------------------------------------------------------------------
// Prosedürel roket mesh'i
// ---------------------------------------------------------------------------

interface BuiltStage {
  group: THREE.Group;
  /** Bu kademenin burnunun grubun yerel +Y'sinde mesafesi (0 = grup tabanı) */
  noseTopLocalY: number;
  /** Gövde altı (motor düzlemi) yerel Y */
  bodyBottomLocalY: number;
}

function buildStageMesh(stage: StageConfig, colorIndex: number, opts: { showRecovery: boolean }): BuiltStage {
  const group = new THREE.Group();
  const dia = stage.body.diameterM;
  const R = dia / 2;
  const bodyLen = stage.body.lengthM;
  const noseLen = stage.nose.lengthCalibers * dia;

  const bodyColor = BODY_COLORS[colorIndex % BODY_COLORS.length];
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.42, metalness: 0.12 });
  const noseMat = new THREE.MeshStandardMaterial({ color: NOSE_COLORS[colorIndex % NOSE_COLORS.length], roughness: 0.35, metalness: 0.15 });
  const finMat = new THREE.MeshStandardMaterial({ color: FIN_COLORS[colorIndex % FIN_COLORS.length], roughness: 0.5, metalness: 0.2 });

  // Gövde: taban (yerel y=0) lüle düzlemi; üst kenar y=bodyLen'de.
  const body = new THREE.Mesh(
    cachedGeom(`cyl:${R.toFixed(4)}:${R.toFixed(4)}:${bodyLen.toFixed(4)}:24`, () => new THREE.CylinderGeometry(R, R, bodyLen, 24)),
    bodyMat,
  );
  body.position.y = bodyLen / 2;
  body.castShadow = true;
  group.add(body);

  // Gövde çevresel bantları (boya şeridi görünümü, tonu gövdeden koyu)
  const bandColor = new THREE.Color(bodyColor).multiplyScalar(0.5);
  const bandMat = new THREE.MeshStandardMaterial({ color: bandColor, roughness: 0.45, metalness: 0.4 });
  const bandGeo = cachedGeom(`cyl:${(R * 1.002).toFixed(4)}:${(R * 1.002).toFixed(4)}:0.02:24`, () => new THREE.CylinderGeometry(R * 1.002, R * 1.002, 0.02, 24));
  for (const by of [0.02, bodyLen - 0.02]) {
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = by;
    band.castShadow = true;
    group.add(band);
  }
  // Burun omuz bileziği
  const shoulder = new THREE.Mesh(bandGeo, bandMat);
  shoulder.position.y = bodyLen + 0.012;
  shoulder.castShadow = true;
  group.add(shoulder);

  // Burun konisi (lathe): taban yerel y=0, sivri uç +Y'de.
  // Mesh y=bodyLen'de → taban gövde üst kenarına, uç roketin tepesine oturur.
  const noseGeo = cachedGeom(
    `nose:${stage.nose.profile}:${noseLen.toFixed(4)}:${R.toFixed(4)}:${stage.nose.powerN.toFixed(3)}:${stage.nose.bluntness.toFixed(3)}:24`,
    () => new THREE.LatheGeometry(makeNoseLatheProfile(stage.nose.profile, noseLen, R, stage.nose.powerN, stage.nose.bluntness), 24),
  );
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.y = bodyLen;
  nose.castShadow = true;
  group.add(nose);

  // Kanatlar: şekil kirişi +X, açıklığı +Y düzleminde çizilir.
  // Ön-dönüşüm: kiriş → gövde eksenine (−Y = arkaya), açıklık → radyal dışa (+X),
  // kalınlık → teğetsel (+Z). Sonra her kanat kendi grubunda Y ekseninde döndürülür.
  if (stage.fins.count > 0) {
    const f = stage.fins;
    const shape = finShape(f, R);
    const geo = cachedGeom(
      `fin:${JSON.stringify([
        f.geometry, f.rootChordM, f.tipChordM, f.semispanM, f.sweepDeg, f.thicknessM, R,
      ])}`,
      () => {
        const g = new THREE.ExtrudeGeometry(shape, { depth: f.thicknessM, bevelEnabled: false, steps: 1 });
        g.rotateZ(-Math.PI / 2); // (x,y) → (y,−x): kök ön kenar (0,0) korunur, kiriş −Y
        const embed = Math.min(R * 0.8, f.rootChordM * 0.3);
        g.translate(R - embed, 0, 0); // kök kirişi gövde yüzeyine göm
        g.translate(0, 0, -f.thicknessM / 2); // kalınlığı ortala
        return g;
      },
    );
    const cant = (f.cantDeg * Math.PI) / 180;
    for (let i = 0; i < f.count; i++) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(geo, finMat);
      mesh.rotation.x = cant; // yalpa: radyal eksen etrafında eğim
      mesh.castShadow = true;
      g.add(mesh);
      g.rotation.y = (i * 2 * Math.PI) / f.count; // gövde çevresinde dağıt
      // Kök ön kenarı burun ucundan xPosM aşağıda (uç = bodyLen + noseLen)
      g.position.y = bodyLen + noseLen - f.xPosM;
      group.add(g);
    }
  }

  // Motor lülesi
  const nozzle = new THREE.Mesh(
    cachedGeom(`noz:${(R * 0.45).toFixed(4)}:${(R * 0.8).toFixed(4)}:16`, () => new THREE.CylinderGeometry(R * 0.45, R * 0.8, 0.02, 16)),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 })
  );
  nozzle.position.y = -0.012;
  group.add(nozzle);

  // Kurtarma paketi (şeffaf küçük kapsül) — burun bölmesinde
  if (opts.showRecovery && stage.recovery.type !== "none") {
    const rec = new THREE.Mesh(
      cachedGeom(`rec:${(R * 0.5).toFixed(4)}:12`, () => new THREE.SphereGeometry(R * 0.5, 12, 8)),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8, transparent: true, opacity: 0.4 })
    );
    rec.position.y = bodyLen + noseLen * 0.5;
    group.add(rec);
  }

  return { group, noseTopLocalY: noseLen + bodyLen, bodyBottomLocalY: 0 };
}

// ---------------------------------------------------------------------------
// Partiküller (alev + duman)
// ---------------------------------------------------------------------------

class ParticleSystem {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private lives: Float32Array;
  private maxLife: Float32Array;
  private sizes: Float32Array;
  private cursor = 0;
  private readonly count: number;

  constructor(count: number, color: THREE.ColorRepresentation, size: number, opacity: number, blending: THREE.Blending = THREE.AdditiveBlending) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.lives = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.sizes = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    const sprite = new THREE.TextureLoader().load(
      "data:image/png;base64," +
        "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mNk+M9Qz0AEYBxVSF+uAQAJ9QEB5IkZLQAAAABJRU5ErkJggg=="
    );
    const mat = new THREE.PointsMaterial({
      color,
      size,
      map: sprite,
      transparent: true,
      opacity,
      blending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < this.count; i++) this.lives[i] = -1;
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.velocities[i * 3] = vel.x;
    this.velocities[i * 3 + 1] = vel.y;
    this.velocities[i * 3 + 2] = vel.z;
    this.lives[i] = life;
    this.maxLife[i] = life;
    this.sizes[i] = size;
  }

  update(dt: number, gravity: number) {
    const arr = this.positions;
    for (let i = 0; i < this.count; i++) {
      if (this.lives[i] <= 0) continue;
      this.lives[i] -= dt;
      arr[i * 3] += this.velocities[i * 3] * dt;
      arr[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      arr[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      this.velocities[i * 3 + 1] -= gravity * dt;
      const m = this.lives[i] / this.maxLife[i];
      this.sizes[i] = (1 - m) * 2 + 0.5;
    }
    const geo = this.points.geometry as THREE.BufferGeometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  hide(): void {
    for (let i = 0; i < this.count; i++) this.lives[i] = -1;
  }
}

// ---------------------------------------------------------------------------
// Sahne
// ---------------------------------------------------------------------------

export interface SceneCallbacks {
  onReady?: () => void;
}

export class RocketScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private rocketGroup = new THREE.Group();
  private stageGroups: THREE.Group[] = [];
  private stageBottomLocalY: number[] = [];
  /** Roket tabanının zemin üzerindeki yüksekliği (ray tepesi) */
  private readonly padY = 1.45;
  /** Yapılandırmadaki ray uzunluğu (simülasyon ray boyunu sayar) */
  private railLen = 1.2;
  /** Alev/dumanın çıktığı aktif (en alt görünür) kademe indeksi */
  private activeBottomIdx = 0;
  private boosterGroup = new THREE.Group();
  private railGroup: THREE.Group;
  private flame: ParticleSystem;
  private smoke: ParticleSystem;
  private smokeAccum = 0;
  private chuteGroup = new THREE.Group();
  private chuteState: "none" | "drogue" | "main" = "none";
  private chuteProgress = 0;
  private trajectoryLine: Line2 | null = null;
  private trajectoryMat: LineMaterial | null = null;
  private trajectoryMarkers = new THREE.Group();
  private gridHelper: THREE.GridHelper | null = null;
  private cloudGroup = new THREE.Group();
  /** Yanıp sönen seyrüsefer ışıkları (fener, direk, kulübe) */
  private blinkMats: THREE.MeshStandardMaterial[] = [];
  /** Kalkış kelepçeleri — fırlatma anında dışa katlanır */
  private clamps: THREE.Group[] = [];
  private clampFold = 0;
  /** Kalkış tozu + genişleyen halka */
  private dust: ParticleSystem;
  private dustRing: THREE.Mesh | null = null;
  private dustActive = false;
  private dustProgress = 0;
  private dustLaunched = false;
  private windVane = new THREE.Group();
  private flameGroup = new THREE.Group();
  private boosterFlameGroups: THREE.Group[] = [];
  private flameIntensity = 0;
  private windDeg = 0;
  private raf = 0;
  private disposed = false;
  private onResize: () => void;

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private cameraMode: "follow" | "pad" | "free" = "follow";
  private lookTarget = new THREE.Vector3(0, 2, 0);
  private rocketHeight = 0.5;
  /** Takip/rampa modunda tekerlekle kontrol edilen zoom çarpanı */
  private followZoom = 1;
  /** Roketin güncel +Y (burun) yönü; paraşütlü inişte sarkıç ile döner */
  private rocketUpVec = new THREE.Vector3(0, 1, 0);
  private rocketAngVel = 0;
  private static readonly PENDULUM_TARGET = new THREE.Vector3(0, 1, 0);
  private static readonly PENDULUM_SPRING = 13;
  private static readonly PENDULUM_DAMPING = 1.6;

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks = {}) {
    const { width, height } = canvas.getBoundingClientRect();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 480, 2350);

    this.camera = new THREE.PerspectiveCamera(55, width / Math.max(height, 1), 0.05, 4000);
    this.camera.position.set(3.0, 2.6, 4.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 2000;
    this.controls.target.set(0, 2.0, 0);

    // Takip/rampa modunda tekerlek = yakınlaş/uzaklaş (OrbitControls kapalıyken de çalışır)
    canvas.addEventListener("wheel", this.onWheel, { passive: false });

    // Post-processing: seçici bloom — yalnızca HDR alev, güneş ve fener parlar.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.7, 0.8, 2.1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    if (REDUCED_MOTION) this.bloom.enabled = false;

    this.buildEnvironment();
    this.railGroup = this.buildRail();
    this.scene.add(this.railGroup);
    this.scene.add(this.rocketGroup);
    this.buildFlameCones();
    // Alev grubu setRocket'ta dispose edilmez (tek sefer kurulur, yeniden eklenir).
    this.flameGroup.userData.noDispose = true;
    this.rocketGroup.add(this.flameGroup);
    this.scene.add(this.trajectoryMarkers);

    this.flame = new ParticleSystem(400, new THREE.Color(2.2, 1.5, 0.5), 0.5, 0.85);
    this.smoke = new ParticleSystem(500, 0xcccccc, 1.2, 0.55);
    this.dust = new ParticleSystem(220, 0x9c8a6b, 1.5, 0.55, THREE.NormalBlending);
    this.flame.points.visible = false;
    this.smoke.points.visible = false;
    this.dust.points.visible = false;
    this.scene.add(this.flame.points);
    this.scene.add(this.smoke.points);
    this.scene.add(this.dust.points);
    this.scene.add(this.chuteGroup);

    // Kalkış halkası: toz dalgası yerde genişleyip söner
    this.dustRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.05, 48),
      new THREE.MeshBasicMaterial({ color: 0xcbb391, transparent: true, opacity: 0, depthWrite: false })
    );
    this.dustRing.rotation.x = -Math.PI / 2;
    this.dustRing.position.y = 0.06;
    this.dustRing.visible = false;
    this.scene.add(this.dustRing);

    // Rüzgar gülü (kamera 2'de rüzgar yönü)
    this.buildWindVane();

    this.onResize = () => {
      const r = canvas.getBoundingClientRect();
      this.camera.aspect = r.width / Math.max(r.height, 1);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(r.width, r.height);
      this.composer.setSize(r.width, r.height);
      const size = this.renderer.getSize(new THREE.Vector2());
      this.trajectoryMat?.resolution.copy(size);
    };
    window.addEventListener("resize", this.onResize);

    callbacks.onReady?.();
    this.loop();
  }

  private onWheel = (e: WheelEvent) => {
    if (this.cameraMode === "follow" || this.cameraMode === "pad") {
      e.preventDefault();
      this.followZoom = Math.min(3.0, Math.max(0.3, this.followZoom * Math.pow(1.0014, -e.deltaY)));
    }
  };

  // -------------------------------------------------------------------------
  // Çevre: gökyüzü, zemin, tepeler, ağaçlar, dağlar, bulutlar
  // -------------------------------------------------------------------------

  private makeSky(): THREE.Mesh {
    const rnd = mulberry32(20260805);
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#1e4380");
    grad.addColorStop(0.32, "#3f6cb0");
    grad.addColorStop(0.6, "#7fa8d6");
    grad.addColorStop(0.8, "#b9d3e8");
    grad.addColorStop(1, HORIZON_COLOR);
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);

    // İnce sirüs şeritleri — gökyüzüne derinlik katar (tohumlu: her açılışta aynı)
    for (let i = 0; i < 9; i++) {
      const y = 14 + i * 24 + (rnd() * 10 - 5);
      g.strokeStyle = `rgba(255,255,255,${0.16 + rnd() * 0.28})`;
      g.lineWidth = 1 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(-2, y);
      g.quadraticCurveTo(8, y + (rnd() * 7 - 3.5), 18, y + (rnd() * 9 - 4.5));
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1900, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    );
    sky.position.y = -60;
    return sky;
  }

  private makeGroundTexture(): THREE.CanvasTexture {
    const rnd = mulberry32(20260803);
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#7d9a4c";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 1 + rnd() * 3;
      const s = rnd();
      g.fillStyle = s < 0.4 ? "rgba(50,70,32,0.18)" : s < 0.75 ? "rgba(124,148,74,0.18)" : "rgba(92,112,58,0.14)";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = "rgba(46,64,30,0.22)";
      g.lineWidth = 1;
      g.beginPath();
      const x = rnd() * 256;
      const y = rnd() * 256;
      const a = rnd() * Math.PI;
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(80, 80);
    tex.anisotropy = 4;
    return tex;
  }

  private buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6e5a3e, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.35);
    sun.position.set(90, 130, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 280;
    sun.shadow.camera.bottom = -80;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Güneş diski: HDR tonlamasız parlaklıkla bloom'da atmosferik parıltı yapar
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(34, 32),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(4.4, 3.9, 3.0),
        fog: false,
        toneMapped: false,
      })
    );
    sunDisc.position.copy(new THREE.Vector3(90, 130, 45).normalize().multiplyScalar(1520));
    sunDisc.lookAt(0, 0, 0);
    sunDisc.frustumCulled = false;
    this.scene.add(sunDisc);

    // Gök kubbesi
    this.scene.add(this.makeSky());

    // Zemin (prosedürel çim dokusu)
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1700, 64),
      new THREE.MeshStandardMaterial({ map: this.makeGroundTexture(), roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Fırlatma sahası temizliği (toprak zemin)
    const clearing = new THREE.Mesh(
      new THREE.CircleGeometry(20, 40),
      new THREE.MeshStandardMaterial({ color: 0x9a8a63, roughness: 1 })
    );
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.y = 0.02;
    clearing.receiveShadow = true;
    this.scene.add(clearing);
    // Toprak dokusu lekeleri
    const soilTex = (() => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const g = c.getContext("2d")!;
      g.fillStyle = "#9a8a63";
      g.fillRect(0, 0, 128, 128);
      const rnd = mulberry32(7);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = rnd() < 0.5 ? "rgba(70,60,40,0.16)" : "rgba(176,160,124,0.14)";
        g.beginPath();
        g.arc(rnd() * 128, rnd() * 128, 1 + rnd() * 2.5, 0, Math.PI * 2);
        g.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(6, 6);
      return t;
    })();
    (clearing.material as THREE.MeshStandardMaterial).map = soilTex;
    (clearing.material as THREE.MeshStandardMaterial).needsUpdate = true;

    // Izgara (yalnızca fırlatma sahası çevresinde, zarif)
    const grid = new THREE.GridHelper(100, 20, 0x4a5a34, 0x5d7040);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.04;
    this.gridHelper = grid;
    this.scene.add(grid);

    // Beton çevre halkası — fırlatma sahasını çerçeveler
    const padRing = new THREE.Mesh(new THREE.RingGeometry(20.4, 24.6, 64), concrete(0x878f96));
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.y = 0.018;
    padRing.receiveShadow = true;
    this.scene.add(padRing);

    // Şimşek / aydınlatma direği — kadrajın arkasında, roketi örtmez
    const mastMat = steel(0x6f787e, 0.42, 0.72);
    const boomMat = steel(0x606a70, 0.45, 0.68);
    const mast = new THREE.Group();
    mast.position.set(-5.8, 0, 6.6);
    const mastLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5.4, 8), mastMat);
    mastLeg.position.y = 2.7;
    mastLeg.castShadow = true;
    mast.add(mastLeg);
    for (let y = 1.1; y < 5.0; y += 1.1) {
      const boom = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.035, 0.035), boomMat);
      boom.position.set(-0.25, y, 0);
      boom.castShadow = true;
      mast.add(boom);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), boomMat);
      tip.position.set(-0.78, y, 0);
      mast.add(tip);
    }
    const mastNav = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xaa2233, emissive: 0xff2200, emissiveIntensity: 1, roughness: 0.4 })
    );
    mastNav.position.y = 5.6;
    mast.add(mastNav);
    this.blinkMats.push(mastNav.material as THREE.MeshStandardMaterial);
    this.scene.add(mast);

    // Ufuk buğusu: atmosferik derinlik için yumuşak ışıma bandı
    const hz = document.createElement("canvas");
    hz.width = 16;
    hz.height = 256;
    const hg = hz.getContext("2d")!;
    const hgGrad = hg.createLinearGradient(0, 0, 0, 256);
    hgGrad.addColorStop(0, "rgba(255,235,205,0)");
    hgGrad.addColorStop(0.5, "rgba(255,235,205,0.06)");
    hgGrad.addColorStop(0.82, "rgba(255,240,215,0.26)");
    hgGrad.addColorStop(1, "rgba(255,244,224,0.42)");
    hg.fillStyle = hgGrad;
    hg.fillRect(0, 0, 16, 256);
    const hazeTex = new THREE.CanvasTexture(hz);
    const haze = new THREE.Mesh(
      new THREE.CylinderGeometry(560, 620, 90, 40, 1, true),
      new THREE.MeshBasicMaterial({
        map: hazeTex,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
      })
    );
    this.scene.add(haze);

    this.scatterHills();
    this.scatterTrees();
    this.scatterMountains();
    this.scatterClouds();
  }

  private scatterHills() {
    const rnd = mulberry32(42);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 13; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 150 + rnd() * 750;
      const h = 9 + rnd() * 22;
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: rnd() < 0.5 ? 0x6d8a45 : 0x748f4a,
          roughness: 1,
          flatShading: true,
        })
      );
      m.position.set(Math.cos(a) * r, h * 0.45, Math.sin(a) * r);
      m.scale.set(55 + rnd() * 75, h, 55 + rnd() * 75);
      m.rotation.y = rnd() * Math.PI;
      m.castShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
    }
  }

  private scatterTrees() {
    const rnd = mulberry32(2026);
    const N = 150;
    const dummy = new THREE.Object3D();
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, 1.3, 5);
    const trunks = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }),
      N
    );
    const canopyGeo = new THREE.ConeGeometry(1, 1, 7);
    const canopyMeshes = [
      new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: 0x2f6133, roughness: 1 }), N),
      new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: 0x3f7838, roughness: 1 }), N),
      new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: 0x4c8a3d, roughness: 1 }), N),
    ];
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 30 + rnd() * 270;
      const s = 0.75 + rnd() * 1.0;
      const trunkScaleY = s * (0.9 + rnd() * 0.35);
      const trunkHeight = 1.3 * trunkScaleY;
      const layout = stackPineCanopies(trunkHeight, [1.18 * s, 0.92 * s, 0.7 * s], 0.08 * s);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // CylinderGeometry is centered on its origin: this puts its bottom
      // exactly on the ground plane instead of burying or floating the trunk.
      dummy.position.set(x, layout.trunkCenterY, z);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.set(0.78 * s, trunkScaleY, 0.78 * s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      // Each centered cone starts at the previous tier's top with a small
      // overlap, so the green canopy never appears disconnected from the trunk.
      const tierRadii = [0.95 * s, 0.76 * s, 0.56 * s];
      for (let tier = 0; tier < canopyMeshes.length; tier++) {
        const canopy = layout.tiers[tier];
        dummy.position.set(x, canopy.centerY, z);
        dummy.scale.set(tierRadii[tier], canopy.height, tierRadii[tier]);
        dummy.updateMatrix();
        canopyMeshes[tier].setMatrixAt(i, dummy.matrix);
      }
    }
    trunks.castShadow = true;
    trunks.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks);
    for (const canopy of canopyMeshes) {
      canopy.castShadow = true;
      canopy.frustumCulled = false;
      canopy.instanceMatrix.needsUpdate = true;
      this.scene.add(canopy);
    }

    // Çalılar
    const bushes = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x55813e, roughness: 1, flatShading: true }),
      42
    );
    for (let i = 0; i < 42; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 14 + rnd() * 90;
      const s = 0.35 + rnd() * 0.5;
      dummy.position.set(Math.cos(a) * r, s * 0.28, Math.sin(a) * r);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.set(s, s * 0.6, s);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
    }
    bushes.castShadow = true;
    bushes.frustumCulled = false;
    this.scene.add(bushes);

    // Kayalar
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 0.9, flatShading: true }),
      26
    );
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 22 + rnd() * 420;
      const s = 0.25 + rnd() * 1.1;
      dummy.position.set(Math.cos(a) * r, s * 0.35, Math.sin(a) * r);
      dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.frustumCulled = false;
    this.scene.add(rocks);
  }

  private scatterMountains() {
    const rnd = mulberry32(99);
    const N = 14;
    const geo = new THREE.ConeGeometry(1, 1, 7);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8fa6bd, roughness: 1, flatShading: true });
    const meshes = new THREE.InstancedMesh(geo, mat, N);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd() * 0.4;
      const r = 980 + rnd() * 480;
      const w = 260 + rnd() * 260;
      const h = 160 + rnd() * 280;
      dummy.position.set(Math.cos(a) * r, h * 0.2, Math.sin(a) * r);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.set(w, h, w);
      dummy.updateMatrix();
      meshes.setMatrixAt(i, dummy.matrix);
    }
    meshes.frustumCulled = false;
    this.scene.add(meshes);
  }

  private scatterClouds() {
    const rnd = mulberry32(11);
    const puffGeo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 24; i++) {
      const cloud = new THREE.Group();
      const n = 3 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) {
        const p = new THREE.Mesh(puffGeo, mat);
        p.position.set((rnd() - 0.5) * 1.8, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.8);
        const s = 10 + rnd() * 14;
        p.scale.set(s, s * 0.5, s * 0.85);
        p.frustumCulled = false;
        cloud.add(p);
      }
      const r = 90 + rnd() * 380;
      const a = rnd() * Math.PI * 2;
      cloud.position.set(Math.cos(a) * r, 130 + rnd() * 120, Math.sin(a) * r);
      this.cloudGroup.add(cloud);
    }
    this.scene.add(this.cloudGroup);
  }

  private buildRail(): THREE.Group {
    const g = new THREE.Group();
    const legMat = steel(0x6f787e, 0.42, 0.72);

    // Ana beton kaide (oktagonal) + üst kaide
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.9, 0.45, 8), concrete(0x8d9298));
    plinth.position.y = -0.05;
    plinth.receiveShadow = true;
    g.add(plinth);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.34, 24), concrete(0x9aa0a6));
    top.position.y = 0.3;
    top.receiveShadow = true;
    top.castShadow = true;
    g.add(top);

    // Kısa, ince arka kule destekleri: merkez hattını boş bırakıp roketi kadrajda kapatmaz.
    const legGeo = new THREE.CylinderGeometry(0.035, 0.055, 1.65, 8);
    for (const x of [-0.68, 0.68]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, 1.2, -0.24);
      leg.rotation.z = x < 0 ? 0.12 : -0.12;
      leg.castShadow = true;
      g.add(leg);
    }
    const towerCrossbarMat = steel(0x606a70, 0.45, 0.68);
    for (const y of [0.75, 1.5]) {
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.035, 0.035), towerCrossbarMat);
      crossbar.position.set(0, y, -0.24);
      crossbar.castShadow = true;
      g.add(crossbar);
    }

    // Kettős ray: merkez hattı boş kalır, roket her açıdan okunur.
    const railHeight = 1.85;
    const railMat = steel(0x5a6066, 0.4, 0.8);
    for (const x of [-0.12, 0.12]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, railHeight, 10), railMat);
      rail.position.set(x, railHeight / 2, 0);
      rail.castShadow = true;
      g.add(rail);
    }
    for (const y of [0.35, 0.85, 1.35, 1.75]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.04), steel(0x454a50, 0.5, 0.7));
      brace.position.set(0, y, 0);
      g.add(brace);
    }

    // Her iki ray için kılavuz halkalar
    const ringGeo = new THREE.TorusGeometry(0.045, 0.008, 8, 18);
    const ringMat = steel(0x3f444a, 0.35, 0.85);
    for (const y of [0.28, 0.62, 1.0, 1.38, 1.74]) {
      for (const x of [-0.12, 0.12]) {
        const r = new THREE.Mesh(ringGeo, ringMat);
        r.position.set(x, y, 0);
        r.rotation.x = Math.PI / 2;
        g.add(r);
      }
    }

    // Alev deflektörü: V-kanal (sarı-siyah uyarı şeritli) + yan duvarlar + yanık iç yüz
    const deflectMat = steel(0x2f343a, 0.55, 0.75);
    const stripeMat = new THREE.MeshStandardMaterial({ map: this.makeWarningStripes(), roughness: 0.6, metalness: 0.3 });
    const scorchMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.9, metalness: 0.4 });
    const near = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.5), stripeMat);
    near.position.set(0, 0.42, -0.55);
    near.rotation.x = -0.6;
    near.castShadow = true;
    g.add(near);
    const far = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.5), stripeMat);
    far.position.set(0, 0.42, -0.15);
    far.rotation.x = 0.45;
    far.castShadow = true;
    g.add(far);
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.7), deflectMat);
      wall.position.set(sx * 0.42, 0.42, -0.32);
      wall.rotation.x = 0.08;
      g.add(wall);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 6), steel(0x555b61));
      strut.position.set(sx * 0.3, 0.22, -0.32);
      strut.rotation.x = 0.5;
      strut.castShadow = true;
      g.add(strut);
    }
    const burnt = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.18), scorchMat);
    burnt.position.set(0, 0.42, -0.34);
    burnt.rotation.x = -0.08;
    g.add(burnt);

    // Kırmızı uyarı feneri
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff2200, emissiveIntensity: 1.0, roughness: 0.4 })
    );
    beacon.position.set(0.86, 0.52, 0.42);
    this.blinkMats.push(beacon.material as THREE.MeshStandardMaterial);
    g.add(beacon);

    // Kalkış kelepçeleri: motor yanınca dışa katlanır (update() sürer)
    const clampMat = steel(0x4a5057, 0.5, 0.6);
    for (const sx of [-1, 1]) {
      const clamp = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), clampMat);
      arm.position.set(-sx * 0.19, 0, 0);
      arm.castShadow = true;
      const paw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.1, 6), steel(0x3a3f45, 0.4, 0.7));
      paw.rotation.z = Math.PI / 2;
      paw.position.set(-sx * 0.36, 0, 0);
      clamp.add(arm, paw);
      clamp.position.set(sx * 0.44, 1.05, 0);
      this.clamps.push(clamp);
      g.add(clamp);
    }

    // Kontrol kulübesi
    const shack = new THREE.Group();
    const shackBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.85), concrete(0x8d9298));
    shackBody.position.y = 0.45;
    shackBody.castShadow = true;
    shack.add(shackBody);
    const shackRoof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.35, 4), steel(0x6a7178, 0.5, 0.4));
    shackRoof.rotation.y = Math.PI / 4;
    shackRoof.position.y = 1.07;
    shack.add(shackRoof);
    const shackDoor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.02), steel(0x3a3f45, 0.5, 0.3));
    shackDoor.position.set(0, 0.3, 0.44);
    shack.add(shackDoor);
    const shackLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xcc3333, emissive: 0xff3300, emissiveIntensity: 1 })
    );
    shackLight.position.set(0.5, 0.78, 0.44);
    shack.add(shackLight);
    this.blinkMats.push(shackLight.material as THREE.MeshStandardMaterial);
    shack.position.set(3.6, 0, -3.4);
    shack.rotation.y = 0.6;
    g.add(shack);

    // Yangın söndürücüler
    const extinguisherMat = new THREE.MeshStandardMaterial({ color: 0xd03c2f, roughness: 0.6 });
    for (const [ex, ez] of [[1.95, -1.05], [2.2, -0.85]] as const) {
      const exf = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 8), extinguisherMat);
      cyl.position.y = 0.16;
      cyl.castShadow = true;
      exf.add(cyl);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.08, 6), steel(0x999999, 0.4, 0.6));
      cap.position.y = 0.37;
      exf.add(cap);
      exf.position.set(ex, 0, ez);
      g.add(exf);
    }

    // Trafik konileri
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xe8702a, roughness: 0.6 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6 });
    for (const [cx, cz] of [[1.55, 1.35], [-1.55, 1.2], [0.45, -1.65]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), coneMat);
      cone.position.set(cx, 0.15, cz);
      cone.castShadow = true;
      g.add(cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.05, 8), bandMat);
      band.position.y = 0.12;
      cone.add(band);
    }
    return g;
  }

  // -------------------------------------------------------------------------
  // Alev konileri (mesh) — partiküllere ek olarak dolgun alev
  // -------------------------------------------------------------------------

  private makeFlameCone(color: THREE.ColorRepresentation, opacity: number, base: number, tip: number, len: number): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(base, tip, len, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -len / 2; // geniş ağız lüle düzleminde, uç aşağıda
    return m;
  }

  private buildFlameCones() {
    // HDR renkler: ACES ton eşlemesi + bloom ile çekirdek parıltısı korunur.
    this.flameGroup.add(this.makeFlameCone(new THREE.Color(1.9, 1.25, 0.45), 0.5, 0.16, 0.02, 1.15));
    this.flameGroup.add(this.makeFlameCone(new THREE.Color(2.6, 1.7, 0.6), 0.6, 0.11, 0.015, 0.85));
    this.flameGroup.add(this.makeFlameCone(new THREE.Color(3.4, 3.0, 2.3), 0.85, 0.05, 0.008, 0.55));
  }

  private buildBoosterFlames(config: RocketConfig) {
    this.boosterFlameGroups = [];
    if (config.boosterCount === 0) return;
    const s0 = config.stages[0];
    const R0 = s0.body.diameterM / 2;
    const bd = s0.body.diameterM * 0.45;
    for (let i = 0; i < config.boosterCount; i++) {
      const theta = (i * 2 * Math.PI) / config.boosterCount;
      const bf = new THREE.Group();
      bf.add(this.makeFlameCone(new THREE.Color(1.6, 1.05, 0.4), 0.45, 0.09, 0.015, 0.7));
      bf.add(this.makeFlameCone(new THREE.Color(2.2, 1.45, 0.55), 0.55, 0.06, 0.01, 0.5));
      bf.add(this.makeFlameCone(new THREE.Color(2.9, 2.6, 2.0), 0.8, 0.03, 0.006, 0.32));
      bf.position.set(Math.cos(theta) * (R0 + bd * 0.55), -0.02, Math.sin(theta) * (R0 + bd * 0.55));
      this.boosterGroup.add(bf);
      this.boosterFlameGroups.push(bf);
    }
  }

  private buildWindVane() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8), mat);
    pole.position.set(6, 1.1, 6);
    this.scene.add(pole);
    this.windVane = new THREE.Group();
    this.windVane.position.set(6, 2.2, 6);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 3), mat);
    arrow.rotation.z = Math.PI / 2;
    arrow.position.x = 1.3;
    this.windVane.add(arrow);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.14), mat);
    tail.position.x = -1.5;
    this.windVane.add(tail);
    this.scene.add(this.windVane);
  }

  // -------------------------------------------------------------------------
  // Roket kurulumu
  // -------------------------------------------------------------------------

  setRocket(config: RocketConfig, _assembly: RocketAssembly) {
    // Eski kademe mesh'lerini yık (geometri/material sızıntısı olmasın);
    // flameGroup tek sefer kurulur ve yeniden eklenir — dispose edilmez.
    const oldChildren = [...this.rocketGroup.children];
    this.rocketGroup.remove(...oldChildren);
    for (const c of oldChildren) if (c !== this.flameGroup) disposeDeep(c);
    this.rocketGroup.add(this.flameGroup);
    this.windDeg = config.windDeg;
    this.railLen = config.railM ?? 1.2;
    this.stageGroups = [];
    this.stageBottomLocalY = [];
    this.chuteState = "none";
    this.chuteProgress = 0;
    clearDisposed(this.chuteGroup);

    // Kademeleri alttan üste istifle: her kademenin tabanı (lüle) y=0'da,
    // burnu +Y'de. Sonraki (üst) kademe bir öncekinin burnunun üstüne biner.
    let y = 0;
    for (let i = config.stages.length - 1; i >= 0; i--) {
      const built = buildStageMesh(config.stages[i], i, { showRecovery: true });
      built.group.position.y = y;
      this.rocketGroup.add(built.group);
      this.stageGroups.unshift(built.group);
      this.stageBottomLocalY.unshift(y);
      y += built.noseTopLocalY;
    }
    this.rocketHeight = y;
    this.activeBottomIdx = this.stageGroups.length - 1;

    // Booster'lar (ilk kademe gövdesi boyunca)
    this.rocketGroup.remove(this.boosterGroup);
    disposeDeep(this.boosterGroup);
    this.boosterGroup = new THREE.Group();
    if (config.boosterCount > 0) {
      const s0 = config.stages[0];
      const R0 = s0.body.diameterM / 2;
      const mat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.5, metalness: 0.2 });
      const len = s0.body.lengthM * 0.85;
      const bd = s0.body.diameterM * 0.45;
      for (let i = 0; i < config.boosterCount; i++) {
        const theta = (i * 2 * Math.PI) / config.boosterCount;
        const g = new THREE.Group();
        const tube = new THREE.Mesh(
          cachedGeom(`btube:${(bd / 2).toFixed(4)}:${(bd / 2).toFixed(4)}:${len.toFixed(4)}:12`, () => new THREE.CylinderGeometry(bd / 2, bd / 2, len, 12)),
          mat,
        );
        tube.position.y = len / 2;
        g.add(tube);
        const cone = new THREE.Mesh(
          cachedGeom(`bcone:${(bd / 2).toFixed(4)}:${(bd * 1.6).toFixed(4)}:12`, () => new THREE.ConeGeometry(bd / 2, bd * 1.6, 12)),
          new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.4 })
        );
        cone.position.y = len + bd * 0.8;
        g.add(cone);
        const nozzle = new THREE.Mesh(
          cachedGeom(`bnoz:${(bd * 0.3).toFixed(4)}:${(bd * 0.55).toFixed(4)}:10`, () => new THREE.CylinderGeometry(bd * 0.3, bd * 0.55, 0.03, 10)),
          new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
        );
        nozzle.position.y = -0.02;
        g.add(nozzle);
        g.position.set(Math.cos(theta) * (R0 + bd * 0.55), 0, Math.sin(theta) * (R0 + bd * 0.55));
        this.boosterGroup.add(g);
      }
    }
    this.rocketGroup.add(this.boosterGroup);
    this.buildBoosterFlames(config);

    // Uçuş yoksa roketi raya koy
    this.rocketGroup.position.set(0, this.padY, 0);
    this.rocketGroup.quaternion.identity();
  }

  // -------------------------------------------------------------------------
  // Oynatım
  // -------------------------------------------------------------------------

  applySample(sample: TelemetrySample | null, events: FlightEvent[]) {
    if (!sample) return;
    const p = sample.pos;
    const rocket = this.rocketGroup;
    // Simülasyon konumu zemin tabanlıdır (rayda 0'dan ray boyuna yükselir).
    // Ray üzerindeyken roket padY'de (ray tepesinde) görünür; ray çıkışından
    // sonra zemin yüksekliğine padY-railLen ofseti eklenir ki konum sürekli kalsın.
    const onRail = sample.onRail;
    rocket.position.set(
      p[0],
      onRail ? this.padY : p[1] + this.padY - this.railLen,
      p[2],
    );

    // Yönelim: uçuşta hız yönünde +Y; paraşüt açılınca sarkıç fiziği devreye
    // girer (update() içinde salınarak dikleşir) — ani dikleşme doğal değil.
    const target = rocketUpVector(sample.vel, this.chuteState !== "none");
    if (this.chuteState === "none") {
      this.rocketUpVec.copy(target);
      this.rocketAngVel = 0;
    }
    rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.rocketUpVec);

    // Kademe / booster ayrımları: ayrılan alt kademeleri gizle (üst kademeler
    // uçan araç olarak kalır). Kademe 0 = en üst, son kademe = en alt.
    const nSep = events.filter((e) => e.id === "stageSep" && e.t <= sample.t).length;
    for (let i = 0; i < this.stageGroups.length; i++) {
      this.stageGroups[i].visible = isStageVisible(i, this.stageGroups.length, nSep);
    }
    this.activeBottomIdx = this.stageGroups.length - 1 - Math.min(nSep, this.stageGroups.length - 1);
    const boosterSep = events.some((e) => e.id === "boosterSep" && e.t <= sample.t);
    this.boosterGroup.visible = !boosterSep;
    this.flameGroup.position.set(0, this.stageBottomLocalY[this.activeBottomIdx] ?? 0, 0);

    // Alev: itki varsa
    const thrust = sample.thrustN ?? 0;
    this.setFlame(thrust > 0.5, thrust);

    // Paraşüt (animasyon bu sınıfın update döngüsünde tamamlanır)
    const drogue = events.find((e) => e.id === "drogueDeploy");
    const deploy = events.find((e) => e.id === "deploy" || e.id === "mainDeploy");
    const drogueAt = drogue ? drogue.t : Infinity;
    const deployAt = deploy ? deploy.t : Infinity;
    if (drogue && sample.t >= drogueAt && sample.t < deployAt) this.setChute("drogue");
    if (deploy && sample.t >= deployAt) this.setChute("main");

    // Aim at the visual center of the rocket, not at the launch point below it.
    // This keeps the corrected nose and the rest of the vehicle composed well
    // from every follow-camera angle, including tilted flight.
    const rocketUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rocket.quaternion);
    this.lookTarget.copy(rocket.position).addScaledVector(rocketUp, this.rocketHeight * 0.45);
    this.updateCamera();
  }

  private setFlame(on: boolean, thrust: number) {
    const prevOn = this.flame.points.visible;
    this.flame.points.visible = on;
    this.smoke.points.visible = on;
    this.flameGroup.visible = on;
    for (const g of this.boosterFlameGroups) g.visible = on;
    // Kalkış anında (ilk alev) rampa çevresinde toz bulutu
    if (on && !prevOn && !this.dustLaunched) {
      this.dustLaunched = true;
      this.burstPadDust();
    }
    // Alev konisi boyutu itkiyle büyür (güç yasasıyla yumuşatılmış)
    this.flameIntensity = on ? Math.max(0.3, Math.min(1.7, Math.pow(thrust / 40, 0.45))) : 0;
    if (!on) return;
    const nozzle = new THREE.Vector3(0, this.stageBottomLocalY[this.activeBottomIdx] ?? 0, 0);
    this.rocketGroup.localToWorld(nozzle);
    if (REDUCED_MOTION) return;
    const n = Math.min(4, Math.floor(thrust * 1.5) + 1);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5) * 0.1, -1, (Math.random() - 0.5) * 0.1).normalize();
      const vel = dir.multiplyScalar(4 + Math.random() * 5);
      this.flame.emit(nozzle, vel, 0.12 + Math.random() * 0.1, 0.5 + thrust * 0.08);
    }
  }

    /** Sarı-siyah çapraz uyarı şeridi dokusu (deflektör için). */
  private makeWarningStripes(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c9a227";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#1a1a1a";
    const w = 14;
    for (let x = -64; x < 192; x += w * 2) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + w, 64);
      g.lineTo(x + w + 32, 0);
      g.lineTo(x + 32, 0);
      g.closePath();
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Kalkış anında rampa çevresinde toz bulutu + genişleyen halka. */
  private burstPadDust() {
    if (REDUCED_MOTION) return;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 1.4;
      this.dust.emit(
        new THREE.Vector3(Math.cos(a) * r, 0.06 + Math.random() * 0.25, Math.sin(a) * r),
        new THREE.Vector3(
          Math.cos(a) * (1.2 + Math.random() * 1.6),
          1.2 + Math.random() * 2.4,
          Math.sin(a) * (1.2 + Math.random() * 1.6)
        ),
        1.4 + Math.random() * 1.2,
        1.4 + Math.random() * 1.0
      );
    }
    this.dustActive = true;
    this.dustProgress = 0;
    if (this.dustRing) {
      this.dustRing.visible = true;
      this.dustRing.scale.setScalar(0.01);
    }
  }

  /** Paraşüt kanopisi: radyal gofres (şerit) + kenar gölgeleme dokusu. */
  private makeChuteTexture(main: string, alt: string): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    const SECTORS = 8;
    for (let i = 0; i < SECTORS; i++) {
      const a0 = (i * Math.PI * 2) / SECTORS - Math.PI / 2;
      const a1 = ((i + 1) * Math.PI * 2) / SECTORS - Math.PI / 2;
      g.beginPath();
      g.moveTo(128, 128);
      g.arc(128, 128, 128, a0, a1);
      g.closePath();
      g.fillStyle = i % 2 === 0 ? main : alt;
      g.fill();
    }
    const grad = g.createRadialGradient(128, 128, 24, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,0.22)");
    grad.addColorStop(0.75, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.4)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private setChute(state: "drogue" | "main") {
    if (this.chuteState === state) return;
    this.chuteState = state;
    this.chuteProgress = 0.02;
    clearDisposed(this.chuteGroup);
    const dia = state === "drogue" ? 0.15 : 0.5;
    const mat = new THREE.MeshStandardMaterial({
      map: this.makeChuteTexture(state === "drogue" ? "#ff8c2e" : "#e83d3d", "#f5f0e8"),
      roughness: 0.95,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
    });
    const canopy = new THREE.Mesh(
      cachedGeom(`chute:${dia.toFixed(3)}:20`, () => new THREE.SphereGeometry(dia, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)),
      mat,
    );
    canopy.scale.y = 1.5;
    canopy.position.y = dia * 1.4;
    this.chuteGroup.add(canopy);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      const line = new THREE.Line(
        cachedGeom(`chuteline:${dia.toFixed(3)}:${i}`, () =>
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(Math.cos(a) * dia * 0.8, dia * 1.4 - dia * 0.2, Math.sin(a) * dia * 0.8),
            new THREE.Vector3(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02),
          ])),
        new THREE.LineBasicMaterial({ color: 0xdddddd })
      );
      this.chuteGroup.add(line);
    }
  }

  private updateCamera() {
    // Uzaklık roket boyuna göre ölçeklenir: irtifa ne olursa olsun gövde
    // ekranda okunabilir kalır (0.3 m'lik roket eskiden 80 m'den sub-pikseldi;
    // sadece alev ve paraşüt görünüyordu).
    const dist = followDistance(this.rocketHeight, this.followZoom);
    if (this.cameraMode === "follow") {
      const desired = this.lookTarget.clone().add(
        new THREE.Vector3(Math.sin(this.camAngle) * dist, dist * 0.4, Math.cos(this.camAngle) * dist)
      );
      // Roket hızlandığında lerp yetişemez — çok uzağa düşünce doğrudan atla
      const tooFar = this.camera.position.distanceTo(this.lookTarget) > dist * 2.2;
      if (tooFar) {
        this.camera.position.copy(desired);
        // Hedef de zıplasın; yoksa kadraj boş gökyüzüne bakar (scrub/teleport)
        this.controls.target.copy(this.lookTarget);
      } else {
        this.camera.position.lerp(desired, 0.18);
        this.controls.target.lerp(this.lookTarget, 0.2);
      }
      this.controls.enabled = false;
    } else if (this.cameraMode === "pad") {
      this.controls.enabled = false;
      // Rampa kamerası sahaya bakar; roket yükselse bile kadraj kaymaz.
      const padCam = new THREE.Vector3(0.9 * dist, 2.4, 1.1 * dist);
      this.camera.position.lerp(padCam, 0.1);
      this.controls.target.lerp(new THREE.Vector3(0, 1.6, 0), 0.14);
    } else {
      this.controls.enabled = true;
    }
  }

  private camAngle = 0.7;
  private camTime = 0;

  setCameraMode(mode: "follow" | "pad" | "free") {
    this.cameraMode = mode;
    if (mode === "free") this.controls.enabled = true;
  }

  setGridVisible(visible: boolean) {
    if (this.gridHelper) this.gridHelper.visible = visible;
  }

  /** Uçuş yokken roketi rampa üzerine koyar, alev/duman/paraşütü kapatır. */
  resetToPad() {
    this.rocketGroup.position.set(0, this.padY, 0);
    this.rocketGroup.quaternion.identity();
    this.rocketUpVec.set(0, 1, 0);
    this.rocketAngVel = 0;
    this.stageGroups.forEach((g) => (g.visible = true));
    this.boosterGroup.visible = true;
    this.activeBottomIdx = this.stageGroups.length - 1;
    this.setFlame(false, 0);
    this.flame.points.visible = false;
    this.smoke.points.visible = false;
    this.flameGroup.visible = false;
    for (const g of this.boosterFlameGroups) g.visible = false;
    this.flameIntensity = 0;
    this.dust.points.visible = false;
    this.dustLaunched = false;
    this.dustActive = false;
    if (this.dustRing) this.dustRing.visible = false;
    this.chuteState = "none";
    this.chuteProgress = 0;
    clearDisposed(this.chuteGroup);
    // Uçuş bitince follow modu kontrolleri kilitliyor — idle'ken geri aç
    this.controls.enabled = true;
  }

  /** Kamerayı varsayılan (rampa) görünümüne döndürür. */
  resetView() {
    this.followZoom = 1;
    this.camera.position.set(3.0, 2.6, 4.2);
    this.controls.target.set(0, 2.0, 0);
    this.controls.enabled = true;
    this.controls.update();
  }

  showTrajectory(samples: TelemetrySample[], visible: boolean) {
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryMat?.dispose();
      this.trajectoryLine = null;
      this.trajectoryMat = null;
    }
    this.trajectoryMarkers.clear();
    if (!visible || samples.length < 2) return;

    // GPU/çizgi bütçesi: telemetri 10 bin+ örneğe çıkabilir; eşit adımla alt örnekle.
    const pts = downsample(samples, 1200);

    // İrtifaya göre renklendirilmiş yörünge: alçakta yeşil → yüksekte açık mavi
    const maxAlt = Math.max(...pts.map((s) => s.pos[1]));
    const positions: number[] = [];
    const colors: number[] = [];
    const cLow = new THREE.Color(0x66aa44);
    const cMid = new THREE.Color(0xffcc33);
    const cHigh = new THREE.Color(0x8ec5ff);
    for (const s of pts) {
      const f = maxAlt > 0.01 ? Math.min(1, s.pos[1] / maxAlt) : 0;
      const c = f < 0.5 ? cLow.clone().lerp(cMid, f * 2) : cMid.clone().lerp(cHigh, (f - 0.5) * 2);
      positions.push(s.pos[0], s.pos[1], s.pos[2]);
      colors.push(c.r, c.g, c.b);
    }
    const geo = new LineGeometry();
    geo.setPositions(positions);
    geo.setColors(colors);
    const mat = new LineMaterial({
      vertexColors: true,
      linewidth: 2.4,
      transparent: true,
      opacity: 0.95,
    });
    mat.resolution.copy(this.renderer.getSize(new THREE.Vector2()));
    this.trajectoryMat = mat;
    this.trajectoryLine = new Line2(geo, mat);
    this.trajectoryLine.computeLineDistances();
    this.scene.add(this.trajectoryLine);

    // Apogee işareti (altın halka) ve iniş noktası (mavi daire) — hafif HDR parıltı
    const apogee = samples.reduce((a, b) => (b.pos[1] > a.pos[1] ? b : a));
    if (apogee.pos[1] > 1) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.4, 2.9, 32),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.15, 0.4), transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(apogee.pos[0], apogee.pos[1], apogee.pos[2]);
      this.trajectoryMarkers.add(ring);
    }
    const last = samples[samples.length - 1];
    if (last.pos[1] < 5) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.8, 40),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.35), transparent: true, opacity: 0.8, toneMapped: false })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(last.pos[0], 0.03, last.pos[2]);
      this.trajectoryMarkers.add(disc);
    }
  }

  update(dt: number, simTime: number) {
    this.camTime += dt;
    this.camAngle = REDUCED_MOTION ? 0.7 : 0.7 + Math.sin(this.camTime * 0.13) * 0.12;
    this.smokeAccum += dt;
    if (this.smokeAccum > 0.05 && this.flame.points.visible && !REDUCED_MOTION) {
      this.smokeAccum = 0;
      const nozzle = new THREE.Vector3(0, this.stageBottomLocalY[this.activeBottomIdx] ?? 0, 0);
      this.rocketGroup.localToWorld(nozzle);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4);
      this.smoke.emit(nozzle, vel, 1.6 + Math.random() * 1.2, 1);
    }

    // Alev konileri: itkiyle ölçeklenir, rastgele titrer
    if (this.flameGroup.visible) {
      const t = this.camTime;
      this.flameGroup.scale.setScalar(this.flameIntensity);
      if (!REDUCED_MOTION) {
        this.flameGroup.children.forEach((c, i) => {
          const s = 0.8 + 0.2 * Math.sin(t * 37 + i * 2.3) * Math.sin(t * 19 + i * 1.7);
          c.scale.set(s, 1 + 0.15 * Math.sin(t * 29 + i * 3.1), s);
        });
        this.boosterFlameGroups.forEach((g, gi) => {
          g.scale.setScalar(this.flameIntensity * 0.6);
          g.children.forEach((c, i) => {
            const s = 0.8 + 0.2 * Math.sin(t * 41 + gi * 2.1 + i * 2.3);
            c.scale.set(s, 1 + 0.15 * Math.sin(t * 27 + gi * 1.3 + i * 3.1), s);
          });
        });
      }
    }

    // Rüzgar gülü rüzgar yönüne döner (hafif salınımla)
    this.windVane.rotation.y =
      -(this.windDeg * Math.PI) / 180 + (REDUCED_MOTION ? 0 : Math.sin(this.camTime * 1.8) * 0.08);
    // Bulutlar yavaşça süzülür
    if (!REDUCED_MOTION) this.cloudGroup.rotation.y = this.camTime * 0.004;
    // Seyrüsefer ışıkları: yavaş nabız — bloom ile kırmızı parıltı yapar
    if (this.blinkMats.length > 0) {
      const pulse = Math.sin(this.camTime * 2.4) * 0.5 + 0.5;
      for (const m of this.blinkMats) m.emissiveIntensity = REDUCED_MOTION ? 1.5 : 0.7 + pulse * 3.4;
    }
    // Kalkış kelepçeleri: motor yanınca dışa katlanır
    const foldTarget = this.flameIntensity > 0 ? 1 : 0;
    this.clampFold += (foldTarget - this.clampFold) * Math.min(1, dt * 3);
    for (let i = 0; i < this.clamps.length; i++) {
      this.clamps[i].rotation.y = (i === 0 ? -1 : 1) * this.clampFold * 1.15;
    }
    // Kalkış tozu halkası: yayılıp söner
    if (this.dustActive && !REDUCED_MOTION) {
      this.dustProgress += dt * 1.5;
      const p = this.dustProgress;
      if (this.dustRing) {
        this.dustRing.scale.setScalar(0.01 + p * 12);
        (this.dustRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - p));
        this.dustRing.visible = p < 1.05;
      }
      if (p > 1.2) this.dustActive = false;
    }
    // Paraşüt: burnun ucuna bağlıdır (kanopi burunda paketlenir), açılma animasyonlu
    if (this.chuteState !== "none") {
      this.rocketAngVel = swingUp(
        this.rocketUpVec,
        this.rocketAngVel,
        RocketScene.PENDULUM_TARGET,
        RocketScene.PENDULUM_SPRING,
        RocketScene.PENDULUM_DAMPING,
        dt
      );
      this.chuteGroup.position.copy(this.rocketGroup.position).addScaledVector(this.rocketUpVec, this.rocketHeight + 0.02);
      this.chuteGroup.rotation.set(0, REDUCED_MOTION ? 0 : this.camTime * 0.4, 0);
      if (this.chuteProgress < 1) {
        this.chuteProgress = Math.min(1, this.chuteProgress + dt * 1.6);
        this.chuteGroup.scale.setScalar(Math.max(0.02, this.chuteProgress));
      }
    }
    this.flame.update(dt, 9.8);
    this.smoke.update(dt, 0.4);
    this.dust.update(dt, 9.8);
    this.controls.update();
    void simTime;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    // Güncelleme RocketView'ın kendi rAF döngüsünden sürülür; burada sadece
    // render edilir (update'teki partikül/kamera adımları iki kez ilerlemesin).
    this.composer.render();
  };

  resize(): void {
    this.onResize();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    // Sahne ağacındaki paylaşılmayan geometri/material'ları serbest bırak
    // (cached/shared olanlar uygulama ömrü boyunca yaşar).
    disposeDeep(this.scene);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
