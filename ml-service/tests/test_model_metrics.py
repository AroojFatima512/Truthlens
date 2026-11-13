"""Report numbers saved for the website: your results table and the sentiment check (scripts/save_model_metrics.py)."""
import csv
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import save_model_metrics as smm  # noqa: E402

HEAD = ("Test set,Model,Sentences,Biased (gold),TP: biased caught,FN: biased missed,FP: false alarms,TN,Accuracy,"
        "Biased precision,Biased recall,Biased F1,Macro-F1")
ROWS = ['Test sheet 1,"v2 (deployed, seed 1)",399,81,70,11,17,301,0.930,0.805,0.864,0.833,0.894',
        'Sheets 1 + 4 (699),Original DeBERTa,699,121,89,32,61,517,0.867,0.593,0.736,0.657,0.787',
        'Sheets 1 + 4 (699),"v2 (deployed, seed 1)",699,121,101,20,37,541,0.918,0.732,0.835,0.780,0.865']


def test_results_table_row_becomes_the_website_figure(tmp_path):
    f = tmp_path / "results.csv"
    f.write_text(HEAD + "\n" + "\n".join(ROWS) + "\n", encoding="utf-8")
    d = smm.sentence_doc(smm.from_results_table(f), "bias-sentence", "x")
    assert d["accuracy"] == 0.918 and d["f1"] == 0.780 and d["macroF1"] == 0.865
    assert d["testSize"] == 699 and d["confusionMatrix"] == [[541, 37], [20, 101]]
    assert d["dataset"] == "Pakistani test sheets 1 + 4 (699 sentences, 121 Biased)"


def test_sentiment_scores_from_label_sheet(tmp_path):
    sheet, pred = tmp_path / "s.csv", tmp_path / "s_predictions.csv"
    gold = ["pos", "neu", "neg", "neu", "neg", "neu"]
    model = ["positive", "neutral", "negative", "negative", "negative", "neutral"]
    with sheet.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["row", "sentence", "bias_A", "bias_B", "sentiment_A", "sentiment_B", "final_bias", "final_sentiment"])
        for i, g in enumerate(gold):
            w.writerow([i, f"s{i}", "N", "N", g, g, "", ""])
    with pred.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["row", "deberta_bias", "sentiment_model"])
        for i, m in enumerate(model):
            w.writerow([i, "N", m])
    out = subprocess.run([sys.executable, str(Path(smm.__file__).with_name("score_label_sheet.py")), str(sheet)],
                         capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    s = json.loads((tmp_path / "s_scores.json").read_text())["sentiment"]["models"]["Sentiment model"]
    assert s["accuracy"] == round(5 / 6, 3) and s["confusion"]["neu"]["neg"] == 1
    d = smm.sentiment_doc(tmp_path / "s_scores.json")
    assert d["model"] == "sentiment" and d["testSize"] == 6 and d["perClassF1"]["pos"] == 1.0
