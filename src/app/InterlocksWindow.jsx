// Issue #92: every interlock on the line as a fill-in-the-blanks sentence,
// Build mode only. Opens as a floating panel over the canvas (the catalogue
// panel's pattern), wide enough to hold a sentence's blanks and its stacked
// step blocks.
import { useState } from "react";
import {
  addInterlock, removeInterlock, setSentenceField, addWhenClears, removeWhenClears,
  setSentenceReset, addStep, removeStep, moveStep, setStepField, setStepAction,
} from "../line/sentenceEditor";
import { machineOptions, conditionOptions, machineActionOptions, stepTypeOptions, CONDITIONS, ACTIONS } from "../line/sentenceOptions";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

const WINDOW_WIDTH = 460;

const pillStyle = {
  background: "transparent", color: C.muted, border: `1px solid ${C.line}`,
  borderRadius: 4, padding: "3px 8px", fontFamily: FONT_MONO, fontSize: 10,
  letterSpacing: "0.04em", cursor: "pointer",
};
const pillActiveStyle = { ...pillStyle, background: C.wheat, color: "#1a1a14", borderColor: C.wheat };
const selectStyle = {
  background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: 4,
  padding: "3px 6px", fontFamily: FONT_MONO, fontSize: 10,
};
const numberStyle = { ...selectStyle, width: 56 };

