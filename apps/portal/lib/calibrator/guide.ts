import { summarizePixels } from "./measurement";
export const guideTests = [
  {
    id: "shadows",
    task: "Patrząc na monitor, sprawdź, czy ciemne pola odróżniają się od czarnego tła.",
    name: "Rozróżnij ciemne tony",
    short: "Cienie",
    levels: [0, 5, 10, 15, 20, 25, 30],
    instruction:
      "Spójrz bezpośrednio na monitor. Ciemne pola powinny stopniowo odróżniać się od czarnego tła; najciemniejsze mogą być trudne do zauważenia. Nie rozjaśniaj wszystkich cieni tylko po to, by aparat zobaczył pierwszy pasek.",
    controls:
      "Black Level / Poziom czerni / Brightness (w niektórych modelach) · Shadow Boost / Black Equalizer / Black Stabilizer pozostaw neutralne.",
    help: "Jeśli kilka pól zlewa się, sprawdź zgodność zakresu RGB karty i monitora (pełny / ograniczony). Nasz wzorzec używa kodów 0–255. Nie ustawiaj zakresu na podstawie samych nazw: Auto bywa poprawne.",
    camera:
      "Kamera może gubić cienie lub je rozjaśniać. O rozróżnialności pól zdecyduj patrząc na ekran.",
  },
  {
    id: "highlights",
    task: "Sprawdź oczami, czy jasne pola się nie zlewają. W razie potrzeby obniż kontrast.",
    name: "Zachowaj jasne szczegóły",
    short: "Jasne tony",
    levels: [225, 230, 235, 240, 245, 250, 255],
    instruction:
      "Na białym tle szukaj różnic między jasnymi polami. Zacznij od fabrycznego kontrastu. Jeśli kilka jasnych pól zlewa się na monitorze, obniż kontrast małymi krokami i sprawdź ponownie.",
    controls:
      "Contrast / Kontrast · Color Contrast / RGB Contrast (jeśli dostępne). Do komfortowej jasności użyj Backlight / Luminance, nie samego kontrastu.",
    help: "Przepalona kamera nie dowodzi obcięcia bieli w monitorze. Zmniejsz ekspozycję telefonu, jeśli duża część kadru osiąga maksymalne wartości.",
    camera:
      "Patrz na ekran. Odczyt prześwietlenia dotyczy kamery, a nie zakresu tonalnego monitora.",
  },
  {
    id: "white",
    task: "Ustaw wygodną jasność i wybierz w menu monitora punkt bieli z wywiadu.",
    name: "Ustaw komfortową biel",
    short: "Biel",
    levels: [255],
    instruction:
      "Dopasuj jasność do otoczenia, bez odblasków. Wybierz punkt bieli z wywiadu w menu monitora. D65 bywa nazwane 6500K, Normal lub User, lecz nazwy presetów nie gwarantują zgodności.",
    controls:
      "Brightness / Backlight / Luminance / OLED Pixel Brightness · Color Temperature / White Point / Warm / Normal / Cool · R/G/B Gain / RGB High / Custom Color.",
    help: "Telefon nie podaje wiarygodnej temperatury bieli ani cd/m². Zmiana balansu bieli aparatu może ukryć zafarb. Zablokuj dostępne automatyki na tym wzorcu przed porównaniem; właściwy cel potwierdza kolorymetr.",
    camera:
      "Obserwuj zapis RGB i prześwietlenia. Nie wyrównuj kanałów monitora do równych RGB telefonu.",
  },
  {
    id: "uniform",
    task: "Szukaj plam na szarym tle monitora. Telefonem porównasz fragmenty jednego kadru.",
    name: "Sprawdź jednolite szare tło",
    short: "Jednolitość",
    levels: [128],
    instruction:
      "Sprawdź, czy na szarym tle widzisz plamy albo ciemniejsze krawędzie. Telefon ustaw prostopadle; zaznacz ekran bez ramek, menu i otoczenia. Siatka porównuje fragmenty tej samej klatki.",
    controls:
      "Uniformity Compensation / Digital Uniformity Equalizer / DUE / Uniformity (jeśli model ma tę funkcję).",
    help: "Mapa pokazuje różnice kodów RGB kamery, nie równomierność luminancji w procentach ani ΔE. Winietowanie obiektywu, odblaski, perspektywa i obróbka telefonu też tworzą plamy. Powtórz po zmianie położenia telefonu, zanim ocenisz monitor.",
    camera:
      "Na telefonie obrysuj ekran w podglądzie. Porównuj siatkę 5×5 z własną obserwacją.",
  },
  {
    id: "black",
    task: "Obejrzyj plamy i poświaty na monitorze z normalnej pozycji pracy.",
    name: "Obejrzyj czerń bez podbijania zdjęcia",
    short: "Czerń",
    levels: [0],
    instruction:
      "Spójrz na czarny ekran w typowych warunkach pracy. Sprawdź poświaty przy krawędziach i plamy. Zmień nieco kąt patrzenia: poświata zależna od kąta może być cechą panelu, a nie usterką.",
    controls:
      "Local Dimming / Lokalne przyciemnianie / Dynamic Contrast / DCR / ASCR / SmartContrast. Zapisz stan tych funkcji; zmieniają obraz testowy.",
    help: "Automatyczna ekspozycja mocno rozjaśnia czerń. Ten test nie mierzy kontrastu ani nie rozstrzyga, czy to bleed, glow lub clouding. Na OLED pełna czerń może wygasić piksele; biały interfejs nadal wpływa na kadr.",
    camera:
      "Utrzymaj ekspozycję jak poprzednio. Mapa może ujawnić plamy, ale nie wyznacza poziomu czerni monitora.",
  },
  {
    id: "gradient",
    task: "Szukaj wyraźnych pasów lub zafarbu w przejściu od czerni do bieli.",
    name: "Sprawdź płynność przejść",
    short: "Gradient",
    levels: [],
    instruction:
      "Obejrzyj przejście od czerni do bieli. Szukaj wyraźnych pasów i niepożądanego zafarbu. Wybierz gammę zgodną z celem wywiadu; numer Gamma 1/2/3 wymaga instrukcji modelu.",
    controls:
      "Gamma / Gamma Mode / Tone Response / EOTF · Picture Mode / Color Mode. Wyłącz wyostrzanie i ulepszacze obrazu na czas porównania.",
    help: "To 256 poziomów sRGB, nie test 10-bit ani pomiar gammy. Pasma może tworzyć monitor, przeglądarka, profil systemowy lub aparat. Zdjęcie JPEG i mora nie pozwalają policzyć bitów panelu.",
    camera:
      "Przede wszystkim oceń gradient wzrokowo. Kod RGB z kamery nie jest pomiarem krzywej monitora.",
  },
] as const;
export type GuideTest = (typeof guideTests)[number]["id"];
export type Region = { x: number; y: number; width: number; height: number };
export type GridReading = {
  cells: number[];
  values: [number, number, number];
  clipped: number;
  spread: number;
  locked: boolean;
};
export type GuideState = {
  pairing_id: string;
  test: GuideTest | null;
  revision: string;
  reading: GridReading | null;
  reading_at: string | null;
  observations: Partial<Record<GuideTest, string>>;
};
export const defaultRegion: Region = {
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
};
export function validTest(value: unknown): value is GuideTest {
  return guideTests.some((t) => t.id === value);
}
export function validateGrid(value: unknown): GridReading {
  const v = value as GridReading;
  if (
    !v ||
    !Array.isArray(v.cells) ||
    v.cells.length !== 25 ||
    !Array.isArray(v.values) ||
    v.values.length !== 3 ||
    [...v.cells, ...v.values, v.spread].some(
      (n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 255,
    ) ||
    typeof v.clipped !== "number" ||
    !Number.isFinite(v.clipped) ||
    v.clipped < 0 ||
    v.clipped > 1 ||
    typeof v.locked !== "boolean"
  )
    throw new Error("Nieprawidłowe dane kamery.");
  return {
    cells: [...v.cells],
    values: [...v.values],
    clipped: v.clipped,
    spread: v.spread,
    locked: v.locked,
  };
}
// Camera code values only. No sRGB inverse transfer or RGB→XYZ conversion.
export function summarizeGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  locked: boolean,
): GridReading {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 5 ||
    height < 5 ||
    width * height * 4 !== data.length
  )
    throw new Error("Nieprawidłowy rozmiar klatki.");
  const sums = Array<number>(25).fill(0),
    counts = Array<number>(25).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4,
        cell = Math.floor((y * 5) / height) * 5 + Math.floor((x * 5) / width);
      sums[cell] += (data[index] + data[index + 1] + data[index + 2]) / 3;
      counts[cell]++;
    }
  return {
    ...summarizePixels(data),
    cells: sums.map((n, i) => n / counts[i]),
    locked,
  };
}
export function guideCSV(state: GuideState): string {
  const quoted = (v: string) =>
    `"${(/^[=+@\-\t\r]/.test(v) ? "'" : "") + v.replaceAll('"', '""')}"`;
  return (
    "test,obserwacja\r\n" +
    guideTests
      .map((t) => `${t.id},${quoted(state.observations[t.id] ?? "")}`)
      .join("\r\n") +
    "\r\n\r\n" +
    "Dane kamery: kody RGB 0-255; nie luminancja monitora\r\n" +
    "wiersz,kolumna,srednia_RGB,roznica_od_srodka\r\n" +
    (state.reading?.cells
      .map(
        (v, i) =>
          `${Math.floor(i / 5) + 1},${(i % 5) + 1},${v.toFixed(2)},${(v - state.reading!.cells[12]).toFixed(2)}`,
      )
      .join("\r\n") ?? "")
  );
}
