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