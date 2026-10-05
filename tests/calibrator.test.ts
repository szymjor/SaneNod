import { describe, it, expect } from "vitest";
import {
  standards,
  defaults,
  recommended,
  validateSettings,
  type StandardId,
} from "../apps/portal/lib/calibrator/standards";
import {
  parseCSV,
  patches,
  analyze,
  summarizePixels,
  validateReading,
  type Reading,
} from "../apps/portal/lib/calibrator/measurement";
import {
  standardICC,
  referenceMatrix,
} from "../apps/portal/lib/calibrator/icc";
describe("monitor guidance and measurement honesty", () => {
  it("recommends web sRGB, print Adobe RGB, and SDR video Rec.709", () => {
    expect(recommended("gaming")).toBe("srgb");
    expect(recommended("print")).toBe("adobe-rgb");
    expect(recommended("video")).toBe("rec709");
  });
  it("rejects unsupported and invalid settings", () => {
    expect(() =>
      validateSettings({ ...defaults(), brightness: NaN }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...defaults(), standard: "__proto__" }),
    ).toThrow();
    expect(() => validateSettings({ ...defaults(), gamma: 10 })).toThrow();
  });
  it("separates Display P3 from DCI-P3, and SDR Rec.2020 from HDR", () => {
    expect(standards["display-p3"].white).toBe("D65");
    expect(standards["dci-p3"].white).toBe("DCI");
    expect(standards.rec2020.caution).toContain("nie PQ/HLG");
  });
  it("camera RGB cannot yield absolute luminance, chromaticity or gamma", () => {
    const r = analyze(
      [{ patch: "white", values: [255, 240, 230], clipped: 0.5, spread: 3 }],
      "camera",
      defaults(),
    );
    expect(r).toMatchObject({
      brightness: null,
      whiteXY: null,
      gamma: null,
      kind: "relative",
    });
    expect(r.advice.join()).toContain("prześwietlenia");
  });
  it("derives XYZ white and gamma from known absolute measurements", () => {
    const readings: Reading[] = [
      { patch: "black", values: [0, 0, 0] },
      { patch: "white", values: [114.05, 120, 130.69] },
      { patch: "gray-50", values: [0, 120 * 0.5 ** 2.2, 0] },
    ];
    const r = analyze(readings, "external", defaults());
    expect(r.brightness).toBe(120);
    expect(r.gamma).toBeCloseTo(2.2);
    expect(r.whiteXY?.[0]).toBeCloseTo(0.3127, 3);
  });
  it("does not fabricate gamma for black/white or gray inversion", () => {
    const r = analyze(
      [
        { patch: "black", values: [1, 10, 1] },
        { patch: "white", values: [1, 10, 1] },
        { patch: "gray-50", values: [1, 10, 1] },
      ],
      "external",
      defaults(),
    );
    expect(r.gamma).toBeNull();
  });
  it("samples central image statistics without assuming sRGB colorimetry", () => {
    expect(
      summarizePixels(
        new Uint8ClampedArray([10, 20, 30, 255, 30, 20, 10, 255]),
      ),
    ).toEqual({ values: [20, 20, 20], clipped: 0, spread: 10 });
    expect(
      summarizePixels(new Uint8ClampedArray([250, 20, 30, 255])).clipped,
    ).toBe(1);
  });
  it("validates complete ordered CSV and rejects missing, swapped, negative or nonfinite measurements", () => {
    const csv =
      "patch,X,Y,Z\n" + patches.map((p) => `${p.id},1,1,1`).join("\n");
    expect(parseCSV(csv)).toHaveLength(10);
    for (const bad of [
      csv.replace("black,1", "white,1"),
      csv.replace("1,1,1", "-1,1,1"),
      csv.replace("1,1,1", "NaN,1,1"),
      csv.replace("1,1,1", "1,,1"),
      csv.replace("1,1,1", "1,Infinity,1"),
      csv.split("\n").slice(0, -1).join("\n"),
    ])
      expect(() => parseCSV(bad)).toThrow();
    expect(() =>
      validateReading(
        { patch: "black", values: [256, 0, 0], clipped: 0, spread: 0 },
        "camera",
        0,
      ),
    ).toThrow();
  });
});
describe("fixed ICC standard references", () => {
  for (const id of Object.keys(standards) as StandardId[])
    it(`${id}: aligned, bounded RGB display profile with D50 PCS and monotone curves`, () => {
      const b = standardICC(id);
      expect(b.readUInt32BE(0)).toBe(b.length);
      expect(b.toString("ascii", 36, 40)).toBe("acsp");
      expect(b.toString("ascii", 12, 24)).toBe("mntrRGB XYZ ");
      expect(b.readUInt32BE(8)).toBe(0x02400000);
      const tags = new Map<string, Buffer>();
      const count = b.readUInt32BE(128);
      for (let i = 0; i < count; i++) {
        const offset = b.readUInt32BE(136 + i * 12),
          size = b.readUInt32BE(140 + i * 12);
        expect(offset % 4).toBe(0);
        expect(offset + size).toBeLessThanOrEqual(b.length);
        tags.set(
          b.toString("ascii", 132 + i * 12, 136 + i * 12),
          b.subarray(offset, offset + size),
        );
      }
      expect(tags.has("vcgt")).toBe(false);
      expect(tags.has("chad")).toBe(true);
      const white = ["rXYZ", "gXYZ", "bXYZ"]
        .map((t) => tags.get(t)!)
        .reduce(
          (sum, t) => sum.map((v, i) => v + t.readInt32BE(8 + i * 4) / 65536),
          [0, 0, 0],
        );
      white.forEach((v, i) => expect(v).toBeCloseTo([0.9642, 1, 0.8249][i], 4));
      for (const name of ["rTRC", "gTRC", "bTRC"]) {
        const t = tags.get(name)!;
        expect(t.toString("ascii", 0, 4)).toBe("curv");
        expect(t.readUInt16BE(12)).toBe(0);
        expect(t.readUInt16BE(t.length - 2)).toBe(65535);
        for (let n = 1; n < t.readUInt32BE(8); n++)
          expect(t.readUInt16BE(12 + 2 * n)).toBeGreaterThanOrEqual(
            t.readUInt16BE(10 + 2 * n),
          );
      }
      expect(referenceMatrix(id).columns).toHaveLength(3);
      expect(standardICC(id).equals(b)).toBe(true);
    });
});
