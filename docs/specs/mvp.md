# MVP Spec

## Goal

Build a Maladum web app that starts from imported character-card data instead of sample placeholders. The MVP should make the scanned party usable at the table by turning the card scans into the UI itself: phone-first full-page swipe navigation, tap-to-track pips, a campaign swipe page with team management, and linked rules text in a bottom sheet.

## Primary User

A solo or cooperative Maladum player who has scanned their character and companion cards and wants a browser-based tracker for one party.

## Current MVP Shape

The MVP is now schema-first:

- app state loads from `imports/maladum-cards/schema-seed.json`
- the save contract is `schemas/campaign-tracker.schema.json`
- normalized card metadata lives in `imports/maladum-cards/card-catalog.json`
- rules lookup is driven by `referenceLibrary`

## Core Jobs To Be Done

- Open the app and immediately see the tracked team
- Swipe between tracked characters and the campaign page on a phone-sized screen
- Spend and restore live health, skill, magic, and action pips during play by tapping the printed card
- Update imported XP rows between quests
- Record permanent stat increases and per-card notes
- Increase or decrease skill levels from the card overlay
- Assign professions to tracked adventurers
- Move adventurers between the active party and reserve
- Tap a starting badge, skill, spell, or ability and see its rules text immediately
- Export or import the full schema-backed save state

## MVP Features

### 1. Schema-backed startup

- Load a local campaign seed over HTTP
- Preserve state in `localStorage`
- Reset back to the imported seed when needed

### 2. Imported card deck

- Show the active party from `party.memberIds`
- Keep reserve members in the same tracked roster
- Render each imported scan as a full-page swipeable character card
- Render card portrait, name, species, and card code inside the card overlay
- Show starting badge, XP rows, and live tracks directly on the card
- Use the blank effect area on the card as the progression dock
- Add a campaign page after the character pages
- Support desktop and mobile interaction without a build step

### 3. Live quest tracking

- Clickable printed pips for health, skill, magic, and actions
- Status effect toggles
- One-card restore and whole-party restore

### 4. Persistent progression tracking

- Clickable printed XP rows using the capacities imported from each scanned card
- Permanent stat increase counters in the progression dock, gated by completed XP rows
- Learned skill level controls in the progression dock
- Per-card campaign notes

### 5. Rules lookup

- Search imported skills, spells, and abilities
- Open rules from badge, skill, or spell controls on the cards
- Show source card file and imported tags
- Keep the rules library local once the app is served
- Use a bottom sheet on mobile and a sticky sidebar on desktop

### 6. Save interchange

- Export the current schema state as JSON
- Import a saved schema state back into the app
- Sanitize imported state against the seeded card definitions

### 7. Team building

- Assign a profession per adventurer from the campaign page
- Move roster members between the active party and reserve
- Add newly imported character-card templates to the tracked roster as they become available

## Explicit Non-goals For This MVP

- Arbitrary manual character creation without an imported card template
- Inventory management
- Quest log editing
- Market, Escape, or Rest wizards
- Core Space support

## Data Design Principles

- Keep `trackerState` separate from `campaignState`
- Keep imported card metadata separate from live save state
- Allow variable XP row lengths to match real scanned cards
- Keep paths relative so the imported dataset works from the local project server
- Keep missing or uncertain rules text explicit instead of inventing data
- Keep overlay calibration explicit so the scanned card remains the source of truth for the UI

## Current Gaps

- The imported card set does not prove which profession card belongs to which character, so professions still need to be chosen manually in the app
- Starting badge rules for `Persuasion`, `Entertainer`, and `Reflexes` are placeholders because no separate rules cards were scanned
- `Focused Energy` is only partially transcribed because the scan is obscured
- Full mandatory XP allocation into class-board skills and spell choices is still pending because the imported data does not yet map professions/class boards to the three scanned characters

## Suggested Next Build Step

The next sensible move is deeper campaign editing against the same schema:

- add or remove learned skills and spells
- begin wiring quest-log and item sections from the existing schema
- let larger imported character catalogs feed the recruit flow directly
