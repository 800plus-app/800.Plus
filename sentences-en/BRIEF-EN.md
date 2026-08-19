# Brief · Example sentences for the English word bank

You are writing one example sentence per English entry in a vocabulary app for
Israeli students preparing for the psychometric exam. The learner just got the
word wrong; your sentence appears under the Hebrew gloss and is the moment they
actually learn the word.

## The one rule that decides everything

**The sentence must give away the meaning even to someone who did not read the
gloss.** If the word could be swapped for any other word of the same part of
speech and the sentence still works, the sentence fails.

✗ `She was very frugal.` — tells you nothing; "happy" fits too.
✓ `She was so frugal she reused tea bags and never bought new clothes.`

## Rules

1. **One sentence, 8–16 words.** Not two sentences, not a fragment.
2. **The entry word appears in the sentence.** Inflection is allowed
   (frugal → frugality is NOT allowed — same word, different form is:
   run → ran ✓, decide → decided ✓, but not decide → decision).
   For entries like "1st - first" use the word form, not the numeral.
3. **The sentence must demonstrate the meaning in the Hebrew gloss.** If the
   gloss says `ליד, בערך; אודות` for "about", pick the FIRST sense (בערך/אודות
   as glossed) — the primary sense, not a rarer one.
4. **Natural, contemporary English.** A sentence a person would actually say or
   write. Simple vocabulary around the target word — the reader is a learner;
   every other word in the sentence should be easier than the target word.
5. **Neutral content.** No politics, religion, violence, sex, real people,
   brands, and nothing about exams or this app.
6. **Do not define.** ✗ `A pretext, which is a false excuse, ...` The sentence
   shows the meaning through context, never explains it.
7. **No AI tells.** No em-dash (—). No "delve", "tapestry", "testament to",
   "a myriad of", "in the realm of". No sentence openers like "In today's
   world". Vary sentence structures across the batch — if ten sentences in a
   row start with "The", rewrite.
8. **Grammar must be flawless.** Articles, prepositions, verb agreement. Read
   each sentence aloud in your head; if a native speaker would stumble, fix it.

## Output — TSV only

One line per input entry, same order, no header, no explanations, no code fences:

```
word<TAB>sentence
```

- `word` is copied exactly as it appears in the input (it is the match key).
- Never leave a sentence empty. A hard entry still gets a sentence.

## What to return in your final message

Only: how many were written, and up to 5 entries that were hard and why.
Do NOT paste the table back.
