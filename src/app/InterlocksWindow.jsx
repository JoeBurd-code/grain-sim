// Issue #92: every interlock on the line as a sentence, Build mode only.
// Docked on the right, where the Build panel sits. Each interlock reads as one plain
// sentence; clicking it opens its editor, one at a time. Every choice offered
// is one the engine accepts, and what it cannot do is said in plain words.
import { useState } from "react";
import {
  addInterlock, removeInterlock, setSentenceField, setWhenClearsCondition, addWhenClears, removeWhenClears,
  setSentenceReset, addStep, removeStep, moveStep, setStepField, rewriteAsHold,
} from "../line/sentenceEditor";
import {
  CONDITIONS, conditionOptions, machineActionOptions, watchableMachines, actionableMachines, switchOptions,
  sentenceSummary, sentenceProblems, runStepHint, machineName, interlocksByMachine,
} from "../line/sentenceOptions";
import { pendingSuggestions, acceptSuggestion, dismissSuggestion } from "../line/suggestedInterlocks";
import { C, FONT_DISP, FONT_MONO } from "../scene/theme";

export const INTERLOCKS_WINDOW_WIDTH = 380;
// Above this many interlocks, every machine group starts shut.
const COLLAPSE_ABOVE = 8;

const pill = {
  background: "transparent", color: C.muted, border: `1px solid ${C.line}`, borderRadius: 4,
  padding: "3px 8px", fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.06em", cursor: "pointer",
};
const pillOn = { ...pill, background: C.wheat, color: "#1a1a14", border: `1px solid ${C.wheat}`, cursor: "default" };
const textBtn = { ...pill, border: "none", padding: "3px 4px", color: C.wheat };
const label = { width: 54, flex: "none", fontSize: 9, color: C.muted, letterSpacing: "0.08em" };
const caption = { fontSize: 9, color: C.muted, lineHeight: 1.5 };
// A chevron drawn in the theme's muted colour, in place of the browser's own.
const CARET = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%237d877f'/%3E%3C/svg%3E")`;
const selectStyle = {
  appearance: "none", WebkitAppearance: "none", background: `${C.bg} ${CARET} no-repeat right 8px center`,
  color: C.text, border: `1px solid ${C.line}`, borderRadius: 4, padding: "4px 24px 4px 8px",
  fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer", minWidth: 0, maxWidth: "100%",
};

// `disabled` maps an option to why it cannot be picked; it shows greyed
// out with that reason as its tooltip.
function Pills({ options, value, labelOf = (o) => String(o).toUpperCase(), onPick, disabled = {} }) {
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {options.map((o) => {
        const why = value !== o ? disabled[o] : undefined;
        return (
          <button key={String(o)} className={why ? undefined : "zonebtn"} aria-pressed={value === o} disabled={Boolean(why)} title={why}
            style={value === o ? pillOn : why ? { ...pill, opacity: 0.35, cursor: "not-allowed" } : pill}
            onClick={() => value !== o && !why && onPick(o)}>
            {labelOf(o)}
          </button>
        );
      })}
    </div>
  );
}

