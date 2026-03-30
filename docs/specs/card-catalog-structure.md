# Card Catalog Structure

## Goal

Store imported card scans in a reusable form without mixing raw files, normalized card definitions, and live campaign state.

## Current Design

The project now uses two complementary JSON files:

1. `imports/maladum-cards/card-catalog.json`
   Normalized card import metadata and card templates.
2. `imports/maladum-cards/schema-seed.json`
   A schema-valid campaign seed that uses those cards as the starting party and rules library.

## Catalog Layers

### 1. `assets`

Raw imported file metadata.

This layer holds:

- renamed filenames
- relative local paths
- preview image paths
- import category
- normalized card ids

### 2. `characterCards`

Normalized character-card definitions.

This layer holds:

- `id`
- `name`
- `cardCode`
- `species`
- `startingBadge`
- `trackTemplate`
- `effectSlots`
- `sourceAssetIds`

`trackTemplate` stores printed card values, not live state:

- `health`
- `skill`
- `magic`
- `actions`
- `xpRowCapacities`

Important change:

- `xpRowCapacities` is now treated as variable-length because the scanned cards use different row layouts

### 3. `referenceCards`

Normalized profession, spell, or rules cards.

This layer holds:

- `id`
- `name`
- `kind`
- `abilities`
- `sourceAssetIds`

This is the stable source for card identity. The richer, searchable rules text used by the app lives in `schema-seed.json` under `referenceLibrary`.

## Why The Split Works

- Scanner filenames are not stable identifiers
- The same card can be rescanned later without changing the canonical id
- Campaign saves should point at normalized card ids, not one specific PDF
- Live quest pips belong in `trackerState`, not in the catalog
- The app can render portraits and card codes from the catalog while reading campaign progress from the seed or saved state

## Overlay UI Note

The current web app uses the scanned character cards as the interactive surface.

Right now that means:

- printed track circles are mapped to overlay hotspots in the app layer
- printed XP rows are mapped to overlay hotspots in the app layer
- the blank lower-right effect area is reused as the on-card progression dock
- the starting badge area is mapped as a rules hotspot
- the calibrated layout assumes the imported card scans stay in their native landscape aspect ratio

Those overlay positions are currently calibrated against the imported Maladum scans in code. If we generalize this importer later, those coordinates can move into catalog metadata without changing the live campaign schema.

## Seed Relationship

`schema-seed.json` combines:

- `campaign`
- `party`
- `adventurers`
- `referenceLibrary`
- `cardCatalog`
- `imports`

That gives the web app one schema-valid entry point while preserving a reusable card catalog for later import workflows.

## Current Files

- Normalized catalog: `imports/maladum-cards/card-catalog.json`
- Schema-backed campaign seed: `imports/maladum-cards/schema-seed.json`
- Human-readable classification: `imports/maladum-cards/CATALOG.md`
- App schema: `schemas/campaign-tracker.schema.json`
