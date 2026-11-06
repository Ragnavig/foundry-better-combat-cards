# Changelog

## 0.0.2

Readability pass on the breakdown, from feedback on the first version.

- Each row now reads as one line: the name of the source on the left, the dice it rolled
  in the middle, what it contributed on the right. The name gets the full width, so long
  German labels are no longer hyphenated in the middle of a word.
- A bonus without dice no longer prints its value twice.
- The die discarded by advantage or disadvantage is drawn next to the kept one as a
  greyed-out, struck-through die instead of a bare number.
- The total row is left out where it would only repeat a value that is already shown —
  a single damage type, or a roll with a single source.

## 0.0.1

First published version. **Early and not feature-complete** — the code paths have been
checked, but the module has not yet been through a real session. Expect rough edges and
please report what breaks.

- Full source breakdown for attack and damage rolls: ability modifier, proficiency,
  item/activity bonuses, magical weapon and ammunition bonuses, situational bonuses,
  condition penalties and bonuses from active effects, with the granting effect named
  where it can be resolved.
- Damage breakdown grouped by damage type, marking doubled critical dice.
- Advantage/disadvantage badge on the roll and display of the discarded die.
- Hit margin against each target's AC.
- "Roll damage" button on attack cards, shown when the attack hit, which records the hit
  targets on the damage card so the damage can be applied to them directly.
- Target management after the fact on attack and damage cards, including taking over
  the hit targets of the matching attack roll.
- Client settings for every display feature, world setting for who may change targets.
- Written against Foundry VTT 14 and dnd5e 6.0.6.
