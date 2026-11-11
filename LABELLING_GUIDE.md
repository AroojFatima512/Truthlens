# TruthLens labelling guide (sentence-level bias)

Both of you label the **same sentences**, **independently**, with this guide. Consistency matters more than any
single decision: when a case is unclear, decide it once, write it in "Decisions log" at the end, and follow it.

## What you label

One **sentence** at a time (the headline is shown only as context). Two things per sentence:

| Column | Values | Question |
|---|---|---|
| `bias_A` / `bias_B` | **B** = biased, **N** = not biased | Does the *writer's own wording* take a side or push a feeling? |
| `sentiment_A` / `sentiment_B` | **pos**, **neu**, **neg** | What is the tone of the sentence? |

Person A fills only the `_A` columns, person B only the `_B` columns. Don't look at the other person's columns
(hide them: right-click the column → Hide) and **never open the `_predictions.csv` file** while labelling –
it contains the model's answers and the outlet name.

## B – biased: label B if the writer's own wording does any of these

1. **Loaded or emotional words** instead of neutral ones: *slammed, blasted, shameless, regime, so-called,
   draconian, heroic, mafia, puppet, notorious, disastrous, historic victory*.
   Neutral: *criticised, said, government, the law, the party*.
2. **Opinion stated as fact**, without saying whose opinion it is: *"The decision is a grave mistake."*
3. **One-sided framing**: only one side's view, or a claim presented as settled when it is disputed:
   *"The government finally took the bold step everyone wanted."*
4. **Speculation or insinuation as news**: *"…raising questions about what he is hiding."*
5. **Sensational or hype language** (common in entertainment/sports): *"shocking", "bombshell",
   "breaks the internet", "fans in frenzy", "secret mission exposed", "humiliation"*.
6. **Labels that judge people or groups**: *"extremist party", "corrupt elite", "traitors"* used by the writer.

## N – not biased

- Plain facts, numbers, dates, events: *"The SBP kept the policy rate at 11pc on Monday."*
- **Attributed** opinions and quotes, reported neutrally: *"The PTI called the move unconstitutional,
  a party spokesman said."* → **N**, because the writer reports the opinion, it is clearly someone else's.
  (Our rule: biased words **inside a clearly attributed quote** are **N**, unless the writer's own words around
  the quote are loaded, e.g. *"PTI predictably cried foul, calling it 'unconstitutional'"* → **B**.)
- Neutral description of something sad or violent: *"Three policemen were martyred in an attack in Bannu."* → N
  (*martyred* is the standard term in Pakistani news; count it as neutral.)

**If unsure: N.** Bias must be visible in the wording, not in the topic. A sentence about a terrible event can
be N; a sentence about a cricket match can be B.

## Sentiment

- **pos**: good news or approving tone (*"…clinched the title in style"*, *"praised the initiative"*).
- **neg**: bad news or disapproving tone (*killed, crisis, criticised, collapse*).
- **neu**: factual/procedural (*"The hearing was adjourned until Monday."*).

Sentiment and bias are separate: *"10 people were killed in the blast"* = **neg** and **N**.

## Examples

| Sentence | Bias | Sentiment |
|---|---|---|
| The National Assembly passed the bill with 210 votes on Tuesday. | N | neu |
| The shameless government rammed the bill through without debate. | B | neg |
| Opposition leaders said the bill was "rushed", according to a statement. | N | neg |
| Pakistan clinched a thrilling three-wicket win to lift the tri-series trophy. | N | pos |
| Fans went into a frenzy as the superstar's bombshell announcement broke the internet. | B | pos |
| Prince Harry's biggest fear about William laid bare. | B | neg |
| Gold prices fell by Rs5,100 per tola, the jewellers' association said. | N | neg |
| The visionary chief minister's historic plan will transform the province. | B | pos |

## How to work

1. Create the sheet (one person, from `ml-service`):
   `python scripts\make_label_sheet.py --n 300 --out labels\test_sheet.csv`
   (add `--second-model none` to skip downloading the second model; it only adds a comparison column).
2. Put `labels\test_sheet.csv` in a shared Google Sheet (or one Excel file passed back and forth).
   Each person hides the other's columns.
3. Label in batches of ~100 (about 30–45 minutes). Take breaks; tired labelling is inconsistent.
4. When **both** have finished a batch: run
   `python scripts\score_label_sheet.py labels\test_sheet.csv` → agreement and Cohen's kappa.
   Kappa above **0.6** is good, 0.4–0.6 moderate (then re-read this guide together), below 0.4: discuss
   the rules before going on.
