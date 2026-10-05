export function Sources() {
  return (
    <details className="sources">
      <summary>Źródła i znaczenie wyników</summary>
      <p>
        Informacje techniczne sprawdzone 5 października 2026. Parametry
        standardów są oddzielone od praktycznych propozycji ustawień. Krótka
        seria nie mierzy pokrycia gamutu ani ΔE. Import XYZ zakłada poprawnie
        użyty kolorymetr i właściwą korekcję dla ekranu.
      </p>
      <ul>
        <li>
          <a
            href="https://www.color.org/chardata/rgb/srgb.xalter"
            target="_blank"
            rel="noreferrer"
          >
            ICC: sRGB — gamut, D65, krzywa odcinkowa i środowisko referencyjne
          </a>
        </li>
        <li>
          <a
            href="https://www.color.org/chardata/rgb/DisplayP3.xalter"
            target="_blank"
            rel="noreferrer"
          >
            ICC: Display P3 — różnica wobec kinowego P3
          </a>
        </li>
        <li>
          <a
            href="https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Adobe: specyfikacja Adobe RGB (1998)
          </a>
        </li>
        <li>
          <a
            href="https://www.itu.int/rec/R-REC-BT.709-6-201506-I/en"
            target="_blank"
            rel="noreferrer"
          >
            ITU-R BT.709
          </a>{" "}
          ·{" "}
          <a
            href="https://www.itu.int/rec/R-REC-BT.2020-2-201510-I/en"
            target="_blank"
            rel="noreferrer"
          >
            ITU-R BT.2020
          </a>
        </li>
        <li>
          <a
            href="https://www.argyllcms.com/doc/dispcal.html"
            target="_blank"
            rel="noreferrer"
          >
            ArgyllCMS: jasność, biel, gamma i ręczne ustawienia monitora
          </a>
        </li>
        <li>
          <a
            href="https://www.w3.org/TR/css-color-4/"
            target="_blank"
            rel="noreferrer"
          >
            W3C CSS Color 4: przestrzenie barw i przekształcanie kolorów w
            przeglądarce
          </a>
        </li>
        <li>
          <a
            href="https://support.apple.com/guide/mac-help/change-your-displays-color-profile-mchlf3ddc60d/mac"
            target="_blank"
            rel="noreferrer"
          >
            Apple: wybór profilu monitora i tryby referencyjne
          </a>
        </li>
        <li>
          <a
            href="https://photo.stackexchange.com/questions/52530/why-cant-one-calibrate-a-monitor-with-a-dslr-a-color-chart"
            target="_blank"
            rel="noreferrer"
          >
            Dyskusja Photo Stack Exchange: ograniczenia aparatu jako kalibratora
          </a>{" "}
          ·{" "}
          <a
            href="https://discuss.pixls.us/t/color-calibration-hardware-recommendations/516"
            target="_blank"
            rel="noreferrer"
          >
            Forum PIXLS: wybór sprzętu pomiarowego
          </a>
        </li>
        <li>
          <a
            href="https://www.color.org/chardata/rgb/DCIP3.xalter"
            target="_blank"
            rel="noreferrer"
          >
            ICC: kinowy DCI-P3 — biel, gamma 2,6 i 48 cd/m²
          </a>
        </li>
        <li>
          <a
            href="https://www.benq.com/en-us/knowledge-center/knowledge/gamma-monitor.html"
            target="_blank"
            rel="noreferrer"
          >
            BenQ: gamma 2,2 / 2,4 / 2,6 i wybór w menu monitora
          </a>
        </li>
        <li>
          <a
            href="https://tftcentral.co.uk/icc-profiles-and-monitor-calibration-settings-database"
            target="_blank"
            rel="noreferrer"
          >
            TFTCentral: kolejność ustawień OSD, ograniczenia profili i
            instrukcja Windows
          </a>
        </li>
        <li>
          <a
            href="https://www.argyllcms.com/doc/ccxxmake.html"
            target="_blank"
            rel="noreferrer"
          >
            ArgyllCMS: korekcja kolorymetru dla typu ekranu
          </a>
        </li>
      </ul>
      <p className="muted">
        Opinie na forach nie są normami. Nie powielamy dawnych cen sprzętu ani
        twierdzeń, że sam wybór profilu gwarantuje poprawne kolory.
      </p>
    </details>
  );
}
