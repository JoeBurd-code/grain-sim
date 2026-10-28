// Build mode's one fixed panel on the right (issue #75). It shows the line
// settings (issue #76) or the selected machine's adjustable fields (issue
// #78), never both. One panel, always in the same place: Build mode never
// opens popups.
import { useState } from "react";
import { adjustableFields, readAdjustableValue, fieldLock } from "../line/adjustableFields";
import { differsFromDefault } from "../line/lineDocument";
import { catalogueItem, makerLabel } from "../catalogue/catalogue";
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

function withUnit(value, unit) {
  return unit ? `${formatValue(value)} ${unit}` : formatValue(value);
}

// Issue #152: a whole-number field (a port count) also steps by one.
function Stepper({ label, disabled, onClick, children }) {
  return (
    <button
      className="zonebtn"
      aria-label={label}
      disabled={disabled}
      style={{ ...btnStyle, padding: "2px 8px", fontSize: 12, opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// An empty box is not 0: it is refused like any other entry that is not a number.
function parseNumber(text) {
  return text.trim() === "" ? NaN : Number(text);
}

// One field. A number is typed and committed on Enter or on leaving the box;
// Escape puts the box back. A refused value stays in the box with the
// message under it, and the line is left as it was. A field with a slider
// commits once the drag lets go. A `lock` (fieldLock) greys the field out
// and says why in place of its limits.
function FieldRow({ field, value, changed, lock, onEdit }) {
  const [dragging, setDragging] = useState(null);
  // The pointer is captured on press, so letting go off the slider still
  // ends the drag here.
  const endDrag = () => {
    if (dragging !== null && dragging !== value) commit(dragging);
    setDragging(null);
  };
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, opacity: lock ? 0.4 : 1 }}>
          {field.slider && (
            <input
              type="range"
              className="param-slider"
              aria-label={`${field.label} slider`}
              min={field.min}
              max={field.max}
              step={field.integer ? 1 : "any"}
              value={dragging ?? value}
              disabled={Boolean(lock)}
              style={{ flex: 1, minWidth: 60, "--slider-color": C.wheat, "--fill-stop": `${(((dragging ?? value) - field.min) / (field.max - field.min)) * 100}%` }}
              onChange={(e) => setDragging(Number(e.target.value))}
              onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerUp={endDrag}
              onKeyUp={endDrag}
              onBlur={endDrag}
            />
          )}
          {field.integer && (
            <Stepper label={`fewer ${field.label}`} disabled={Boolean(lock) || value <= field.min} onClick={() => commit(value - 1)}>
              &minus;
            </Stepper>
          )}
          <input
            type="text"
            inputMode="decimal"
            aria-label={field.label}
            value={dragging !== null ? formatValue(dragging) : draft ?? formatValue(value)}
            disabled={Boolean(lock)}
            style={{ ...inputStyle, borderColor: error ? C.red : C.line }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
              if (e.key === "Escape") showValue();
            }}
          />
          {field.integer && (
            <Stepper label={`more ${field.label}`} disabled={Boolean(lock) || value >= field.max} onClick={() => commit(value + 1)}>
              +
            </Stepper>
          )}
          <span style={{ fontSize: 10, color: C.muted }}>{field.unit}</span>
        </div>
      )}
      <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
        {lock ?? (field.kind === "number"
          ? `${withUnit(field.min, field.unit)} to ${withUnit(field.max, field.unit)} · default ${withUnit(field.default, field.unit)}`
          : `default ${optionLabel(field.default)}`)}
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

// Flipping and deleting the machine are buttons over it on the canvas
// (Scene.jsx); the Delete key deletes too.
// Issue #158: puts a dragged name label back where the line or the
// catalogue first put it. Greyed out while it is already there.
function ResetLabel({ machine, atDefault, onResetLabel }) {
  return (
    <div style={{ marginTop: 22 }}>
      <button
        className="zonebtn"
        style={{ ...btnStyle, opacity: atDefault ? 0.4 : 1, cursor: atDefault ? "default" : "pointer" }}
        disabled={atDefault}
        onClick={() => onResetLabel(machine.id)}
      >
        RESET LABEL
      </button>
      <div style={{ fontSize: 9, color: C.muted, marginTop: 6 }}>
        Drag the name label on the canvas to move it.
      </div>
    </div>
  );
}

