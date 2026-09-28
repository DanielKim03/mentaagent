import { describe, expect, it } from "vitest";
import { evaluateMath } from "../src/services/agent/tools/math.js";

describe("evaluateMath", () => {
  it("does the arithmetic the agent actually asks for", () => {
    expect(evaluateMath("(180000+124000+90000)/720000*100")).toBeCloseTo(54.7222, 3);
    expect(evaluateMath("(48200 - 31000) / 48200 * 100")).toBeCloseTo(35.6846, 3);
    expect(evaluateMath("1.5e3 + .5")).toBe(1500.5);
  });

  it("follows the usual precedence", () => {
    expect(evaluateMath("2 + 3 * 4")).toBe(14);
    expect(evaluateMath("2 ^ 3 ^ 2")).toBe(512); // right-associative
    expect(evaluateMath("-2 ^ 2")).toBe(-4);
    expect(evaluateMath("10 % 4 * 3")).toBe(6);
    expect(evaluateMath("--3")).toBe(3);
  });

  it("has the listed functions and constants", () => {
    expect(evaluateMath("round(2.345, 2)")).toBe(2.35);
    expect(evaluateMath("round(2.5)")).toBe(3);
    expect(evaluateMath("max(3, 9, 4) - min(3, 9, 4)")).toBe(6);
    expect(evaluateMath("sum(1, 2, 3) / avg(2, 4)")).toBe(2);
    expect(evaluateMath("sqrt(16) + abs(-2) + log10(1000)")).toBe(9);
    expect(evaluateMath("round(PI, 4)")).toBe(3.1416);
  });

  it("refuses anything that isn't arithmetic", () => {
    for (const bad of [
      "constructor",
      "__proto__",
      "toString()",
      "sqrt.constructor",
      "x = 1",
      "this",
      "'a'",
      'process.exit(1)',
      "max()",
      "pow(2)",
      "1 +",
      "(1",
      "1 2",
      "hasOwnProperty(1)",
    ]) {
      expect(() => evaluateMath(bad), bad).toThrow();
    }
  });

  it("stops runaway nesting", () => {
    expect(() => evaluateMath("(".repeat(500) + "1" + ")".repeat(500))).toThrow(/nested/);
    expect(() => evaluateMath("-".repeat(500) + "1")).toThrow(/nested/);
  });
});
