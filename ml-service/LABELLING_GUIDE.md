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
   **Balanced training sheets.** Most Pakistani news sentences are neutral, so a random sheet gives very
   few B examples. For TRAINING sheets add `--balance 0.5`: half the sentences are ones a model thinks are
   biased, half ones both models think are not. Label them exactly as usual – the models only choose which
   sentences you see, and many of the "likely biased" ones will turn out to be N. Never balance the TEST
   sheet: it must stay random so the scores reflect real news.
   `python scripts\make_label_sheet.py --n 400 --balance 0.5 --first-seen-since 2026-11-01 --out labels\train_sheet_2.csv --exclude labels\train_sheet_1.csv --seed 11`
   For more biased candidates (e.g. 600 of 800) also allow up to 4 per article:
   `python scripts\make_label_sheet.py --n 800 --balance 0.75 --biased-per-article 4 --first-seen-since 2026-11-01 --out labels\train_sheet_2.csv --exclude labels\train_sheet_1.csv --seed 11`
7. Build the splits for fine-tuning:
   `python scripts\make_splits.py --test labels\test_sheet.csv --train labels\train_sheet_1.csv labels\train_sheet_2.csv`
   → `labels\splits\train.csv`, `val.csv`, `test.csv` (split by article, all categories in each part).

## Fine-tuning on your labels (Colab)

1. Check the labels: `python scripts\score_label_sheet.py labels\<sheet>.csv` → kappa, and how many B / N.
2. Make the splits:
   * with a separate test sheet: `python scripts\make_splits.py --test labels\test_sheet.csv --train labels\train_sheet_1.csv`
   * with only one labelled sheet: `python scripts\make_splits.py --train labels\train_sheet_1.csv --test-share 0.2`
     (keep the same `--seed` later so the test set stays the same).
3. Upload `labels\splits\train.csv`, `val.csv`, `test.csv` to Google Drive → `MyDrive/truthlens/labels/splits/`.
4. In Colab (GPU), optionally run the notebook's SHARED CONFIG cell (MBIC test check), then paste
   `notebooks\finetune_pakistani.py` into a new cell and run it. It prints "before vs after" on the Pakistani
   test set (and on the MBIC test set) and saves the best model to `MyDrive/truthlens/model_deberta_pk`.
5. Only if it is better on the Pakistani test set without a big drop on MBIC: download that folder to
   `ml-service\models\bias_deberta_pk`, set `BIAS_MODEL_DIR = "models/bias_deberta_pk"` in `app\config.py`,
   restart uvicorn, and re-score: `python scripts\analyze_crawled.py --force --days 30`.

Save sheets from Excel as **CSV UTF-8 (Comma delimited)** (File → Save As), not plain "CSV", or the scripts
can't read curly quotes. Don't edit or re-save the `_predictions.csv` files.

## Word-level labels (for the highlighted words)

The sentence labels say WHETHER a sentence is biased; the word model also needs WHICH words. Only the
sentences you already labelled B are marked (`python scripts\make_word_sheet.py` -> `labels\word_sheet.csv`).
Each of you fills your own column (`words_A` / `words_B`), independently, with the biased words copied
exactly from the sentence, separated by commas.

* Mark the writer's loaded, emotional, judging, labelling or hype words; usually 1-3 per sentence.
* Mark single words; for a phrase mark its loaded words ("tall claims" -> `tall`).
* Do not mark names, numbers, neutral nouns/verbs, or words inside someone else's quote.
* If no single word carries the bias (the framing as a whole is one-sided), write `-`.

Check with `--check` (typos, agreement), settle differences in `final_words`, then `--export` and train
with `notebooks\train_word_model.py` in Colab (MBIC's biased_words4 first, then these words).

## Decisions log

Write every rule you agree on here, with an example, so the next batch is labelled the same way.

| Date | Case | Decision |
|---|---|---|
| | | |
