# Contributing

Bug reports and pull requests are welcome.

## Layout

| Path | Contents |
| --- | --- |
| `scripts/sources.mjs` | records which part of a roll formula came from which source and tags the roll terms |
| `scripts/breakdown.mjs` | turns an evaluated roll into the breakdown shown on the card |
| `scripts/cards.mjs` | patches the system's roll rendering and the attack/damage data models |
| `scripts/targets.mjs` | changing a card's recorded targets after the fact |
| `templates/` | the replacement cards and the breakdown partials |

## Rules of thumb

- Never guess a label. If the summands of a formula do not add up to the parsed roll,
  mark the roll as mismatched and let the card fall back to the system's own breakdown.
- Build on the system's data models, partials and custom elements instead of
  reimplementing them, so the damage tray, target pills and context menu keep working.
- Wrap every patch in a guard (`bcccPatched`) so re-applying it is harmless.

## Testing

There is no automated test suite. Check a change in a world with dnd5e 6.x:

- an attack with advantage and with disadvantage, and a flat (`attack.flat`) attack
- a critical hit, with and without "multiply numeric modifiers" and "powerful critical"
- a weapon with ammunition, a spell, and an attack from an unowned item
- a damage roll with several damage types, and a healing activity
- the damage button after a hit, after a miss, after a critical, and with no targets at all
- the damage button on an upcast spell, to check the scaling is carried over
- a card seen by a player without ownership of the actor, and a blind roll
