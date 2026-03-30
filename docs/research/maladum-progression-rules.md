# Maladum Progression Rules

## Source

- Official source: `Maladum Dungeons of Enveron Rulebook`
- Official URL: <https://links.battlesystems.co.uk/49wulPz>
- Local working copy: intentionally excluded from the public repo; use the official URL above.
- Extracted on: `2026-03-30`

Primary rulebook pages used for this extract:

- `p.54` Assembling Your Party
- `p.62-63` Advancement Phase / Level Up!
- `p.81` Training skill
- `p.66` Rest Phase (random XP gain case)

## What The App Must Track

Per Adventurer, progression is not just "current XP". The rules require:

- current `rank`
- XP marks by row
- current row being filled
- stat increases earned from completed rows
- learned skill spaces
- learned spell spaces
- skill and spell rank restrictions
- whether XP was earned this phase and must be allocated immediately

## Core Rule Summary

### Rank

- Each row of Experience spaces on the character board is a `rank`.
- A character's rank is the number of rows with `at least one space filled`.
- Most Adventurers start at `rank 1`.

### Earning Experience

- While filling rows `1-2`:
  - gain `1 Experience` if the character `survives the quest` and `escapes`
  - this does `not` require completing the primary objective
- While filling rows `3-4`:
  - gain `1 Experience` only if the character `survives`
  - and the party completes the `primary objective`
- While filling row `5`:
  - Experience is only gained in `special circumstances`
  - the rulebook gives examples rather than one universal trigger

### Rank 5 Special Circumstances Called Out In The Rulebook

Examples listed on `p.62`:

- personally completing a primary objective
- defeating four characters in a single round
- completing the primary objective and surviving while starting with no more than two party members
- single-handedly dragging a defeated Adventurer off the board from at least medium range from the Staging Point

The rulebook also allows players to agree additional XP for notable acts.

### Spending Experience

- Experience earned in Advancement must be `allocated immediately`
- it `cannot be saved for later ranks`
- it can be allocated to `any empty spaces` on the Adventurer's `Class board` or `Character board`

### Learning Or Improving Skills

- To improve a Skill, fill one space next to its icon
- from the next game onward, the usable level is the number of marked spaces
- Skills on the `Class board` may only be filled up to the character's `current rank`
- Skills on the `Character board` are `not restricted` in that way and add on top of the Class board value

### Learning Spells

- To learn a spell, fill one space on the spell track
- then mark a spell on the matching reference card
- the spell must be of a level `at or below current rank`

## Level-Up Rewards By Completed Row

Rulebook `p.63`:

| Completed XP Row | Benefit |
| --- | --- |
| `1st` | Increase `Health`, `Magic`, or `Skill` by `1` |
| `2nd` | Increase `Health`, `Magic`, or `Skill` by `1` |
| `3rd` | Increase `any two of Health, Magic, or Skill` by `1` |
| `4th` | Increase `any two statistics` by `1` |
| `5th` | Increase `any two statistics` by `1` |

## Caps And Edge Cases

- Stat increases may only be marked up to the Adventurer's `maximum potential` printed on the board
- Additional pegs are gained in future games to match the increased statistics
- Some Adventurers do `not` have all five ranks
- If all relevant spaces are already filled, the Adventurer cannot advance further in that direction
- Once the Experience track is full, any later Experience may be added to `other statistics with spaces remaining`

## Important Related Rules

### Starting Character Setup

On `p.54`, when creating an Adventurer:

- mark one Class-board space for each of the Adventurer's default Experience
- only one space per Skill may be marked at this stage
- if the Adventurer uses a Maladaar Class, they may choose spell spaces instead of Skill spaces

### Training Skill

On `p.81`, `Training` can add Experience in the `Advancement Phase`:

- level `2`: add one Experience to another Adventurer, limited to certain Skill groups, trainee rank no higher than `X`
- level `3`: add one Experience to two Adventurers, with one of them rank-limited by `X`

This means not all Experience comes from quest survival alone.

### Rest Phase XP Gain

On `p.66`, one Inn result can grant:

- `one Experience` to a random `rank 1` party member

This is another reason the app should treat XP gain as an allocatable event, not just a static counter.

## Product Rules To Encode

For the app, the progression flow should be:

1. record whether an Adventurer earned Experience this phase
2. fill the `next empty XP space`
3. immediately allocate that Experience to a Skill or Spell space
4. if the row became complete, unlock the matching stat increase choice
5. clamp all increases to printed maximum potential
6. enforce rank limits on Class-board Skills and spell levels

## Open Question

The rulebook wording for rows `4` and `5` is `any two statistics`.

Working interpretation:

- this probably includes `Actions`, because rows `1-3` explicitly restrict the choice to `Health`, `Magic`, and `Skill`, then rows `4-5` broaden the wording

However, this should be treated as an `inference`, not a fully verified quote, until we confirm it against:

- the printed character boards across more characters
- the official character editor behavior
- or an official FAQ / clarification

## Current Recommendation

Do not let the UI treat stat increases as free manual counters.

Instead, implement progression as:

- `earned XP event`
- `mandatory immediate allocation`
- `row-completion reward`
- `rank-gated skill/spell learning`

That will match the official rule flow much more closely than the current MVP.