function MachineSettings({ line, machine, labelAtDefault, onEditField, onEditText, onResetLabel }) {
  const fields = adjustableFields(machine);
  const item = catalogueItem(machine.item);
  return (
    <>
      <div style={headingStyle}>{machine.name}</div>
      <TextFieldRow label="name" value={machine.name} onCommit={(v) => onEditText(machine.id, "name", v)} />
      <TextFieldRow label="tag" value={machine.tag} onCommit={(v) => onEditText(machine.id, "tag", v)} />
      {item && makerLabel(item) && (
        <div style={{ fontSize: 9, color: C.muted, marginTop: 10 }}>{makerLabel(item)}</div>
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
            lock={fieldLock(line, machine.id, f.id)}
            onEdit={(fieldId, value) => onEditField(machine.id, fieldId, value)}
          />
        ))
      )}
      <ResetLabel machine={machine} atDefault={labelAtDefault} onResetLabel={onResetLabel} />
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

// Issue #95: several machines selected. Their values stay on each
// machine's own panel; the group is moved, copied and deleted together.
function GroupSettings({ group, onDeleteGroup }) {
  return (
    <>
      <div style={headingStyle}>{group.length} MACHINES</div>
      <div style={{ marginTop: 14 }}>
        {group.map((m) => (
          <div key={m.id} style={{ fontSize: 10, color: C.text, marginBottom: 3 }}>{m.name}</div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: C.muted, marginTop: 12, lineHeight: 1.6 }}>
        Drag any one of them to move them all. Ctrl+C copies them with the
        connections and interlocks between them; Ctrl+V pastes the copy.
      </div>
      <div style={{ marginTop: 22 }}>
        <button
          className="zonebtn"
          style={{ ...btnStyle, color: C.red, borderColor: C.red }}
          onClick={onDeleteGroup}
        >
          DELETE {group.length} MACHINES
        </button>
        <div style={{ fontSize: 9, color: C.muted, marginTop: 6 }}>
          Removes the machines and their connections.
        </div>
      </div>
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
  line, machine, group, connection, settingsOpen, problemsOpen, problems, lineName,
  labelAtDefault, onStartOver, onEditField, onEditText, onResetLabel, onDeleteGroup, onDeleteConnection, onGoToProblem,
}) {
  // Nothing selected and neither SETTINGS nor PROBLEMS open: the panel
  // takes no width at all, so the canvas gets the room back. Opening it
  // slides it in from the right edge rather than popping into place; the
  // inner content keeps its full width throughout so it never squashes
  // mid-transition.
  const open = Boolean(settingsOpen || machine || group || connection || problemsOpen);
  // Floats over the canvas rather than squeezing it: resizing the canvas's
  // own container on open/close used to re-fit the viewport and make the
  // whole scene visibly jump/zoom. Overlaid, it may cover machines
  // underneath -- left to the user to pan around.
  return (
    <aside style={{
      position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 5,
      width: open ? BUILD_PANEL_WIDTH : 0, flex: "none",
      borderLeft: open ? `1px solid ${C.line}` : "none",
      background: C.panel, overflow: "hidden",
      transition: "width 0.18s ease",
    }}>
      <div style={{ width: BUILD_PANEL_WIDTH, height: "100%", boxSizing: "border-box", padding: "14px 16px", overflowY: "auto", fontFamily: FONT_MONO }}>
        {settingsOpen ? (
          <LineSettings lineName={lineName} onStartOver={onStartOver} />
        ) : machine ? (
          // Keyed by machine, so a half-typed value or a refusal never
          // carries over to the next machine selected.
          <MachineSettings key={machine.id} line={line} machine={machine} labelAtDefault={labelAtDefault} onEditField={onEditField} onEditText={onEditText} onResetLabel={onResetLabel} />
        ) : group ? (
          <GroupSettings group={group} onDeleteGroup={onDeleteGroup} />
        ) : connection ? (
          <ConnectionSettings line={line} connection={connection} onDeleteConnection={onDeleteConnection} />
        ) : problemsOpen ? (
          <Problems problems={problems} onGoToProblem={onGoToProblem} />
        ) : null}
      </div>
    </aside>
  );
}
