// Seçili bileşen için alan formları — türlere göre öznitelikler.

import { useTechStore } from "../store";
import {
  TECH_COMPONENT_LABELS,
  NOSE_SHAPES,
  FINISHES,
  FIN_CROSS_SECTIONS,
  TechComponent,
  BodyTube,
} from "../model";
import { TECH_MATERIAL_LIST } from "../materials";
import { ESTES_MOTORS } from "../../physics/motors/catalog";

const MOTOR_OPTIONS = [
  { id: "", name: "— (boş) —" },
  ...ESTES_MOTORS.map((m) => ({ id: m.id, name: `${m.id} (${(m.mass * 1000) | 0} g)` })),
];

function flatten(cs: TechComponent[]): TechComponent[] {
  const out: TechComponent[] = [];
  for (const c of cs) {
    out.push(c);
    if (c.kind === "bodytube") out.push(...flatten((c as BodyTube).children));
  }
  return out;
}

function NumField({ label, value, onChange, unit, step = 0.001, min }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
}) {
  return (
    <label className="cf">
      <span>{label}</span>
      <input
        type="number"
        value={value >= 0 && value < 1 ? value.toPrecision(3) : value.toFixed(3)}
        step={step}
        min={min}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {unit && <em>{unit}</em>}
    </label>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ id: string; name: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="cf">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}

function CheckField({ label, value, onChange }: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="cf cf-check">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Ortak alanlar: ad, malzeme, yüzey, eksenel ofset, kütle override. */
function CommonFields({ comp, patch }: { comp: TechComponent; patch: (p: Record<string, unknown>) => void }) {
  const showOffset = comp.kind !== "nosecone";
  return (
    <>
      <label className="cf">
        <span>Ad</span>
        <input type="text" value={comp.name} onChange={(e) => patch({ name: e.target.value })} />
      </label>
      <SelectField
        label="Malzeme"
        value={comp.materialId}
        options={TECH_MATERIAL_LIST.map((m) => ({ id: m.id, name: m.name }))}
        onChange={(v) => patch({ materialId: v })}
      />
      <SelectField label="Yüzey" value={comp.finish} options={FINISHES} onChange={(v) => patch({ finish: v })} />
      {showOffset && (
        <NumField label="Eksenel ofset" value={comp.axialOffsetM} onChange={(v) => patch({ axialOffsetM: v })} unit="m" />
      )}
      {comp.kind === "mass" && (
        <NumField label="Kütle" value={(comp as Extract<TechComponent, { kind: "mass" }>).massKg} onChange={(v) => patch({ massKg: v })} unit="kg" />
      )}
      {comp.massOverrideKg !== undefined && (
        <NumField label="Kütle override" value={comp.massOverrideKg} onChange={(v) => patch({ massOverrideKg: v })} unit="kg" />
      )}
    </>
  );
}

function FinFields({ c, patch }: {
  c: Extract<TechComponent, { kind: "trapezoidfin" } | { kind: "ellipticalfin" }>;
  patch: (p: Record<string, unknown>) => void;
}) {
  return (
    <>
      <NumField label="Adet" value={c.finCount} onChange={(v) => patch({ finCount: Math.max(1, Math.round(v)) })} step={1} />
      <NumField label="Dönüş" value={c.rotationDeg} onChange={(v) => patch({ rotationDeg: v })} unit="°" />
      <NumField label="Kök kiriş" value={c.rootChordM} onChange={(v) => patch({ rootChordM: v })} unit="m" />
      <NumField label="Yükseklik" value={c.heightM} onChange={(v) => patch({ heightM: v })} unit="m" />
      <NumField label="Kalınlık" value={c.thicknessM} onChange={(v) => patch({ thicknessM: v })} unit="m" />
      <SelectField
        label="Kesit"
        value={c.crossSection}
        options={FIN_CROSS_SECTIONS}
        onChange={(v) => patch({ crossSection: v })}
      />
      <NumField label="Yalpa (cant)" value={c.cantDeg} onChange={(v) => patch({ cantDeg: v })} unit="°" />
    </>
  );
}

function EditorBody({ comp }: { comp: TechComponent }) {
  const updateComponent = useTechStore((s) => s.updateComponent);
  const patch = (p: Record<string, unknown>) => updateComponent(comp.id, p);

  switch (comp.kind) {
    case "nosecone": {
      const c = comp as Extract<TechComponent, { kind: "nosecone" }>;
      return (
        <>
          <SelectField label="Profil" value={c.shape} options={NOSE_SHAPES} onChange={(v) => patch({ shape: v })} />
          <NumField label="Profil parametresi" value={c.shapeParameter} onChange={(v) => patch({ shapeParameter: v })} />
          <NumField label="Uzunluk" value={c.lengthM} onChange={(v) => patch({ lengthM: v })} unit="m" />
          <NumField label="Arka çap" value={c.aftDiameterM} onChange={(v) => patch({ aftDiameterM: v })} unit="m" />
          <NumField label="Cidar" value={c.wallThicknessM} onChange={(v) => patch({ wallThicknessM: v })} unit="m" />
          <CheckField label="Dolu (masif)" value={c.filled} onChange={(v) => patch({ filled: v })} />
          <NumField label="Omuz çapı" value={c.shoulderDiameterM} onChange={(v) => patch({ shoulderDiameterM: v })} unit="m" />
          <NumField label="Omuz uzunluğu" value={c.shoulderLengthM} onChange={(v) => patch({ shoulderLengthM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "bodytube": {
      const c = comp as BodyTube;
      return (
        <>
          <NumField label="Uzunluk" value={c.lengthM} onChange={(v) => patch({ lengthM: v })} unit="m" />
          <NumField label="Dış çap" value={c.outerDiameterM} onChange={(v) => patch({ outerDiameterM: v })} unit="m" />
          <NumField label="Cidar" value={c.wallThicknessM} onChange={(v) => patch({ wallThicknessM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "transition": {
      const c = comp as Extract<TechComponent, { kind: "transition" }>;
      return (
        <>
          <SelectField label="Profil" value={c.shape} options={NOSE_SHAPES} onChange={(v) => patch({ shape: v })} />
          <NumField label="Uzunluk" value={c.lengthM} onChange={(v) => patch({ lengthM: v })} unit="m" />
          <NumField label="Ön çap" value={c.foreDiameterM} onChange={(v) => patch({ foreDiameterM: v })} unit="m" />
          <NumField label="Arka çap" value={c.aftDiameterM} onChange={(v) => patch({ aftDiameterM: v })} unit="m" />
          <NumField label="Cidar" value={c.wallThicknessM} onChange={(v) => patch({ wallThicknessM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "trapezoidfin": {
      const c = comp as Extract<TechComponent, { kind: "trapezoidfin" }>;
      return (
        <>
          <FinFields c={c} patch={patch} />
          <NumField label="Uç kiriş" value={c.tipChordM} onChange={(v) => patch({ tipChordM: v })} unit="m" />
          <NumField label="Süpürme" value={c.sweepLengthM} onChange={(v) => patch({ sweepLengthM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "ellipticalfin": {
      const c = comp as Extract<TechComponent, { kind: "ellipticalfin" }>;
      return (
        <>
          <FinFields c={c} patch={patch} />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "freeformfin": {
      const c = comp as Extract<TechComponent, { kind: "freeformfin" }>;
      return (
        <>
          <NumField label="Adet" value={c.finCount} onChange={(v) => patch({ finCount: Math.max(1, Math.round(v)) })} step={1} />
          <NumField label="Dönüş" value={c.rotationDeg} onChange={(v) => patch({ rotationDeg: v })} unit="°" />
          <NumField label="Kalınlık" value={c.thicknessM} onChange={(v) => patch({ thicknessM: v })} unit="m" />
          <div className="cf cf-label">Noktalar (x·y, m)</div>
          {c.points.map((p, i) => (
            <div className="cf cf-pair" key={i}>
              <input
                type="number"
                value={p.x.toFixed(3)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) {
                    patch({ points: c.points.map((q, j) => (j === i ? { ...q, x: v } : q)) });
                  }
                }}
              />
              <input
                type="number"
                value={p.y.toFixed(3)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) {
                    patch({ points: c.points.map((q, j) => (j === i ? { ...q, y: v } : q)) });
                  }
                }}
              />
              <button className="cf-del" onClick={() => patch({ points: c.points.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="btn small" onClick={() => patch({ points: [...c.points, { x: 0.02 * (c.points.length + 1), y: 0.04 }] })}>
            Nokta ekle
          </button>
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "tubefin": {
      const c = comp as Extract<TechComponent, { kind: "tubefin" }>;
      return (
        <>
          <NumField label="Adet" value={c.finCount} onChange={(v) => patch({ finCount: Math.max(1, Math.round(v)) })} step={1} />
          <NumField label="Dönüş" value={c.rotationDeg} onChange={(v) => patch({ rotationDeg: v })} unit="°" />
          <NumField label="Uzunluk" value={c.lengthM} onChange={(v) => patch({ lengthM: v })} unit="m" />
          <NumField label="Dış çap" value={c.outerDiameterM} onChange={(v) => patch({ outerDiameterM: v })} unit="m" />
          <NumField label="Cidar" value={c.wallThicknessM} onChange={(v) => patch({ wallThicknessM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "parachute": {
      const c = comp as Extract<TechComponent, { kind: "parachute" }>;
      return (
        <>
          <NumField label="Çap" value={c.diameterM} onChange={(v) => patch({ diameterM: v })} unit="m" />
          <SelectField
            label="Açılma"
            value={c.deployEvent}
            options={[
              { id: "ejection", name: "Ejeksiyon (itki sonu)" },
              { id: "apogee", name: "Apoge" },
              { id: "altitude", name: "İrtifada" },
            ]}
            onChange={(v) => patch({ deployEvent: v })}
          />
          {c.deployEvent === "altitude" && (
            <NumField label="Açılma irtifası" value={c.deployAltitudeM} onChange={(v) => patch({ deployAltitudeM: v })} unit="m" />
          )}
          <NumField label="Gecikme" value={c.deployDelayS} onChange={(v) => patch({ deployDelayS: v })} unit="s" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "streamer": {
      const c = comp as Extract<TechComponent, { kind: "streamer" }>;
      return (
        <>
          <NumField label="Uzunluk" value={c.stripLengthM} onChange={(v) => patch({ stripLengthM: v })} unit="m" />
          <NumField label="Genişlik" value={c.stripWidthM} onChange={(v) => patch({ stripWidthM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "shockcord": {
      const c = comp as Extract<TechComponent, { kind: "shockcord" }>;
      return (
        <>
          <NumField label="İp uzunluğu" value={c.cordLengthM} onChange={(v) => patch({ cordLengthM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "mass": {
      const c = comp as Extract<TechComponent, { kind: "mass" }>;
      return (
        <>
          <NumField label="Kütle" value={c.massKg} onChange={(v) => patch({ massKg: v })} unit="kg" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "launchlug": {
      const c = comp as Extract<TechComponent, { kind: "launchlug" }>;
      return (
        <>
          <NumField label="Dış çap" value={c.outerDiameterM} onChange={(v) => patch({ outerDiameterM: v })} unit="m" />
          <NumField label="Uzunluk" value={c.lengthM} onChange={(v) => patch({ lengthM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "railbutton": {
      const c = comp as Extract<TechComponent, { kind: "railbutton" }>;
      return (
        <>
          <NumField label="Dış çap" value={c.outerDiameterM} onChange={(v) => patch({ outerDiameterM: v })} unit="m" />
          <NumField label="Yükseklik" value={c.heightM} onChange={(v) => patch({ heightM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "innertube":
    case "tubecoupler": {
      const c = comp as Extract<TechComponent, { kind: "innertube" } | { kind: "tubecoupler" }>;
      return (
        <>
          <NumField label="Uzunluk" value={c.lengthM} onChange={(v) => patch({ lengthM: v })} unit="m" />
          <NumField label="Dış çap" value={c.outerDiameterM} onChange={(v) => patch({ outerDiameterM: v })} unit="m" />
          <NumField label="Cidar" value={c.wallThicknessM} onChange={(v) => patch({ wallThicknessM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "centeringring":
    case "bulkhead":
    case "engineblock": {
      const c = comp as Extract<TechComponent, { kind: "centeringring" | "bulkhead" | "engineblock" }>;
      return (
        <>
          <NumField label="Uzunluk" value={c.lengthM} onChange={(v) => patch({ lengthM: v })} unit="m" />
          <NumField label="Dış çap" value={c.outerDiameterM} onChange={(v) => patch({ outerDiameterM: v })} unit="m" />
          {comp.kind === "centeringring" && (
            <NumField
              label="İç çap"
              value={(comp as Extract<TechComponent, { kind: "centeringring" }>).innerDiameterM}
              onChange={(v) => patch({ innerDiameterM: v })}
              unit="m"
            />
          )}
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    case "motormount": {
      const c = comp as Extract<TechComponent, { kind: "motormount" }>;
      return (
        <>
          <SelectField label="Motor" value={c.motorId ?? ""} options={MOTOR_OPTIONS} onChange={(v) => patch({ motorId: v || null })} />
          <NumField label="Çıkıntı" value={c.overhangM} onChange={(v) => patch({ overhangM: v })} unit="m" />
          <CommonFields comp={comp} patch={patch} />
        </>
      );
    }
    default:
      return <CommonFields comp={comp} patch={patch} />;
  }
}

export default function ComponentEditor() {
  const comp = useTechStore((s) =>
    s.selectedId
      ? s.rocket.stages.flatMap((st) => flatten(st.components)).find((c) => c.id === s.selectedId) ?? null
      : null
  );
  if (!comp) {
    return (
      <div className="panel">
        <div className="panel-head"><span>Bileşen</span></div>
        <div className="panel-empty">Soldan bir bileşen seçin — öznitelikleri burada düzenlenir.</div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <span>{TECH_COMPONENT_LABELS[comp.kind]}: {comp.name}</span>
      </div>
      <div className="cf-form">
        <EditorBody comp={comp} />
      </div>
    </div>
  );
}
