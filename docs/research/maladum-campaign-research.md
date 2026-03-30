# Maladum Campaign Research

## Scope

The goal is to track character and campaign progress in Maladum, especially the between-quest campaign loop. This research is based on official Battle Systems materials available publicly on 2026-03-28.

## What Maladum Is

Maladum is a fantasy miniatures board game played as linked quests. The starter set supports solo play or cooperative play with up to four players controlling a party of Adventurers.

The official rulebook frames the campaign as a sequence of narrative quests where the same party can persist from game to game, gain experience, buy and lose equipment, hire new members, and suffer long-term consequences.

## Core Campaign Loop

The most important product insight is that Maladum is not only about what happens during a quest. The campaign identity is the post-game sequence.

Official rulebook campaign phases:

1. Escape
2. Advancement
3. Market
4. Rest

This means a tracker should not only store static character sheets. It should guide players through the between-game workflow.

## Character and Party Progression That Must Be Tracked

### Party-level state

- Campaign name and ruleset
- Current quest and next available quest options
- Stash of Guilders
- Renown
- Base Camp notes
- Storage contents
- Whether secure storage is active after staying at an inn
- Campaign achievements, rewards, and delays

### Character-level state

- Adventurer identity
- Class or profession
- Current rank
- Experience progress by row
- Learned skills
- Learned spells
- Stat increases from leveling
- Inventory and armour
- Broken equipment
- Temporary injuries or missed-quest status
- Permanent death or leaving the party
- Whether the Adventurer took part in the latest quest
- Temporary-hire vs permanent-hire status

### Quest result state

- Quest played
- Primary and secondary objective outcomes
- Quest rewards
- Renown gained or spent
- Delay gained or reduced
- Achievements earned
- Rewards unlocked
- Characters defeated, rescued, left for dead, or lost
- Branching choice for the next quest

## Rules That Directly Shape the Product

### Escape Phase

If a character did not get off the board, the party chooses between a rescue mission or leaving them for dead. Leaving them for dead can result in:

- permanent death and loss of equipment
- missing one or two quests
- recovering but losing all equipment
- paying Guilders based on rank to recover safely
- full recovery

Product implication: a tracker needs explicit per-character recovery status, missed-quest counters, and equipment-loss handling.

### Advancement Phase

Experience is row-based and rank-based, not a single flat XP number. Each completed row increases rank and unlocks stat increases. Skill and spell access depends on rank.

Product implication: do not model Maladum progression as only `xpTotal`. Store row progress and rank-aware unlocks.

Dedicated extract:

- see [maladum-progression-rules.md](./maladum-progression-rules.md)
- machine-readable version: [maladum-progression-rules.json](./maladum-progression-rules.json)

### Market Phase

The Market Phase is a rules engine of its own:

- sell and buy equipment
- apply valuable-item purchase limits by rank
- draw one rare item offer
- hire Adventurers permanently or temporarily
- hire rescued NPCs at reduced cost
- repair broken items by rarity
- pay upkeep per Adventurer

Product implication: the tracker should eventually provide a Market wizard, not just a notes field.

### Rest Phase

Players choose inn or wilderness, then roll on different outcome tables. Effects can grant blessings, XP, items, Renown, provisions, stat penalties, or item loss.

Product implication: post-game effects should be stored as future-state modifiers for the next quest.

## Branching Campaign Structure

The official `Dungeons of Enveron` narrative campaign consists of 20 quests, or 21 including the replayable introductory scenario. The actual number played varies based on objectives completed and choices made.

Battle Systems explicitly describes the campaign log as tracking:

- Achievements
- Rewards
- Delay Track

Achievements can be:

- simple yes or no flags
- variable counters
- locations visited
- enemies defeated
- items found

Delays matter mechanically. They can:

- increase starting Dread
- change special rules
- make certain missions unavailable

Product implication: campaign state needs a generic event and flag system, not only a fixed checklist.

## Official Campaign Scoring Signals

