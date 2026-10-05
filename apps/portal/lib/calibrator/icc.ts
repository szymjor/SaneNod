import { standards, type StandardId, type XYZ } from "./standards";
type Matrix = [XYZ, XYZ, XYZ];
const D50: XYZ = [0.9642, 1, 0.8249];
const bradford: Matrix = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];
const mul = (m: Matrix, v: XYZ) =>
  m.map((row) => row.reduce((a, x, i) => a + x * v[i], 0)) as XYZ;
function inverse(m: Matrix): Matrix {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-10) throw new Error("Invalid reference primaries");
  return [
    [e * i - f * h, c * h - b * i, b * f - c * e],
    [f * g - d * i, a * i - c * g, c * d - a * f],
    [d * h - e * g, b * g - a * h, a * e - b * d],
  ].map((row) => row.map((v) => v / det)) as Matrix;
}
const xyz = (x: number, y: number): XYZ => [x / y, 1, (1 - x - y) / y];
export function referenceMatrix(id: StandardId) {
  const s = standards[id],
    white = xyz(...s.xy);
  const p = s.primaries.map((v) => xyz(...v));
  const matrix = p[0].map((_, i) => p.map((v) => v[i])) as Matrix;
  const scale = mul(inverse(matrix), white);
  const src = mul(bradford, white),
    dst = mul(bradford, D50),
    inv = inverse(bradford);
  const adapt = (v: XYZ) =>
    mul(inv, mul(bradford, v).map((n, i) => (n * dst[i]) / src[i]) as XYZ);
  return {
    columns: p.map((v, i) => adapt(v.map((n) => n * scale[i]) as XYZ)),
    adaptation: ([0, 1, 2] as const)
      .map((c) => adapt([c === 0 ? 1 : 0, c === 1 ? 1 : 0, c === 2 ? 1 : 0]))
      .map((_, i, cols) => cols.map((v) => v[i])) as Matrix,
  };
}
const fixed = (b: Buffer, offset: number, v: number) =>
  b.writeInt32BE(Math.round(v * 65536), offset);
const ascii = (b: Buffer, offset: number, s: string) =>
  b.write(s, offset, "ascii");
function xyzTag(v: XYZ) {
  const b = Buffer.alloc(20);
  ascii(b, 0, "XYZ ");
  v.forEach((x, i) => fixed(b, 8 + i * 4, x));
  return b;
}
function description(s: string) {
  const text = Buffer.from(s + "\0", "ascii"),
    b = Buffer.alloc(12 + text.length + 78);
  ascii(b, 0, "desc");
  b.writeUInt32BE(text.length, 8);
  text.copy(b, 12);
  return b;
}
function curve(id: StandardId) {
  const s = standards[id],
    b = Buffer.alloc(12 + 1024 * 2);
  ascii(b, 0, "curv");
  b.writeUInt32BE(1024, 8);
  for (let i = 0; i < 1024; i++) {
    const v = i / 1023;
    const y =
      s.curve === "srgb"
        ? v <= 0.04045
          ? v / 12.92
          : ((v + 0.055) / 1.055) ** 2.4
        : v ** s.gamma;
    b.writeUInt16BE(Math.round(y * 65535), 12 + i * 2);
  }
  return b;
}
/** ICC v2 RGB matrix/TRC reference. Describes a standard, never a measured monitor. */
export function standardICC(id: StandardId): Buffer {
  const { columns, adaptation } = referenceMatrix(id);
  const chad = Buffer.alloc(44);
  ascii(chad, 0, "sf32");
  adaptation.flat().forEach((v, i) => fixed(chad, 8 + i * 4, v));
  const copy = Buffer.from(
    "text\0\0\0\0SaneNod reference profile; no device characterization.\0",
    "ascii",
  );
  const tags: [string, Buffer][] = [
    ["desc", description(`SaneNod ${id} reference SDR`)],
    ["cprt", copy],
    ["wtpt", xyzTag(D50)],
    ["bkpt", xyzTag([0, 0, 0])],
    ["chad", chad],
    ...["r", "g", "b"].flatMap(
      (c, i) =>
        [
          [c + "XYZ", xyzTag(columns[i])],
          [c + "TRC", curve(id)],
        ] as [string, Buffer][],
    ),
  ];
  let offset = 132 + tags.length * 12;
  const size =
      offset + tags.reduce((n, [, b]) => n + Math.ceil(b.length / 4) * 4, 0),
    out = Buffer.alloc(size);
  out.writeUInt32BE(size, 0);
  ascii(out, 4, "SNod");
  out.writeUInt32BE(0x02400000, 8);
  ascii(out, 12, "mntr");
  ascii(out, 16, "RGB ");
  ascii(out, 20, "XYZ ");
  [2026, 1, 1, 0, 0, 0].forEach((v, i) => out.writeUInt16BE(v, 24 + i * 2));
  ascii(out, 36, "acsp");
  ascii(out, 40, "MSFT");
  out.writeUInt32BE(1, 64);
  D50.forEach((v, i) => fixed(out, 68 + i * 4, v));
  ascii(out, 80, "SNod");
  out.writeUInt32BE(tags.length, 128);
  tags.forEach(([signature, b], i) => {
    ascii(out, 132 + i * 12, signature);
    out.writeUInt32BE(offset, 136 + i * 12);
    out.writeUInt32BE(b.length, 140 + i * 12);
    b.copy(out, offset);
    offset += Math.ceil(b.length / 4) * 4;
  });
  return out;
}
