# SaneNod

Ekosystem web/PWA + desktop ze wspólnym kontem oraz **Kalibratorem Monitora**. Infrastruktura Etapu 1 jest sprawdzona w uzgodnionym trybie testowym.

## Struktura

```text
apps/portal       Next.js: landing, pulpit, konta, PWA, parowanie, Kalibrator
apps/desktop      Electron: izolowane okno tego samego portalu
packages/ui       współdzielone komponenty
packages/auth     Better Auth, sesje, klient i bezpieczne przekierowania
database          schemat komunikacji i parowania
scripts           lokalny Postgres, migracje, projekt Vercel
tests             testy bezpieczeństwa bazy i testy przeglądarkowe
```

Node 24.19.0, pnpm 11.19.0, Turborepo. Aplikacje ekosystemu działają pod **jedną domeną**, w `/apps/<nazwa>`, i korzystają z tej samej sesji. Kolejne odrębne pakiety w `apps/` można montować przez portal. Osobne domeny wymagają później prawdziwego przepływu OIDC; sama wspólna baza nie daje SSO między domenami.

## Lokalnie

W istniejącym checkout, bez tworzenia worktree:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:migrate
pnpm --filter @sanenod/portal dev
```

Docker uruchamia Postgres na loopback:54329. `db:start` generuje lokalne dane dostępowe w ignorowanych plikach z prawami 0600 i zachowuje istniejący `.env.local`. Nie używa produkcyjnej bazy. Odtworzenie bazy wymaga zachowania `.cache/postgres.env` razem z wolumenem `sanenod-postgres-data`. `docker stop sanenod-postgres` zatrzymuje tylko ten kontener.

`pnpm dev` uruchamia portal oraz pozostałe zdefiniowane zadania developerskie. Desktop jest celowo uruchamiany osobno:

```sh
SANENOD_PORTAL_URL=http://localhost:3000 pnpm desktop:dev
```

W Windows ustaw tę zmienną składnią właściwą dla PowerShell. W produkcji użyj adresu HTTPS wdrożonego portalu. Desktop zachowuje własną sesję w trwałej partycji Electron; po jednorazowym logowaniu to samo konto działa we wszystkich aplikacjach portalu. Sesji telefonu i komputera nie kopiujemy między urządzeniami.

## Sprawdzenie

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:signup
```

Testy bazy i E2E wymagają **lokalnej, izolowanej** bazy po migracji. E2E uruchamia produkcyjny serwer Next.js i używa testowych kont z uprzednio potwierdzonym e-mailem. Nie weryfikuje rzeczywistej wysyłki poczty. `test:signup` sprawdza formularz rejestracji i logowania na serwerze developerskim (bez wysyłki poczty). Jeśli Chromium jest już zainstalowany, ustaw `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. `GET /api/health` sprawdza połączenie i obecność tabel kont oraz parowania.

## Wdrożenie i architektura

Szczegóły: [Kalibrator, model pomiarów i zweryfikowane źródła](docs/calibrator.md), [wdrożenie Vercel](docs/vercel.md), [architektura Etapu 1](docs/architecture.md).

GitHub Actions: lint, typecheck, testy PostgreSQL, build, E2E oraz uruchomienie i pakowanie Electron na Windows/macOS. Aktywna integracja GitHub–Vercel automatycznie tworzy preview gałęzi/PR oraz produkcję dla `main`. Opcjonalny workflow deploy przez Actions wymaga jawnego `DEPLOY_VIA_ACTIONS=true` i sekretów; nie uruchamiaj równolegle obu pipeline’ów.

Obecny portal jest **programem testowym**: `AUTH_TEST_MODE=true` umożliwia rejestrację bez potwierdzania e-maila i bez wysyłania poczty. Tryb jest oznaczony w interfejsie. Preview ma oddzielną bazę i sekret. Przed udostępnieniem rzeczywistym użytkownikom wyłącz ten tryb i skonfiguruj zweryfikowanego nadawcę.

Kalibrator działa pod `/apps/calibrator`: wywiad, różne nazwy ustawień OSD, wzorce, telefon jako orientacyjny czujnik RGB, wpisywanie/import XYZ z kolorymetru, historia i porównania. Pomaga regulować **ustawienia samego monitora**; ICC wybierasz ze standardowych referencji, nie z profilu wygenerowanego z kamery. Szczegóły ograniczeń i źródeł są w aplikacji oraz `docs/calibrator.md`.

`DEPLOYMENT_TEST_URL=https://sanenod.vercel.app NODE_USE_ENV_PROXY=1 node scripts/verify-deployment.mjs` sprawdza wdrożenie testowe; rejestruje własne konto tymczasowe i usuwa wyłącznie to konto przez dostęp do Vercel/Neon, jeśli jest dostępny. Nie uruchamiaj na tym wdrożeniu lokalnych testów bazy ani fixture'ów.

Kalibrator wspiera testy ustawień prowadzone równocześnie na PC i telefonie: po sparowaniu QR wybierz **Uruchom testy z telefonem**. PC pokazuje sześć wzorców, a telefon udostępnia instrukcje, pilot i lokalną analizę zaznaczonego obszaru w siatce 5×5. Wyniki kamery to tylko kody RGB; ICC pozostają gotowymi referencjami. [Metoda, ograniczenia i źródła](docs/calibrator.md#testy-ustawień-prowadzone-jednocześnie-na-telefonie-i-pc).
