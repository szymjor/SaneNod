export const uses = {
  general: "Użytek ogólny",
  photo: "Obróbka zdjęć",
  design: "Grafika / design",
  video: "Montaż wideo",
  gaming: "Gaming",
  code: "Programowanie",
  print: "Przygotowanie do druku",
} as const;
export type Use = keyof typeof uses;
export type StandardId =
  "srgb" | "adobe-rgb" | "display-p3" | "dci-p3" | "rec709" | "rec2020";
export type XYZ = [number, number, number];
export type Standard = {
  name: string;
  explanation: string;
  caution: string;
  gamma: number;
  brightness: number;
  white: "D65" | "DCI";
  xy: [number, number];
  primaries: [[number, number], [number, number], [number, number]];
  curve: "srgb" | "gamma";
};
export const standards: Record<StandardId, Standard> = {
  srgb: {
    name: "sRGB",
    explanation:
      "Standard stron WWW, większości gier i codziennych aplikacji. Najbezpieczniejszy wybór do ogólnej pracy.",
    caution: "Wybierz tryb sRGB w monitorze, jeżeli jest dostępny.",
    gamma: 2.2,
    brightness: 120,
    white: "D65",
    xy: [0.3127, 0.329],
    primaries: [
      [0.64, 0.33],
      [0.3, 0.6],
      [0.15, 0.06],
    ],
    curve: "srgb",
  },
  "adobe-rgb": {
    name: "Adobe RGB (1998)",
    explanation:
      "Szersza gama, szczególnie zieleni. Przydatna w profesjonalnej fotografii i przygotowaniu do druku.",
    caution:
      "Wymaga monitora o odpowiednim gamucie i aplikacji zarządzających kolorem. Pliki dla WWW zwykle eksportuj do sRGB.",
    gamma: 563 / 256,
    brightness: 100,
    white: "D65",
    xy: [0.3127, 0.329],
    primaries: [
      [0.64, 0.33],
      [0.21, 0.71],
      [0.15, 0.06],
    ],
    curve: "gamma",
  },
  "display-p3": {
    name: "Display P3",
    explanation:
      "Szersza gama dla nowoczesnych ekranów i grafiki cyfrowej. Biel D65, krzywa podobna do sRGB.",
    caution:
      "To nie DCI-P3: ma inną biel i krzywą. Monitor musi obsługiwać gamut P3.",
    gamma: 2.2,
    brightness: 120,
    white: "D65",
    xy: [0.3127, 0.329],
    primaries: [
      [0.68, 0.32],
      [0.265, 0.69],
      [0.15, 0.06],
    ],
    curve: "srgb",
  },
  "dci-p3": {
    name: "DCI-P3",
    explanation:
      "Standard projekcji kinowej: biel kinowa i gamma 2,6, przeznaczony do kontrolowanych warunków projekcji.",
    caution:
      "Do zwykłego ekranu P3 wybierz Display P3. Referencja kina to 48 cd/m² i ciemne otoczenie.",
    gamma: 2.6,
    brightness: 48,
    white: "DCI",
    xy: [0.314, 0.351],
    primaries: [
      [0.68, 0.32],
      [0.265, 0.69],
      [0.15, 0.06],
    ],
    curve: "gamma",
  },
  rec709: {
    name: "Rec. 709 (SDR)",
    explanation:
      "Standard materiałów HD/SDR. Ma te same barwy podstawowe co sRGB, lecz odmienny kontekst oglądania wideo.",
    caution:
      "Profil referencyjny używa gammy 2,4, przybliżenia BT.1886 dla zerowej czerni. Nie jest profilem HDR.",
    gamma: 2.4,
    brightness: 100,
    white: "D65",
    xy: [0.3127, 0.329],
    primaries: [
      [0.64, 0.33],
      [0.3, 0.6],
      [0.15, 0.06],
    ],
    curve: "gamma",
  },
  rec2020: {
    name: "Rec. 2020 (SDR)",
    explanation:
      "Bardzo szeroka gama używana jako kontener wideo UHD, także w systemach HDR. Sam gamut nie określa HDR.",
    caution:
      "Ten profil jest referencją SDR (gamma 2,4), nie PQ/HLG. Większość monitorów nie pokrywa pełnego Rec. 2020.",
    gamma: 2.4,
    brightness: 100,
    white: "D65",
    xy: [0.3127, 0.329],
    primaries: [
      [0.708, 0.292],
      [0.17, 0.797],
      [0.131, 0.046],
    ],
    curve: "gamma",
  },
};
export function recommended(use: Use): StandardId {
  return use === "print" ? "adobe-rgb" : use === "video" ? "rec709" : "srgb";
}
export function suitability(use: Use, id: StandardId) {
  const preferred = recommended(use);
  if (id === preferred) return "Dobry punkt wyjścia do wybranego zastosowania.";
  if (
    (use === "photo" && id === "adobe-rgb") ||
    (use === "design" && id === "display-p3")
  )
    return "Wybór odpowiedni, jeśli monitor i cały obieg pracy obsługują tę gamę. Do publikacji WWW przygotuj też wersję sRGB.";
  return `Dla tego zastosowania proponujemy ${standards[preferred].name}: ${standards[preferred].explanation} Inny standard wybierz świadomie, zgodnie z materiałem i możliwościami ekranu.`;
}
export type Settings = {
  use: Use;
  standard: StandardId;
  white: "D65" | "D50" | "DCI";
  brightness: number;
  gamma: number;
  ambient: "dim" | "office" | "bright";
  monitor: string;
  sensorName: string;
};
export function defaults(
  use: Use = "general",
  id = recommended(use),
): Settings {
  const s = standards[id];
  return {
    use,
    standard: id,
    white: s.white,
    brightness: s.brightness,
    gamma: s.gamma,
    ambient: "office",
    monitor: "",
    sensorName: "",
  };
}
export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") throw new Error("Brak ustawień.");
  const v = value as Settings;
  if (
    !Object.hasOwn(uses, v.use) ||
    !Object.hasOwn(standards, v.standard) ||
    !["D65", "D50", "DCI"].includes(v.white) ||
    !["dim", "office", "bright"].includes(v.ambient) ||
    !Number.isFinite(v.brightness) ||
    v.brightness < 40 ||
    v.brightness > 400 ||
    !Number.isFinite(v.gamma) ||
    v.gamma < 1.8 ||
    v.gamma > 2.8 ||
    typeof v.monitor !== "string" ||
    v.monitor.length > 120 ||
    typeof v.sensorName !== "string" ||
    v.sensorName.length > 120
  )
    throw new Error(
      "Sprawdź standard, parametry i nazwę monitora (maks. 120 znaków).",
    );
  return {
    use: v.use,
    standard: v.standard,
    white: v.white,
    brightness: v.brightness,
    gamma: v.gamma,
    ambient: v.ambient,
    monitor: v.monitor.trim(),
    sensorName: v.sensorName.trim(),
  };
}
