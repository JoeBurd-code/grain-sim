// Build mode's one fixed panel on the right (issue #75). It shows the line
// settings (issue #76) or the selected machine's adjustable fields (issue
// #78), never both. One panel, always in the same place: Build mode never
// opens popups.
import { useState } from "react";
import { adjustableFields, readAdjustableValue } from "../line/adjustableFields";
import { differsFromDefault } from "../line/lineDocument";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

const BUILD_PANEL_WIDTH = 280;

const btnStyle = {
  background: "transparent", color: C.wheat, border: `1px solid ${C.line}`,
  borderRadius: 4, padding: "4px 10px", fontFamily: FONT_MONO, fontSize: 10,
  letterSpacing: "0.08em", cursor: "pointer",
};

const headingStyle = { fontFamily: FONT_DISP, fontSize: 16, color: C.wheat, letterSpacing: "0.04em" };

const inputStyle = {
  width: 72, background: C.bg, color: C.text, border: `1px solid ${C.line}`,
  borderRadius: 4, padding: "3px 6px", fontFamily: FONT_MONO, fontSize: 11,
};

// START OVER asks before it discards: the first click only arms it. The
// confirmation is part of the panel, not a browser dialog.
function LineSettings({ lineName, onStartOver }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <div style={headingStyle}>LINE SETTINGS</div>
      <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{lineName}</div>
      <div style={{ marginTop: 18 }}>
        {confirming ? (
          <>
            <div style={{ fontSize: 10, color: C.text, marginBottom: 8 }}>
              Discard this line and load the golden line again?
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="zonebtn"
                style={{ ...btnStyle, color: C.red, borderColor: C.red }}
                onClick={() => {
                  setConfirming(false);
                  onStartOver();
                }}
              >
                DISCARD AND START OVER
              </button>
              <button className="zonebtn" style={{ ...btnStyle, color: C.muted }} onClick={() => setConfirming(false)}>
                CANCEL
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="zonebtn" style={btnStyle} onClick={() => setConfirming(true)}>
              START OVER
            </button>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 6 }}>
              Load the golden line again.
            </div>
          </>
        )}
      </div>
    </>
  );
}

function formatValue(value) {
  return typeof value === "number" ? String(Number(value.toPrecision(6))) : String(value);
}

function optionLabel(option) {
  if (option === true) return "ON";
  if (option === false) return "OFF";
  return String(option).toUpperCase();
}

// An empty box is not 0: it is refused like any other entry that is not a number.
function parseNumber(text) {
  return text.trim() === "" ? NaN : Number(text);
}

// One field. A number is typed and committed on Enter or on leaving the box;
// Escape puts the box back. A refused value stays in the box with the
// message under it, and the line is left as it was.
function FieldRow({ field, value, changed, onEdit }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const showValue = () => {
    setDraft(null);
    setError(null);
  };

  const commit = (next) => {
    const result = onEdit(field.id, next);
    if (result.ok) showValue();
    else setError(result.error);
  };
  const commitDraft = () => {
    if (draft === null) return;
    if (draft === formatValue(value)) showValue();
    else commit(parseNumber(draft));
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 10 }}>
        <span style={{ color: changed ? C.wheat : C.text }}>{field.label}</span>
        {changed && <span style={{ fontSize: 8, color: C.wheat, letterSpacing: "0.08em" }}>CHANGED</span>}
      </div>
      {field.kind === "option" ? (
        <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
          {field.options.map((o) => (
            <button
              key={String(o)}
              className="zonebtn"
              aria-pressed={value === o}
              style={value === o
                ? { ...btnStyle, background: C.wheat, color: "#1a1a14", borderColor: C.wheat, cursor: "default" }
                : { ...btnStyle, color: C.muted }}
              onClick={() => value !== o && commit(o)}
            >
              {optionLabel(o)}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <input
            type="text"
            inputMode="decimal"
            aria-label={field.label}
            value={draft ?? formatValue(value)}
            style={{ ...inputStyle, borderColor: error ? C.red : C.line }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
              if (e.key === "Escape") showValue();
            }}
          />
          <span style={{ fontSize: 10, color: C.muted }}>{field.unit}</span>
        </div>
      )}
      <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
        {field.kind === "number"
          ? `${formatValue(field.min)} to ${formatValue(field.max)} ${field.unit} · default ${formatValue(field.default)} ${field.unit}`
          : `default ${optionLabel(field.default)}`}
      </div>
      {error && <div style={{ fontSize: 9, color: C.red, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

function MachineSettings({ line, machine, onEditField }) {
  const fields = adjustableFields(machine);
  return (
    <>
      <div style={headingStyle}>{machine.name}</div>
      <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{machine.tag}</div>
      {fields.length === 0 ? (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 16 }}>This machine has no adjustable settings.</div>
      ) : (
        fields.map((f) => (
          <FieldRow
            key={f.id}
            field={f}
            value={readAdjustableValue(line, machine.id, f.id)}
            changed={differsFromDefault(line, machine.id, f.id)}
            onEdit={(fieldId, value) => onEditField(machine.id, fieldId, value)}
          />
        ))
      )}
    </>
  );
}

export default function BuildPanel({ line, machine, settingsOpen, lineName, onStartOver, onEditField }) {
  return (
    <aside style={{
      width: BUILD_PANEL_WIDTH, flex: "none", borderLeft: `1px solid ${C.line}`,
      background: C.panel, padding: "14px 16px", overflowY: "auto",
      fontFamily: FONT_MONO,
    }}>
      {settingsOpen ? (
        <LineSettings lineName={lineName} onStartOver={onStartOver} />
      ) : machine ? (
        // Keyed by machine, so a half-typed value or a refusal never carries
        // over to the next machine selected.
        <MachineSettings key={machine.id} line={line} machine={machine} onEditField={onEditField} />
      ) : (
        <div style={{ fontSize: 10, color: C.muted }}>Select a machine to see its settings.</div>
      )}
    </aside>
  );
}
