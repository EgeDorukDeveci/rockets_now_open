// Tasarım editörü: kademe bileşenleri, motor, kurtarma, aviyonik, fırlatma koşulları.

import { useState } from "react";
import { useStore } from "../store";
import { StageConfig, defaultStage } from "../types";
import { MATERIALS, FIN_MATERIALS, CANOPY_MATERIALS, TUBE_SIZES } from "../physics/materials";
import { NOSE_PROFILES } from "../physics/noseShapes";
import { ESTES_MOTORS } from "../physics/motors/catalog";
import { Section, NumField, SelectField, ToggleField } from "./ui";

const MOTOR_CLASSES = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const GRAINS = ["endBurn", "bates", "star", "finocyl"];
const FUELS = ["LOX/RP-1", "LOX/LH2", "LOX/CH4"];
const GEOMETRIES = ["rectangular", "swept", "clippedDelta", "delta", "elliptical", "rounded"];

function numberOpts(list: number[]): Array<{ value: string; label: string }> {
  return list.map((v) => ({ value: String(v), label: String(v) }));
}

type StageUpdater = (s: StageConfig) => StageConfig;

function MotorEditor({ stage, onChange }: { stage: StageConfig; onChange: (updater: StageUpdater) => void }) {
  const c = stage.motor.choice;
  const kind = c.kind;
  const upd = (fn: (s: StageConfig) => StageConfig) => onChange(fn);
  return (
    <Section title="Motor">
      <SelectField
        label="Tür"
        value={kind}
        options={[
          { value: "estes", label: "Estes (siyah toz)" },
          { value: "apcp", label: "APCP kompozit" },
          { value: "liquid", label: "Sıvı yakıt" },
          { value: "hybrid", label: "Hibrit" },
          { value: "coldGas", label: "Soğuk gaz" },
        ]}
        onChange={(k) => {
          if (k === "estes") upd((s) => ({ ...s, motor: { ...s.motor, choice: { kind: "estes", id: "C6-7", count: 1 } } }));
          else if (k === "apcp") upd((s) => ({ ...s, motor: { ...s.motor, choice: { kind: "apcp", cls: "C", avgThrustN: 15, delay: 4, impulsePct: 0.8, grain: "bates", count: 1 } } }));
          else if (k === "liquid") upd((s) => ({ ...s, motor: { ...s.motor, choice: { kind: "liquid", fuel: "LOX/RP-1", name: "Sıvı Motor", thrustN: 120, propMassKg: 3, dryFraction: 0.12, count: 1 } } }));
          else if (k === "hybrid") upd((s) => ({ ...s, motor: { ...s.motor, choice: { kind: "hybrid", thrustN: 80, propMassKg: 2, count: 1 } } }));
          else upd((s) => ({ ...s, motor: { ...s.motor, choice: { kind: "coldGas", thrustN: 30, propMassKg: 0.8, count: 1 } } }));
        }}
      />
      {kind === "estes" && (
        <>
          <SelectField
            label="Motor"
            value={c.id}
            options={ESTES_MOTORS.map((m) => ({ value: m.id, label: `${m.id} — ${m.totalImpulse.toFixed(1)} Ns, ${m.burnTime.toFixed(1)} s` }))}
            onChange={(id) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, id } } }))}
          />
          <NumField label="Adet" value={c.count} min={1} max={4} onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, count: Math.round(v) } } }))} />
        </>
      )}
      {kind === "apcp" && (
        <>
          <SelectField label="Sınıf" value={c.cls} options={MOTOR_CLASSES.map((m) => ({ value: m, label: m }))} onChange={(cls) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, cls: cls as never } } }))} />
          <NumField label="Ort. itki" value={c.avgThrustN} min={1} max={500} unit="N" onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, avgThrustN: v } } }))} />
          <NumField label="Gecikme" value={c.delay} min={0} max={20} unit="s" onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, delay: v } } }))} />
          <NumField label="İtki yüzdesi" value={c.impulsePct} min={0} max={1} step={0.05} onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, impulsePct: v } } }))} />
          <SelectField label="Yakıt geometrisi" value={c.grain} options={GRAINS.map((g) => ({ value: g, label: g }))} onChange={(grain) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, grain: grain as never } } }))} />
        </>
      )}
      {(kind === "liquid" || kind === "hybrid" || kind === "coldGas") && (
        <>
          {kind === "liquid" && (
            <>
              <SelectField label="Yakıt" value={c.fuel} options={FUELS.map((f) => ({ value: f, label: f }))} onChange={(fuel) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, fuel: fuel as never } } }))} />
              <NumField label="İtki" value={c.thrustN} min={1} max={5000} unit="N" onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, thrustN: v } } }))} />
              <NumField label="Yakıt kütlesi" value={c.propMassKg} min={0.1} max={500} unit="kg" onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, propMassKg: v } } }))} />
              <NumField label="Kuru oran" value={c.dryFraction} min={0.02} max={0.5} step={0.01} onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, dryFraction: v } } }))} />
            </>
          )}
          {(kind === "hybrid" || kind === "coldGas") && (
            <NumField label="İtki" value={c.thrustN} min={1} max={5000} unit="N" onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, thrustN: v } } }))} />
          )}
          {(kind === "hybrid" || kind === "coldGas") && (
            <NumField label="Yakıt kütlesi" value={c.propMassKg} min={0.05} max={500} unit="kg" onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, choice: { ...c, propMassKg: v } } }))} />
          )}
        </>
      )}
      <NumField label="Kısma" value={stage.motor.throttle} min={0.1} max={1} step={0.05} onChange={(v) => upd((s) => ({ ...s, motor: { ...s.motor, throttle: v } }))} />
    </Section>
  );
}