function MachineSelect({ machines, line, value, onChange, label: aria }) {
  const listed = machines.some((m) => m.id === value);
  return (
    <select aria-label={aria} style={selectStyle} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {!listed && <option value={value ?? ""} disabled>{value ? machineName(line, value) : "pick a machine"}</option>}
      {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

// A number with − and + either side, in the theme. Typing commits on Enter
// or on leaving the box, so one change is one undo step; the arrows and the
// arrow keys commit at once. Escape puts the box back.
function Stepper({ value, onCommit, min = 0, max = Infinity, step = 1, unit, label: aria }) {
  const [draft, setDraft] = useState(null);
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const commit = (v) => {
    setDraft(null);
    if (Number.isFinite(v) && clamp(v) !== value) onCommit(clamp(v));
  };
  const nudge = (d) => commit(Math.round(((value ?? 0) + d) * 100) / 100);
  const btn = {
    width: 22, height: 24, background: C.panel2, color: C.text, border: `1px solid ${C.line}`,
    fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1, cursor: "pointer", padding: 0,
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "inline-flex" }}>
        <button className="zonebtn" aria-label={`less ${aria}`} style={{ ...btn, borderRadius: "4px 0 0 4px" }} onClick={() => nudge(-step)}>−</button>
        <input
          type="text" inputMode="decimal" aria-label={aria}
          value={draft ?? (value == null ? "" : String(value))}
          placeholder="…"
          style={{
            width: 42, height: 24, boxSizing: "border-box", textAlign: "center", background: C.bg, color: C.text,
            border: `1px solid ${C.line}`, borderLeft: "none", borderRight: "none", fontFamily: FONT_MONO, fontSize: 11,
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== null && commit(draft.trim() === "" ? NaN : Number(draft))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(null);
            if (e.key === "ArrowUp") { e.preventDefault(); nudge(step); }
            if (e.key === "ArrowDown") { e.preventDefault(); nudge(-step); }
          }}
        />
        <button className="zonebtn" aria-label={`more ${aria}`} style={{ ...btn, borderRadius: "0 4px 4px 0" }} onClick={() => nudge(step)}>+</button>
      </div>
      {unit && <span style={{ fontSize: 10, color: C.muted }}>{unit}</span>}
    </div>
  );
}

function Row({ name, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minHeight: 24 }}>
      <span style={label}>{name}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Section({ title, children, aside }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.line}`, paddingBottom: 3 }}>
        <span style={{ fontSize: 10, color: C.wheat, letterSpacing: "0.1em" }}>{title}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

// The level-or-running condition of a part. `onField(field, value)`.
function ConditionRows({ line, machine, part, onField }) {
  const level = CONDITIONS[part.condition]?.level;
  const switches = level ? switchOptions(line, machine) : [];
  return (
    <>
      <Row name="IS">
        {machine == null ? (
          <span style={caption}>pick a machine first</span>
        ) : (
          <Pills options={conditionOptions(line, machine)} value={part.condition} onPick={(v) => onField("condition", v)} />
        )}
        {level && (
          <Stepper label="set point" value={part.setpoint == null ? null : Math.round(part.setpoint * 100)} min={0} max={100} unit="%"
            onCommit={(v) => onField("setpoint", v / 100)} />
        )}
      </Row>
      {switches.length > 0 && (
        <Row name="SWITCH">
          <Pills options={["none", ...switches]} value={part.switch ?? "none"} onPick={(v) => onField("switch", v === "none" ? null : v)} />
        </Row>
      )}
      <Row name="FOR">
        <Stepper label="delay" value={part.delaySec} min={0} max={600} unit="s" onCommit={(v) => onField("delaySec", v)} />
      </Row>
    </>
  );
}

const STEP_LABEL = { ifStillTrue: "IF STILL TRUE, GO ON", tripLine: "TRIP THE WHOLE LINE", alarm: "RAISE AN ALARM" };
const STEP_COLOR = { tripLine: C.red, alarm: C.amber };

// Every action the machine can take. Start and open only undo a stop or
// close this interlock gave earlier (`held`), so until then they show
// greyed out with the reason. The step's own action is always shown, so a
// broken one can be seen and fixed.
function stepActions(line, step, held) {
  const all = machineActionOptions(line, step.machine);
  const options = step.action == null || all.includes(step.action) ? all : [step.action, ...all];
  const disabled = {};
  if (!held.has(step.machine)) {
    disabled.start = "Only after this interlock has stopped it. Machines run on their own.";
    disabled.open = "Only after this interlock has closed it. Valves are open on their own.";
  }
  return { options, disabled };
}

function StepList({ line, steps, part, heldBefore, actions, onHover }) {
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const machines = actionableMachines(line);
  const held = new Set(heldBefore);
  return (
    <div style={{ marginTop: 6 }}>
      {steps.length === 0 && <div style={{ ...caption, padding: "4px 0" }}>No steps yet.</div>}
      {steps.map((step, i) => {
        const offered = step.machine !== undefined ? stepActions(line, step, held) : null;
        if (step.action === "stop" || step.action === "close") held.add(step.machine);
        return (
          <div
            key={i}
            draggable
            onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i) actions.moveStep(part, dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            onMouseEnter={() => step.machine && onHover([step.machine])}
            onMouseLeave={() => onHover(null)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", marginTop: 4,
              border: `1px solid ${dragOver === i && dragFrom !== i ? C.wheat : C.line}`, borderRadius: 4,
              background: C.panel2, opacity: dragFrom === i ? 0.5 : 1,
            }}
          >
            <span title="drag to reorder" style={{ color: C.muted, cursor: "grab", fontSize: 11, userSelect: "none" }}>⠿</span>
            <span style={{ color: C.muted, fontSize: 9, width: 10 }}>{i + 1}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
              {step.machine !== undefined ? (
                <>
                  <MachineSelect machines={machines} line={line} value={step.machine} label="machine"
                    onChange={(v) => actions.setStepField(part, i, "machine", v)} />
                  {step.machine != null && (
                    <Pills options={offered.options} disabled={offered.disabled} value={step.action}
                      onPick={(a) => actions.setStepField(part, i, "action", a)} />
                  )}
                </>
              ) : step.action === "wait" ? (
                <>
                  <span style={{ fontSize: 10, color: C.text, letterSpacing: "0.06em" }}>WAIT</span>
                  <Stepper label="wait" value={step.seconds} min={0} max={3600} unit="s"
                    onCommit={(v) => actions.setStepField(part, i, "seconds", v)} />
                </>
              ) : (
                <span style={{ fontSize: 10, letterSpacing: "0.06em", color: STEP_COLOR[step.action] ?? C.text }}>
                  {STEP_LABEL[step.action] ?? step.action}
                </span>
              )}
            </div>
            <button className="zonebtn" aria-label="remove step" title="remove step"
              style={{ ...textBtn, color: C.muted, fontSize: 13 }} onClick={() => actions.removeStep(part, i)}>×</button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 2, marginTop: 4, flexWrap: "wrap" }}>
        <button className="zonebtn" style={textBtn} onClick={() => actions.addStep(part, "machine")}>+ MACHINE</button>
        <button className="zonebtn" style={textBtn} onClick={() => actions.addStep(part, "wait")}>+ WAIT</button>
        {part === "then" && (
          <>
            <button className="zonebtn" style={textBtn} title="Write it to the event log, and hold nothing"
              onClick={() => actions.addStep(part, "alarm")}>+ ALARM</button>
            <button className="zonebtn" style={textBtn} onClick={() => actions.addStep(part, "ifStillTrue")}>+ IF STILL TRUE</button>
            <button className="zonebtn" style={textBtn} onClick={() => actions.addStep(part, "tripLine")}>+ TRIP LINE</button>
          </>
        )}
      </div>
    </div>
  );
}

function Summary({ line, rule }) {
  return (
    <span style={{ fontSize: 10, color: C.text, lineHeight: 1.6 }}>
      {sentenceSummary(line, rule).map((seg, i) => (seg.machine !== undefined
        ? <span key={i} style={{ color: C.wheat }}>{machineName(line, seg.machine)}</span>
        : <span key={i}>{seg.text}</span>))}
    </span>
  );
}

// The first step with a machine picked but no action: nearly always someone
// leaving it blank so the machine "runs", which needs no step at all.
function idleStep(rule) {
  const parts = [["then", rule.then], ["whenClearsThen", rule.whenClears?.then ?? []]];
  for (const [part, steps] of parts) {
    const index = steps.findIndex((s) => s.machine != null && s.action == null);
    if (index >= 0) return { part, index, machine: steps[index].machine };
  }
  return null;
}

function Problems({ line, rule, onRewrite, onRemoveStep }) {
  const idle = idleStep(rule);
  const idleMessage = idle && idle.part === "then" ? `step ${idle.index + 1} needs an action` : null;
  const problems = sentenceProblems(line, rule);
  const hint = runStepHint(line, rule);
  if (problems.length === 0) return null;
  if (idle && !hint) {
    return (
      <div style={{ marginTop: 14, border: `1px solid ${C.amber}`, borderRadius: 4, padding: "8px 10px" }}>
        <div style={{ fontSize: 9, color: C.amber, letterSpacing: "0.1em" }}>THIS INTERLOCK WILL NOT RUN YET</div>
        <div style={{ ...caption, color: C.text, marginTop: 6 }}>
          Machines run on their own. A step can only stop a machine or close a valve.
          To leave {machineName(line, idle.machine)} running, remove this step.
        </div>
        <button className="zonebtn" style={{ ...pill, color: C.wheat, border: `1px solid ${C.wheat}`, marginTop: 8 }}
          onClick={() => onRemoveStep(idle.part, idle.index)}>
          REMOVE STEP
        </button>
        {problems.filter((p) => p !== idleMessage && !(idle.part !== "then" && p.endsWith("needs an action"))).map((p, i) => (
          <div key={i} style={{ ...caption, color: C.text, marginTop: 4 }}>· {p}</div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14, border: `1px solid ${C.amber}`, borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: C.amber, letterSpacing: "0.1em" }}>THIS INTERLOCK WILL NOT RUN YET</div>
      {hint ? (
        <>
          <div style={{ ...caption, color: C.text, marginTop: 6 }}>
            An interlock can only hold a machine stopped or a valve closed. It cannot make one run.
            To run {machineName(line, hint.machine)} only while {machineName(line, rule.when.machine)} is {rule.when.condition}
            {CONDITIONS[rule.when.condition]?.level ? ` ${Math.round(rule.when.setpoint * 100)} %` : ""}, {hint.action}{" "}
            it while it is {hint.condition}
            {CONDITIONS[hint.condition]?.level ? ` ${Math.round(rule.when.setpoint * 100)} %` : ""}.
          </div>
          <button className="zonebtn" style={{ ...pill, color: C.wheat, border: `1px solid ${C.wheat}`, marginTop: 8 }} onClick={onRewrite}>
            REWRITE IT THAT WAY
          </button>
        </>
      ) : (
        problems.map((p, i) => <div key={i} style={{ ...caption, color: C.text, marginTop: 4 }}>· {p}</div>)
      )}
    </div>
  );
}

function Editor({ line, rule, actions, onHover }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const clears = rule.whenClears;
  const heldByThen = rule.then.filter((s) => s.action === "stop" || s.action === "close").map((s) => s.machine);
  return (
    <div style={{ padding: "2px 12px 12px" }}>
      <Section title="WHEN">
        <Row name="WATCH">
          <MachineSelect machines={watchableMachines(line)} line={line} value={rule.when.machine} label="watched machine"
            onChange={(v) => actions.setField("when", "machine", v)} />
        </Row>
        <ConditionRows line={line} machine={rule.when.machine} part={rule.when} onField={(f, v) => actions.setField("when", f, v)} />
      </Section>

      <Section title="THEN">
        <StepList line={line} steps={rule.then} part="then" heldBefore={[]} actions={actions} onHover={onHover} />
      </Section>

      {clears ? (
        <Section
          title="WHEN IT CLEARS"
          aside={<button className="zonebtn" style={{ ...textBtn, color: C.muted }} onClick={actions.removeWhenClears}>REMOVE</button>}
        >
          <Row name="RUN">
            <Pills
              options={["at once", "when"]}
              value={clears.condition === undefined ? "at once" : "when"}
              onPick={(v) => actions.setWhenClearsCondition(v === "when")}
            />
          </Row>
          {clears.condition === undefined ? (
            <div style={{ ...caption, marginTop: 6 }}>The steps below run as soon as the "when" condition stops holding.</div>
          ) : (
            <ConditionRows line={line} machine={rule.when.machine} part={clears} onField={(f, v) => actions.setField("whenClears", f, v)} />
          )}
          <StepList line={line} steps={clears.then} part="whenClearsThen" heldBefore={heldByThen} actions={actions} onHover={onHover} />
        </Section>
      ) : (
        <button className="zonebtn" style={{ ...textBtn, marginTop: 12 }} onClick={actions.addWhenClears}>
          + WHAT HAPPENS WHEN IT CLEARS
        </button>
      )}

      <Section title="RESET">
        <Row name="">
          <Pills options={["auto", "latched"]} value={rule.reset} onPick={actions.setReset} />
        </Row>
        <div style={{ ...caption, marginTop: 4 }}>
          {rule.reset === "latched"
            ? "Holds until an operator presses RESET TRIPS."
            : "Lets go by itself once the condition clears."}
        </div>
      </Section>

      <Problems line={line} rule={rule} onRewrite={actions.rewrite} onRemoveStep={actions.removeStep} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 14 }}>
        {confirmDelete ? (
          <>
            <button className="zonebtn" style={{ ...pill, color: C.muted }} onClick={() => setConfirmDelete(false)}>CANCEL</button>
            <button className="zonebtn" style={{ ...pill, color: C.red, border: `1px solid ${C.red}` }} onClick={actions.remove}>DELETE IT</button>
          </>
        ) : (
          <button className="zonebtn" style={{ ...textBtn, color: C.red }} onClick={() => setConfirmDelete(true)}>DELETE INTERLOCK</button>
        )}
      </div>
    </div>
  );
}

function ruleMachines(rule) {
  const steps = [...rule.then, ...(rule.whenClears?.then ?? [])];
  return [rule.when.machine, ...steps.map((s) => s.machine).filter(Boolean)];
}

// `onEdit(fn)` applies `fn(line) => { ok, line }` as one undoable edit (PlantApp).
export default function InterlocksWindow({ line, onEdit, onHoverMachines, onClose }) {
  const [openId, setOpenId] = useState(null);
  // Machine id ("" for no machine yet) -> collapsed. A long list starts with
  // every group shut, so the user opens the machine they are after.
  const [collapsed, setCollapsed] = useState({});
  // Fixed when the window opens, so adding one more never shuts open groups.
  const [manyInterlocks] = useState(() => line.interlocks.length > COLLAPSE_ABOVE);
  const actionsFor = (id) => ({
    setField: (part, field, value) => onEdit((l) => setSentenceField(l, id, part, field, value)),
    setWhenClearsCondition: (on) => onEdit((l) => setWhenClearsCondition(l, id, on)),
    addWhenClears: () => onEdit((l) => addWhenClears(l, id)),
    removeWhenClears: () => onEdit((l) => removeWhenClears(l, id)),
    setReset: (reset) => onEdit((l) => setSentenceReset(l, id, reset)),
    addStep: (part, kind) => onEdit((l) => addStep(l, id, part, kind)),
    removeStep: (part, index) => onEdit((l) => removeStep(l, id, part, index)),
    moveStep: (part, from, to) => onEdit((l) => moveStep(l, id, part, from, to)),
    setStepField: (part, index, field, value) => onEdit((l) => setStepField(l, id, part, index, field, value)),
    rewrite: () => {
      const hint = runStepHint(line, line.interlocks.find((r) => r.id === id));
      if (hint) onEdit((l) => rewriteAsHold(l, id, hint.index));
    },
    remove: () => {
      onEdit((l) => removeInterlock(l, id));
      onHoverMachines(null);
    },
  });
  const onAdd = () => {
    const result = onEdit((l) => addInterlock(l));
    if (result.ok) setOpenId(result.id);
  };

  return (
    <aside style={{
      position: "absolute", top: 0, bottom: 0, right: 0, zIndex: 6, width: INTERLOCKS_WINDOW_WIDTH, maxWidth: "100%",
      background: C.panel, borderLeft: `1px solid ${C.line}`, boxShadow: "-6px 0 18px rgba(0,0,0,0.35)",
      display: "flex", flexDirection: "column", fontFamily: FONT_MONO,
    }}>
      <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: FONT_DISP, fontSize: 16, color: C.wheat, letterSpacing: "0.04em" }}>
            INTERLOCKS <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.muted }}>{line.interlocks.length}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="zonebtn" style={{ ...pill, color: C.wheat, border: `1px solid ${C.wheat}` }} onClick={onAdd}>+ ADD</button>
            <button className="zonebtn" aria-label="close interlocks" style={{ ...pill, padding: "3px 7px" }} onClick={onClose}>×</button>
          </div>
        </div>
        <div style={{ ...caption, marginTop: 6 }}>
          Each interlock watches one machine, and while that is true it holds other machines stopped or valves closed.
          They are listed under the machine they watch.
        </div>
      </div>

      <div style={{ overflowY: "auto", padding: "8px 10px 16px", flex: 1 }}>
        {line.interlocks.length === 0 && (
          <div style={{ ...caption, marginTop: 10 }}>This line has no interlocks. Press + ADD to make one.</div>
        )}
        {interlocksByMachine(line, pendingSuggestions(line)).map(({ machine, rules, suggestions }) => {
          const okById = new Map(rules.map((r) => [r.id, sentenceProblems(line, r).length === 0]));
          const key = machine ?? "";
          // A group holding the open interlock is always shown.
          const shown = rules.some((r) => r.id === openId) || !(collapsed[key] ?? manyInterlocks);
          return (
            <div key={key} style={{ marginTop: 10 }}>
              <button
                className="zonebtn"
                aria-expanded={shown}
                onClick={() => setCollapsed((c) => ({ ...c, [key]: shown }))}
                onMouseEnter={() => machine && onHoverMachines([machine])}
                onMouseLeave={() => onHoverMachines(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none",
                  borderBottom: `1px solid ${C.line}`, padding: "4px 2px", cursor: "pointer", fontFamily: FONT_MONO, textAlign: "left",
                }}
              >
                <span style={{ color: C.muted, fontSize: 9, width: 8 }}>{shown ? "▾" : "▸"}</span>
                <span style={{ flex: 1, fontSize: 10, color: machine ? C.wheat : C.muted, letterSpacing: "0.08em" }}>
                  {machine ? machineName(line, machine) : "NO MACHINE YET"}
                </span>
                {rules.some((r) => !okById.get(r.id)) && (
                  <span title="an interlock here will not run yet" style={{ width: 6, height: 6, borderRadius: 3, background: C.amber }} />
                )}
                {suggestions.length > 0 && <span style={{ fontSize: 9, color: C.wheat }}>+{suggestions.length} suggested</span>}
                <span style={{ fontSize: 9, color: C.muted }}>{rules.length}</span>
              </button>
              {shown && rules.map((rule) => {
                const open = rule.id === openId;
                const ok = okById.get(rule.id);
                return (
                  <div
                    key={rule.id}
                    onMouseEnter={() => onHoverMachines(ruleMachines(rule))}
                    onMouseLeave={() => onHoverMachines(null)}
                    style={{ border: `1px solid ${open ? C.wheat : ok ? C.line : C.amber}`, borderRadius: 6, marginTop: 6, background: C.bg }}
                  >
                    <button
                      onClick={() => setOpenId(open ? null : rule.id)}
                      aria-expanded={open}
                      style={{
                        display: "flex", gap: 8, alignItems: "flex-start", width: "100%", textAlign: "left",
                        background: "transparent", border: "none", padding: "9px 10px", cursor: "pointer", fontFamily: FONT_MONO,
                      }}
                    >
                      <span title={ok ? "will run" : "will not run yet"}
                        style={{ width: 7, height: 7, borderRadius: 4, marginTop: 5, flex: "none", background: ok ? C.green : C.amber }} />
                      <span style={{ flex: 1 }}>
                        <Summary line={line} rule={rule} />
                      </span>
                      <span style={{ color: C.muted, fontSize: 9, marginTop: 3 }}>{open ? "▲" : "▼"}</span>
                    </button>
                    {open && <Editor key={rule.id} line={line} rule={rule} actions={actionsFor(rule.id)} onHover={onHoverMachines} />}
                  </div>
                );
              })}
              {shown && suggestions.map((rule) => (
                <div
                  key={rule.id}
                  onMouseEnter={() => onHoverMachines(ruleMachines(rule))}
                  onMouseLeave={() => onHoverMachines(null)}
                  style={{ display: "flex", gap: 8, alignItems: "flex-start", border: `1px dashed ${C.line}`, borderRadius: 6, marginTop: 6, padding: "9px 10px" }}
                >
                  <span style={{ flex: 1, opacity: 0.75 }}>
                    <span style={{ display: "block", fontSize: 8, color: C.wheat, letterSpacing: "0.1em", marginBottom: 2 }}>SUGGESTED</span>
                    <Summary line={line} rule={rule} />
                  </span>
                  <button className="zonebtn" aria-label="add suggested interlock" title="Add this interlock"
                    style={{ ...pill, color: C.green, border: `1px solid ${C.green}`, padding: "2px 7px" }}
                    onClick={() => onEdit((l) => acceptSuggestion(l, rule.id))}>✓</button>
                  <button className="zonebtn" aria-label="dismiss suggested interlock" title="Dismiss. It will not be suggested again."
                    style={{ ...pill, padding: "2px 7px" }}
                    onClick={() => { onEdit((l) => dismissSuggestion(l, rule.id)); onHoverMachines(null); }}>✕</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
