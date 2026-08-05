# Teknik Mod (OpenRocket Klonu) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SlopRocket'a, OpenRocket'i maksimum düzeyde taklit eden ikinci bir "Teknik Mod" eklemek — bileşen ağacı tasarımı, genişletilmiş Barrowman, bileşen bazlı sürükleme analizi, 6-DOF simülasyon ve analiz panelleri. Casual mod (mevcut uygulama) aynen korunur.

**Architecture:** Teknik mod, mevcut casual koduna dokunmadan `src/tech/` altında tamamen ayrı bir modül olarak yaşar. Kendi bileşen veri modeli (OpenRocket bileşen hiyerarşisi), kendi fizik katmanı (montaj→Barrowman→sürükleme→rüzgar→6-DOF simülatör) ve kendi zustand store'u vardır. `App.tsx`'e eklenen bir mod anahtarı casual/teknik arasında geçiş yapar; iki mod tek yönlü dönüşüm fonksiyonlarıyla (convert.ts) birbirine bağlanır.

**Tech Stack:** Mevcut stack (Vite + React 18 + TS + three.js + zustand + vitest). Yeni bağımlılık YOK. Grafikler mevcut canvas yardımcı fonksiyonundan (HudPanel'den çıkarılıp paylaşılan `charts.ts`'e taşınacak) yeniden kullanılır.

## Global Constraints

