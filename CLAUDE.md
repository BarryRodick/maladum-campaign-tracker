# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A schema-first vanilla JS web app for tracking Maladum tabletop game campaigns. It loads character data from scanned card imports, tracks live pips (health, skill, magic, action, XP), enforces official progression rules, and provides a rules reference library. No build step, no framework, no bundler.

## Commands

### Serve the app locally (required — file:// won't work)

```
python -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173`. PowerShell wrapper: `powershell -ExecutionPolicy Bypass -File .\scripts\run-app.ps1`

### Run the smoke test

```
powershell -ExecutionPolicy Bypass -File .\scripts\run-smoke-test.ps1
```

Or directly: `python tests/smoke_test.py`

Requires `selenium` (`python -m pip install --user selenium`) and Chrome or Edge installed. Currently 20/20 checks.

## Deployment

Deployed via **GitHub Pages** from the `main` branch, served at `maladum.assisted-review.com`. No build step required — the repo root is the deploy root. GitHub Pages serves `index.html` directly.

## Architecture

**Single-page app with no build tooling.** The entire UI is rendered by `app.js` using string-template HTML injected into `#app`. State changes go through `commit()` which persists to `localStorage` and calls `render()`.

### Mobile-first swipe deck

The primary UI is a full-viewport horizontal scroll-snap deck. Each adventurer gets a `card-slide` article containing a scanned card image with percentage-based hotspot overlays. Swiping left/right switches characters. The final slide is a campaign summary page. Page dot indicators sync via a passive scroll listener (`syncPageDots()`).

### Card overlay system

Scanned character cards (2334x1692 landscape) are rendered at their native aspect ratio. Transparent hotspot buttons are positioned over the printed pip tracks using percentage coordinates defined in `TRACK_OVERLAY` and `CARD_OVERLAY` constants. Tapping a pip on the card image directly updates state.

### Rules reference

On mobile: a CSS bottom sheet (`position: fixed` + `translateY` transform + `data-state` attribute) that peeks from the bottom and slides up. On desktop (>=1080px): a sticky sidebar in a two-column grid layout.

### Data flow

1. `bootstrap()` fetches the seed JSON, merges it with any saved `localStorage` state via `sanitizeState()`, then renders
2. `sanitizeState(raw, seed)` is the central merge function — it reconciles saved state against the seed, preserving user edits while ensuring new seed fields appear
3. `commit()` saves state to `localStorage` under key `maladum-webapp-state-v2` and re-renders

### Key data files

- `imports/maladum-cards/schema-seed.json` — initial app state loaded at startup (the "seed")
- `imports/maladum-cards/card-catalog.json` — normalized card metadata with image paths
- `schemas/campaign-tracker.schema.json` — JSON Schema defining the save-state contract

### Research artifacts (under `docs/research/`)

- `maladum-progression-rules.md` / `.json` — official rulebook extract covering rank, XP, stat increases
- `maladum-profession-skills.md` / `.json` — detailed rules-card data for Marksman/Guardian/Magus/Rogue
- `maladum-profession-board-overview.md` / `.json` — combined 22-profession inventory from multiple board sheets

### UI interaction pattern

All click handlers are delegated through a single `handleClick` listener on `#app`, dispatching on `data-action` attributes. Input events (notes, search) use `handleInput`.

Key `data-action` values:

- `set-track` — tap a pip hotspot to set health/skill/magic/actions
- `set-xp` — tap an XP pip to mark experience
- `adjust-bonus` — stat increase +/- from completed XP rows (in the Progression drawer)
- `adjust-ability-level` — level up a learned skill
- `toggle-status` — toggle status effects (blessed, cursed, etc.)
- `restore-adventurer` / `restore-party` — reset ephemeral tracks
- `reset-imported` — restore seed data
- `select-reference` — open a rules entry
- `jump-page` — dot navigation between slides

### State shape

The schema has top-level keys: `campaign`, `party`, `adventurers[]`, `items[]`, `questLog[]`, `referenceLibrary`, `cardCatalog`, `imports[]`. Each adventurer has `profile`, `campaignState` (persistent: XP rows, stat increases, learned skills/spells, notes, inventory), and `trackerState` (ephemeral: current pips, status effects).

### Progression rules

Progression logic enforces the official Maladum rulebook:

- Rank derives from XP rows with at least one marked space
- Completing an XP row unlocks stat increase picks
- Rows 1-2: increase Health, Skill, or Magic by 1
- Row 3: increase any two of Health, Skill, or Magic
- Rows 4-5: increase any two statistics (including Actions)
- All increases are clamped to printed maximum potential

Key functions: `getProgressionState()`, `canIncreaseStat()`, `getDerivedRank()`, `getCompletedXpRows()`, `getTrackIncreaseCap()`

## Testing

The smoke test (`tests/smoke_test.py`) is a self-contained Selenium test that spins up its own HTTP server, launches headless Chrome/Edge, and verifies the imported-card workflow end-to-end. It uses a custom check/report pattern (not pytest) — look for `check()` calls to understand assertions.

Key selectors tested: `article.card-slide[data-adventurer-id]`, `.card-deck`, `.scan-art`, `.pip-hotspot.is-current`, `.xp-hotspot.is-marked`, `.badge-hotspot`, `.reference-detail h3`, `.entry-link`
