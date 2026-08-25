# tests/

## Run

```
node tests/run.js
```

That is the whole thing. No install, no `package.json`, no dependencies — `node:test` and
`node:assert` only. Requires Node 18+; verified on the Node 24.16.0 installed here.

Exit code is `0` only if every test passed **and** at least one test ran. The last block of
output is a one-line verdict plus a list of failing test names with line numbers.

Run one file while working on it:

```
node --test tests/03-buckets.test.js
```

> Do **not** use `node --test tests/` — Node treats that as a module path, not a directory, and
> the run dies before any test executes. `node --test "tests/**/*.test.js"` works but quotes
> differently in PowerShell, cmd and bash, and when it goes wrong it goes wrong by matching
> nothing and exiting 0. `tests/run.js` does the discovery in JavaScript so it behaves the same
> everywhere, and refuses to report success if it found no tests.

---

## Current status

**996 tests · 995 pass · 0 fail · 1 skipped · 73 files.** (Updated 11.8.2026, בדק בית 3.)

⚠ **This file described 171 tests and four failures until 11.8.2026.** The plan for בדק בית 3
called that out by name, because a stale "what is NOT covered" list is worse than no list: it
sends the next audit to re-test areas that are already saturated, and it quietly grants absolution
to areas that were never covered at all. If you are reading this more than a few weeks after the
date above, re-run `node tests/run.js` before trusting any number here.

The four bank failures this file used to list are **gone** — the data was fixed and the tests
evolved with it (`02-bank.test.js` now passes 32/32). Do not go looking for them.

---

## How the tests reach into `app.js`

`app.js` is a browser script. It has no exports, and it touches `document`, `window` and
`localStorage` at the top level. Two ways to test it from Node:

**1. Stub a DOM and load the whole file.** Rejected. `app.js` binds handlers to roughly ninety
elements at the top level and also reaches for `localStorage`, `matchMedia`,
`navigator.serviceWorker`, `IntersectionObserver`, `fetch` and Supabase before any function is
callable. Every one of those is a surface a future edit adds to, and each addition breaks the
stub. The suite would then go red for reasons unrelated to anything under test, and the reflex
would be to loosen the stub until it stopped complaining — which is how a suite stops meaning
anything.

**2. Lift the function's source out of the file and evaluate it.** Chosen. This is the technique
the project already reached for by hand in `scratchpad/nite_v1.js` and `nite_v3.js`; what is here
is a hardened version of it. It depends on exactly one property of `app.js` — that the function
is still declared at the top level under the same name — and when that breaks it breaks with a
message naming the symbol, not with a `TypeError` from inside a fake DOM.

That bet was tested for real during the build: `app.js` was edited twice while this suite was
being written, and both times the suite picked the change up on the next run. Once it named a
new module-level variable (`committedKeys`) that needed seeding; once it silently absorbed a
one-line fix to `learnedCards`.

### What was hardened, and why it mattered

`nite_v1.js` finds a function by counting `{` and `}` from the declaration. That counts braces
inside strings, regexes, comments and template literals too. It works on today's `app.js` only
because every such brace currently happens to be balanced. One `/\{/` or `'}'` and the extraction
returns the wrong slice of the file — and the tests built on it go **green against code that was
never run**, which is worse than having no tests.

So `_harness/scan.js` builds a mask of which characters are really code and matches braces only
over those. `tests/00-harness.test.js` checks that mask against every script in the project
(`app.js`, `store.js`, `sw.js`, `config.js`, `leveltest.js`, `leveltest-he.js`) by asserting the
brace balance comes out at exactly zero, and pins the naive counter failing on both a brace
inside a regex and a brace inside a string.

### Files

| file | what it does |
|---|---|
| `_harness/scan.js` | code-vs-string/regex/comment/template mask; brace and statement matching |
| `_harness/extract.js` | pulls `function f(){}` and `const x = …` out of `app.js` by name; throws, naming the symbol, if one is gone |
| `_harness/sandbox.js` | builds a fresh `vm` context per call with the lifted functions, the real banks, and `app.js`'s module state seeded |
| `run.js` | discovery + the one-line verdict |

### Two things the harness restates rather than lifts

Everything that decides a bucket, a level, a count, an access verdict or an answer is the real
code. Two fragments live inside DOM-bound functions and are re-stated, both named here so the
list stays honest:

