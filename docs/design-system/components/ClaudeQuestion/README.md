# ClaudeQuestion

The card where Claude Code asks something and waits for your choice: one or more questions, each with options, single or multiple choice and "Outro" with free text.

**The consumer provides:** `questions` (`id`, a short `header` for the tab, `question`, `options` with `label` and `description`, `multiSelect`), `onSubmit(answers)` (an object `{ [id]: string[] }`, with the typed text in place of "Outro") and `onSkip` (the "x": Claude decides on its own). In `ClaudePanel`, pass everything in `question`.

- Static gradient border (`.wp-neon`) with `shadow-neon`: it is the AI waiting for you, not an alert. Uppercase header "O Claude tem uma pergunta" with the `question` icon in a 14% `accent` square.
- More than one question: pill tabs with each one's `header`; the current one has an `accent` outline, answered ones get a `success` ✓. Footer "1 de 2", Voltar, Próxima and, on the last one, Responder (primary, enabled only when everything is answered).
- Options in `bg-200` rows with label, description in `ink-muted` and the key number (1–9). Selected: 10% `accent` background, `accent` outline and the mark in `--grad-brand` with a pop. Single choice is round; multiple is square, with the hint "Escolha uma ou mais".
- Single choice advances to the next question on its own after 160ms. Keyboard: numbers choose, ← → switch questions, Enter on "Outro" advances or answers.
- Switching questions: the text and options rise 4px in `duration-base`.
