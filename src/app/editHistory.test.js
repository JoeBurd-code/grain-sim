import { describe, it, expect } from "vitest";
import { emptyHistory, pushHistory, undoHistory, redoHistory } from "./editHistory";

describe("edit history", () => {
  it("undoes and redoes back to the exact earlier line document", () => {
    let history = emptyHistory();
    const lineA = { v: "a" };
    const lineB = { v: "b" };
    history = pushHistory(history, lineA);

    const undone = undoHistory(history, lineB);
    expect(undone.line).toBe(lineA);

    const redone = redoHistory(undone.history, lineA);
    expect(redone.line).toBe(lineB);
  });

  it("returns null when there is nothing to undo or redo", () => {
    expect(undoHistory(emptyHistory(), { v: "x" })).toBeNull();
    expect(redoHistory(emptyHistory(), { v: "x" })).toBeNull();
  });

  it("clears the redo future on a new edit after an undo", () => {
    let history = emptyHistory();
    history = pushHistory(history, { v: 1 });
    const undone = undoHistory(history, { v: 2 });
    expect(undone.history.future).toHaveLength(1);

    const afterNewEdit = pushHistory(undone.history, { v: 3 });
    expect(afterNewEdit.future).toEqual([]);
  });

  it("keeps 50 steps and drops the oldest", () => {
    let history = emptyHistory();
    for (let i = 0; i < 60; i++) history = pushHistory(history, { v: i });
    expect(history.past).toHaveLength(50);
    expect(history.past[0]).toEqual({ v: 10 });
    expect(history.past[49]).toEqual({ v: 59 });
  });

  it("keeps the past capped at 50 across a chain of redos", () => {
    let history = emptyHistory();
    for (let i = 0; i < 50; i++) history = pushHistory(history, { v: i });
    let current = { v: 50 };
    // Undo everything, then redo everything: the past should settle back at 50.
    for (let i = 0; i < 50; i++) {
      const undone = undoHistory(history, current);
      history = undone.history;
      current = undone.line;
    }
    for (let i = 0; i < 50; i++) {
      const redone = redoHistory(history, current);
      history = redone.history;
      current = redone.line;
    }
    expect(history.past).toHaveLength(50);
    expect(history.future).toEqual([]);
  });
});