function BodyEditor({ stage, onChange }: { stage: StageConfig; onChange: (updater: StageUpdater) => void }) {
  const upd = (fn: (s: StageConfig) => StageConfig) => onChange(fn);
  return (
    <Section title="Gövde">
      <SelectField
        label="Tüp çapı"
        value={String(stage.body.diameterM)}
        options={Object.entries(TUBE_SIZES).map(([k, v]) => ({ value: String(v / 1000), label: `${k} — ${v.toFixed(1)} mm` }))}
        onChange={(v) => upd((s) => ({ ...s, body: { ...s.body, diameterM: parseFloat(v) } }))}
      />
      <NumField label="Uzunluk" value={stage.body.lengthM} min={0.05} max={3} step={0.005} unit="m" onChange={(v) => upd((s) => ({ ...s, body: { ...s.body, lengthM: v } }))} />
      <NumField label="Cidar" value={stage.body.wallM} min={0.0003} max={0.01} step={0.0001} unit="m" onChange={(v) => upd((s) => ({ ...s, body: { ...s.body, wallM: v } }))} />
      <SelectField label="Malzeme" value={stage.body.material} options={Object.values(MATERIALS).map((m) => ({ value: m.id, label: m.name }))} onChange={(material) => upd((s) => ({ ...s, body: { ...s.body, material } }))} />
      <ToggleField label="Boya / kaplama" value={stage.body.paint} onChange={(paint) => upd((s) => ({ ...s, body: { ...s.body, paint } }))} />
    </Section>
  );
}

function NoseEditor({ stage, onChange }: { stage: StageConfig; onChange: (updater: StageUpdater) => void }) {
  const upd = (fn: (s: StageConfig) => StageConfig) => onChange(fn);
  return (
    <Section title="Burun Konisi">
      <SelectField label="Profil" value={stage.nose.profile} options={NOSE_PROFILES.map((p) => ({ value: p.id, label: p.name }))} onChange={(profile) => upd((s) => ({ ...s, nose: { ...s.nose, profile: profile as never } }))} />
      <NumField label="İncelik" value={stage.nose.lengthCalibers} min={0.5} max={5} step={0.1} unit="kal" onChange={(v) => upd((s) => ({ ...s, nose: { ...s.nose, lengthCalibers: v } }))} />
      <SelectField label="Malzeme" value={stage.nose.material} options={Object.values(MATERIALS).map((m) => ({ value: m.id, label: m.name }))} onChange={(material) => upd((s) => ({ ...s, nose: { ...s.nose, material } }))} />
      <ToggleField label="İçi boş" value={stage.nose.hollow} onChange={(hollow) => upd((s) => ({ ...s, nose: { ...s.nose, hollow } }))} />
    </Section>
  );
}

