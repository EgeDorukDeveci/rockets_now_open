// Teknik mod Three.js sahnesi: yerleşimlerden prosedürel roket, CG/CP işaretleri,
// rampa rayı, yörünge çizgisi, alev ve paraşüt. Oynatım store'daki teknik
// simülasyon örnekleriyle sürülür (fizik ayrı katmandadır).
//
// Koordinat eşlemesi: teknik çerçeve ENU (x=doğu, y=kuzey, z=yukarı) →
// three.js (x=doğu, y=yukarı, z=kuzey). Roket burun ucu +Y'de, yerleşim
// x'i +Y'ye doğrusal taşınır.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { TechRocket } from "../model";
import { assembleTech, placeRocket, motorSpecsFromCatalog } from "../physics/assembly";
import { TechSimSample } from "../physics/simulator";

const BG = new THREE.Color(0x0a0f18);
const GRID_COLOR = 0x1c2736;

// ---------------------------------------------------------------------------
// Burun profilleri (t ∈ [0,1] → normalize yarıçap)
// ---------------------------------------------------------------------------

function noseRadiusAt(shape: string, t: number, param: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (shape) {
    case "conical":
      return 1 - x;
    case "ogive": {
      const L = 1;
      const R = 1;
      const rho = (L * L + R * R) / (2 * R);
      return (R - rho) + Math.sqrt(Math.max(0, rho * rho - (L - x) * (L - x)));
    }
    case "elliptical":
      return Math.sqrt(Math.max(0, 1 - (1 - x) * (1 - x)));
    case "parabolic":
      return 2 * x - x * x;
    case "power":
      return Math.pow(x, Math.min(1.5, Math.max(0.1, param || 0.5)));
    case "haack": {
      const th = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * x)));
      return Math.sqrt(Math.max(0, (th - Math.sin(2 * th) / 2) / Math.PI));
    }
    default:
      return 1 - x;
  }
}

function noseProfilePoints(shape: string, param: number, R: number, L: number, seg = 24): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector2(Math.max(0.0001, R * noseRadiusAt(shape, t, param)), t * L));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Sahne
// ---------------------------------------------------------------------------

export interface TechSceneCallbacks {
  onReady?: () => void;
}