1. **`answerCard`** (`_harness/sandbox.js`) — the three lines `finishCard()` runs per card
   (`app.js`: `const e=sess(w); e.attempts++;` and the ok/!ok branch). The rest of `finishCard`
   rewrites `#feedback`'s innerHTML.
2. **`accepts`** (`05-answer.test.js`) — the acceptance rule of `check()`:
   `isCorrect(v, w.term) || glossAlts(w).some(t => isCorrect(v, t))`. `check()` itself reads
   `#answerInput`.

`commitSession`, `classify`, `newCards`, `weakCards`, `learnedCards`, `isCorrect`, `heForms`,
`norm`, `normEn`, `mergeProgress`, `hasAccess`, `buildBank`, `glossAlts` and `meaningMatch` are
all the shipped functions, running unmodified.

### Gotcha for whoever edits these

The sandbox is a separate `vm` realm. An array built inside it has a different prototype, so
`assert.deepStrictEqual(sandboxArray, [])` fails on the **prototype** while printing
`actual: []  expected: []`. Use `expectNone(assert, list, msg)` for "this must be empty" (it
normalises the realm and prints the offenders), and `plain(x)` for deep comparisons.
`00-harness.test.js` pins this trap so it cannot be rediscovered the hard way.

---

## What is covered

| file | area |
|---|---|
| `00-harness.test.js` | the scanner, the lifting, sandbox isolation, the realm trap |
| `01-normalize.test.js` | `norm`, `normEn`, `fullSpelling`, `pleneYod`, `pleneVav`, `heForms` — niqqud, finals, NFKC, hyphens, articles, case, idempotence, plus every fixed regression by name |
| `02-bank.test.js` | both banks: key uniqueness, gloss presence and language, editing artefacts, balanced parens, header counts, `buildBank` losing nothing, every term answering itself |
| `03-buckets.test.js` | `newCards`/`weakCards`/`learnedCards`/`classify` — exclusivity, exhaustiveness, agreement with the donut, the tester's bug, interrupted rounds |
| `04-access.test.js` | `hasAccess` across every status × date, both free-phase states, malformed dates, `subActive` agreement |
| `05-answer.test.js` | `isCorrect`, alternatives, compounds, plene forms, shared-gloss acceptance, `meaningMatch` |
| `06-merge.test.js` | `mergeProgress` — max counts, last-write-wins level, deletions, session dedupe and cap, idempotence, malformed input |

⚠ **That table covers files `00`–`06` only — the original core. There are 73 files.** It is not
maintained per-file on purpose: a hand-written index of 73 entries goes stale between one audit
and the next, and a stale index is what sent this whole document wrong until 11.8.2026. Every
file opens with a header comment saying what it guards and, where it matters, which real failure
it locks in. `ls tests/` and read the headers — those cannot drift from the tests they sit above.

Broadly, beyond the core: `07`–`08` storage and `store.js` · `11` time · `15` copy · `22` unloaded
sync · `30` sampling · `39` merge fields · `49` navigation · `62`–`63` senses · `65` speech ·
`67` entitlement · `68`–`70` sentence completion · `71` entitlement network · `72` `enrank` ·
`73` innerHTML escaping and CSP · `74` partial bank, update safety, login failure · `75` offline
sentence bank.

### Named regressions locked in

Each of these is a separate test with the word in its name, so undoing one produces a red line
naming it rather than a number going down:

