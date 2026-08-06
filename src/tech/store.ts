// Teknik mod merkezi durumu: bileşen ağacı yönetimi + simülasyon çalıştırma.

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
import { TechFlightResult, TechSimSample, sampleAtTime, simulate } from "./physics/simulator";

export type TechUiTab = "analysis" | "drag" | "simulation" | "motor";
export type TechStatus = "idle" | "running" | "ended";
export type TechCameraMode = "follow" | "pad" | "free";

/** Simülasyonu resetlemeden bileşen değişikliği yapılınca sonucu geçersiz kılar. */
function staleResult(result: TechFlightResult | null): TechFlightResult | null {
  return result === null ? null : { ...result, samples: [], summary: { ...result.summary } };
}

/** Sonuç geçersizken 3D sahnenin eski örneği göstermesini engeller. */
const STALE = { currentSample: null, simTime: 0 } as const;

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
  result: TechFlightResult | null;
  currentSample: TechSimSample | null;
  cameraMode: TechCameraMode;
  showTrajectory: boolean;
  showGrid: boolean;

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
  setCurrentSample: (s: TechSimSample | null) => void;
  setCameraMode: (m: TechCameraMode) => void;
  setShowTrajectory: (v: boolean) => void;
  setShowGrid: (v: boolean) => void;
}

export const useTechStore = create<TechSimState>((set, get) => ({
  rocket: defaultTechRocket(),
  selectedId: null,
  tab: "analysis",
  status: "idle",
  simTime: 0,
  result: null,
  currentSample: null,
  cameraMode: "follow",
  showTrajectory: true,
  showGrid: true,

  updateRocket: (r) => set({ rocket: r }),
  patchConditions: (patch) =>
    set({ rocket: { ...get().rocket, conditions: { ...get().rocket.conditions, ...patch } } }),
  selectComponent: (id) => set({ selectedId: id }),
  updateComponent: (id, patch) => {
    const rocket = get().rocket;
    const stages = rocket.stages.map((st) => ({
      ...st,
      components: st.components.map((c) => replaceComponentInTree(c, id, patch)),
    }));
    set({ rocket: { ...rocket, stages }, result: staleResult(get().result), ...STALE });
  },
  addComponent: (parentId, kind) => {
    const comp = makeComponent(kind);
    comp.id = uid();
    const rocket = get().rocket;
    const stages = rocket.stages.map((st) => ({ ...st, components: insertComponent(st.components, parentId, comp) }));
    set({ rocket: { ...rocket, stages }, selectedId: comp.id, result: staleResult(get().result), ...STALE });
  },
  removeComponent: (id) => {
    const rocket = get().rocket;
    const stages = rocket.stages.map((st) => ({ ...st, components: removeComponentFromTree(st.components, id) }));
    set({ rocket: { ...rocket, stages }, selectedId: null, result: staleResult(get().result), ...STALE });
  },
  setTab: (t) => set({ tab: t }),
  setStatus: (s) => set({ status: s }),
  runSimulation: () => {
    const rocket = get().rocket;
    const result = simulate(rocket);
    set({
      result,
      status: "ended",
      simTime: 0,
      currentSample: result.samples.length ? result.samples[0] : null,
    });
  },
  resetSim: () => set({ status: "idle", simTime: 0, result: null, currentSample: null }),
  setSimTime: (t) => {
    const result = get().result;
    set({
      simTime: t,
      currentSample: result && result.samples.length ? sampleAtTime(result, t) : null,
    });
  },
  setCurrentSample: (s) => set({ currentSample: s }),
  setCameraMode: (m) => set({ cameraMode: m }),
  setShowTrajectory: (v) => set({ showTrajectory: v }),
  setShowGrid: (v) => set({ showGrid: v }),
}));