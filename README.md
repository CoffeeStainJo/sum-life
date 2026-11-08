# Sum Life

A minimal, mobile-first food journal PWA. Scan a barcode or search Open Food Facts, confirm the
nutrition figures, and log it. Only today (and yesterday, for copying) is ever kept, all in
`localStorage`. No accounts, no backend.

## Stack

- React 19 + TypeScript, built with Vite
- Plain CSS (dark theme), icons from `lucide-react`
- The browser's built-in `BarcodeDetector` for EAN/UPC scanning where available, with `@zxing/library`
  in a Web Worker as the fallback
- Open Food Facts REST API (no key needed)
- `vite-plugin-pwa` (Workbox) for the manifest and service worker

## Scripts

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Dev server on http://localhost:5173 (camera works on this PC) |
| `npm run dev:https` | Same, over HTTPS with a self-signed cert, for testing on a phone |
| `npm test`          | Vitest unit tests for storage, dates, nutrition and OFF parsing |
| `npm run typecheck` | `tsc` over app and config                                       |
| `npm run build`     | Typecheck + production build into `dist/`                       |
| `npm run preview`   | Serve the production build                                      |
| `npm run icons`     | Regenerate `public/icons/*` from `scripts/generate-icons.mjs`  |

## Testing on an iPhone

Safari only exposes the camera on secure origins, so a plain `http://<lan-ip>:5173` URL will not
work from the phone.

1. Run `npm run dev:https` and note the `Network:` URL Vite prints (e.g. `https://192.168.1.20:5173`).
2. Open that URL in Safari on the phone. Accept the self-signed certificate warning
   (*Show Details* → *visit this website*).
3. Tap *Share* → *Add to Home Screen* to run it as a standalone app. Camera permission is asked the
   first time you open the *Scan* tab. If you deny it, the scanner shows a manual barcode field and
   you can re-enable the camera under *Settings → Safari → Camera*.

The production build (`npm run build` → `dist/`) is fully static. Host it on any HTTPS static host
and it installs as a PWA.

## How it works

```
src/
  types.ts                  FoodItem, JournalEntry, DailyLog, MealType
  lib/
    dates.ts                Local-time YYYY-MM-DD keys for today / yesterday
    storage.ts              One localStorage key per date; prunes anything older than yesterday
    openFoodFacts.ts        Barcode + text search, nutriment parsing (per 100 g and per serving)
    nutrition.ts            Serving maths, totals, clamping
    feedback.ts             Beep (WebAudio) + vibrate on scan
    scanning.ts             Reticle → video crop geometry, read confirmation
    barcodeDecoder.ts       Native BarcodeDetector, or zxing in a Web Worker
    zxingDecode.ts          zxing decode of RGBA pixels (runs in workers/barcode.worker.ts)
    meals.ts, errors.ts, id.ts
  hooks/
    useDailyJournal.ts      Loads today + yesterday, persists edits, handles midnight rollover
    useFoodSearch.ts        Debounced, abortable OFF text search
    useBarcodeLookup.ts     Barcode → FoodCandidate
  components/
    SummaryBar.tsx          Day summary: big kcal total + protein/carbs/fat energy split
    MealSection.tsx         One card per meal; EntryRow.tsx has the serving stepper + delete
    CopyYesterdayButton.tsx Shown only when today is empty and yesterday is not
    AddFoodDrawer.tsx       Bottom sheet with Search and Scan tabs
    FoodSearchTab.tsx       Search results + "enter manually"
    BarcodeScanner.tsx      Camera (auto-starts, freezes on capture), permission fallbacks, manual entry
    FoodConfirmForm.tsx     Review/edit figures, pick basis, amount (grams or servings) and meal
```

Logging by weight:

- Every food can carry a serving weight in grams (`servingGrams`). Open Food Facts fills it from the
  product's serving quantity or 100 g; manual entries default to per-100 g figures so you can type
  what the scale says.
- The amount can be entered and later adjusted in grams or in servings. Grams is the default when the
  figures are per 100 g. Under the hood every entry stores a servings multiplier, so older entries
  without a weight keep working and simply stay in servings.

Storage rules:

- Journals are stored under `sumlife:log:<YYYY-MM-DD>`.
- On load, on focus, on tab visibility change and once a minute, the app checks the date. If the
  day has rolled over it reloads and prunes every key that is not today or yesterday.
- Corrupt or partially valid data is sanitised on read; bad entries are dropped rather than crashing.

Open Food Facts notes:

- Nutrients are read per 100 g. When the product has a `serving_quantity`, a per-serving figure is
  derived and offered as the default basis; you can switch to per 100 g in the confirm form.
- Products with no nutrition data are hidden from search. Missing individual macros default to 0
  and are flagged so you can fill them in.
- Lookups are cached by the service worker (network-first, 7 days) so recently scanned products
  still resolve offline.

## Out of scope

Authentication, cloud sync, water/exercise tracking, recipes, fasting timers and multi-day history
are intentionally not included.
