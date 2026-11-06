# Better Combat Chat Cards (D&D 5e)

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13%20–%20v14-informational)](https://foundryvtt.com/)
[![System](https://img.shields.io/badge/system-dnd5e%206.x-red)](https://github.com/foundryvtt/dnd5e)
[![Release](https://img.shields.io/github/v/release/Ragnavig/foundry-better-combat-cards?display_name=tag&sort=semver)](https://github.com/Ragnavig/foundry-better-combat-cards/releases/latest)
[![License](https://img.shields.io/github/license/Ragnavig/foundry-better-combat-cards)](LICENSE)

The combat chat cards of dnd5e 6.x are compact, but they keep the two questions every
table asks to themselves:

* *"Did I roll that with advantage?"*
* *"Where do these numbers actually come from — did the system count everything?"*

Hovering a damage total shows something like `8 + 2 + 2`. The system has thrown away
what those numbers *were* by that point: it builds its rolls from parts such as
`@mod + @prof + @ruleBonus`, and Foundry replaces each reference with a plain number
while parsing the formula.

This module records those parts **before** the formula is parsed, tags the resulting
roll terms, and stores the labels with the roll. The attack and damage cards are then
rendered from this module's own templates — built on top of the system's own data
models and partials, so everything the stock cards do keeps working.

## What it does

**Full source breakdown.** Every number on an attack or damage card is listed with the
source it came from: the d20, the ability modifier (named: *Strength modifier*), the
proficiency bonus, an item's or activity's attack or damage bonus, a magical weapon or
ammunition bonus, a situational bonus typed into the roll dialog, condition penalties
such as exhaustion, and bonuses granted by active effects. Where a bonus can be traced
to the effect that granted it, the effect is named instead of a generic "Effects &
features". Damage is grouped by damage type and marks doubled critical dice.

**Advantage and disadvantage you can see.** A badge on the roll shows at a glance
whether the roll was made with advantage or disadvantage, and the die that was *not*
used is displayed next to the result, struck through. Elven Accuracy, Halfling Lucky
and minimum/maximum values (Reliable Talent) are named in the breakdown.

**Hit margin.** Each target shows by how much the attack beat or missed its AC, next to
the hit/miss pill — so a 1-point miss is obvious.

**Roll damage from the attack card.** When the attack hit, a *Roll damage* button appears
below the roll — labelled *Roll critical damage* on a critical. It rolls through the
activity's own damage pipeline (ability, attack mode, ammunition, critical, upcast
scaling and consumed resources all carried over), and it records **the targets the
attack hit** on the damage card instead of whatever happens to be targeted at that
moment. The GM then applies the damage to exactly those creatures from the damage
card's tray.

**Target management after the fact.** The recorded targets of a card can be changed
afterwards: take your current targets or your selected tokens, add to the existing ones,
remove a single target, or clear them all. On a damage card you can also take over the
targets of the matching attack roll — either all of them or only the ones that were
hit. Because the targets live in the message's own data, the system re-evaluates hit and
miss and rebuilds the damage tray, so the damage applies to the right creatures.

**Everything else keeps working.** The damage tray, its multipliers and
resistance/immunity controls, the "apply to selected tokens" switch, ammunition,
weapon mastery, the context menu entries for applying damage and selecting hit or
missed targets — all of it is the system's own code and is untouched.

## Installation

In Foundry: **Add-on Modules → Install Module → Manifest URL**, then paste:

```
https://github.com/Ragnavig/foundry-better-combat-cards/releases/latest/download/module.json
```

Then enable the module in your world.

## Settings

Client settings — each player decides for themselves:

| Setting | Default | Effect |
| --- | --- | --- |
| Show roll breakdown | on | the detailed breakdown with every source; off falls back to the system's tooltip |
| Breakdown always expanded | off | render the breakdown inside the card instead of in the hover popover |
| Show the dropped die | on | display the die that advantage or disadvantage discarded |
| Show advantage badge | on | mark advantage/disadvantage directly on the roll |
| Show hit margin | on | by how much the attack beat or missed the AC |
| Damage button on attack cards | only when the attack hit | offer *Roll damage* on the attack card (only on a hit / always / never) |
| Resolve effect names | on | name the active effect behind a bonus |

World setting, Gamemaster only:

| Setting | Default | Effect |
| --- | --- | --- |
| Target tools | Game master and the author of the card | who may change a card's recorded targets afterwards (nobody / GM only / GM and author) |

## How the breakdown works

The system assembles each roll from an array of formula parts. This module wraps
`fromConfig` on the system's roll classes, splits every part into its individual
summands, labels them, and then matches the summands back onto the parsed roll terms by
counting how many terms each one contributes. The index of the matching summand is
written into each term's own options, so it survives being stored on the chat message
and being copied by critical scaling.

If the summands do not add up to the parsed formula — because another module rewrote the
formula, or an unusual operator is involved — the module does **not** guess. It marks
the roll and the card falls back to the system's plain breakdown, so a number is never
labelled with the wrong source.

Damage rolls are tagged before critical scaling rewrites their terms, which is why
doubled dice stay attached to the source they were doubled from.

## How the damage button works

The button carries the id of the activation's usage message, which is how the system
resolves the origin of a roll started from a chat card. The damage roll is therefore
recorded against the same origin as the system's own damage button, so it is summarised
on the usage card in exactly the same way. The roll itself goes through the activity's
`rollDamage`, with the ability, attack mode, ammunition and critical state taken from
the attack card it was started from — and the targets of the message set to the ones the
attack hit.

## Compatibility

* Foundry VTT v13 – v14
* dnd5e 6.0.0 or newer, verified with 6.0.6

The module patches the system's roll classes and the attack/damage chat message data
models. Another module that replaces the same templates or the same data models may
conflict with it.

## Credits

Written and maintained by [Ragnavig](https://github.com/Ragnavig). See
[CONTRIBUTORS.md](CONTRIBUTORS.md).

## License

[MIT](LICENSE)
