// Merkezi durum: tasarım config'i, montaj/tahmin önbelleği, uçuş oynatımı, kamera.
// Uçuş, kalkışta tamamen önceden hesaplanır (predictFlight) ve telemetri
// tamponundan oynatılır — 3D sahne aynı saatte ilerler (doküman §6).

import { create } from "zustand";
import { RocketConfig, StageConfig, defaultConfig } from "./types";
import { assembleRocket, RocketAssembly } from "./physics/rocket";
import { predictFlight, FlightPrediction } from "./physics/predict";
import { simulateFlight, FlightResult, TelemetrySample } from "./physics/trajectory";

export type FlightStatus = "idle" | "running" | "paused" | "ended";
export type CameraMode = "follow" | "pad" | "free";

export interface SimState {
  // ---- Tasarım ----
  config: RocketConfig;
  assembly: RocketAssembly;
  prediction: FlightPrediction | null;

  // ---- Uçuş ----
  status: FlightStatus;
  /** Oynatım saati, s */
  simTime: number;
  /** Oynatım hızı çarpanı */
  speed: number;
  result: FlightResult | null;
  /** Oynatımda en son görünen telemetri örneği */
  currentSample: TelemetrySample | null;

  // ---- Kamera / görünüm ----
  cameraMode: CameraMode;
  showTrajectory: boolean;
  showGrid: boolean;

  // ---- Eylemler ----
  updateConfig: (c: RocketConfig) => void;
  patchConfig: (patch: Partial<RocketConfig>) => void;
  updateStage: (index: number, updater: (s: StageConfig) => StageConfig) => void;
  /** Sadece adı değiştirir — fizik hesaplarını tekrar çalıştırmaz. */
  setName: (name: string) => void;
  setStatus: (s: FlightStatus) => void;
  launch: () => void;
  reset: () => void;
  setSimTime: (t: number) => void;
  setSpeed: (s: number) => void;
  setCameraMode: (m: CameraMode) => void;
  setShowTrajectory: (v: boolean) => void;
  setShowGrid: (v: boolean) => void;
}

/** Yapılandırma değiştiğinde montaj + tahmini yeniden hesaplar. */
function recompute(config: RocketConfig) {
  const assembly = assembleRocket(config);
  const prediction = predictFlight(config);
  return { config, assembly, prediction };
}

const initial = recompute(defaultConfig());

export const useStore = create<SimState>((set, get) => ({
  config: initial.config,
  assembly: initial.assembly,
  prediction: initial.prediction,

  status: "idle",
  simTime: 0,
  speed: 1,
  result: null,
  currentSample: null,

  cameraMode: "follow",
  showTrajectory: true,
  showGrid: true,

  updateConfig: (c) => {
    set(recompute(c));
  },
  patchConfig: (patch) => {
    const config = { ...get().config, ...patch };
    set(recompute(config));
  },
  updateStage: (index, updater) => {
    const stages = get().config.stages.map((s, i) => (i === index ? updater(s) : s));
    const config = { ...get().config, stages };
    set(recompute(config));
  },

  setName: (name) => set({ config: { ...get().config, name } }),

  setStatus: (s) => set({ status: s }),
  launch: () => {
    const result = simulateFlight({ assembly: get().assembly, throttle: 1 });
    set({
      result,
      status: "running",
      simTime: 0,
      currentSample: result.telemetry[0] ?? null,
    });
  },
  reset: () =>
    set({ status: "idle", simTime: 0, result: null, currentSample: null }),

  setSimTime: (t) => {
    const { result } = get();
    if (!result) return;
    const clamp = Math.max(0, Math.min(t, result.telemetry[result.telemetry.length - 1].t));
    // İkili arama: simTime'a en yakın örnek
    const tel = result.telemetry;
    let lo = 0;
    let hi = tel.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tel[mid].t <= clamp) lo = mid;
      else hi = mid - 1;
    }
    set({ simTime: clamp, currentSample: tel[lo] ?? null });
  },

  setSpeed: (s) => set({ speed: s }),
  setCameraMode: (m) => set({ cameraMode: m }),
  setShowTrajectory: (v) => set({ showTrajectory: v }),
  setShowGrid: (v) => set({ showGrid: v }),
}));
