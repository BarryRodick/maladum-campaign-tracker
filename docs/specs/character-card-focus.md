# Character Card Focus

## Product Direction

The app should behave like a digital version of the scanned character cards, not a generic fantasy party dashboard.

Current design choice:

- boot from a schema-backed seed file
- treat the imported character cards as the source of truth for printed values
- keep live quest state separate from long-term campaign progression
- use the card image itself as the primary interaction surface
- optimize the first-pass layout for phone play, with full-page swipe navigation between characters
- move campaign management onto its own swipe page
- let the campaign page manage the roster, not just passive campaign counters
- use a bottom-sheet rules lookup on mobile instead of a long inline rules panel

## Current Card Set

The imported working set is:

- `Unger` (`Q73`)
- `Syrio` (`Q64`)
- `Artain` (`Q61`)

Their portraits, starting badges, printed track values, and XP row layouts come from the local scanned cards.

## Core Screen

### Swipe pages

Show the tracked team as a horizontally swipeable full-page deck.

Each card should expose:

- character name
- species
- card code
- portrait from the imported scan
- starting badge
- current and maximum health through printed pip hotspots
- current and maximum skill through printed pip hotspots
- current and maximum magic through printed pip hotspots
- current and maximum actions through printed pip hotspots
- imported XP row capacities and current XP marks through printed XP hotspots
- permanent stat increases in the blank progression area on the card
- learned skills in the blank progression area on the card
- learned spells in the blank progression area on the card
- temporary status effects
- per-card notes

After the character pages, include one campaign page that holds:

- campaign name
- current quest
- stash
- renown
- delay
- campaign notes
- team builder controls
- profession assignment controls
- active and reserve roster management

## Interaction Model

### Live tracking mode

Used during a quest.

- tap printed pips to spend or restore health, skill, magic, and actions
- toggle status effects quickly
- restore one card from the card overlay or restore the whole party from the header
- keep this state in `trackerState`

### Progression mode

Used between quests.

- tap imported XP rows to update progression
- record permanent stat increases in the card's blank progression dock, but only when completed XP rows unlock them
- raise or lower learned skill levels in the same progression dock
- assign a profession to each tracked adventurer from the campaign page
- move adventurers between the active party and reserve as the campaign grows
- add notes for campaign-state changes
- keep this state in `campaignState`

## Rules Lookup

Rules lookup should be local and card-linked.

Current behavior:

- the starting badge on each card is clickable
- learned skills and spells in the progression dock are clickable
- the lookup sheet searches imported `skills`, `spells`, and `abilities`
- each lookup entry shows type, optional level, tags, rules text, and source file

Known gaps in the current card set:

- `Persuasion`, `Entertainer`, and `Reflexes` do not have separate rules cards in this import
- `Focused Energy` is only partially transcribed because the scan is obscured by glare

## Data Model Split

Use these layers:

1. `campaign`
   Party-wide campaign identity and shared counters.
2. `party`
   Active member ordering, reserve ordering, and party-level grouping.
3. `adventurers[*].profile`
   Printed card values and persistent identity.
4. `adventurers[*].campaignState`
   XP rows, learned rules, stat increases, and card notes.
5. `adventurers[*].trackerState`
   Live pips and temporary status effects.
6. `referenceLibrary`
   Searchable rules text transcribed from imported profession and spell cards.
7. `cardCatalog`
   Normalized scan metadata and character-card templates.

## Current Implementation Notes

- The app loads `imports/maladum-cards/schema-seed.json` on startup.
- The schema now allows variable-length XP rows because the scanned cards do not all match a fixed five-row layout.
- Relative asset paths are used inside the seed so the portraits and source files work when the project is served locally.
- Overlay positions are currently calibrated against the imported landscape scan layout inside the app.
- Rank is currently derived from the XP track rather than treated as a free manual field.
- Stat increases are now gated by completed XP rows.
- The campaign page now owns profession assignment and reserve-member support.
- Full immediate XP allocation into class-board skills and spell choices is still pending because profession/class-board ownership is not yet structured in the imported seed.

## Next Build Step

The next useful feature is not another sample UI pass. It is deeper campaign editing against the same schema:

- add or remove learned skills and spells from the dashboard
- start recording quest log entries and item ownership
- support recruiting from larger imported card sets without relying on the current three-character seed
