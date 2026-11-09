import { describe, it, expect } from "vitest";
import { formatElapsed } from "./formatElapsed";

describe("formatElapsed", () => {
  it("shows a fresh run as zero", () => {
    expect(formatElapsed(0)).toBe("0:00:00.0");
  });

  it("keeps the tenth so a single step moves the clock", () => {
    expect(formatElapsed(0.1)).toBe("0:00:00.1");
    expect(formatElapsed(0.6999999999)).toBe("0:00:00.7");
    expect(formatElapsed(59.96)).toBe("0:01:00.0");
  });

  it("rolls seconds into minutes and minutes into hours", () => {
    expect(formatElapsed(125.3)).toBe("0:02:05.3");
    expect(formatElapsed(3600)).toBe("1:00:00.0");
    expect(formatElapsed(2 * 3600 + 17 * 60 + 4.5)).toBe("2:17:04.5");
  });

  it("does not wrap hours past a day", () => {
    expect(formatElapsed(26 * 3600)).toBe("26:00:00.0");
  });
});