The official `Campaign Scoring Assets` show that Maladum campaign progress is broader than only character sheets. The scoring sheet includes:

- campaign achievements such as `Occult Paraphernalia`, `Favour Owed`, `Skeletal Trails`, and `Unwilling Apprentice`
- counters such as relics retrieved, grave points searched, corpses examined, sanctified rooms, and delays
- end-campaign scoring based on remaining Renown, stash, total party value, and campaign-log marks
- bonus trackers for wandering beasts defeated, relics crafted, side quests complete, tentacles defeated, talismans found, and a corrupter banished or defeated

Product implication: the schema should separate core campaign progression from optional scoring and expansion counters.

## Expansion Signals Worth Designing For

The base tracker should target `Dungeons of Enveron`, but the schema should allow optional modules:

- `Beyond the Vaults` introduces side quests, hidden locations, universal quests, new terrain interactions, and book-related market outcomes.
- `Of Ale and Adventure` adds relic crafting and side-quest completion to scoring.
- `Oblivion's Maw` adds counters for tentacles, talismans, and a corrupter outcome.
- `Forbidden Creed` adds companions and at least one new wandering beast, the Maladite Golem.
- `Dominion of Ur'ghaal` adds new branching campaigns. `Shields of the Frontier` introduces citizen counters and a reputation tracker. `Second Sun` is another large branching campaign.

Product implication: use a modular campaign definition system instead of hardcoding one campaign forever.

## Existing Official Digital Tools

Battle Systems already provides official digital support, but not a full campaign tracker:

- Character Creator
- Item Database
- Event Deck Builder
- Map Editor

I did not find an official campaign-progress tracker in Battle Systems' public downloads and tool pages.

## Skill Lookup Source

The official `Maladum Reference Section` is the clearest public source for fast skill lookup. It contains skill, spell, and ability reference text and is a better in-app rules source than the main rulebook for this feature.

Product implication: skill lookup should be backed by a local indexed rules library sourced from the official reference section, with each learned skill on a character card linking into that index.

## Interop Opportunity: Official Character Files

Important inference from the official public character editor bundle:

- The editor exports a `.maladumcharacter` file.
- The bundle saves version `1.1`.
- The exported payload includes fields such as `name`, `species`, `health`, `skill`, `magic`, `actions`, `xp_rank1`, `available_xp`, stat increases, ability slots, and optional image metadata.

This appears to be a strong import target for our project.

Inference note: the `.maladumcharacter` format is not documented on the public page copy. The format details above are inferred from the public JavaScript bundle used by the official character editor.

## Product Recommendation

The best first product is a guided campaign companion, not a full rules simulator.

Recommended v1:

- Create or import Adventurers
- Show the whole active party as digital character cards
- Track current pips for health, skill, magic, and actions
- Track skill and spell progression on each card
- Open skill rules directly from the card
- Persist party, character, inventory, achievement, and branching state
- Show what carries into the next quest

Avoid in v1:

- full encounter automation
- full item database recreation
- tactical board-state tracking during a live game
- multiplayer trading and barter UX beyond simple notes

## Sources

- Battle Systems Downloads page: <https://battlesystems.co.uk/downloads/>
- Maladum Dungeons of Enveron Rulebook: <https://links.battlesystems.co.uk/49wulPz>
- The Dungeons of Enveron Narrative Campaign: <https://battlesystems.co.uk/blog/the-dungeons-of-enveron-narrative-campaign/>
- Venture Beyond The Vaults: <https://battlesystems.co.uk/blog/venture-beyond-the-vaults/>
- The Campaign Trail: <https://battlesystems.co.uk/blog/the-campaign-trail/>
- Maladum The Forbidden Creed Expansion: <https://battlesystems.co.uk/product/maladum-forbidden-creed-expansion/>
- Maladum Character Editor: <https://battlesystems.co.uk/maladum-character-editor/>
- Maladum Item Database: <https://battlesystems.co.uk/maladum-item-database/>
