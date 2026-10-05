export const controls = [
  {
    title: "1. Przygotuj ekran",
    names:
      "Preset / Picture Mode / Tryb obrazu / Color Space / Gamut / Professional / Creator / Standard",
    help: "Wybierz tryb zgodny z celem. Rozgrzej monitor około 30 minut. Na czas pomiarów wyłącz HDR, Night Shift / Night Light, filtr niebieskiego światła, automatyczną jasność, oszczędzanie energii i dynamiczny kontrast. Po kalibracji zmiana tych funkcji zmienia wynik.",
    extra:
      "Nazwy funkcji: Eco / Smart Energy Saving / Ambient Light Sensor / Auto Brightness / Dynamic Contrast / DCR / ASCR / SmartContrast / Black Equalizer. Przeglądarka i aktywny profil systemowy nadal mogą przekształcać wzorce.",
  },
  {
    title: "2. Dopasuj jasność",
    names:
      "Jasność / Brightness / Backlight / Podświetlenie / Luminance / OLED Pixel Brightness / OLED Light",
    help: "Reguluj przede wszystkim moc podświetlenia lub jasność pikseli. Kolorymetr pozwala porównać cd/m² z celem; kamera tego nie mierzy. Przy mocnym świetle najpierw ogranicz odblaski.",
    extra:
      "W części ekranów Brightness zmienia poziom czerni, a Backlight moc podświetlenia. Sprawdź efekt regulacji w instrukcji swojego modelu.",
  },
  {
    title: "3. Sprawdź kontrast i cienie",
    names:
      "Kontrast / Contrast / Black Level / Poziom czerni / Shadow Detail / Black Stabilizer",
    help: "Zacznij od fabrycznego kontrastu. Na skali szarości rozróżniaj jasne i ciemne pola, bez zlewania sąsiednich stopni. Nadmierny kontrast może obcinać jasne tony. Nie wyrównuj koloru funkcją rozjaśniania cieni.",
    extra:
      "Black Equalizer / Shadow Boost / Black Stabilizer zmieniają cienie. Zostaw je neutralne w pracy z kolorem. Obcięcie w obrazie kamery nie dowodzi obcięcia w monitorze.",
  },
  {
    title: "4. Ustaw biel",
    names:
      "Color Temperature / Temperatura barwowa / White Point / Punkt bieli / Warm / Normal / Cool / 6500K / User / Custom Color",
    help: "D65 jest typowym celem pracy z ekranem; 6500K to przybliżona nazwa ustawienia, nie dowód zgodności chromatyczności. D50 bywa używane przy ocenie druku w odpowiednim oświetleniu. Sprawdź wynik kolorymetrem.",
    extra:
      "Gdy preset nie wystarcza, szukaj R/G/B Gain / RGB Gain / Wzmocnienie RGB / Color Gain / RGB High / Custom RGB / User Color / Color Control. Zmieniaj jeden kanał małymi krokami i mierz ponownie.",
  },
  {
    title: "5. Dopasuj gammę",
    names:
      "Gamma / Gamma Mode / Gamma 1–5 / Tone Response / EOTF / Black Gamma",
    help: "Wybierz cel wywiadu i sprawdź półtony. Numery Gamma 1/2/3 nie oznaczają jednakowych wartości u różnych producentów; potrzebna jest instrukcja modelu lub pomiar.",
    extra:
      "RGB Offset / Bias / Cutoff / RGB Low reguluje głównie ciemne odcienie, a Gain jasne. Nie używaj Offset zamiast Gain do ogólnego ustawiania bieli. Przykład z dokumentacji BenQ SW/PD: Color Mode → Custom Mode → Gamma; menu Twojego modelu może wyglądać inaczej.",
  },
] as const;
