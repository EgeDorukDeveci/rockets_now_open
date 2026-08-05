import { describe, it, expect } from "vitest";
import { useTechStore } from "./store";

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