function FinEditor({ stage, onChange }: { stage: StageConfig; onChange: (updater: StageUpdater) => void }) {
  const upd = (fn: (s: StageConfig) => StageConfig) => onChange(fn);
  return (
    <Section title="Kanatlar">
      <SelectField label="Adet" value={String(stage.fins.count)} options={numberOpts([0, 3, 4, 5, 6])} onChange={(v) => upd((s) => ({ ...s, fins: { ...s.fins, count: parseInt(v, 10) as never } }))} />
      <SelectField label="Geometri" value={stage.fins.geometry} options={GEOMETRIES.map((g) => ({ value: g, label: g }))} onChange={(geometry) => upd((s) => ({ ...s, fins: { ...s.fins, geometry: geometry as never } }))} />
      <NumField label="Kök kiriş" value={stage.fins.rootChordM} min={0.01} max={0.5} step={0.005} unit="m" onChange={(v) => upd((s) => ({ ...s, fins: { ...s.fins, rootChordM: v } }))} />
      <NumField label="Uç kiriş" value={stage.fins.tipChordM} min={0} max={0.5} step={0.005} unit="m" onChange={(v) => upd((s) => ({ ...s, fins: { ...s.fins, tipChordM: v } }))} />
      <NumField label="Açıklık" value={stage.fins.semispanM} min={0.005} max={0.4} step={0.005} unit="m" onChange={(v) => upd((s) => ({ ...s, fins: { ...s.fins, semispanM: v } }))} />
      <NumField label="Konum" value={stage.fins.xPosM} min={0} max={3} step={0.005} unit="m" onChange={(v) => upd((s) => ({ ...s, fins: { ...s.fins, xPosM: v } }))} />
      <NumField label="Tarama" value={stage.fins.sweepDeg} min={0} max={60} unit="°" onChange={(v) => upd((s) => ({ ...s, fins: { ...s.fins, sweepDeg: v } }))} />
      <NumField label="Yalpa (cant)" value={stage.fins.cantDeg} min={0} max={5} step={0.1} unit="°" onChange={(v) => upd((s) => ({ ...s, fins: { ...s.fins, cantDeg: v } }))} />
      <NumField label="Kalınlık" value={stage.fins.thicknessM} min={0.0005} max={0.02} step={0.0005} unit="m" onChange={(v) => upd((s) => ({ ...s, fins: { ...s.fins, thicknessM: v } }))} />
      <SelectField label="Malzeme" value={stage.fins.material} options={Object.values(FIN_MATERIALS).map((m) => ({ value: m.id, label: m.name }))} onChange={(material) => upd((s) => ({ ...s, fins: { ...s.fins, material } }))} />
    </Section>
  );
}

function RecoveryEditor({ stage, onChange }: { stage: StageConfig; onChange: (updater: StageUpdater) => void }) {
  const r = stage.recovery;
  const upd = (fn: (s: StageConfig) => StageConfig) => onChange(fn);
  return (
    <Section title="Kurtarma">
      <SelectField
        label="Sistem"
        value={r.type}
        options={[
          { value: "parachute", label: "Paraşüt" },
          { value: "streamer", label: "Şerit" },
          { value: "tumble", label: "Devrilme" },
          { value: "none", label: "Yok" },
        ]}
        onChange={(type) => upd((s) => ({ ...s, recovery: { ...r, type: type as never } }))}
      />
      {r.type === "parachute" && (
        <>
          <NumField label="Çap" value={r.diameterM} min={0.1} max={3} step={0.05} unit="m" onChange={(v) => upd((s) => ({ ...s, recovery: { ...r, diameterM: v } }))} />
          <NumField label="Drogue çapı" value={r.drogueDiaM} min={0} max={1} step={0.05} unit="m" onChange={(v) => upd((s) => ({ ...s, recovery: { ...r, drogueDiaM: v } }))} />
        </>
      )}
      {r.type === "streamer" && (
        <NumField label="Genişlik" value={r.diameterM} min={0.02} max={0.5} step={0.01} unit="m" onChange={(v) => upd((s) => ({ ...s, recovery: { ...r, diameterM: v } }))} />
      )}
      <SelectField label="Kanopi" value={r.material} options={Object.entries(CANOPY_MATERIALS).map(([k, v]) => ({ value: k, label: `${k} (${v.density} g/m²)` }))} onChange={(material) => upd((s) => ({ ...s, recovery: { ...r, material } }))} />
      <SelectField
        label="Tetik"
        value={r.trigger}
        options={[
          { value: "delay", label: "Motor gecikmesi" },
          { value: "apogee", label: "Apogee (aviyonik)" },
          { value: "timer", label: "Zamanlayıcı" },
        ]}
        onChange={(trigger) => upd((s) => ({ ...s, recovery: { ...r, trigger: trigger as never } }))}
      />
      {r.trigger === "timer" && <NumField label="Süre" value={r.timerSeconds} min={0} max={120} unit="s" onChange={(v) => upd((s) => ({ ...s, recovery: { ...r, timerSeconds: v } }))} />}
      <NumField label="Şok ipi" value={r.shockCordM} min={0} max={5} step={0.1} unit="m" onChange={(v) => upd((s) => ({ ...s, recovery: { ...r, shockCordM: v } }))} />
    </Section>
  );
}