5. Only after both have finished: look at the rows where you disagree, discuss, and write the agreed answer
   in `final_bias` / `final_sentiment` (leave empty if you still disagree – those rows are left out).
   Add any new rule to the decisions log below.
6. The first sheet (300 sentences) is the **TEST set**: it is never used for training.
   Later sheets for fine-tuning must exclude its articles:
   `python scripts\make_label_sheet.py --n 500 --out labels\train_sheet_1.csv --exclude labels\test_sheet.csv --seed 7`
   (a different `--seed` for every new sheet; list all earlier sheets after `--exclude`).
7. Build the splits for fine-tuning:
   `python scripts\make_splits.py --test labels\test_sheet.csv --train labels\train_sheet_1.csv labels\train_sheet_2.csv`
   → `labels\splits\train.csv`, `val.csv`, `test.csv` (split by article, all categories in each part).

## Decisions log

Write every rule you agree on here, with an example, so the next batch is labelled the same way.

| Date | Case | Decision |
|---|---|---|
| 2026-11-01 | Opinion / editorial pieces: the writer's own evaluation or prescription, even without loaded words (*"Parties need elected policy councils…"*, *"Pakistan's commendable position…"*, *"Education should be an investment, not an unbearable burden."*) | **B** (rule 2, opinion as fact). Background facts inside an op-ed stay **N**. |
| 2026-11-01 | Promotional / press-release copy with no loaded words (*"The platform also focuses on driver earnings and flexibility."*, university MoU write-ups) | **N**, usually **pos**. |
| 2026-11-01 | Security-forces terms: *martyred*, *Fitna al-Hindustan*, *khawarij*, *India-backed terrorists*, attributed to ISPR / security sources | **N** (same treatment as *martyred*). Writer's own *"the Israeli regime launched…"* → **B** (*regime* is in the loaded-word list). |
| 2026-11-01 | Guide-listed loaded words in the writer's voice: *so-called* case, *crush the mafia*, *notorious* | **B**. Exception: *"so-called honour killing"* is standard distancing → **N**. |
| 2026-11-01 | "READ MORE:" teaser headlines inside a sentence | Judge the teaser's wording: *"…biggest fear laid bare"*, *"real fear unlocked"*, *"unexpected gesture with powerful message"* → **B**; a plain teaser → **N**. |
| 2026-11-01 | Celebrity / royal gossip speculation (*"is said to be worried that…"*, *"may have exhibited his confidence…"*, *"seem to have taken a major U-turn"*, *"made the Duke run out of patience"*) | **B** (rule 4/5). A plain event report about royals → **N**. |
| 2026-11-01 | Vivid but standard sports verbs (*crush, blistering, devastating spell, stunning comeback, commanding win*) | **N** (like *"thrilling three-wicket win"*). Sentiment from the side the sentence is about. |
| 2026-11-01 | Emotional framing of a sad event by the writer (*"left the area in a state of grief and sorrow over the loss of two precious human lives… innocent child"*) | **B**, **neg**. Plain report of the same event → **N**. |
| 2026-11-01 | Sentiment of security operations (militants killed, posts destroyed) | **neg** by default (violence); **pos** only when the wording itself approves (*"successfully"*, *"effective"*, *"lauded"*). |
| 2026-11-01 | Boilerplate / fragments (*"Published in Dawn, October 31st, 2026"*, cut-off sentences) | **N**, **neu**. |
| 2026-11-01 | Superlative claims with no source (*"The Patriot missile system is the most effective weapon to counter…"*) | **B**, **neu** (opinion as fact). |
| 2026-11-01 | Satire / dialogue columns (e.g. *Golden Handcuffs*): lines spoken by a character (*"First: …"*, *"Second: …"*) vs. the writer's narration (*"The air was thick with the scent of jasmine and old-money privilege."*) | Character lines → **N** (like a quote). Writer's narration that pushes a judgement → **B**. |
| 2026-11-01 | Op-ed platitudes vs. claims: *"Learning to handle challenges constructively is an essential part of personal growth."* vs. *"This is not a poverty problem."* / *"Without Imran Khan, the PTI has struggled to act as a cohesive political organisation."* | Generic platitude → **N**. A contested claim or judgement in the writer's voice → **B**. Hedged analysis (*"may not explain"*, *"one possible explanation"*) → **N**. |
| 2026-11-01 | Writer's labels for named people: *"Dysfunctional chief minister Sohail Afridi…"*, *"The mercurial US leader…"* | **B** (rule 6). The neutral version (*"former chief minister Sohail Afridi"*) → **N**. |
| 2026-11-01 | Passive insinuation: *"Questions are also being raised about what Meghan knew…"*, *"…is also being questioned"* | **B** (rule 4) when nobody is named as asking. |