function Pills({ options, value, labelOf, onPick }) {
  return (
    <div style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={String(o)}
          className="zonebtn"
          style={value === o ? pillActiveStyle : pillStyle}
          onClick={() => value !== o && onPick(o)}
        >
          {labelOf ? labelOf(o) : String(o).toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function MachineSelect({ line, value, onChange }) {
  return (
    <select aria-label="machine" style={selectStyle} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>pick a machine</option>
      {machineOptions(line).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

// "When [machine] is [above] [85 %] for [5 s]" (and the clear part's own
// copy, with no leading "when"). `onHover` fires with the part's machine id
// (or null) so the canvas can highlight it.
function ConditionPart({ line, part, machine, onMachine, onField, onHover }) {
  const condition = CONDITIONS[part.condition];
  const level = condition?.level;
  return (
    <span
      onMouseEnter={() => machine && onHover(machine)}
      onMouseLeave={() => onHover(null)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
    >
      <MachineSelect line={line} value={machine} onChange={onMachine} />
      <span style={{ color: C.muted, fontSize: 10 }}>is</span>
      <Pills options={conditionOptions(line, machine)} value={part.condition} onPick={(v) => onField("condition", v)} />
      {level && (
        <>
          <input
            type="number" min={0} max={100} aria-label="set point"
            value={Math.round((part.setpoint ?? 0) * 100)}
            style={numberStyle}
            onChange={(e) => onField("setpoint", Number(e.target.value) / 100)}
          />
          <span style={{ color: C.muted, fontSize: 10 }}>%</span>
        </>
      )}
      <span style={{ color: C.muted, fontSize: 10 }}>for</span>
      <input
        type="number" min={0} aria-label="signal delay"
        value={part.delaySec ?? 0}
        style={numberStyle}
        onChange={(e) => onField("delaySec", Number(e.target.value))}
      />
      <span style={{ color: C.muted, fontSize: 10 }}>s</span>
    </span>
  );
}

// One "then [action] [machine]" / "wait [n] s" / "if still true" / "trip the
// whole line" step. `onHover` fires with the step's machine, if it has one.
function StepBlock({ line, step, index, part, after, onAction, onField, onRemove, onHover, dragHandlers }) {
  const flow = step.action === "wait" || step.action === "ifStillTrue" || step.action === "tripLine";
  return (
    <div
      draggable
      {...dragHandlers}
      onMouseEnter={() => step.machine && onHover(step.machine)}
      onMouseLeave={() => onHover(null)}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", marginTop: 4,
        border: `1px solid ${C.line}`, borderRadius: 4, background: C.panel2, cursor: "grab",
      }}
    >
      <span style={{ color: C.muted, fontSize: 9 }}>{index + 1}</span>
      <Pills
        options={stepTypeOptions(line, after)}
        value={step.action}
        labelOf={(a) => (ACTIONS[a] ? a.toUpperCase() : a === "ifStillTrue" ? "IF STILL TRUE" : a === "tripLine" ? "TRIP LINE" : a.toUpperCase())}
        onPick={(a) => onAction(part, index, a)}
      />
      {step.action === "wait" && (
        <>
          <input
            type="number" min={0} aria-label="wait seconds" value={step.seconds ?? 0} style={numberStyle}
            onChange={(e) => onField(part, index, "seconds", Number(e.target.value))}
          />
          <span style={{ color: C.muted, fontSize: 10 }}>s</span>
        </>
      )}
      {!flow && (
        <MachineSelect line={line} value={step.machine} onChange={(v) => onField(part, index, "machine", v)} />
      )}
      {!flow && machineActionOptions(line, step.machine).length > 0 && (
        <Pills
          options={machineActionOptions(line, step.machine)}
          value={step.action}
          onPick={(a) => onAction(part, index, a)}
        />
      )}
      <button
        className="zonebtn"
        aria-label="remove step"
        style={{ ...pillStyle, marginLeft: "auto", color: C.red, borderColor: C.red, padding: "2px 6px" }}
        onClick={() => onRemove(part, index)}
      >
        ×
      </button>
    </div>
  );
}

// A stack of step blocks, run top to bottom (issue #92): add, remove, and
// drag to reorder. `after` is "then" or "when it clears", so a step's own
// stepTypeOptions only offers "if still true"/"trip the whole line" after
// "then".
function StepStack({ line, steps, part, after, onAction, onField, onAdd, onRemove, onMove, onHover }) {
  const [dragIndex, setDragIndex] = useState(null);
  return (
    <div style={{ marginTop: 6 }}>
      {steps.map((step, i) => (
        <StepBlock
          key={i}
          line={line}
          step={step}
          index={i}
          part={part}
          after={after}
          onAction={onAction}
          onField={onField}
          onRemove={onRemove}
          onHover={onHover}
          dragHandlers={{
            onDragStart: () => setDragIndex(i),
            onDragOver: (e) => e.preventDefault(),
            onDrop: (e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) onMove(part, dragIndex, i);
              setDragIndex(null);
            },
          }}
        />
      ))}
      <button
        className="zonebtn"
        style={{ ...pillStyle, marginTop: 4 }}
        onClick={() => onAdd(part, stepTypeOptions(line, after)[0] ?? "wait")}
      >
        + ADD STEP
      </button>
    </div>
  );
}

const headingStyle = { fontFamily: FONT_DISP, fontSize: 14, color: C.wheat, letterSpacing: "0.04em" };

function SentenceCard({ line, rule, actions, onHover }) {
  const onField = (part, field, value) => actions.setField(rule.id, part, field, value);
  const onStepAction = (part, index, action) => actions.setStepAction(rule.id, part, index, action);
  const onStepField = (part, index, field, value) => actions.setStepField(rule.id, part, index, field, value);
  const onAddStep = (part, action) => actions.addStep(rule.id, part, action);
  const onRemoveStep = (part, index) => actions.removeStep(rule.id, part, index);
  const onMoveStep = (part, from, to) => actions.moveStep(rule.id, part, from, to);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>WHEN</span>
        <ConditionPart
          line={line}
          part={rule.when}
          machine={rule.when.machine}
          onMachine={(v) => onField("when", "machine", v)}
          onField={(field, v) => onField("when", field, v)}
          onHover={onHover}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>THEN</span>
        <StepStack
          line={line} steps={rule.then} part="then" after="then"
          onAction={onStepAction} onField={onStepField} onAdd={onAddStep} onRemove={onRemoveStep} onMove={onMoveStep}
          onHover={onHover}
        />
      </div>

      {rule.whenClears ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ color: C.muted, fontSize: 10 }}>WHEN IT CLEARS</span>
            {rule.whenClears.condition !== undefined ? (
              <ConditionPart
                line={line}
                part={rule.whenClears}
                machine={rule.when.machine}
                onMachine={() => {}}
                onField={(field, v) => onField("whenClears", field, v)}
                onHover={onHover}
              />
            ) : (
              <span style={{ color: C.muted, fontSize: 9 }}>runs the moment the "when" condition stops holding</span>
            )}
            <button className="zonebtn" style={{ ...pillStyle, color: C.red, borderColor: C.red }} onClick={() => actions.removeWhenClears(rule.id)}>
              REMOVE
            </button>
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: C.muted, fontSize: 10 }}>THEN</span>
            <StepStack
              line={line} steps={rule.whenClears.then} part="whenClearsThen" after="whenClearsThen"
              onAction={onStepAction} onField={onStepField} onAdd={onAddStep} onRemove={onRemoveStep} onMove={onMoveStep}
              onHover={onHover}
            />
          </div>
        </div>
      ) : (
        <button className="zonebtn" style={{ ...pillStyle, marginTop: 10 }} onClick={() => actions.addWhenClears(rule.id)}>
          + ADD "WHEN IT CLEARS"
        </button>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>RESET</span>
        <Pills options={["auto", "latched"]} value={rule.reset} onPick={(v) => actions.setReset(rule.id, v)} />
        <button
          className="zonebtn"
          style={{ ...pillStyle, marginLeft: "auto", color: C.red, borderColor: C.red }}
          onClick={() => actions.removeInterlock(rule.id)}
        >
          DELETE INTERLOCK
        </button>
      </div>
    </div>
  );
}