function PayloadEditor({ stage, onChange }: { stage: StageConfig; onChange: (updater: StageUpdater) => void }) {
  const upd = (fn: (s: StageConfig) => StageConfig) => onChange(fn);
  return (
    <Section title="Yük & Aviyonik">
      <ToggleField label="Yük var" value={stage.payload.hasPayload} onChange={(hasPayload) => upd((s) => ({ ...s, payload: { ...s.payload, hasPayload } }))} />
      <NumField label="Yük kütlesi" value={stage.payload.cargoKg} min={0} max={50} step={0.01} unit="kg" disabled={!stage.payload.hasPayload} onChange={(v) => upd((s) => ({ ...s, payload: { ...s.payload, cargoKg: v } }))} />
      <SelectField
        label="Aviyonik"
        value={stage.payload.avionics}
        options={[
          { value: "none", label: "Yok" },
          { value: "altimeter", label: "Altimetre" },
          { value: "barometer", label: "Barometre" },
          { value: "gps", label: "GPS" },
          { value: "flightComputer", label: "Uçuş Bilgisayarı" },
        ]}
        onChange={(avionics) => upd((s) => ({ ...s, payload: { ...s.payload, avionics: avionics as never } }))}
      />
    </Section>
  );
}

export default function DesignEditor() {
  const config = useStore((s) => s.config);
  const updateStage = useStore((s) => s.updateStage);
  const patchConfig = useStore((s) => s.patchConfig);
  const [activeStage, setActiveStage] = useState(0);

  const stageIdx = Math.min(activeStage, config.stages.length - 1);
  const stage = config.stages[stageIdx];
  const setStage = (updater: StageUpdater) => updateStage(stageIdx, updater);

  const addStage = () => {
    if (config.stages.length >= 3) return;
    const s = defaultStage();
    s.body.diameterM = Math.max(0.03, config.stages[config.stages.length - 1].body.diameterM * 1.6);
    patchConfig({ stages: [...config.stages, s] });
    setActiveStage(config.stages.length);
  };
  const removeStage = () => {
    if (config.stages.length <= 1) return;
    const stages = config.stages.slice(0, -1);
    patchConfig({ stages });
    setActiveStage(Math.max(0, stageIdx - 1));
  };

  return (
    <div className="editor">
      <div className="stage-tabs">
        {config.stages.map((_, i) => (
          <button key={i} className={i === stageIdx ? "tab active" : "tab"} onClick={() => setActiveStage(i)}>
            Kademe {i + 1}
          </button>
        ))}
        {config.stages.length < 3 && <button className="tab add" aria-label="Kademe ekle" onClick={addStage}>+</button>}
        {config.stages.length > 1 && <button className="tab del" aria-label="Son kademeyi sil" onClick={removeStage}>−</button>}
      </div>

      <div className="editor-scroll">
        <BodyEditor stage={stage} onChange={setStage} />
        <NoseEditor stage={stage} onChange={setStage} />
        <FinEditor stage={stage} onChange={setStage} />
        <MotorEditor stage={stage} onChange={setStage} />
        <RecoveryEditor stage={stage} onChange={setStage} />
        <PayloadEditor stage={stage} onChange={setStage} />
        {config.stages.length > 1 && (
          <Section title="Kademe Ayrımı">
            <SelectField
              label="Ayrım"
              value={stage.separation}
              options={[
                { value: "hot", label: "Sıcak (üst motor ayrımda yanar)" },
                { value: "cold", label: "Soğuk (0.4 s gecikme)" },
              ]}
              onChange={(separation) => setStage((s) => ({ ...s, separation: separation as never }))}
            />
          </Section>
        )}

        <Section title="Paralel Güçlendiriciler">
          <SelectField label="Adet" value={String(config.boosterCount)} options={numberOpts([0, 2, 4])} onChange={(v) => patchConfig({ boosterCount: parseInt(v, 10) as never })} />
          <SelectField
            label="Booster motor"
            value={config.boosterMotor.choice.kind === "estes" ? config.boosterMotor.choice.id : "apcp"}
            options={ESTES_MOTORS.map((m) => ({ value: m.id, label: m.id }))}
            onChange={(id) => patchConfig({ boosterMotor: { ...config.boosterMotor, choice: { kind: "estes", id, count: 1 } } })}
          />
        </Section>

        <Section title="Fırlatma Koşulları">
          <NumField label="Ray uzunluğu" value={config.railM} min={0.3} max={5} step={0.1} unit="m" onChange={(v) => patchConfig({ railM: v })} />
          <NumField label="Ray açısı" value={config.railTiltDeg} min={0} max={15} unit="°" onChange={(v) => patchConfig({ railTiltDeg: v })} />
          <NumField label="Rüzgar hızı" value={config.windMps} min={0} max={20} step={0.5} unit="m/s" onChange={(v) => patchConfig({ windMps: v })} />
          <NumField label="Rüzgar yönü" value={config.windDeg} min={0} max={360} unit="°" onChange={(v) => patchConfig({ windDeg: v })} />
        </Section>
      </div>
    </div>
  );
}
