# Retraining the TruthLens bias model

## What is in this folder
| File | Put it in | What it is |
|---|---|---|
| labels/train_800.csv | ml-service\labels\ (replace) | 859 rows, final_bias / final_sentiment filled for every row |
| labels/train_800_predictions.csv | ml-service\labels\ (replace) | now 859 rows: article, outlet, category and the model's answer for rows 801-859 too. make_splits needs this |
| scripts/train_bias.py | ml-service\scripts\ and Drive | fine-tunes the model, keeps the best epoch on val |
| scripts/eval_bias.py | ml-service\scripts\ and Drive | scores old and new model on test.csv |

## Step 1. Finish the test sheet (on your laptop)
test_sheet.csv must have bias_B and, for disagreements, final_bias. A row with no gold label is left out of the test set.
    python scripts\score_label_sheet.py labels\test_sheet.csv
Settle the listed disagreements in final_bias / final_sentiment and score again.

## Step 2. Build the splits
    python scripts\make_splits.py --test labels\test_sheet.csv --train labels\train_800.csv --seed 7
Expected: train 742 sentences (290 B), val 117 (42 B), test = gold rows of test_sheet.
Seed 7 gives train and val nearly the same bias share (39% / 36%); the default seed 42 puts 51% B in val.
Output: labels\splits\train.csv, val.csv, test.csv, split_manifest.json.

## Step 3. Upload to Google Drive
    MyDrive/truthlens/splits/   train.csv  val.csv  test.csv
    MyDrive/truthlens/scripts/  train_bias.py  eval_bias.py
Your current model is already at MyDrive/truthlens/model_deberta_plain. Do not overwrite it.

## Step 4. Train in Colab (Runtime > Change runtime type > T4 GPU)
    from google.colab import drive; drive.mount('/content/drive')
    %cd /content/drive/MyDrive/truthlens/scripts
    !pip -q install sentencepiece
    !python train_bias.py --init /content/drive/MyDrive/truthlens/model_deberta_plain --train ../splits/train.csv --val ../splits/val.csv --out /content/drive/MyDrive/truthlens/model_deberta_v2 --seed 42
Epoch 0 = the old model on val. The epoch with the best val macro-F1 is saved; training stops after 2 epochs
with no improvement. Optional: repeat with --seed 1 and --seed 2 (different --out) and report mean +- spread.

## Step 5. Test once
    !python eval_bias.py --test ../splits/test.csv --model old=/content/drive/MyDrive/truthlens/model_deberta_plain --model new=/content/drive/MyDrive/truthlens/model_deberta_v2
Saves splits/test_results.json and test_predictions.csv. Do not go back and tune on test.

## Step 6. Use the new model (laptop)
1. Download MyDrive/truthlens/model_deberta_v2.
2. Rename ml-service\models\bias_deberta to bias_deberta_old (backup).
3. New folder ml-service\models\bias_deberta with the downloaded files (config.json, model.safetensors, tokenizer files; train_log.json is harmless).
4. Restart uvicorn, open http://localhost:8000/health.
5. python scripts\analyze_crawled.py --force --days 7   (re-score saved articles)
To go back: delete bias_deberta, rename bias_deberta_old back.
