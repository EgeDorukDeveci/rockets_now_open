// Uygulama düzeni: üst bar, tasarım editörü (sol), 3D görünüm (orta), HUD (sağ).

import { useRef, useState } from "react";
import { useStore } from "../store";
import { RocketConfig } from "../types";
import DesignEditor from "./DesignEditor";
import { HudPanel } from "./HudPanel";
import Controls from "./Controls";
import RocketView from "./RocketView";
import { PRESETS } from "../presets";
import { TECH_PRESETS } from "../tech/presets";
import TechApp from "../tech/ui/TechApp";
import { casualToTech } from "../tech/convert";
import { useTechStore } from "../tech/store";

/** Teknik mod üst barı: model adı + hazır model seçici + mod anahtarı. */
function TechTopbar({ onBack }: { onBack: () => void }) {
  const rocket = useTechStore((s) => s.rocket);

  const applyPreset = (id: string) => {
    const p = TECH_PRESETS.find((x) => x.id === id);
    if (!p) return;
    useTechStore.setState({
      rocket: p.build(),
      result: null,
      currentSample: null,
      status: "idle",
      simTime: 0,
      selectedId: null,
      tab: "analysis",
    });
  };

  return (
    <header className="topbar">
      <div className="logo">
        <span className="logo-rocket">🚀</span>
        <span className="logo-text">SLOP<span className="accent">ROCKET</span></span>
        <span className="logo-sub tech-mode-chip">Teknik Mod</span>
      </div>
      <div className="topbar-mid">
        <input
          className="name-input tech-name-input"
          value={rocket.name}
          onChange={(e) =>
            useTechStore.getState().updateRocket({ ...useTechStore.getState().rocket, name: e.target.value })
          }
          placeholder="Roket adı"
        />
        <select
          className="preset-select"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) applyPreset(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="" disabled>Hazır model…</option>
          {TECH_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="topbar-actions">
        <button className="btn small" onClick={onBack}>← Kolay Mod</button>
      </div>
    </header>
  );
}

function CameraButtons() {
  const mode = useStore((s) => s.cameraMode);
  const set = useStore((s) => s.setCameraMode);
  return (
    <div className="camera-buttons">
      <button className={`cb ${mode === "follow" ? "active" : ""}`} onClick={() => set("follow")} title="Takip kamerası">Takip</button>
      <button className={`cb ${mode === "pad" ? "active" : ""}`} onClick={() => set("pad")} title="Rampa kamerası">Rampa</button>
      <button className={`cb ${mode === "free" ? "active" : ""}`} onClick={() => set("free")} title="Serbest kamera">Serbest</button>
    </div>
  );
}

function ViewToggles() {
  const trajectory = useStore((s) => s.showTrajectory);
  const grid = useStore((s) => s.showGrid);
  const setTrajectory = useStore((s) => s.setShowTrajectory);
  const setGrid = useStore((s) => s.setShowGrid);
  return (
    <div className="view-toggles" role="group" aria-label="Görünüm katmanları">
      <button className={`vt ${trajectory ? "on" : ""}`} onClick={() => setTrajectory(!trajectory)} title="Yörünge çizgisi">
        <span /> Yörünge
      </button>
      <button className={`vt ${grid ? "on" : ""}`} onClick={() => setGrid(!grid)} title="Zemin ızgarası">
        <span /> Izgara
      </button>
    </div>
  );
}

function exportJSON(config: RocketConfig) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${config.name.replace(/[^\w\- ]/g, "").replace(/\s+/g, "-")}.sloprocket.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [mode, setMode] = useState<"casual" | "tech">("casual");
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  const setName = useStore((s) => s.setName);
  const reset = useStore((s) => s.reset);
  const fileRef = useRef<HTMLInputElement>(null);

  if (mode === "tech") {
    return (
      <div className="app">
        <TechTopbar onBack={() => setMode("casual")} />
        <TechApp />
      </div>
    );
  }

  const applyPreset = (id: string) => {
    const p = PRESETS.find((p) => p.id === id);
    if (p) updateConfig(p.build());
  };

  const enterTech = () => {
    useTechStore.setState({
      rocket: casualToTech(config),
      result: null,
      currentSample: null,
      status: "idle",
      simTime: 0,
      selectedId: null,
      tab: "analysis",
    });
    setMode("tech");
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as RocketConfig;
        if (!parsed || !Array.isArray(parsed.stages) || parsed.stages.length === 0) throw new Error("bad");
        updateConfig(parsed);
      } catch {
        alert("Geçersiz tasarım dosyası.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span className="logo-rocket">🚀</span>
          <span className="logo-text">SLOP<span className="accent">ROCKET</span></span>
          <span className="logo-sub">Tasarım · Simülasyon · Telemetri</span>
        </div>
        <div className="topbar-mid">
          <input
            className="name-input"
            value={config.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Roket adı"
          />
          <select
            className="preset-select"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) applyPreset(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>Hazır tasarım…</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="topbar-actions">
          <button className="btn small" onClick={() => exportJSON(config)}>Dışa aktar</button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>İçe aktar</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
          <button className="btn small" onClick={reset}>Temizle</button>
          <button className="btn small" onClick={enterTech}>Teknik Mod →</button>
        </div>
      </header>

      <main className="layout">
        <aside className="left">
          <DesignEditor />
        </aside>
        <section className="center">
          <div className="view3d">
            <RocketView />
          </div>
          <CameraButtons />
          <ViewToggles />
          <Controls />
        </section>
        <aside className="right">
          <HudPanel />
        </aside>
      </main>
    </div>
  );
}
