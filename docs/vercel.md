# Vercel — konfiguracja docelowa

Projekt **sanenod** istnieje w zespole **SaneNod** (slug `sanenod`): https://vercel.com/sanenod/sanenod. Portal: https://sanenod.vercel.app. Project ID `prj_fq3PbZQCuXaej0XAHCRz2ENvSF2v`, Org ID `team_T7AfBn4j1kIvKRiuLz4lXlSZ`. To projekt na koncie właściciela, bez limitu anonimowego wdrożenia.

Obecne wdrożenie jest programem testowym (`AUTH_TEST_MODE=true`), zgodnie z decyzją właściciela. Produkcyjny zasób Neon: `neon-teal-ladder`; preview: `sanenod-preview`. Oba schematy kont i parowania zostały przygotowane. Bazy i sekrety sesji są odrębne.

## Projekt

Po bezpiecznym udostępnieniu `VERCEL_TOKEN` w ustawieniach środowiska:

```sh
node scripts/vercel-project.mjs
```

Skrypt tworzy projekt, jeśli nie istnieje, lub używa istniejącego o zgodnym katalogu głównym. Nie nadpisuje innego projektu. Dla zespołu ustaw opcjonalnie jego niejawny w sensie organizacyjnym, ale niebędący sekretem `VERCEL_TEAM_ID`. Ustawienia projektu: Root Directory `apps/portal`, Framework Next.js, Node 24.x, instalacja `pnpm install --frozen-lockfile`, build `pnpm --filter @sanenod/portal build`. Włącz dostęp do plików poza Root Directory dla pakietów workspace. Nie włączaj równoległego automatycznego deploy Git Integration, jeśli wdraża GitHub Actions — inaczej powstaną dwa pipeline'y.

## Baza i poczta w Vercel Marketplace

Podłącz Postgres (np. Neon) i Resend. Wykorzystaj osobne bazy dla preview i production. `DATABASE_URL` musi być prawdziwym połączeniem TLS, najlepiej przez pooling dostawcy. Polecenie `DATABASE_URL=... pnpm db:migrate` wykonaj wyłącznie z wartościami wprowadzonymi przez bezpieczne ustawienia/zmienne procesu, nigdy zapisanymi w repo ani w historii poleceń. Migracji nie wykonuje build; bazy należy przygotować przed pierwszym uruchomieniem nowej wersji. Schemat jest obecnie początkowy; kolejne migracje powinny być wersjonowane i objęte kontrolą zmian.

Zmienne Vercel w obu środowiskach:

| Nazwa                  | Znaczenie                                                |
| ---------------------- | -------------------------------------------------------- |
| `DATABASE_URL`         | serwerowy URL Postgres od dostawcy                       |
| `BETTER_AUTH_SECRET`   | oddzielny losowy sekret ≥32 znaki dla każdego środowiska |
| `BETTER_AUTH_URL`      | dokładny origin HTTPS wdrożenia                          |
| `NEXT_PUBLIC_SITE_URL` | publiczny adres tego samego wdrożenia                    |
| `RESEND_API_KEY`       | klucz dostarczania e-maili                               |
| `AUTH_EMAIL_FROM`      | nadawca z potwierdzonej domeny w Resend                  |

Dla preview stabilny dedykowany origin jest najprostszy. Jeżeli używasz losowych adresów deploymentów, serwer musi wyznaczać własny origin z platformowego `VERCEL_URL` (kod robi to automatycznie, gdy brak jawnego `BETTER_AUTH_URL`). Nie kopiuj produkcyjnego origin i sekretu do preview. Potwierdzenie domeny nadawcy wymaga rekordów DNS. Można utrzymywać wszystko z panelu Vercel, ale baza i doręczanie poczty są usługami dostawców Marketplace, nie wbudowanymi funkcjami hostingu.

## GitHub Actions

Aktywna integracja GitHub–Vercel jest połączona z `szymjor/SaneNod`: gałęzie/PR dostają preview, `main` produkcję. Actions wykonuje CI i buduje instalatory desktopowe. Aktualna integracja Codex z GitHub zwracała 403 dla Secrets, Variables i reguł ochrony gałęzi; nie twierdzimy, że te ustawienia zostały zapisane.

Opcjonalna alternatywa to deploy w Actions: wyłącz automatyczne deploy w Vercel Git Integration, ustaw `DEPLOY_VIA_ACTIONS=true`, a następnie ustaw `VERCEL_TOKEN` jako sekret repo/środowisk `preview` i `production`. Ustaw `VERCEL_ORG_ID` i `VERCEL_PROJECT_ID` jako Variables; skrypt projektu wyświetla wyłącznie te identyfikatory, nigdy token. Skonfiguruj ochronę gałęzi main i zasady dostępu do środowisk. Workflow deploy działa dopiero po CI i nie wykonuje kodu z forków z sekretami.

Nie ustawiamy produkcyjnych danych w CI testowym. CI ma własny Postgres i świeży sekret. Workflow nie migruje produkcyjnej bazy automatycznie.

## Sprawdzenie po wdrożeniu

1. `/api/health` zwraca `200` i `{"status":"ok"}`.
2. W trybie testowym zarejestruj konto z adresem testowym i zaloguj się. W trybie dla rzeczywistych użytkowników dodatkowo odbierz e-mail i potwierdź adres.
3. Odśwież pulpit; konto nadal jest dostępne. Wylogowanie jednego urządzenia nie wylogowuje drugiego.
4. Na telefonie zaloguj to samo konto, zeskanuj QR z komputera, sprawdź ping/pong i zakończ połączenie.
5. Zainstaluj PWA i sprawdź ekran offline bez danych konta w cache.
6. Uruchom Electron z `SANENOD_PORTAL_URL` wskazującym HTTPS i sprawdź sesję.
7. Zweryfikuj deploy preview PR i produkcji main po przejściu CI.

Wyniki potwierdzają działanie uzgodnionej infrastruktury testowej. Przed uruchomieniem dla rzeczywistych użytkowników skonfiguruj pocztę oraz wyłącz `AUTH_TEST_MODE`; nie uznawaj testowych kont za zweryfikowane adresy.
