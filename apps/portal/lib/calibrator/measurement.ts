import { standards, type Settings, type XYZ } from "./standards";
export const patches = [
  { id: "black", name: "Czerń", rgb: [0, 0, 0] },
  ...[0.05, 0.1, 0.25, 0.5, 0.75].map((v) => ({
    id: `gray-${v * 100}`,
    name: `Szarość ${v * 100}%`,
    rgb: [v, v, v],
  })),
  { id: "white", name: "Biel", rgb: [1, 1, 1] },
  { id: "red", name: "Czerwień", rgb: [1, 0, 0] },
  { id: "green", name: "Zieleń", rgb: [0, 1, 0] },
  { id: "blue", name: "Niebieski", rgb: [0, 0, 1] },
] as const;
export type Sensor = "camera" | "external";
export type Reading = {
  patch: string;
  values: XYZ;
  clipped?: number;
  spread?: number;
  camera?: string;
};
export function validateReading(
  value: unknown,
  sensor: Sensor,
  index: number,
): Reading {
  const r = value as Reading;
  if (
    !r ||
    r.patch !== patches[index]?.id ||
    !Array.isArray(r.values) ||
    r.values.length !== 3 ||
    r.values.some(
      (v) =>
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > (sensor === "camera" ? 255 : 10000),
    )
  )
    throw new Error(
      "Pomiar nie pasuje do wzorca lub ma nieprawidłowe wartości.",
    );
  if (sensor === "external" && r.values[1] <= 0 && r.patch !== "black")
    throw new Error("Luminancja Y musi być dodatnia.");
  if (
    sensor === "camera" &&
    (typeof r.clipped !== "number" ||
      !Number.isFinite(r.clipped) ||
      r.clipped < 0 ||
      r.clipped > 1 ||
      typeof r.spread !== "number" ||
      !Number.isFinite(r.spread) ||
      r.spread < 0 ||
      r.spread > 255)
  )
    throw new Error("Brak informacji o jakości próbki kamery.");
  return {
    patch: r.patch,
    values: [...r.values] as XYZ,
    ...(sensor === "camera"
      ? {
          clipped: r.clipped,
          spread: r.spread,
          camera: typeof r.camera === "string" ? r.camera.slice(0, 300) : "",
        }
      : {}),
  };
}
export function parseCSV(text: string): Reading[] {
  if (text.length > 20000) throw new Error("Plik jest zbyt duży.");
  const lines = text
    .trim()
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  if (lines.shift()?.trim().toLowerCase() !== "patch,x,y,z")
    throw new Error("Nagłówek CSV musi mieć postać patch,X,Y,Z.");
  if (lines.length !== patches.length)
    throw new Error(
      `Potrzeba ${patches.length} pomiarów w kolejności wzorców.`,
    );
  return lines.map((line, index) => {
    const parts = line.split(",").map((v) => v.trim());
    if (
      parts.length !== 4 ||
      parts
        .slice(1)
        .some((v) => !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v))
    )
      throw new Error(
        `Nieprawidłowy wiersz ${index + 2}. Użyj kropki dziesiętnej i jednostek cd/m².`,
      );
    return validateReading(
      { patch: parts[0], values: parts.slice(1).map(Number) },
      "external",
      index,
    );
  });
}
export function analyze(
  readings: Reading[],
  sensor: Sensor,
  settings: Settings,
) {
  if (sensor === "camera") {
    const bad = readings.filter(
      (r) => (r.clipped ?? 0) > 0.02 || (r.spread ?? 0) > 30,
    );
    return {
      kind: "relative" as const,
      brightness: null,
      gamma: null,
      whiteXY: null,
      advice: [
        "Kamera daje tylko orientacyjne próbki RGB. Nie wyznaczamy z nich cd/m², punktu bieli ani dokładności kolorów.",
        ...(bad.length
          ? [
              `${bad.length} próbek ma prześwietlenia lub niejednorodny kadr. Zmniejsz ekspozycję, wycentruj telefon i powtórz pomiar.`,
            ]
          : [
              "Porównuj serie tylko przy niezmienionej ekspozycji, balansie bieli, pozycji telefonu i świetle otoczenia.",
            ]),
        "Ustaw jasność komfortową dla otoczenia, a biel/gammę według trybu monitora. Wynik zweryfikuj kolorymetrem, jeśli potrzebujesz dokładności.",
      ],
    };
  }
  const white = readings.find((r) => r.patch === "white")?.values;
  const black = readings.find((r) => r.patch === "black")?.values[1] ?? 0;
  const gray = readings.find((r) => r.patch === "gray-50")?.values[1];
  const sum = white?.reduce((a, b) => a + b, 0) ?? 0;
  const xy = white && sum > 0 ? [white[0] / sum, white[1] / sum] : null;
  const ratio =
    white && gray !== undefined ? (gray - black) / (white[1] - black) : 0;
  const gamma = ratio > 0 && ratio < 1 ? Math.log(ratio) / Math.log(0.5) : null;
  const target =
    settings.white === "D50"
      ? [0.3457, 0.3585]
      : settings.white === "DCI"
        ? [0.314, 0.351]
        : [0.3127, 0.329];
  const advice = [];
  if (white)
    advice.push(
      Math.abs(white[1] - settings.brightness) <= settings.brightness * 0.05
        ? "Jasność bieli jest w granicach 5% celu."
        : `Jasność bieli: ${white[1].toFixed(1)} cd/m². ${white[1] > settings.brightness ? "Zmniejsz" : "Zwiększ"} jasność w menu monitora do okolic ${settings.brightness} cd/m².`,
    );
  if (xy)
    advice.push(
      Math.hypot(xy[0] - target[0], xy[1] - target[1]) <= 0.005
        ? "Chromatyczność bieli jest blisko wybranego celu (odległość xy ≤ 0,005)."
        : `Biel xy = ${xy.map((v) => v.toFixed(4)).join(", ")}; cel ${target.join(", ")}. Zmień temperaturę lub wzmocnienia RGB w menu monitora i zmierz ponownie. Nie da się wyznaczyć kierunku każdego suwaka bez pomiaru jego odpowiedzi.`,
    );
  if (gamma !== null)
    advice.push(
      `Efektywna gamma z szarości 50%: ${gamma.toFixed(2)}. Cel ustawień: ${settings.gamma.toFixed(2)}. Sprawdź ustawienie gammy i powtórz pełną serię; to oszacowanie w jednym punkcie, nie dopasowanie krzywej.`,
    );
  else
    advice.push(
      "Nie można oszacować gammy: sprawdź czerń, biel i pomiar szarości 50%.",
    );
  if (standards[settings.standard].curve === "srgb")
    advice.push(
      "Krzywa sRGB nie jest czystą potęgą 2,2. Gamma z jednego punktu służy orientacji.",
    );
  return {
    kind: "absolute" as const,
    brightness: white?.[1] ?? null,
    gamma,
    whiteXY: xy,
    advice,
  };
}
// Central 20% crop, channel means, clipping fraction, spatial spread. No image is uploaded.
export function summarizePixels(data: Uint8ClampedArray): {
  values: XYZ;
  clipped: number;
  spread: number;
} {
  if (!data.length || data.length % 4) throw new Error("Brak klatki kamery.");
  const sums = [0, 0, 0],
    squares = [0, 0, 0];
  let clipped = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      sums[c] += data[i + c];
      squares[c] += data[i + c] ** 2;
    }
    if (data[i] >= 250 || data[i + 1] >= 250 || data[i + 2] >= 250) clipped++;
  }
  const values = sums.map((v) => v / count) as XYZ;
  return {
    values,
    clipped: clipped / count,
    spread: Math.max(
      ...squares.map((v, i) =>
        Math.sqrt(Math.max(0, v / count - values[i] ** 2)),
      ),
    ),
  };
}