- Tüm birimler SI (m, kg, s, N, Pa); gösterim m/km (doküman §8).
- UI dili: Türkçe (teknik terimler İngilizce kodlarla birlikte).
- Casual mod REGRESYON YASAĞI: mevcut 38 test her zaman yeşil kalmalı; casual bileşenlerin davranışı değiştirilemez (charts.ts refactor'ü hariç — görsel davranış birebir korunur).
- Windows PowerShell: npm scriptleri `cmd /c "..."` ile çalıştırılır (execution policy npm.ps1'i engeller).
- Kabul kriterleri:
  - Alpha replikası (teknik modda): uzunluk 0.31±0.02 m, çap 0.0249 m (BT-50), kütle 22.7 g ±%20, C6-7 + ray 1.2 m + 0 m/s rüzgarda apogee 150–250 m (casual kalibrasyonu 218 m).
  - Vakum modu: Tsiolkovsky doğrulaması ±%1 (dv = Isp·g0·ln(m0/mf)).
  - Stabilite marjı ≥ 1.0 kalibre (subsonik).
  - Cd(Mach=0) tipik roket için 0.25–0.6; transonik tepe ≥ 1.5× subsonik Cd.
  - Her fizik modülü kendi vitest dosyasıyla test edilir; her görev kendi commit'iyle biter.
- Commit mesajları repo stili: `git log`'daki gibi kısa, başlık (örn. `feat: add tech component model`).

## File Structure

```
src/tech/
  model.ts              — bileşen tipleri, varsayılanlar, fabrikalar, serileştirme
  materials.ts          — bulk/surface/line malzeme veritabanı (TECH_MATERIALS)
  convert.ts            — casual RocketConfig <-> TechRocket dönüşümü + teknik presetler
  store.ts              — useTechStore (zustand)
  physics/
    assembly.ts         — bileşen yerleştirme (placement), kütle/CG/CP hesapları
    barrowman.ts        — genişletilmiş Barrowman: Cn, CP, bileşen bazlı analiz
    drag.ts             — bileşen sürüklemesi (friction+wave+base), Cd(Mach) tablosu
    wind.ts             — ortalama + çok seviyeli rüzgar modelleri
    simulator.ts        — 6-DOF RK4 simülatör (kuaterniyon)
  three/
    techScene.ts        — placement'lardan three.js sahne üretimi
  ui/
    TechApp.tsx         — teknik mod ana yerleşimi (sol ağaç+editör, orta 3D, sağ sekmeler)
    ComponentTree.tsx   — OpenRocket tarzı bileşen ağacı (+ ekle/sil)
    ComponentEditor.tsx — seçili bileşen için alan formları
    MetricsPanel.tsx    — kütle/CG/CP/stabilite ölçümleri + bileşen kütle tablosu
    ComponentAnalysis.tsx — bileşen bazlı sürükleme dökümü tablosu
    CdMachPanel.tsx     — Cd-Mach tablosu
    SimulationPanel.tsx — simülasyon çalıştırma + sonuç özeti + grafikler
    MotorPanel.tsx      — motor kataloğu + itki eğrisi grafiği
    TechView.tsx        — 3D görünüm (RocketView'a benzer sarmalayıcı)
tests (satır içi *.test.ts, src/tech/ içinde)
```

## Task Başarı Kriterleri

Her görev bağımsız test edilebilir bir teslimat üretir; testler önce yazılır (TDD), başarısız doğrulanır, sonra implementasyon yapılır, test yeşil olunca commit.

---

### Task 1: Teknik Mod Veri Modeli (model.ts + materials.ts)

**Files:**
- Create: `src/tech/model.ts`
- Create: `src/tech/materials.ts`
- Test: `src/tech/model.test.ts`

**Interfaces:**
- Produces (sonraki görevler bunlara güvenir):
  - `TECH_MATERIALS: Record<string, TechMaterial>` (id → malzeme; id'ler: `cardboard`, `basswood`, `balsa`, `plywood`, `phenolic`, `fiberglass`, `carbon`, `aluminum`, `ripstop`, `nylon`, `elastic`, `kevlar`)
  - `TechMaterial { id; name; type: "bulk"|"surface"|"line"; density: number; roughness: number; strength: number; modulus: number; color: string; pricePerKg: number; desc: string }` (density: bulk kg/m³, surface kg/m², line kg/m)
  - `Finish = "normal" | "smooth" | "rough" | "polished"`
  - `NoseShape = "conical" | "ogive" | "elliptical" | "parabolic" | "power" | "haack"`
  - `FinCrossSection = "square" | "rounded" | "airfoil" | "wedge"`
  - `ComponentKind` — aşağıdaki bileşenlerin `kind` alanı birliği
  - `ComponentBase { id; name; axialOffsetM; radialOffsetM; angleDeg; finish; materialId; massOverrideKg?: number }`
  - Bileşen arayüzleri: `NoseCone, BodyTube (children: TechComponent[]), Transition, TrapezoidFinSet, EllipticalFinSet, FreeformFinSet, TubeFinSet, Parachute, Streamer, ShockCord, MassComponent, LaunchLug, RailButton, InnerTube, TubeCoupler, CenteringRing, Bulkhead, EngineBlock, MotorMount`
  - `TechComponent = ...` birliği; `TechStage { id; name; components: TechComponent[]; separationEvent: "ejection"|"burnout"|"apogee"; separationDelayS }`
  - `PodSet`, `ParallelStage` (ikisi de: id, name, instanceCount, radiusOffsetM, angleOffsetDeg, axialOffsetM, components; ParallelStage ek olarak separationEvent)
  - `TechConditions { launchRodLengthM; launchRodAngleDeg; launchRodDirectionDeg; launchIntoWind; launchAltitudeM; windModel: "average"|"multilevel"; windSpeedMps; windDirectionDeg; windStdDev; windLevels: {altitudeM; speedMps; directionDeg; stdDev}[]; timestepS; maxTimeS }`
  - `TechRocket { name; designer; designType; revision; stages: TechStage[]; podSets: PodSet[]; parallelStages: ParallelStage[]; conditions: TechConditions }`
  - `makeComponent(kind: ComponentKind): TechComponent` — sensörlü fabrika (her kind için varsayılan)
  - `defaultTechRocket(): TechRocket` — Alpha replikası (casual'daki Estes Alpha preset'iyle birebir uyumlu değerler)
  - `uid(): string` — benzersiz id (`crypto.randomUUID()` fallback ile)
  - `serializeTech(r: TechRocket): string` / `deserializeTech(json: string): TechRocket`
  - `TECH_COMPONENT_LABELS: Record<ComponentKind, string>` — Türkçe etiketler
  - `NOSE_SHAPES: { id: NoseShape; name: string }[]`, `FINISHES: { id: Finish; name: string }[]`, `FIN_CROSS_SECTIONS: { id: FinCrossSection; name: string }[]`

- [ ] **Step 1: Write the failing test**

`src/tech/model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  defaultTechRocket,
  makeComponent,
  serializeTech,
  deserializeTech,
  TECH_COMPONENT_LABELS,
  TECH_MATERIALS,
  type TechRocket,
  type BodyTube,
  type NoseCone,
  type MotorMount,
} from "./model";
import { TECH_MATERIALS as MATS } from "./materials";

describe("tech model", () => {
  it("Alpha varsayılan roketi geçerli", () => {
    const r = defaultTechRocket();
    expect(r.stages.length).toBe(1);
    const kinds = r.stages[0].components.map((c) => c.kind);
    expect(kinds).toContain("nosecone");
    expect(kinds).toContain("bodytube");
    expect(kinds).toContain("trapezoidfin");
    expect(kinds).toContain("motormount");
    // Alpha ölçüleri (casual preset ile uyumlu): uzunluk 0.312 m, BT-50
    const tube = r.stages[0].components.find((c) => c.kind === "bodytube") as BodyTube;
    expect(tube.outerDiameterM).toBeCloseTo(0.0249, 3);
    expect(Math.abs(tube.lengthM - 0.16) < 0.05).toBe(true);
  });

  it("makeComponent her kind için geçerli nesne üretir", () => {
    const kinds = Object.keys(TECH_COMPONENT_LABELS) as Array<keyof typeof TECH_COMPONENT_LABELS>;
    for (const k of kinds) {
      const c = makeComponent(k as never);
      expect(c.id).toBeTruthy();
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("her bileşen malzemeId referansı geçerli", () => {
    const r = defaultTechRocket();
    const walk = (cs: Array<{ materialId?: string }>) => {
      for (const c of cs) {
        if (c.materialId !== undefined) expect(MATS[c.materialId]).toBeDefined();
      }
    };
    walk(r.stages[0].components);
  });

  it("serileştirme yuvarlak yol korur", () => {
    const r = defaultTechRocket();
    const r2 = deserializeTech(serializeTech(r));
    expect(r2.name).toBe(r.name);
    expect(r2.stages[0].components.length).toBe(r.stages[0].components.length);
    expect(r2.conditions.windSpeedMps).toBe(r.conditions.windSpeedMps);
  });

  it("motor montajı varsayılan Estes C6-7 referanslı", () => {
    const r = defaultTechRocket();
    const mm = r.stages[0].components.find((c) => c.kind === "motormount") as MotorMount;
    expect(mm.motorId).toBe("C6-7");
  });

  it("NoseCone shoulder alanları sıfır veya pozitif", () => {
    const r = defaultTechRocket();
    const nose = r.stages[0].components.find((c) => c.kind === "nosecone") as NoseCone;
    expect(nose.lengthM).toBeGreaterThan(0);
    expect(nose.aftDiameterM).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "npx vitest run src/tech/model.test.ts"`
Expected: FAIL — "Cannot find module './model'"

- [ ] **Step 3: Write minimal implementation — `src/tech/materials.ts`**

```ts
// Teknik mod malzeme veritabanı. bulk: kg/m³, surface: kg/m², line: kg/m.
export type MaterialType = "bulk" | "surface" | "line";

export interface TechMaterial {
  id: string;
  name: string;
  type: MaterialType;
  density: number;
  roughness: number;
  strength: number;
  modulus: number;
  color: string;
  pricePerKg: number;
  desc: string;
}

export const TECH_MATERIALS: Record<string, TechMaterial> = {
  cardboard: { id: "cardboard", name: "Kraft Karton", type: "bulk", density: 550, roughness: 1.0, strength: 1.0, modulus: 3.5e9, color: "#c8a15a", pricePerKg: 120, desc: "Model roket klasiği" },
  basswood: { id: "basswood", name: "Basswood", type: "bulk", density: 500, roughness: 0.96, strength: 1.4, modulus: 9e9, color: "#d9b98a", pricePerKg: 260, desc: "Burun konisi ve kanatlar" },
  balsa: { id: "balsa", name: "Balsa", type: "bulk", density: 160, roughness: 1.0, strength: 0.6, modulus: 3.5e9, color: "#e3c9a0", pricePerKg: 400, desc: "Çok hafif kanat" },
  plywood: { id: "plywood", name: "Kontrplak", type: "bulk", density: 620, roughness: 0.97, strength: 1.6, modulus: 10e9, color: "#b98d5f", pricePerKg: 90, desc: "Sağlam kanat" },
  phenolic: { id: "phenolic", name: "Fenolik", type: "bulk", density: 950, roughness: 0.94, strength: 1.9, modulus: 8e9, color: "#8a6a4a", pricePerKg: 210, desc: "İç tüp / kuplör" },
  fiberglass: { id: "fiberglass", name: "Fiberglas", type: "bulk", density: 1600, roughness: 0.9, strength: 3.5, modulus: 25e9, color: "#b8c4c0", pricePerKg: 190, desc: "Yüksek mukavemet" },
  carbon: { id: "carbon", name: "Karbon", type: "bulk", density: 1500, roughness: 0.87, strength: 5.0, modulus: 70e9, color: "#2a2d33", pricePerKg: 900, desc: "En sert" },
  aluminum: { id: "aluminum", name: "Alüminyum", type: "bulk", density: 2700, roughness: 0.9, strength: 2.6, modulus: 69e9, color: "#b9c4cd", pricePerKg: 220, desc: "Ağır, dayanıklı" },
  ripstop: { id: "ripstop", name: "Ripstop Naylon", type: "surface", density: 0.06, roughness: 0.95, strength: 1.6, modulus: 1e8, color: "#7d8ba0", pricePerKg: 3500, desc: "Paraşüt kanopisi" },
  nylon: { id: "nylon", name: "Naylon", type: "surface", density: 0.08, roughness: 0.95, strength: 1.2, modulus: 8e7, color: "#9aa5b5", pricePerKg: 1800, desc: "Paraşüt kanopisi" },
  elastic: { id: "elastic", name: "Elastik İp", type: "line", density: 0.003, roughness: 1.0, strength: 0.8, modulus: 1e6, color: "#d8d0c0", pricePerKg: 5000, desc: "Şok ipi" },
  kevlar: { id: "kevlar", name: "Kevlar İp", type: "line", density: 0.002, roughness: 0.92, strength: 4.5, modulus: 70e9, color: "#c9a227", pricePerKg: 12000, desc: "Yüksek dayanım şok ipi" },
};

export const TECH_MATERIAL_LIST = Object.values(TECH_MATERIALS);
```

- [ ] **Step 4: Write implementation — `src/tech/model.ts`**

```ts
// Teknik mod veri modeli — OpenRocket bileşen hiyerarşisi.
// Birimler SI; axialOffsetM parent'ın ön ucundan ileri pozitif.

import { TECH_MATERIALS } from "./materials";

export type Finish = "normal" | "smooth" | "rough" | "polished";
export type NoseShape = "conical" | "ogive" | "elliptical" | "parabolic" | "power" | "haack";
export type FinCrossSection = "square" | "rounded" | "airfoil" | "wedge";

export const NOSE_SHAPES: { id: NoseShape; name: string }[] = [
  { id: "conical", name: "Konik" },
  { id: "ogive", name: "Teğet Ogive" },
  { id: "elliptical", name: "Elipsoidal" },
  { id: "parabolic", name: "Parabolik" },
  { id: "power", name: "Power" },
  { id: "haack", name: "Haack" },
];

export const FINISHES: { id: Finish; name: string }[] = [
  { id: "normal", name: "Normal" },
  { id: "smooth", name: "Pürüzsüz" },
  { id: "rough", name: "Pürüzlü" },
  { id: "polished", name: "Cilalı" },
];

export const FIN_CROSS_SECTIONS: { id: FinCrossSection; name: string }[] = [
  { id: "square", name: "Kare" },
  { id: "rounded", name: "Yuvarlatılmış" },
  { id: "airfoil", name: "Kanat Profili" },
  { id: "wedge", name: "Kama" },
];

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface ComponentBase {
  id: string;
  name: string;
  /** Parent ön ucundan eksenel ofset, m (negatif = geri çıkıntı) */
  axialOffsetM: number;
  /** Eksenel bileşenlerde 0; radyal (lug/rail/pod) için merkezden uzaklık, m */
  radialOffsetM: number;
  /** Radyal konum açısı, derece */
  angleDeg: number;
  finish: Finish;
  materialId: string;
  /** OpenRocket mass override, kg */
  massOverrideKg?: number;
}

export interface NoseCone extends ComponentBase {
  kind: "nosecone";
  shape: NoseShape;
  shapeParameter: number;
  lengthM: number;
  aftDiameterM: number;
  wallThicknessM: number;
  filled: boolean;
  shoulderDiameterM: number;
  shoulderLengthM: number;
}

export interface BodyTube extends ComponentBase {
  kind: "bodytube";
  lengthM: number;
  outerDiameterM: number;
  wallThicknessM: number;
  /** İçine montajlanan bileşenler (motormount, centeringring, ...) */
  children: TechComponent[];
}

export interface Transition extends ComponentBase {
  kind: "transition";
  shape: NoseShape;
  shapeParameter: number;
  lengthM: number;
  foreDiameterM: number;
  aftDiameterM: number;
  wallThicknessM: number;
  filled: boolean;
}

export interface TrapezoidFinSet extends ComponentBase {
  kind: "trapezoidfin";
  finCount: number;
  rotationDeg: number;
  rootChordM: number;
  tipChordM: number;
  sweepLengthM: number;
  heightM: number;
  thicknessM: number;
  crossSection: FinCrossSection;
  cantDeg: number;
}

export interface EllipticalFinSet extends ComponentBase {
  kind: "ellipticalfin";
  finCount: number;
  rotationDeg: number;
  rootChordM: number;
  heightM: number;
  thicknessM: number;
  crossSection: FinCrossSection;
  cantDeg: number;
}

export interface FreeformFinSet extends ComponentBase {
  kind: "freeformfin";
  finCount: number;
  rotationDeg: number;
  thicknessM: number;
  /** Çokgen noktaları: x = eksenel (kök LE'den), y = radyal (gövde yüzeyinden), m */
  points: Array<{ x: number; y: number }>;
  cantDeg: number;
}

export interface TubeFinSet extends ComponentBase {
  kind: "tubefin";
  finCount: number;
  rotationDeg: number;
  lengthM: number;
  outerDiameterM: number;
  wallThicknessM: number;
}

export interface Parachute extends ComponentBase {
  kind: "parachute";
  diameterM: number;
  /** null = otomatik (0.8) */
  cdManual: number | null;
  lineCount: number;
  lineLengthM: number;
  deployEvent: "ejection" | "apogee" | "altitude";
  deployAltitudeM: number;
  deployDelayS: number;
}

export interface Streamer extends ComponentBase {
  kind: "streamer";
  stripLengthM: number;
  stripWidthM: number;
}

export interface ShockCord extends ComponentBase {
  kind: "shockcord";
  cordLengthM: number;
}

export interface MassComponent extends ComponentBase {
  kind: "mass";
  massKg: number;
}

export interface LaunchLug extends ComponentBase {
  kind: "launchlug";
  outerDiameterM: number;
  lengthM: number;
}

export interface RailButton extends ComponentBase {
  kind: "railbutton";
  outerDiameterM: number;
  heightM: number;
}

export interface InnerTube extends ComponentBase {
  kind: "innertube";
  lengthM: number;
  outerDiameterM: number;
  wallThicknessM: number;
}

export interface TubeCoupler extends ComponentBase {
  kind: "tubecoupler";
  lengthM: number;
  outerDiameterM: number;
  wallThicknessM: number;
}

export interface CenteringRing extends ComponentBase {
  kind: "centeringring";
  lengthM: number;
  outerDiameterM: number;
  innerDiameterM: number;
}

export interface Bulkhead extends ComponentBase {
  kind: "bulkhead";
  lengthM: number;
  outerDiameterM: number;
}

export interface EngineBlock extends ComponentBase {
  kind: "engineblock";
  lengthM: number;
  outerDiameterM: number;
}

export interface MotorMount extends ComponentBase {
  kind: "motormount";
  /** motor kataloğundaki id (örn. "C6-7"); null = boş */
  motorId: string | null;
  /** Motorun tüp dışına taşan kısmı, m */
  overhangM: number;
}

export type TechComponent =
  | NoseCone
  | BodyTube
  | Transition
  | TrapezoidFinSet
  | EllipticalFinSet
  | FreeformFinSet
  | TubeFinSet
  | Parachute
  | Streamer
  | ShockCord
  | MassComponent
  | LaunchLug
  | RailButton
  | InnerTube
  | TubeCoupler
  | CenteringRing
  | Bulkhead
  | EngineBlock
  | MotorMount;

export type ComponentKind = TechComponent["kind"];

export const TECH_COMPONENT_LABELS: Record<ComponentKind, string> = {
  nosecone: "Burun Konisi",
  bodytube: "Gövde Tüpü",
  transition: "Geçiş Konisi",
  trapezoidfin: "Yamuk Kanat",
  ellipticalfin: "Elips Kanat",
  freeformfin: "Serbest Kanat",
  tubefin: "Tüp Kanat",
  parachute: "Paraşüt",
  streamer: "Şerit",
  shockcord: "Şok İpi",
  mass: "Kütle Bileşeni",
  launchlug: "Rampa Pabucu",
  railbutton: "Ray Butonu",
  innertube: "İç Tüp",
  tubecoupler: "Tüp Kuplörü",
  centeringring: "Santraj Halkası",
  bulkhead: "Bölme",
  engineblock: "Motor Bloğu",
  motormount: "Motor Montajı",
};

export interface TechStage {
  id: string;
  name: string;
  components: TechComponent[];
  separationEvent: "ejection" | "burnout" | "apogee";
  separationDelayS: number;
}

export interface PodSet {
  id: string;
  name: string;
  instanceCount: number;
  radiusOffsetM: number;
  angleOffsetDeg: number;
  axialOffsetM: number;
  components: TechComponent[];
}

export interface ParallelStage {
  id: string;
  name: string;
  instanceCount: number;
  radiusOffsetM: number;
  angleOffsetDeg: number;
  axialOffsetM: number;
  components: TechComponent[];
  separationEvent: "burnout" | "apogee";
}

export interface WindLevel {
  altitudeM: number;
  speedMps: number;
  directionDeg: number;
  stdDev: number;
}

export interface TechConditions {
  launchRodLengthM: number;
  launchRodAngleDeg: number;
  launchRodDirectionDeg: number;
  launchIntoWind: boolean;
  launchAltitudeM: number;
  windModel: "average" | "multilevel";
  windSpeedMps: number;
  windDirectionDeg: number;
  windStdDev: number;
  windLevels: WindLevel[];
  timestepS: number;
  maxTimeS: number;
}

export interface TechRocket {
  name: string;
  designer: string;
  designType: string;
  revision: string;
  stages: TechStage[];
  podSets: PodSet[];
  parallelStages: ParallelStage[];
  conditions: TechConditions;
}

const base = (): ComponentBase => ({
  id: uid(),
  name: "Bileşen",
  axialOffsetM: 0,
  radialOffsetM: 0,
  angleDeg: 0,
  finish: "normal",
  materialId: "cardboard",
});

export function makeComponent(kind: ComponentKind): TechComponent {
  switch (kind) {
    case "nosecone":
      return { ...base(), kind, name: "Burun Konisi", shape: "ogive", shapeParameter: 0.5, lengthM: 0.07, aftDiameterM: 0.0249, wallThicknessM: 0.002, filled: false, shoulderDiameterM: 0.0238, shoulderLengthM: 0.03 };
    case "bodytube":
      return { ...base(), kind, name: "Gövde Tüpü", lengthM: 0.2, outerDiameterM: 0.0249, wallThicknessM: 0.001, children: [] };
    case "transition":
      return { ...base(), kind, name: "Geçiş Konisi", shape: "conical", shapeParameter: 0.5, lengthM: 0.05, foreDiameterM: 0.0249, aftDiameterM: 0.033, wallThicknessM: 0.002, filled: false };
    case "trapezoidfin":
      return { ...base(), kind, name: "Yamuk Kanatlar", finCount: 3, rotationDeg: 0, rootChordM: 0.08, tipChordM: 0.06, sweepLengthM: 0.02, heightM: 0.05, thicknessM: 0.003, crossSection: "airfoil", cantDeg: 0, materialId: "balsa" };
    case "ellipticalfin":
      return { ...base(), kind, name: "Elips Kanatlar", finCount: 3, rotationDeg: 0, rootChordM: 0.08, heightM: 0.05, thicknessM: 0.003, crossSection: "airfoil", cantDeg: 0, materialId: "balsa" };
    case "freeformfin":
      return { ...base(), kind, name: "Serbest Kanatlar", finCount: 3, rotationDeg: 0, thicknessM: 0.003, points: [{ x: 0, y: 0 }, { x: 0.04, y: 0.05 }, { x: 0.08, y: 0.04 }, { x: 0.06, y: 0 }], cantDeg: 0, materialId: "balsa" };
    case "tubefin":
      return { ...base(), kind, name: "Tüp Kanatlar", finCount: 6, rotationDeg: 0, lengthM: 0.08, outerDiameterM: 0.006, wallThicknessM: 0.001 };
    case "parachute":
      return { ...base(), kind, name: "Paraşüt", diameterM: 0.3, cdManual: null, lineCount: 6, lineLengthM: 0.3, deployEvent: "apogee", deployAltitudeM: 150, deployDelayS: 0, materialId: "ripstop" };
    case "streamer":
      return { ...base(), kind, name: "Şerit", stripLengthM: 0.5, stripWidthM: 0.05, materialId: "ripstop" };
    case "shockcord":
      return { ...base(), kind, name: "Şok İpi", cordLengthM: 0.6, materialId: "elastic" };
    case "mass":
      return { ...base(), kind, name: "Kütle Bileşeni", massKg: 0.02 };
    case "launchlug":
      return { ...base(), kind, name: "Rampa Pabucu", outerDiameterM: 0.006, lengthM: 0.035, radialOffsetM: 0.012, materialId: "plywood" };
    case "railbutton":
      return { ...base(), kind, name: "Ray Butonu", outerDiameterM: 0.0097, heightM: 0.0097, radialOffsetM: 0.012, materialId: "phenolic" };
    case "innertube":
      return { ...base(), kind, name: "İç Tüp", lengthM: 0.08, outerDiameterM: 0.019, wallThicknessM: 0.0008, materialId: "phenolic" };
    case "tubecoupler":
      return { ...base(), kind, name: "Tüp Kuplörü", lengthM: 0.05, outerDiameterM: 0.0238, wallThicknessM: 0.0008, materialId: "phenolic" };
    case "centeringring":
      return { ...base(), kind, name: "Santraj Halkası", lengthM: 0.006, outerDiameterM: 0.024, innerDiameterM: 0.019, materialId: "phenolic" };
    case "bulkhead":
      return { ...base(), kind, name: "Bölme", lengthM: 0.002, outerDiameterM: 0.024, materialId: "plywood" };
    case "engineblock":
      return { ...base(), kind, name: "Motor Bloğu", lengthM: 0.006, outerDiameterM: 0.018, materialId: "plywood" };
    case "motormount":
      return { ...base(), kind, name: "Motor Montajı", motorId: "C6-7", overhangM: 0.005, materialId: "phenolic" };
  }
}

export function defaultTechConditions(): TechConditions {
  return {
    launchRodLengthM: 1.2,
    launchRodAngleDeg: 0,
    launchRodDirectionDeg: 0,
    launchIntoWind: true,
    launchAltitudeM: 0,
    windModel: "average",
    windSpeedMps: 3,
    windDirectionDeg: 0,
    windStdDev: 0.2,
    windLevels: [
      { altitudeM: 0, speedMps: 2, directionDeg: 0, stdDev: 0.2 },
      { altitudeM: 100, speedMps: 3, directionDeg: 5, stdDev: 0.3 },
      { altitudeM: 500, speedMps: 5, directionDeg: 10, stdDev: 0.4 },
    ],
    timestepS: 0.01,
    maxTimeS: 600,
  };
}

/** Alpha replikası: BT-50 gövde, ogive burun, 3 kanat, C6-7, 30 cm paraşüt. */
export function defaultTechRocket(): TechRocket {
  const nose = makeComponent("nosecone") as NoseCone;
  nose.name = "Burun Konisi";
  nose.shape = "ogive";
  nose.lengthM = 0.075;
  nose.aftDiameterM = 0.0249;
  nose.wallThicknessM = 0.002;
  nose.materialId = "basswood";
  nose.filled = false;

  const tube = makeComponent("bodytube") as BodyTube;
  tube.name = "Gövde Tüpü";
  tube.lengthM = 0.16;
  tube.outerDiameterM = 0.0249;
  tube.wallThicknessM = 0.001;
  tube.materialId = "cardboard";

  const fin = makeComponent("trapezoidfin") as TrapezoidFinSet;
  fin.name = "Kanatlar";
  fin.finCount = 3;
  fin.rootChordM = 0.07;
  fin.tipChordM = 0.055;
  fin.sweepLengthM = 0.012;
  fin.heightM = 0.045;
  fin.thicknessM = 0.003;
  fin.materialId = "balsa";
  fin.crossSection = "airfoil";

  const lug = makeComponent("launchlug") as LaunchLug;
  lug.name = "Rampa Pabucu";
  lug.axialOffsetM = 0.04;
  lug.radialOffsetM = 0.0125;
  lug.lengthM = 0.03;
  lug.outerDiameterM = 0.006;

  const mount = makeComponent("motormount") as MotorMount;
  mount.name = "Motor Montajı";
  mount.axialOffsetM = 0.09;
  mount.motorId = "C6-7";
  mount.overhangM = 0.005;

  const chute = makeComponent("parachute") as Parachute;
  chute.name = "Paraşüt";
  chute.diameterM = 0.3;
  chute.deployEvent = "apogee";

  const cord = makeComponent("shockcord") as ShockCord;
  cord.name = "Şok İpi";
  cord.cordLengthM = 0.6;

  return {
    name: "Alpha Replica",
    designer: "SlopRocket",
    designType: "kit",
    revision: "1",
    stages: [{
      id: uid(),
      name: "Alpha",
      components: [nose, tube, fin, lug, mount, chute, cord],
      separationEvent: "ejection",
      separationDelayS: 0,
    }],
    podSets: [],
    parallelStages: [],
    conditions: defaultTechConditions(),
  };
}

export function serializeTech(r: TechRocket): string {
  return JSON.stringify(r, null, 2);
}

export function deserializeTech(json: string): TechRocket {
  const parsed = JSON.parse(json) as TechRocket;
  if (!parsed || !Array.isArray(parsed.stages) || parsed.stages.length === 0) {
    throw new Error("Geçersiz teknik tasarım");
  }
  return parsed;
}

export { TECH_MATERIALS };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cmd /c "npx vitest run src/tech/model.test.ts"`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/tech/model.ts src/tech/materials.ts src/tech/model.test.ts
git commit -m "feat: add tech mode component model and materials"
```

---

### Task 2: Teknik Mod Store + Mod Anahtarı (techStore.ts + App.tsx)

**Files:**
- Create: `src/tech/store.ts`
- Modify: `src/components/App.tsx`
- Create: `src/tech/ui/TechApp.tsx` (boş iskelet — sonraki görevlerde doldurulur)
- Test: `src/tech/store.test.ts`

**Interfaces:**
- Consumes: Task 1 — `TechRocket`, `defaultTechRocket`, `TechComponent`, `ComponentKind`, `TechConditions`, `makeComponent`, `uid`
- Produces:
  - `TechUiTab = "analysis" | "drag" | "simulation" | "motor"`
  - `useTechStore` (zustand):
    - state: `rocket: TechRocket`, `selectedId: string | null`, `tab: TechUiTab`, `status: "idle"|"running"|"ended"`, `simTime`, `result: TechFlightResult | null`, `currentSample: TechTelemetrySample | null`
    - actions: `updateRocket(r)`, `patchConditions(patch: Partial<TechConditions>)`, `selectComponent(id|null)`, `updateComponent(id, patch: Partial<TechComponent>)`, `addComponent(parentId: string | null, kind: ComponentKind)`, `removeComponent(id)`, `setTab(t)`, `setStatus(s)`, `runSimulation()`, `resetSim()`, `setSimTime(t)`, `setCurrentSample(s|null)`
  - `findComponent(components: TechComponent[], id: string): TechComponent | null` — ağaçta yürür
  - `replaceComponentInTree(root: TechComponent, id: string, patch: Partial<TechComponent>): TechComponent` — immutable güncelleme
  - `insertComponent(root: TechComponent[], parentId: string | null, comp: TechComponent): TechComponent[]`
  - `removeComponentFromTree(root: TechComponent[], id: string): TechComponent[]`
  - App.tsx: `mode: "casual" | "tech"` yerel state + topbar'da mod anahtarı (`Kolay` / `Teknik` düğmeleri)

- [ ] **Step 1: Write the failing test**

`src/tech/store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { useTechStore } from "./store";
import { defaultTechRocket, makeComponent } from "./model";

describe("tech store", () => {
  it("başlangıçta Alpha varsayılanı yüklü", () => {
    const s = useTechStore.getState();
    expect(s.rocket.stages.length).toBe(1);
    expect(s.selectedId).toBeNull();
    expect(s.tab).toBe("analysis");
  });

  it("addComponent ağaca ekler ve seçer", () => {
    const s = useTechStore.getState();
    const tubeId = s.rocket.stages[0].components.find((c) => c.kind === "bodytube")!.id;
    s.addComponent(tubeId, "centeringring");
    const st = useTechStore.getState();
    const tube = st.rocket.stages[0].components.find((c) => c.kind === "bodytube")!;
    expect(tube.kind === "bodytube" && tube.children.some((c) => c.kind === "centeringring")).toBe(true);
    expect(st.selectedId).toBeTruthy();
  });

  it("updateComponent alanları yamalar", () => {
    const s = useTechStore.getState();
    const nose = s.rocket.stages[0].components.find((c) => c.kind === "nosecone")!;
    s.updateComponent(nose.id, { lengthM: 0.09 });
    const st = useTechStore.getState();
    const n2 = st.rocket.stages[0].components.find((c) => c.kind === "nosecone")!;
    expect((n2 as { lengthM: number }).lengthM).toBe(0.09);
  });

  it("removeComponent ağaçtan siler", () => {
    const s = useTechStore.getState();
    const lug = s.rocket.stages[0].components.find((c) => c.kind === "launchlug")!;
    const count = s.rocket.stages[0].components.length;
    s.removeComponent(lug.id);
    const st = useTechStore.getState();
    expect(st.rocket.stages[0].components.length).toBe(count - 1);
  });

  it("patchConditions rüzgarı günceller", () => {
    const s = useTechStore.getState();
    s.patchConditions({ windSpeedMps: 5 });
    expect(useTechStore.getState().rocket.conditions.windSpeedMps).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c "npx vitest run src/tech/store.test.ts"`
Expected: FAIL — "Cannot find module './store'"

- [ ] **Step 3: Write implementation — `src/tech/store.ts`**

```ts
// Teknik mod merkezi durumu. Fizik montajı Task 3'te eklenir; şimdilik
// sadece bileşen ağacı yönetimi + simülasyon yer tutucuları.

import { create } from "zustand";
import {
  ComponentKind,
  TechComponent,
  TechConditions,
  TechRocket,
  defaultTechRocket,
  makeComponent,
  uid,
} from "./model";

export type TechUiTab = "analysis" | "drag" | "simulation" | "motor";
export type TechStatus = "idle" | "running" | "ended";

export function findComponent(components: TechComponent[], id: string): TechComponent | null {
  for (const c of components) {
    if (c.id === id) return c;
    if (c.kind === "bodytube") {
      const hit = findComponent(c.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function replaceComponentInTree(root: TechComponent, id: string, patch: Record<string, unknown>): TechComponent {
  if (root.id === id) return { ...root, ...patch } as TechComponent;
  if (root.kind === "bodytube") {
    return { ...root, children: root.children.map((c) => replaceComponentInTree(c, id, patch)) };
  }
  return root;
}

export function insertComponent(roots: TechComponent[], parentId: string | null, comp: TechComponent): TechComponent[] {
  if (parentId === null) return [...roots, comp];
  return roots.map((r) => (r.id === parentId && r.kind === "bodytube"
    ? { ...r, children: [...r.children, comp] }
    : r.kind === "bodytube"
      ? { ...r, children: insertComponent(r.children, parentId, comp) }
      : r));
}

export function removeComponentFromTree(roots: TechComponent[], id: string): TechComponent[] {
  return roots
    .filter((r) => r.id !== id)
    .map((r) => (r.kind === "bodytube" ? { ...r, children: removeComponentFromTree(r.children, id) } : r));
}

export interface TechSimState {
  rocket: TechRocket;
  selectedId: string | null;
  tab: TechUiTab;
  status: TechStatus;
  simTime: number;
  result: unknown;
  currentSample: unknown;

  updateRocket: (r: TechRocket) => void;
  patchConditions: (patch: Partial<TechConditions>) => void;
  selectComponent: (id: string | null) => void;
  updateComponent: (id: string, patch: Record<string, unknown>) => void;
  addComponent: (parentId: string | null, kind: ComponentKind) => void;
  removeComponent: (id: string) => void;
  setTab: (t: TechUiTab) => void;
  setStatus: (s: TechStatus) => void;
  runSimulation: () => void;
  resetSim: () => void;
  setSimTime: (t: number) => void;
  setCurrentSample: (s: unknown) => void;
}

export const useTechStore = create<TechSimState>((set, get) => ({
  rocket: defaultTechRocket(),
  selectedId: null,
  tab: "analysis",
  status: "idle",
  simTime: 0,
  result: null,
  currentSample: null,

  updateRocket: (r) => set({ rocket: r }),
  patchConditions: (patch) => set({ rocket: { ...get().rocket, conditions: { ...get().rocket.conditions, ...patch } } }),
  selectComponent: (id) => set({ selectedId: id }),
  updateComponent: (id, patch) => {
    const rocket = get().rocket;
    const stages = rocket.stages.map((st) => ({
      ...st,
      components: st.components.map((c) => replaceComponentInTree(c, id, patch)),
    }));
    set({ rocket: { ...rocket, stages } });
  },
  addComponent: (parentId, kind) => {
    const comp = makeComponent(kind);
    comp.id = uid();
    const rocket = get().rocket;
    const stages = rocket.stages.map((st) => ({ ...st, components: insertComponent(st.components, parentId, comp) }));
    set({ rocket: { ...rocket, stages }, selectedId: comp.id });
  },
  removeComponent: (id) => {
    const rocket = get().rocket;
    const stages = rocket.stages.map((st) => ({ ...st, components: removeComponentFromTree(st.components, id) }));
    set({ rocket: { ...rocket, stages }, selectedId: null });
  },
  setTab: (t) => set({ tab: t }),
  setStatus: (s) => set({ status: s }),
  runSimulation: () => { /* Task 8'de gerçek simülasyon */ },
  resetSim: () => set({ status: "idle", simTime: 0, result: null, currentSample: null }),
  setSimTime: (t) => set({ simTime: t }),
  setCurrentSample: (s) => set({ currentSample: s }),
}));
```

- [ ] **Step 4: Write implementation — `src/tech/ui/TechApp.tsx` (iskelet) ve `src/components/App.tsx` mod anahtarı**

`src/tech/ui/TechApp.tsx`:

```tsx
// Teknik mod ana yerleşimi — Task 9-12'de doldurulur.

export default function TechApp() {
  return (
    <div className="tech-app">
      <div className="tech-placeholder">
        Teknik mod — bileşen ağacı, analiz panelleri ve simülasyon buraya gelecek.
      </div>
    </div>
  );
}
```

`src/components/App.tsx` değişikliği — dosyanın başına ekleyin:

```tsx
import { useRef, useState } from "react";
```

ve `export default function App()` içinde ilk satıra:

```tsx
  const [mode, setMode] = useState<"casual" | "tech">("casual");
  if (mode === "tech") {
    return (
      <div className="app">
        <header className="topbar">
          <div className="logo">
            <span className="logo-rocket">🚀</span>
            <span className="logo-text">SLOP<span className="accent">ROCKET</span></span>
            <span className="logo-sub">Teknik Mod</span>
          </div>
          <div className="topbar-actions">
            <button className="btn small" onClick={() => setMode("casual")}>← Kolay Mod</button>
          </div>
        </header>
        <TechApp />
      </div>
    );
  }
```

Ayrıca casual topbar'ın `topbar-actions` bölümüne "Teknik Mod" düğmesi:

```tsx
          <button className="btn small" onClick={() => setMode("tech")}>Teknik Mod →</button>
```

`import TechApp from "../tech/ui/TechApp";` — App.tsx importlarına ekleyin.

- [ ] **Step 5: Run tests + build to verify**

Run: `cmd /c "npx vitest run"`
Expected: PASS (38 casual + 4 tech store testleri — store.test.ts'te addComponent/updateComponent testleri sırayla çalışır)
Run: `cmd /c "npm run build"`
Expected: SUCCESS (tsc + vite)

- [ ] **Step 6: Commit**

```bash
git add src/tech/store.ts src/tech/store.test.ts src/tech/ui/TechApp.tsx src/components/App.tsx
git commit -m "feat: add tech mode store and app mode switcher"
```

---

# Task 3 — Fizik montaj: `src/tech/physics/assembly.ts`

## Amaç
Ağaç modelini mutlak konumlu `PlacedComponent[]`'e, kütle/CG/aero referanslarına çeviren montaj katmanı. Casual `resolveMotor`'u köprü olarak kullanarak motor özelliklerini katalogdan çeker. Barrowman burası değil — Task 4'te `analyzeBarrowman` gerçeği yazılır, şimdilik yer tutucu (cp ≈ 0.24, cnTotal ≈ 38) montajı çalıştırır.

## Dosyalar
- `src/tech/physics/assembly.ts` (yeni)
- `src/tech/physics/assembly.test.ts` (yeni)
- `src/tech/store.ts` (+ `refreshAssembly`) (değişiklik)
- `src/tech/store.test.ts` (+test) (değişiklik)

## Kabul (acceptance)
- Alpha: `totalLength` 0.29–0.33 m; `referenceDiameter` 0.0249±0.0001
- Alpha: `structureMass` 15–30 g; `liftoffMass` 40–60 g; `propellantMass` 8–14 g
- `motorSpecsFromCatalog("C6-7")` → totalImpulse 8.8 N·s ±0.1, burnTime 1.9 s ±0.1, mass 24.2 g ±0.05 g, propellant 10.8 g ±0.05 g
- `cp > cg` ve stabilite ≥ 1 kalibre
- motorsuz kopyada CG öne kayar (motor ağı bahe basılan arka kütlenin etkisi)
- Motor katalog verisi casual `resolveMotor({ kind: "estes", id, count: 1 })`'dan gelir — aynı `C6-7` aynı sayı döner
- Mevcut casual testler (38) yeşil kalır

## Kural / kabul (yerleşim kuralı)
- `axialOffset` değeri bileşenin **aft (arka)** ucuna eklenir; 0 = az önce eklenen bileşene bitişik.
- Motor tüpü (motormount) gövde içine takılır; motorun kütle merkezi motor arka yüzeyinden itibaren `overhang + motor.length/2` konuma gelir (arka tarafta ağırlık).
- Yapay (geometrik) kütleler, kanat/eşek makas: verim alanı × kalınlık × malzeme yoğunluğu × adet.
- Referans çapı: mavi burunç rejeli en büyük bodytube dış çapı.

## Dosya: `src/tech/physics/assembly.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { defaultTechRocket } from "../model";
import {
  assembleTech,
  motorSpecsFromCatalog,
  placeRocket,
} from "./assembly";

const alpha = () => defaultTechRocket();

describe("tech assembly", () => {
  it("Alpha: uzunluk 0.29–0.33 m", () => {
    const a = assembleTech(alpha());
    expect(a.totalLength).toBeGreaterThan(0.29);
    expect(a.totalLength).toBeLessThan(0.33);
  });

  it("Alpha: referans çapı BT-50 → Ø24.9 mm", () => {
    const a = assembleTech(alpha());
    expect(a.referenceDiameter).toBeCloseTo(0.0249, 4);
  });

  it("Alpha: yapı kütlesi 15–30 g (motorsuz)", () => {
    const a = assembleTech(alpha());
    expect(a.structureMass).toBeGreaterThan(0.015);
    expect(a.structureMass).toBeLessThan(0.030);
  });

  it("Alpha: kalkış kütlesi 40–60 g (C6-7 dahil)", () => {
    const a = assembleTech(alpha());
    expect(a.liftoffMass).toBeGreaterThan(0.040);
    expect(a.liftoffMass).toBeLessThan(0.060);
  });

  it("Alpha: itici kütlesi 8–14 g", () => {
    const a = assembleTech(alpha());
    expect(a.propellantMass).toBeGreaterThan(0.008);
    expect(a.propellantMass).toBeLessThan(0.014);
  });

  it("motorSpecsFromCatalog: C6-7 → 8.8 N·s / 1.9 s / 24.2 g / 10.8 g", () => {
    const m = motorSpecsFromCatalog("C6-7");
    expect(m !== null).toBe(true);
    expect(m!.totalImpulse).toBeCloseTo(8.8, 1);
    expect(m!.burnTime).toBeCloseTo(1.9, 1);
    expect(m!.mass).toBeCloseTo(0.0242, 4);
    expect(m!.propellant).toBeCloseTo(0.0108, 4);
  });

  it("Alpha: benzer yabancı — CP, CG'nin arkasında ve stabilite ≥ 1 cal", () => {
    const a = assembleTech(alpha());
    expect(a.cp).toBeGreaterThan(a.cg);
    expect((a.cp - a.cg) / a.referenceDiameter).toBeGreaterThanOrEqual(1);
  });

  it("motor çıkarınca CG öne kayar", () => {
    const withM = assembleTech(alpha());
    const bare = alpha();
    clearMotors(bare);
    const noM = assembleTech(bare);
    expect(noM.cg).toBeLessThan(withM.cg);
  });

  it("placeRocket: tüp son kanat, naz önce; son Parça sıralı artış", () => {
    const p = placeRocket(alpha());
    const nose = p.find((c) => c.kind === "nosecone");
    const tube = p.find((c) => c.kind === "bodytube");
    const fin = p.find((c) => c.kind === "trapezoidfin");
    expect(nose && tube && fin).toBeTruthy();
    expect(nose!.x).toBeLessThan(tube!.x);
    expect(fin!.x).toBeGreaterThan(tube!.x);
  });
});
```

Adım yürütme:

- [ ] **Step 1: Testi ekleyin**

```bash
mkdir -p src/tech/physics
```

- [ ] **Step 2: Testi çalıştır — FAIL beklenir**

Run: `cmd /c "npx vitest run src/tech/physics/assembly.test.ts"`
Expected: FAIL — "Cannot find module './assembly'" (henüz yok)

- [ ] **Step 3: Implementation — `src/tech/physics/assembly.ts`**
```