# Architektura Etapu 1

## Hosting i konta

Vercel hostuje portal Next.js i krótkie funkcje HTTP. Postgres jest zarządzanym dodatkiem Vercel Marketplace (np. Neon). Better Auth przechowuje tożsamości, hashe haseł i sesje w centralnej bazie. Klient nie otrzymuje hasła do bazy. `DATABASE_URL` z TLS pochodzi od dostawcy; weryfikacji certyfikatów nie wyłączamy. Pool ma limit pięciu połączeń na instancję i integrację z cyklem życia funkcji Vercel.

W produkcji rejestracja wymaga potwierdzenia e-mail; wiadomości wysyła Resend, także dostępny jako dodatek Marketplace. Brak skonfigurowanej poczty blokuje ten krok. Lokalnie rejestracja nie wymaga poczty; testy nie dowodzą dostarczenia e-maila w produkcji. Sesje trwają 7 dni i są odświeżane. Better Auth zapewnia obsługę cookies, ochronę żądań autoryzacji i weryfikację sesji po stronie serwera. Wszystkie aplikacje mają jedną domenę: cookie sesji działa dla ścieżek portalu, nie dla dowolnych obcych domen.

## Parowanie

Komputer generuje 256-bitowy token losowy, baza przechowuje tylko SHA-256. QR zawiera token we fragmencie URL; nie trafia on do parametrów zapytań HTTP ani Referer. Telefon zachowuje go tymczasowo w sessionStorage podczas logowania i usuwa po użyciu. Obie strony muszą mieć tę samą tożsamość i **różne sesje logowania**. Telefon przejmuje token atomowym UPDATE, więc dokładnie jedna próba może się udać. Kod wygasa po 5 minutach, połączenie po 30 minutach. Każda strona może zakończyć sesję.

Wiadomości `ping`, `pong`, `signal` są przesyłane przez autoryzowane żądania HTTP. Odpytywanie co 2 sekundy służy do sygnalizacji i testu połączenia. Limity ograniczają tworzenie sesji, próby przejęcia i wysyłanie wiadomości. Dostęp wymaga konkretnej sesji urządzenia i właściciela konta; samo bycie zalogowanym na to samo konto na trzecim urządzeniu nie daje dostępu. Serwer sprawdza Origin operacji zapisujących, limit wielkości JSON i expiry. Stare dane są usuwane przy tworzeniu nowych połączeń.

Na Etapie 2 kanał `signal` może negocjować WebRTC DataChannel dla ciągłego przesyłania pomiarów. WebRTC nie jest jeszcze zaimplementowany. Vercel Functions nie będzie udawać długotrwałego serwera WebSocket. WebRTC w sieciach z restrykcyjnym NAT może wymagać osobnego TURN; wybór nastąpi przy wdrażaniu komunikacji pomiarowej.

## PWA i desktop

Manifest i service worker umożliwiają instalację portalu oraz ekran offline. Service worker przechowuje tylko ekran offline i publiczne ikony, nigdy konta, tokeny, API lub pulpit. Konta i połączone urządzenia wymagają sieci. Kamera mobilna wymaga HTTPS i zgody użytkownika.

Electron wybrano dla jednolitego Chromium i przyszłej integracji z systemowymi API koloru. Tauri ma mniejszy rozmiar, ale korzysta z różnych systemowych WebView, co komplikuje powtarzalność obsługi kamery. Dostęp do zewnętrznych czujników wymaga osobnych sterowników/integracji niezależnie od tej decyzji.

Okno Electron ma sandbox, contextIsolation, brak Node w rendererze i nie udostępnia zdalnej stronie native bridge. Nawigacja jest ograniczona do portalu, nowe okna zablokowane. Kamera jest dopuszczona tylko dla tego origin; mikrofon nie jest dopuszczony. Pakowanie, podpisywanie i test fizycznej kamery na Windows/macOS wymagają tych platform. Systemowy moduł ustawień koloru zostanie zaprojektowany w Etapie 2 z wąskim, walidowanym IPC.

## Warunek wejścia do Etapu 2

1. Przejście lokalnego CI oraz testu rejestracji/logowania.
2. Utworzony projekt Vercel i odrębne bazy/sekrety dla preview oraz produkcji.
3. Dostarczony e-mail weryfikacyjny, logowanie i odświeżenie sesji w HTTPS.
4. Parowanie telefonu i komputera, wiadomość ping/pong oraz odwołanie połączenia.
5. Udany preview PR i deploy main po CI.
6. Uruchomienie Electron na Windows/macOS, logowanie i potwierdzenie uprawnień kamery.

## Granice przyszłego Kalibratora

Zwykła kamera telefonu nie jest wzorcowanym kolorymetrem. Automatyczna ekspozycja, balans bieli, charakterystyka sensora i widmo wyświetlacza uniemożliwiają obietnicę wiernych pomiarów bez charakteryzacji sprzętu. Nie przedstawimy porównań obrazowych jako pomiaru ΔE. Profil ICC opisujący urządzenie wymaga rzetelnych danych; wybór sRGB/Adobe RGB/P3 nie poszerza fizycznego gamutu monitora. Etap 2 rozdzieli tryb orientacyjny kamery i pomiary wzorcowanym czujnikiem oraz uwzględni te granice w UX.
