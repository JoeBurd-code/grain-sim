// Build mode's one fixed panel on the right (issue #75). It shows the line
// settings (issue #76) or the selected machine's adjustable fields (issue
// #78), never both. One panel, always in the same place: Build mode never
// opens popups.
import { useState } from "react";
import { adjustableFields, readAdjustableValue } from "../line/adjustableFields";
import { differsFromDefault } from "../line/lineDocument";
import { catalogueItem } from "../catalogue/catalogue";
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

// A name or tag (issue #90): free text, committed the same way a number is
// (Enter or blur, Escape reverts), but with no min/max/unit line underneath
// since there is no plant unit to show.
function TextFieldRow({ label, value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const showValue = () => {
    setDraft(null);
    setError(null);
  };
  const commitDraft = () => {
    if (draft === null || draft === value) return showValue();
    const result = onCommit(draft);
    if (result.ok) showValue();
    else setError(result.error);
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, color: C.text }}>{label}</div>
      <input
        type="text"
        aria-label={label}
        value={draft ?? value}
        style={{ ...inputStyle, width: "100%", borderColor: error ? C.red : C.line, boxSizing: "border-box" }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitDraft();
          if (e.key === "Escape") showValue();
        }}
      />
      {error && <div style={{ fontSize: 9, color: C.red, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

function MachineSettings({ line, machine, onEditField, onEditText, onDeleteMachine }) {
  const fields = adjustableFields(machine);
  const item = catalogueItem(machine.item);
  return (
    <>
      <div style={headingStyle}>{machine.name}</div>
      <TextFieldRow label="name" value={machine.name} onCommit={(v) => onEditText(machine.id, "name", v)} />
      <TextFieldRow label="tag" value={machine.tag} onCommit={(v) => onEditText(machine.id, "tag", v)} />
      {item && (
        <div style={{ fontSize: 9, color: C.muted, marginTop: 10 }}>
          {item.maker || "—"} &middot; {item.model || "—"}
        </div>
      )}
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
      {/* Issue #87. The Delete key does the same. */}
      <div style={{ marginTop: 22 }}>
        <button
          className="zonebtn"
          style={{ ...btnStyle, color: C.red, borderColor: C.red }}
          onClick={() => onDeleteMachine(machine.id)}
        >
          DELETE MACHINE
        </button>
        <div style={{ fontSize: 9, color: C.muted, marginTop: 6 }}>
          Removes the machine and its connections.
        </div>
      </div>
    </>
  );
}

// Issue #89: the problems list. Each problem names the machine and the
// problem (problems.js); clicking one jumps the canvas to that machine and
// selects it, same as clicking the machine itself.
function Problems({ problems, onGoToProblem }) {
  return (
    <>
      <div style={headingStyle}>PROBLEMS</div>
      {problems.length === 0 ? (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 16 }}>This line has no problems.</div>
      ) : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          {problems.map((p) => (
            <div
              key={p.id}
              role={p.machineId ? "button" : undefined}
              onClick={p.machineId ? () => onGoToProblem(p.machineId) : undefined}
              style={{
                fontSize: 10, color: C.text, padding: "6px 8px",
                border: `1px solid ${C.line}`, borderRadius: 4,
                cursor: p.machineId ? "pointer" : "default",
              }}
            >
              {p.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Issue #88: a connection selected instead of a machine shows what it joins
// and a way to delete it, the Delete key's own panel counterpart.
function ConnectionSettings({ line, connection, onDeleteConnection }) {
  const nameOf = (id) => line.machines.find((m) => m.id === id)?.name ?? id;
  return (
    <>
      <div style={headingStyle}>CONNECTION</div>
      <div style={{ fontSize: 11, color: C.text, marginTop: 14 }}>
        {nameOf(connection.from.machine)} &rarr; {nameOf(connection.to.machine)}
      </div>
      <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
        {connection.kind === "waste" ? "Waste connection" : "Product connection"}
      </div>
      <div style={{ marginTop: 22 }}>
        <button
          className="zonebtn"
          style={{ ...btnStyle, color: C.red, borderColor: C.red }}
          onClick={onDeleteConnection}
        >
          DELETE CONNECTION
        </button>
      </div>
    </>
  );
}

export default function BuildPanel({
  line, machine, connection, settingsOpen, problemsOpen, problems, lineName,
  onStartOver, onEditField, onEditText, onDeleteMachine, onDeleteConnection, onGoToProblem,
}) {
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
        <MachineSettings key={machine.id} line={line} machine={machine} onEditField={onEditField} onEditText={onEditText} onDeleteMachine={onDeleteMachine} />
      ) : connection ? (
        <ConnectionSettings line={line} connection={connection} onDeleteConnection={onDeleteConnection} />
      ) : problemsOpen ? (
        <Problems problems={problems} onGoToProblem={onGoToProblem} />
      ) : (
        <div style={{ fontSize: 10, color: C.muted }}>Select a machine or a connection to see its settings.</div>
      )}
    </aside>
  );
}