export class TechScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private rocketGroup = new THREE.Group();
  private chuteGroup = new THREE.Group();
  private flame: THREE.Mesh;
  private flameBase = 1;
  private trajectoryLine: Line2 | null = null;
  private trajectoryMat: LineMaterial | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private padGroup = new THREE.Group();

  private cgMarker: THREE.Mesh | null = null;
  private cpMarker: THREE.Mesh | null = null;
  private rodDir = new THREE.Vector3(0, 1, 0);
  private rodLen = 1.2;

  private cameraMode: "follow" | "pad" | "free" = "follow";
  private lookTarget = new THREE.Vector3(0, 2, 0);
  private followZoom = 1;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private onResize: () => void;

  private currentPos = new THREE.Vector3(0, 1.2, 0);
  private currentDir = new THREE.Vector3(0, 1, 0);
  private chuteOpen = 0;
  private flameLit = false;
  private simTime = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: TechSceneCallbacks = {}) {
    const { width, height } = canvas.getBoundingClientRect();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = BG;

    this.camera = new THREE.PerspectiveCamera(55, width / Math.max(height, 1), 0.05, 6000);
    this.camera.position.set(2.4, 2.2, 3.6);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 3000;
    this.controls.target.set(0, 2.0, 0);

    canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.buildEnvironment();
    this.scene.add(this.padGroup);
    this.scene.add(this.rocketGroup);
    this.scene.add(this.chuteGroup);

    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.008, 0.12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff9a3c,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.flame.position.y = -0.02;
    this.flame.visible = false;
    this.rocketGroup.add(this.flame);

    this.onResize = () => {
      const r = canvas.getBoundingClientRect();
      this.camera.aspect = r.width / Math.max(r.height, 1);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(r.width, r.height);
      const size = this.renderer.getSize(new THREE.Vector2());
      this.trajectoryMat?.resolution.copy(size);
    };
    window.addEventListener("resize", this.onResize);

    callbacks.onReady?.();
    this.loop();
  }

  private onWheel = (e: WheelEvent) => {
    if (this.cameraMode !== "free") {
      e.preventDefault();
      this.followZoom = Math.min(3.0, Math.max(0.3, this.followZoom * Math.pow(1.0014, -e.deltaY)));
    }
  };

  // -------------------------------------------------------------------------
  // Çevre: koyu zemin + ızgara + işaretçiler (teknik görünüm)
  // -------------------------------------------------------------------------

  private buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x1a1410, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(60, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 160;
    sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(900, 48),
      new THREE.MeshStandardMaterial({ color: 0x0d1420, roughness: 0.98, metalness: 0.02 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.gridHelper = new THREE.GridHelper(200, 40, GRID_COLOR, GRID_COLOR);
    this.gridHelper.position.y = 0.001;
    this.scene.add(this.gridHelper);

    const axis = new THREE.AxesHelper(1.2);
    axis.position.y = 0.01;
    this.scene.add(axis);
  }

  private buildPad() {
    this.padGroup.clear();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: 0x2b3b50, roughness: 0.8, metalness: 0.4 })
    );
    base.position.y = 0.025;
    this.padGroup.add(base);

    const rodLen = Math.max(this.rodLen, 0.3);
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, rodLen, 8),
      new THREE.MeshStandardMaterial({ color: 0x8fa4bd, roughness: 0.35, metalness: 0.85 })
    );
    rod.position.y = rodLen / 2 + 0.05;
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.rodDir);
    this.padGroup.add(rod);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.008, 0.02, 8),
      new THREE.MeshStandardMaterial({ color: 0xff5c7a, roughness: 0.4, metalness: 0.3 })
    );
    tip.position.copy(this.rodDir.clone().multiplyScalar(rodLen + 0.06));
    this.padGroup.add(tip);
  }

  // -------------------------------------------------------------------------
  // Roket üretimi (yerleşimlerden)
  // -------------------------------------------------------------------------

  private buildRocket(rocket: TechRocket) {
    this.rocketGroup.clear();
    this.cgMarker = null;
    this.cpMarker = null;

    const a = assembleTech(rocket);
    const placements = placeRocket(rocket);
    const R = a.referenceDiameter / 2;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.45, metalness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc2, roughness: 0.45, metalness: 0.15 });

    for (const p of placements) {
      const y = p.x;
      switch (p.kind) {
        case "nosecone": {
          const c = placements.find((q) => q.id === p.id);
          if (!c) break;
          const l = p.lengthM;
          const shape = (rocket.stages.flatMap((s) => s.components)).find((q) => q.id === p.id);
          const sh = (shape as { shape?: string; shapeParameter?: number } | undefined)?.shape ?? "ogive";
          const param = (shape as { shapeParameter?: number } | undefined)?.shapeParameter ?? 0.5;
          const pts = noseProfilePoints(sh, param, R, l);
          const geo = new THREE.LatheGeometry(pts, 28);
          const mesh = new THREE.Mesh(geo, accentMat);
          mesh.position.y = y + l;
          mesh.castShadow = true;
          this.rocketGroup.add(mesh);
          break;
        }
        case "bodytube": {
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, p.lengthM, 28), bodyMat);
          mesh.position.y = y + p.lengthM / 2;
          mesh.castShadow = true;
          this.rocketGroup.add(mesh);
          const band = new THREE.Mesh(
            new THREE.CylinderGeometry(R * 1.004, R * 1.004, 0.008, 28),
            new THREE.MeshStandardMaterial({ color: 0x3a4a60, roughness: 0.5 })
          );
          band.position.y = y + p.lengthM - 0.004;
          this.rocketGroup.add(band);
          break;
        }
        case "transition": {
          const c = placements.find((q) => q.id === p.id);
          if (!c) break;
          const comp = (rocket.stages.flatMap((s) => s.components)).find((q) => q.id === p.id) as
            { foreDiameterM?: number; aftDiameterM?: number } | undefined;
          const rFore = (comp?.foreDiameterM ?? R * 2) / 2;
          const rAft = (comp?.aftDiameterM ?? R * 2) / 2;
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rFore, rAft, p.lengthM, 28), accentMat);
          mesh.position.y = y + p.lengthM / 2;
          mesh.castShadow = true;
          this.rocketGroup.add(mesh);
          break;
        }
        case "trapezoidfin":
        case "ellipticalfin":
        case "freeformfin":
        case "tubefin": {
          const comp = (rocket.stages.flatMap((s) => s.components)).find((q) => q.id === p.id);
          if (!comp) break;
          this.addFins(comp as never, p, R);
          break;
        }
        case "launchlug": {
          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(p.radialOffsetM + 0.003, p.radialOffsetM + 0.003, p.lengthM, 12),
            new THREE.MeshStandardMaterial({ color: 0x8fa4bd, roughness: 0.35, metalness: 0.7 })
          );
          mesh.position.y = y + p.lengthM / 2;
          mesh.castShadow = true;
          this.rocketGroup.add(mesh);
          break;
        }
        case "motormount": {
          const comp = (rocket.stages.flatMap((s) => s.components)).find((q) => q.id === p.id) as
            { motorId?: string | null } | undefined;
          if (!comp?.motorId) break;
          const m = motorSpecsFromCatalog(comp.motorId);
          if (!m) break;
          const nozzle = new THREE.Mesh(
            new THREE.CylinderGeometry(m.diameter / 2 * 0.7, m.diameter / 2, 0.02, 16),
            new THREE.MeshStandardMaterial({ color: 0x555f6b, roughness: 0.3, metalness: 0.9 })
          );
          nozzle.position.y = y + p.lengthM - 0.01;
          this.rocketGroup.add(nozzle);
          break;
        }
        default:
          break;
      }
    }

    // CG / CP işaretleri — yerel +Y üzerinde (yeşil = kütle merkezi, kırmızı = basınç merkezi)
    const mkRing = (color: number) => {
      const g = new THREE.Mesh(
        new THREE.TorusGeometry(R * 1.15, 0.0016, 8, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      );
      g.rotation.x = Math.PI / 2;
      return g;
    };
    const mkDot = (color: number) => {
      const g = new THREE.Mesh(
        new THREE.SphereGeometry(0.007, 12, 12),
        new THREE.MeshBasicMaterial({ color })
      );
      return g;
    };
    this.cgMarker = mkRing(0x7dff6a);
    this.cgMarker.position.y = a.cg;
    this.rocketGroup.add(this.cgMarker);
    this.cpMarker = mkDot(0xff5c7a);
    this.cpMarker.position.y = a.cp;
    this.rocketGroup.add(this.cpMarker);

    this.rocketGroup.position.set(0, 0.05 + this.rodLen, 0);
    this.rocketGroup.position.copy(this.rodDir.clone().multiplyScalar(this.rodLen + 0.05));
  }

  private addFins(comp: never, p: { x: number; radialOffsetM: number; angleDeg: number; lengthM: number }, R: number) {
    const c = comp as
      | { kind: "trapezoidfin"; finCount: number; rotationDeg: number; rootChordM: number; tipChordM: number; sweepLengthM: number; heightM: number; thicknessM: number; crossSection: string }
      | { kind: "ellipticalfin"; finCount: number; rotationDeg: number; rootChordM: number; heightM: number; thicknessM: number; crossSection: string }
      | { kind: "freeformfin"; finCount: number; rotationDeg: number; thicknessM: number; points: Array<{ x: number; y: number }> }
      | { kind: "tubefin"; finCount: number; rotationDeg: number; lengthM: number; outerDiameterM: number };
    if (!c) return;

    let shape: THREE.Shape;
    if (c.kind === "trapezoidfin") {
      shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(c.rootChordM, 0);
      shape.lineTo(c.sweepLengthM + c.tipChordM, c.heightM);
      shape.lineTo(c.sweepLengthM, c.heightM);
      shape.closePath();
    } else if (c.kind === "ellipticalfin") {
      shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(c.rootChordM, 0);
      shape.quadraticCurveTo(c.rootChordM * 0.85, c.heightM, c.rootChordM / 2, c.heightM);
      shape.quadraticCurveTo(c.rootChordM * 0.15, c.heightM, 0, 0);
      shape.closePath();
    } else if (c.kind === "freeformfin") {
      shape = new THREE.Shape();
      const pts = c.points;
      if (pts.length < 2) return;
      shape.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
      shape.closePath();
    } else {
      // tubefin: açıklığı dışta duran tüpler — basit yatay silindirler
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8cfc2, roughness: 0.5, metalness: 0.15 });
      for (let i = 0; i < c.finCount; i++) {
        const tube = new THREE.Mesh(
          new THREE.CylinderGeometry(c.outerDiameterM / 2, c.outerDiameterM / 2, c.lengthM, 12),
          mat
        );
        tube.rotation.x = Math.PI / 2;
        const ang = (i / c.finCount) * Math.PI * 2 + (c.rotationDeg * Math.PI) / 180;
        tube.position.set(Math.cos(ang) * (R + c.outerDiameterM / 2), p.x + c.lengthM / 2, Math.sin(ang) * (R + c.outerDiameterM / 2));
        tube.castShadow = true;
        this.rocketGroup.add(tube);
      }
      return;
    }

    const thick = "thicknessM" in c ? c.thicknessM : 0.003;
    const count = "finCount" in c ? c.finCount : 3;
    const rotDeg = "rotationDeg" in c ? c.rotationDeg : 0;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    const mat = new THREE.MeshStandardMaterial({ color: 0xb9845a, roughness: 0.55, metalness: 0.12 });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      const ang = (i / count) * Math.PI * 2 + (rotDeg * Math.PI) / 180 + Math.PI / 2;
      const holder = new THREE.Group();
      holder.rotation.z = Math.PI / 2;
      holder.add(mesh);
      mesh.rotation.y = Math.PI / 2;
      holder.position.y = p.x;
      holder.rotation.y = ang;
      holder.position.set(Math.cos(ang - Math.PI / 2) * 0, 0, 0);
      holder.position.x = Math.cos(ang - Math.PI / 2) * (R - thick / 2);
      holder.position.z = Math.sin(ang - Math.PI / 2) * (R - thick / 2);
      holder.castShadow = true;
      this.rocketGroup.add(holder);
    }
  }

  // -------------------------------------------------------------------------
  // Yörünge
  // -------------------------------------------------------------------------

  showTrajectory(samples: TechSimSample[], visible: boolean) {
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryMat?.dispose();
      this.trajectoryLine = null;
      this.trajectoryMat = null;
    }
    if (!visible || samples.length < 2) return;

    const positions: number[] = [];
    for (const s of samples) positions.push(s.x, s.z, s.y);
    const geo = new LineGeometry();
    geo.setPositions(positions);
    const mat = new LineMaterial({
      color: 0x4da3ff,
      linewidth: 1.8,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const size = this.renderer.getSize(new THREE.Vector2());
    mat.resolution.copy(size);
    const line = new Line2(geo, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    this.trajectoryLine = line;
    this.trajectoryMat = mat;
  }

  // -------------------------------------------------------------------------
  // Oynatım
  // -------------------------------------------------------------------------

  applySample(sample: TechSimSample | null) {
    if (!sample) return;
    this.simTime = sample.t;
    this.currentPos.set(sample.x, sample.z, sample.y);
    const sp = Math.hypot(sample.vx, sample.vy, sample.vz);
    if (sp > 0.05) {
      this.currentDir.set(sample.vx / sp, sample.vz / sp, sample.vy / sp);
    }
    const lit = sample.accelG > 1.15 && !sample.deployed;
    this.flameLit = lit;
    this.flameBase = Math.min(1.6, Math.max(0.7, sample.accelG / 4));
    if (sample.deployed) this.chuteOpen = Math.min(1, this.chuteOpen + 0.02);
    else this.chuteOpen = Math.max(0, this.chuteOpen - 0.02);
  }

  resetToPad() {
    this.rocketGroup.position.copy(this.rodDir.clone().multiplyScalar(this.rodLen + 0.05));
    this.rocketGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.rodDir);
    this.currentPos.copy(this.rocketGroup.position);
    this.currentDir.copy(this.rodDir);
    this.chuteOpen = 0;
    this.flameLit = false;
    this.flame.visible = false;
    this.controls.enabled = true;
  }

  resetView() {
    this.followZoom = 1;
    this.camera.position.set(2.4, 2.2, 3.6);
    this.controls.target.set(0, 2.0, 0);
    this.controls.enabled = true;
    this.controls.update();
  }

  setCameraMode(mode: "follow" | "pad" | "free") {
    this.cameraMode = mode;
    if (mode === "free") this.controls.enabled = true;
  }

  setGridVisible(visible: boolean) {
    if (this.gridHelper) this.gridHelper.visible = visible;
  }

  setRocket(rocket: TechRocket) {
    const cond = rocket.conditions;
    const tilt = (cond.launchRodAngleDeg * Math.PI) / 180;
    const az = (cond.launchRodDirectionDeg * Math.PI) / 180;
    this.rodDir.set(
      Math.sin(tilt) * Math.sin(az),
      Math.cos(tilt),
      Math.sin(tilt) * Math.cos(az)
    ).normalize();
    this.rodLen = cond.launchRodLengthM;
    this.buildPad();
    this.buildRocket(rocket);
    this.resetToPad();
  }

  // -------------------------------------------------------------------------
  // Döngü
  // -------------------------------------------------------------------------

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // Roket pozisyonu + yön
    this.rocketGroup.position.lerp(this.currentPos, Math.min(1, dt * 24));
    this.rocketGroup.quaternion.slerp(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.currentDir),
      Math.min(1, dt * 10)
    );
    this.rocketGroup.quaternion.normalize();

    // Alev
    this.flame.visible = this.flameLit;
    if (this.flameLit) {
      const j = 1 + Math.sin(this.simTime * 220) * 0.12 + Math.sin(this.simTime * 377) * 0.07;
      this.flame.scale.set(j, this.flameBase, j);
      this.flame.position.set(0, -0.02 - this.flameBase * 0.06, 0);
    }

    // Paraşüt: roketin üstünde açılan koni
    this.chuteGroup.clear();
    if (this.chuteOpen > 0.01) {
      const dia = 0.5;
      const ch = new THREE.Mesh(
        new THREE.ConeGeometry(dia / 2 * this.chuteOpen, 0.24 * this.chuteOpen, 20),
        new THREE.MeshStandardMaterial({
          color: 0x4da3ff,
          roughness: 0.9,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        })
      );
      ch.rotation.x = Math.PI;
      ch.position.set(0, 0.4, 0);
      this.chuteGroup.add(ch);
      for (let i = 0; i < 4; i++) {
        const line = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0008, 0.0008, 0.34, 4),
          new THREE.MeshBasicMaterial({ color: 0xd7e1ec })
        );
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        line.position.set(Math.cos(a) * 0.14, 0.17, Math.sin(a) * 0.14);
        line.rotation.z = Math.cos(a) * 0.35;
        line.rotation.x = -Math.sin(a) * 0.35;
        this.chuteGroup.add(line);
      }
    }

    // Kamera modları
    if (this.cameraMode === "follow") {
      this.controls.enabled = false;
      const target = this.currentPos.clone().add(new THREE.Vector3(0, 1.2, 0));
      const dist = 2.2 * this.followZoom;
      this.lookTarget.lerp(target, Math.min(1, dt * 4));
      const camPos = this.lookTarget.clone().add(new THREE.Vector3(1.1, 1.0, 1.6).multiplyScalar(dist / 2.3));
      this.camera.position.lerp(camPos, Math.min(1, dt * 6));
      this.camera.lookAt(this.lookTarget);
    } else if (this.cameraMode === "pad") {
      this.controls.enabled = false;
      this.lookTarget.lerp(this.currentPos, Math.min(1, dt * 3));
      const camPos = this.rodDir.clone().multiplyScalar(-2.6 * this.followZoom).add(new THREE.Vector3(0, 0.8, 0));
      this.camera.position.lerp(camPos, Math.min(1, dt * 6));
      this.camera.lookAt(this.lookTarget);
    } else {
      this.controls.target.lerp(this.currentPos, Math.min(1, dt * 3));
      this.controls.update();
    }

    // Yön işaretleri roketi takip etsin
    if (this.cgMarker) this.cgMarker.rotation.x = Math.PI / 2;
    if (this.cpMarker) this.cpMarker.rotation.x = 0;

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }
}
