# WINDELS AI Language Learning

A native WINDELS module: one AI language teacher, many languages, independent
progress per language. It is not a translation page and not a generic chatbot.

## Honesty

- Levels are `ASSESSED` (from answers) or `SELF_DECLARED`. They are never random.
- Progress percentages are computed from stored lessons, reviews and attempts.
- Weaknesses require repeated stored misses.
- Pronunciation scores stay `NOT_AVAILABLE` unless a real provider is configured.
- Listening audio is `CLIENT_TTS` unless a TTS provider is wired.
- Original writing is stored and never overwritten.

## Phases

1. Registry, profiles, adaptive assessment, learning paths, progress storage
2. Lessons, conversation, writing correction, grammar help, history
3. Vocabulary, flashcards, quizzes, SM-2 spaced repetition
4. Listening (text + optional speech) and speaking (transcript evaluation)
5. Weakness detection, daily plans, adaptive next step

## API

Prefix: `/api/v1/language-learning`

Authenticated, org-scoped. Redis keys: `ll:<entity>:i:<org>:<id>`.

## Adding a language

1. Register metadata with `registerLanguage()` in `registry.ts` (or the extra map).
2. Add a curriculum pack via `registerPack()` / `curriculum.ts`.
3. Do not scatter ISO codes through the UI.

## UI

- Desktop: `/app/languages`
- Mobile: `/m/languages`
