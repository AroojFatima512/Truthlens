"""All settings in one place. Override any of them with environment variables."""
import os

# Folder where you saved the fine-tuned DeBERTa from the notebook (see notebooks/BiasDetection.ipynb, "Save the plain DeBERTa model").
BIAS_MODEL_DIR = os.getenv("BIAS_MODEL_DIR", "models/bias_deberta")

# 3-class sentiment (negative / neutral / positive). SST-2 DistilBERT has no "neutral",
# so it can't fill the Neutral bar on your screens. Swap this for your own model later.
SENTIMENT_MODEL = os.getenv("SENTIMENT_MODEL", "cardiffnlp/twitter-roberta-base-sentiment-latest")

SBERT_MODEL = os.getenv("SBERT_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
SPACY_MODEL = os.getenv("SPACY_MODEL", "en_core_web_sm")

BIAS_MAX_LEN = int(os.getenv("BIAS_MAX_LEN", "256"))
SENTIMENT_MAX_LEN = int(os.getenv("SENTIMENT_MAX_LEN", "128"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "16"))

# Explainable AI (Captum). Each explained sentence costs ~1-3 s on a laptop CPU.
XAI_STEPS = int(os.getenv("XAI_STEPS", "20"))
XAI_TOP_K_DEFAULT = int(os.getenv("XAI_TOP_K", "5"))     # the 5 most biased sentences of an article are explained
# "ablation" (Captum FeatureAblation, word by word: clearer) or "ig" (Integrated Gradients, as in the notebook)
XAI_METHOD = os.getenv("XAI_METHOD", "ablation")
# website card: only adjectives/adverbs scoring >= 0.8 ("1"), or every word scoring >= 0.4 ("0")
XAI_CARD_STRICT = os.getenv("XAI_CARD_STRICT", "1") != "0"
# Word-level bias model (notebooks/train_word_model.py). If this folder exists, the highlighted words come
# from it (sentence gate + word model); otherwise from the Explainable AI words above.
BIAS_WORDS_MODEL_DIR = os.getenv("BIAS_WORDS_MODEL_DIR", "models/bias_words")
# A sentence's words can be highlighted when the sentence model labels it Biased (p >= 0.5, its normal decision).
WORD_GATE = float(os.getenv("WORD_GATE", "0.5"))
WORD_THRESHOLD = float(os.environ["WORD_THRESHOLD"]) if os.getenv("WORD_THRESHOLD") else None

# Article bias % -> label shown on the UI ("68% - High Bias"). Tune these on your own data.
BIAS_LOW_BELOW = float(os.getenv("BIAS_LOW_BELOW", "35"))
BIAS_HIGH_FROM = float(os.getenv("BIAS_HIGH_FROM", "60"))

# Cross-source comparison
SAME_STORY_THRESHOLD = float(os.getenv("SAME_STORY_THRESHOLD", "0.60"))   # grouping articles into one story
SAME_STORY_MAX_DAYS = int(os.getenv("SAME_STORY_MAX_DAYS", "3"))
# Between SAME_STORY_THRESHOLD and this, two articles join one story only if they share a place or a person
# (stops "10 terrorists killed in Barkhan" joining "12 terrorists killed in Kurram"). From here on, similarity alone.
SAME_STORY_STRONG = float(os.getenv("SAME_STORY_STRONG", "0.75"))
# An opinion piece/editorial and a news report are never one event (comparing their bias would mislead);
# they can still share a topic. Two opinion pieces on one event can be compared with each other.
SEPARATE_OPINION = os.getenv("SEPARATE_OPINION", "1") != "0"
SENT_MATCH = float(os.getenv("SENT_MATCH", "0.70"))      # sentence pair = same fact (maybe reworded)
SENT_RELATED = float(os.getenv("SENT_RELATED", "0.50"))  # below this a sentence is unique to its source

ENTITY_TYPES = {"PERSON", "ORG", "GPE", "NORP", "EVENT", "LAW", "LOC", "FAC"}
# the outlets' own names show up as entities ("Dawn reported", "Geo News") but say nothing about the story
ENTITY_IGNORE = {"dawn", "dawn.com", "dawn news", "geo", "geo news", "geo.tv", "geo tv", "the news", "app", "reuters", "afp",
                 "express tribune", "the express tribune", "tribune", "tribune.com.pk", "et",
                 "the nation", "nation.com.pk", "samaa", "samaa tv", "samaa news", "samaa.tv", "web desk",
                 "aaj", "aaj news", "aaj tv", "aaj english", "news desk"}

# filler words never shown as "highlighted" bias words
STOPWORDS = set("""a an the and or but if then so than that this these those there here of in on at to from by for with
about as into over after before under between through during without within against among is are was were be been being
am do does did done have has had having will would shall should can could may might must it its it's he she they them
their his her him we us our you your i me my not no nor only also just very more most less least such same other another
any each every all both few some own back up down out off again further once when where why how what which who whom whose
while until because since though although whether otherwise yet still even ever said says say told""".split())
