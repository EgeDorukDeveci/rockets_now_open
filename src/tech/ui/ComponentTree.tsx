// Bileşen ağacı — OpenRocket tarzı hiyerarşik liste, ekle/sil/seç.

import { useState } from "react";
import { useTechStore } from "../store";
import {
  TECH_COMPONENT_LABELS,
  ComponentKind,
  TechComponent,
  BodyTube,
} from "../model";

const KIND_ICONS: Record<ComponentKind, string> = {
  nosecone: "◤",
  bodytube: "▮",
  transition: "◥",
  trapezoidfin: "▲",
  ellipticalfin: "◗",
  freeformfin: "◢",
  tubefin: "▭",
  parachute: "☂",
  streamer: "▬",
  shockcord: "≈",
  mass: "●",
  launchlug: "⌾",
  railbutton: "◉",
  innertube: "▣",
  tubecoupler: "‖",
  centeringring: "◎",
  bulkhead: "━",
  engineblock: "▤",
  motormount: "⌁",
};

/** Gövde tüpü içine yerleştirilebilen bileşenler. */
const INSIDE_KINDS: ComponentKind[] = [
  "innertube", "tubecoupler", "centeringring", "bulkhead",
  "engineblock", "motormount", "parachute", "streamer", "shockcord", "mass",
];

const OUTSIDE_KINDS: ComponentKind[] = [
  "nosecone", "bodytube", "transition",
  "trapezoidfin", "ellipticalfin", "freeformfin", "tubefin",
  "launchlug", "railbutton",
];

const ALL_KINDS: ComponentKind[] = [...OUTSIDE_KINDS, ...INSIDE_KINDS];

export function AddMenu({ parentId, onDone }: { parentId: string | null; onDone?: () => void }) {
  const addComponent = useTechStore((s) => s.addComponent);
  const [open, setOpen] = useState(false);
  const kinds = parentId ? INSIDE_KINDS : ALL_KINDS;
  return (
    <div className="add-menu">
      <button className="btn small" onClick={() => setOpen((o) => !o)} title="Bileşen ekle">
        ＋ Ekle
      </button>
      {open && (
        <div className="add-menu-drop" role="menu">
          {kinds.map((k) => (
            <button
              key={k}
              role="menuitem"
              onClick={() => {
                addComponent(parentId, k);
                setOpen(false);
                onDone?.();
              }}
            >
              <span className="tree-icon">{KIND_ICONS[k]}</span>
              {TECH_COMPONENT_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ comp, depth }: { comp: TechComponent; depth: number }) {
  const selectedId = useTechStore((s) => s.selectedId);
  const selectComponent = useTechStore((s) => s.selectComponent);
  const removeComponent = useTechStore((s) => s.removeComponent);
  const [expanded, setExpanded] = useState(true);
  const isTube = comp.kind === "bodytube";
  const children = isTube ? (comp as BodyTube).children : [];

  return (
    <>
      <div
        className={`tree-row ${selectedId === comp.id ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => selectComponent(comp.id)}
      >
        {isTube && children.length > 0 ? (
          <button
            className="tree-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((x) => !x);
            }}
            aria-label={expanded ? "Daralt" : "Genişlet"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="tree-toggle tree-toggle-empty" />
        )}
        <span className="tree-icon">{KIND_ICONS[comp.kind]}</span>
        <span className="tree-name" title={`${comp.name} — ${TECH_COMPONENT_LABELS[comp.kind]}`}>
          {comp.name}
        </span>
        <span className="tree-kind">{TECH_COMPONENT_LABELS[comp.kind]}</span>
        {isTube && (
          <AddMenu
            parentId={comp.id}
            onDone={() => {
              useTechStore.getState().selectComponent(comp.id);
            }}
          />
        )}
        <button
          className="tree-del"
          title="Bileşeni sil"
          onClick={(e) => {
            e.stopPropagation();
            removeComponent(comp.id);
          }}
        >
          ✕
        </button>
      </div>
      {isTube && expanded && children.map((c) => <Row key={c.id} comp={c} depth={depth + 1} />)}
    </>
  );
}

function componentCount(cs: TechComponent[]): number {
  return cs.reduce((n, c) => n + 1 + (c.kind === "bodytube" ? componentCount((c as BodyTube).children) : 0), 0);
}

export default function ComponentTree() {
  const rocket = useTechStore((s) => s.rocket);
  const stages = rocket.stages;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Bileşenler</span>
        <span className="panel-head-meta">
          {componentCount(stages.flatMap((st) => st.components))} parça · {stages.length} kademe
        </span>
        <AddMenu parentId={null} />
      </div>
      <div className="tree">
        {stages.map((st, i) => (
          <div key={st.id} className="tree-stage">
            <div className="tree-stage-label">
              <span className="tree-icon">⛨</span>
              <span className="tree-stage-name">{st.name || `Kademe ${i + 1}`}</span>
              <span className="tree-stage-badge">{componentCount(st.components)}</span>
            </div>
            {st.components.map((c) => (
              <Row key={c.id} comp={c} depth={1} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