// `line`/`onEdit` follow the rest of Build mode's double-apply pattern:
// `onEdit` is called with a function `(line) => result` and only commits
// when the result is ok, after recording the pre-edit line for undo.
export default function InterlocksWindow({ line, onEdit, onHoverMachine }) {
  const act = (fn) => (...args) => onEdit((l) => fn(l, ...args));
  const actions = {
    setField: act((l, id, part, field, value) => setSentenceField(l, id, part, field, value)),
    addWhenClears: act((l, id) => addWhenClears(l, id)),
    removeWhenClears: act((l, id) => removeWhenClears(l, id)),
    setReset: act((l, id, reset) => setSentenceReset(l, id, reset)),
    addStep: act((l, id, part, action) => addStep(l, id, part, action)),
    removeStep: act((l, id, part, index) => removeStep(l, id, part, index)),
    moveStep: act((l, id, part, from, to) => moveStep(l, id, part, from, to)),
    setStepField: act((l, id, part, index, field, value) => setStepField(l, id, part, index, field, value)),
    setStepAction: act((l, id, part, index, action) => setStepAction(l, id, part, index, action)),
    removeInterlock: act((l, id) => removeInterlock(l, id)),
  };

  return (
    <aside style={{
      position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", bottom: 0, zIndex: 6,
      width: WINDOW_WIDTH, maxWidth: "calc(100% - 32px)", background: C.panel,
      border: `1px solid ${C.line}`, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={headingStyle}>INTERLOCKS</div>
        <button className="zonebtn" style={pillStyle} onClick={() => onEdit((l) => addInterlock(l))}>
          + ADD INTERLOCK
        </button>
      </div>
      <div style={{ overflowY: "auto", padding: "4px 16px 16px", fontFamily: FONT_MONO }}>
        {line.interlocks.length === 0 ? (
          <div style={{ fontSize: 10, color: C.muted, marginTop: 16 }}>This line has no interlocks yet.</div>
        ) : (
          line.interlocks.map((rule) => (
            <SentenceCard key={rule.id} line={line} rule={rule} actions={actions} onHover={onHoverMachine} />
          ))
        )}
      </div>
    </aside>
  );
}
