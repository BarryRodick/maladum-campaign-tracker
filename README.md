# Maladum Campaign Tracker

Schema-first web app prototype for tracking imported Maladum character cards. The current build is phone-first and uses the scanned cards themselves as the main UI: a compact toolbar, full-viewport swipe pages, landscape card scans with direct pip hotspots, a campaign page with team-building controls, and a rules bottom sheet.

## Current dataset

- Imported character cards: `Unger`, `Syrio`, `Artain`
- Imported companion cards: `Marksman`, `Guardian`, `Magus`, `Rogue`, `Primorist`
- Character portraits and card codes rendered from the scan import
- XP row capacities and current XP marks captured from the scanned character cards
- Rules lookup built from the imported profession and spell cards

Known scan gaps:

- `Persuasion`, `Entertainer`, and `Reflexes` do not have separate rules cards in this set, so their lookup entries are placeholders
- `Focused Energy` on the `Primorist` spell card is partially obscured by glare

## Run the prototype

Do not open `index.html` directly from disk. The app needs to be served over `http://127.0.0.1` so the module script and seed-data fetch both work correctly.

Recommended:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-app.ps1
```

Keep that terminal open, then visit `http://127.0.0.1:4173`.

Manual option:

```powershell
python -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Run the smoke test

The project includes a Python/Selenium smoke test that serves the app locally, opens it in headless Chrome or Edge, and verifies the imported-card workflow.

If Selenium is not installed yet:

```powershell
python -m pip install --user selenium
```

Run the test:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-smoke-test.ps1
```

## Current prototype

- Loads the app state from `imports/maladum-cards/schema-seed.json`
- Uses `schemas/campaign-tracker.schema.json` as the save-state contract
- Renders the imported cards in a full-viewport swipe deck instead of a generic dashboard
- Tracks the whole roster, not just the current active party, by keeping active and reserve members in the same saved team state
- Keeps the card scans in their native landscape aspect ratio so the printed pips align with the overlay
- Tracks live health, skill, magic, action, and XP pips by tapping the printed circles on the scans
- Uses the card's blank lower-right area as a progression dock for row-completion stat rewards and learned skill levels
- Shows the printed starting badge as a hotspot and keeps later learned skills or spells in the same on-card progression dock
- Adds a dedicated campaign swipe page for quest, stash, renown, delay, notes, and team-building
- Allows profession assignment per adventurer from the campaign page
- Allows active versus reserve roster management so the whole team can be tracked over time
- Opens the rules library in a bottom sheet on mobile and a sticky sidebar on desktop
- Searches a local lookup library across imported skills, spells, and abilities
- Saves the full schema state to `localStorage`
- Supports JSON import and export of the saved schema state

## Main files

- `index.html`
- `styles.css`
- `app.js`
- `app-data.js`
- `imports/maladum-cards/schema-seed.json`
- `imports/maladum-cards/card-catalog.json`
- `schemas/campaign-tracker.schema.json`
- `scripts/run-app.ps1`
- `scripts/run-smoke-test.ps1`
- `tests/smoke_test.py`
- `docs/specs/character-card-focus.md`
- `docs/specs/mvp.md`
- `docs/specs/card-catalog-structure.md`

## Notes

- The schema now allows variable-length XP rows so it can match the real printed character cards.
- The imported seed still starts with profession placeholders, but the app now lets you assign professions from the team-builder UI.
- Relative asset paths are used inside the seed and catalog so the dataset works when served locally from the project root.
- The current overlay calibration is tuned to the imported Maladum scans and assumes the same printed layout across this first card set.
- Stat increases are now gated by completed XP rows in line with the rulebook.
- The current recruit flow can add newly imported character templates to the tracked roster; it does not yet support arbitrary manual card creation.
- Full mandatory XP allocation into class-board skills and spell choices is still pending because the imported character set does not yet include enough structured profession/class-board ownership data.
