import { it, expect } from "vitest";
import {
  summarizeGrid,
  validateGrid,
  guideCSV,
  guideTests,
  type GuideState,
} from "../apps/portal/lib/calibrator/guide";
it("reports camera codes without inventing physical luminance or chromaticity", () => {
  const data = new Uint8ClampedArray(10 * 10 * 4);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) {
      const i = (y * 10 + x) * 4,
        v = Math.floor(y / 2) * 5 + Math.floor(x / 2);
      data.set([v, v + 10, v + 20, 255], i);
    }
  const reading = summarizeGrid(data, 10, 10, false);
  expect(reading.cells).toEqual(Array.from({ length: 25 }, (_, i) => i + 10));
  expect(reading.values).toEqual([12, 22, 32]);
  expect(reading.clipped).toBe(0);
  expect(reading).not.toHaveProperty("gamma");
  expect(() => summarizeGrid(data, 11, 10, false)).toThrow();
});
it("handles flat black and clipped images without division by zero and rejects poisoned aggregates", () => {
  const data = new Uint8ClampedArray(100 * 4);
  expect(summarizeGrid(data, 10, 10, true).cells.every((v) => v === 0)).toBe(
    true,
  );
  data.fill(255);
  const reading = summarizeGrid(data, 10, 10, true);
  expect(reading.clipped).toBe(1);
  expect(reading.spread).toBe(0);
  expect(validateGrid(reading)).toEqual(reading);
  for (const bad of [
    { ...reading, cells: [1] },
    { ...reading, clipped: Infinity },
    { ...reading, cells: Array(25).fill(NaN) },
    { ...reading, values: [1, "2", 3] },
    { ...reading, locked: "yes" },
  ])
    expect(() => validateGrid(bad)).toThrow();
});
it("exports labelled observations and relative camera codes with safe spreadsheet fields", () => {
  const state: GuideState = {
    pairing_id: "test",
    test: "uniform",
    revision: "test",
    reading_at: null,
    reading: summarizeGrid(new Uint8ClampedArray(100 * 4), 10, 10, false),
    observations: { shadows: "=1+2", white: 'Contrast "75"\nBacklight 20' },
  };
  const csv = guideCSV(state);
  expect(csv).toContain('"\'=1+2"');
  expect(csv).toContain('Contrast ""75""');
  expect(csv).toContain("nie luminancja monitora");
  expect(csv).not.toContain("NaN");
  expect(new Set(guideTests.map((t) => t.id)).size).toBe(6);
});
