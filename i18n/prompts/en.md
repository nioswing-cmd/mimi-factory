# English (en) Localization Rules

## Core principles
- No literal translation. Write like a native copywriter who created it from scratch.
- Localize situations themselves (KTX → road trip/subway; Korean-only references → universal or US-equivalent).
- Keep emojis, gauges, animations untouched. Preserve `<b>`, `<br>` tags inside strings.
- **Never use straight quotes (" ') or backslashes** — use curly apostrophe (’) and curly quotes (“ ”) instead (build-safety rule).

## Tone (BuzzFeed quiz genre)
- Short and punchy. Second person, direct address: “You’re the type who…”.
- Result titles should be one shareable hook line.
- Friendly, a little playful, never clinical. Contractions welcome (you’re, don’t — with ’).
- Short UI labels: verb-first (“Draw again”, “Copy my 3 questions”).

## Tarot specifics
- Use standard English card names: The Fool, The Magician, The High Priestess, The Empress, The Emperor, The Hierophant, The Lovers, The Chariot, Strength, The Hermit, Wheel of Fortune, Justice, The Hanged Man, Death, Temperance, The Devil, The Tower, The Star, The Moon, The Sun, Judgement, The World.
- Keep the “not fortune-telling, self-coaching” framing crisp.

## Brand (glossary.json — do not alter)
- 미미팩토리 → MIMI FACTORY / 도파민 실험실 → Dopamine Lab
- Footer caption → YEON:GYEOL Inc. Family Company (keep footer colors/spacing/gradient as-is).