- `כֹּפֶר` answerable as `כופר`
- `סַיָּס` answerable as `סייס`
- `מִכְמוֹרֶת` answerable as `מיכמורת`, **not** `מיכמוורת`
- `bestseller` / `best-seller` / `best seller`
- `department store` keys as two words, and `departmentstore` still answers it
- a leading space must not hide the article (`  the book` → `book`)
- a word from inside a parenthetical example is not a valid answer (`יגור` / `קרה`)
- repeated merges must not double the session history (the streak bug)
- a practised word must not come back under "new" (today's tester report)
- an interrupted round is one log row, not three

---

## Proof the suite can fail

A suite that cannot go red is decoration, and here decoration would be worse than nothing because
it would be believed. So it was checked, on a throwaway copy of the tree outside the repo:
**18 deliberate breakages, 18 caught.**

| broken | caught by |
|---|---|
| `norm()` stops treating a hyphen as a separator | hyphen-separator + `department store` |
| `normEn()` stops stripping the leading article | article + leading-space regressions |
| `fullSpelling()` loses its backward look | the `מיכמוורת` regression |
| `isCorrect()` stops accepting plene forms | whole-bank plene self-acceptance |
| `meaningMatch()` accepts any word from the gloss | the `יגור`/`קרה` regression |
| `glossAlts()` returns nothing | shared-gloss acceptance, both languages |
| `newCards()` back to the `level < 1` rule | the tester's bug + 6 more |
| `learnedCards()` stops excluding level-test skips | donut/button agreement |
| `commitSession()` stops recording `seen` | 8 bucket tests |
| `commitSession()` latches after the first commit | interrupted-round tests |
| `hasAccess()` locks a paid-through cancellation | the canceled matrix row |
| `PAST_DUE_GRACE_DAYS` set to 0 | the grace-window tests |
| `mergeProgress()` forgets remote deletions | deletion resurrection |
| `mergeProgress()` stops de-duplicating sessions | the streak regression + idempotence |
| `mergeProgress()` takes `max(level)` | last-write-wins downgrade |
| `norm()` renamed | the harness itself, 30 tests |
| `data.js` gains a duplicate entry | key uniqueness + header count |
| `data.js` gains an untranslated gloss | gloss-language checks |

---

## What is NOT covered — this needs a browser

Nothing below is tested here. Listing it is the point: an untested area that nobody has written
down reads as a tested one.

**Rewritten 11.8.2026.** Most of what this section used to list is now covered — `localStorage`
and the migrations (`07`, `74`), `store.js` and the network paths (`08`, `71`), the service
worker (`75`), the level test and `enrank` (`72`), and `esc()`/XSS (`73`, plus a live-browser
run). Those entries were removed rather than left standing, because a "not covered" list that is
wrong in the *safe* direction still wastes the next reader's week.

What genuinely has no automated coverage:

- **Rendering itself.** The suite reaches functions, never pixels. Whether the donut draws, the
  results screen reads well, or a layout breaks at some width — no test sees any of it. ‏320px
  and 375px were checked by hand in a browser on 11.8 (zero overflow across five screens); that
  is a measurement, not a standing guarantee.
- **Event wiring.** Buttons, Enter-to-check, focus handling. `check()` and `finishCard()` are
  covered only through the two restated lines above; a bug in the rest of `finishCard` is
  invisible here. Several real bugs found on 11.8 lived exactly here.
- **`maskTerm()`.** Lifted and callable, but its output is only ever read by a human as a prompt.
  Judging whether it hides the answer *well* needs eyes. (Its output goes to `.textContent`, so
  it is not an escaping question — see `73`.)
- **Timing and ordering.** Debounced sync, two devices racing in real time. `mergeProgress` is
  tested with hand-built payloads, never with concurrent writers.
- **Clock skew.** `mergeProgress` resolves `level` by comparing `last` timestamps written by
  different devices. A device with a skewed clock wins every conflict. Still not tested, and
  still not defended against in the app — see the skipped test below.
- **A real device, a real restore, the live database, a real screen reader.** Group ה' of
  בדק בית 3. Cannot be closed from a terminal, and is listed here so nobody assumes it was.
- **Anything about whether a translation is *correct*.** The bank tests check shape, uniqueness
  and language — never meaning.

⚠ **The single largest blind spot is structural, not a list.** The mutation run on 11.8 scored
100% — but only across the 10.7% of `app.js` the harness can reach. **89.3% of the file receives
no mutant at all.** Inside what is reachable the coverage is absolute; outside it there is no
measurement whatsoever. Read any coverage claim about this suite with that ratio in hand.

---

## The four failing tests — resolved

⚠ **Historical.** Until 11.8.2026 this section listed four failures in `02-bank.test.js`: a
sense repeated inside one entry, leftover separator artefacts, and three pairs of Hebrew entries
reachable from each other through `heForms`. **All four are gone.** The data was corrected and
the tests grew with it — `02-bank.test.js` now passes 32/32, and the homograph question is
covered by two named tests (`colliding entries differ in vocalisation`, `a legal homograph pair
carries two different meanings`).

The section is kept as a stub rather than deleted, because the detail lives on in
[`דוחות/בדק-בית-בדיקות.md`](../דוחות/בדק-בית-בדיקות.md) and a reader arriving from there needs to
know it was closed. **Do not re-open this hunt.**

## The skipped test

`04-access.test.js` › *an unparseable date should not lock a paying subscriber*. It fails today
and the fix belongs in `app.js`, so it is `skip`ped with the exact two-line change written out in
the comment above it. Summary: `sub_until` is written by a billing webhook, and any value
`new Date()` cannot parse currently locks every `active` subscriber holding one.
