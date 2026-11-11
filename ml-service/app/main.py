"""TruthLens ML service. Your Node/Express backend calls these endpoints; the React app never calls them directly.

Run:  uvicorn app.main:app --port 8000      Docs: http://localhost:8000/docs
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import config, models, words
from .analyze import analyze_article
from .compare import compare_articles, group_stories
from .explain import explain_sentence, name_words, top_words


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("WARMUP", "1") == "1":   # load all models at start-up so the first request isn't slow
        models.bias_model(); models.sentiment_model(); models.nlp(); models.sbert()
    yield


app = FastAPI(title="TruthLens ML service", version="0.1", lifespan=lifespan)


class AnalyzeIn(BaseModel):
    title: str = ""
    body: str = Field(..., min_length=20)
    explain_top_k: int | None = Field(None, ge=0, le=10, description="How many of the most biased sentences to explain (Captum). 0 = skip.")


class ExplainIn(BaseModel):
    text: str = Field(..., min_length=3)
    method: str | None = Field(None, description='"ablation" (default) or "ig"')


class SentenceIn(BaseModel):
    index: int
    text: str = Field(..., min_length=3)


class ExplainManyIn(BaseModel):
    sentences: list[SentenceIn] = Field(..., max_length=20)
    method: str | None = None
    entities: list[dict] = Field(default_factory=list, description="the article's stored entities (names left off the card)")


class ArticleIn(BaseModel):
    id: str
    source: str | None = None
    title: str = ""
    body: str
    published_at: str | None = None
    category: str | None = None      # "opinion" pieces are kept out of news stories (config.SEPARATE_OPINION)
    analysis: dict | None = None     # pass the stored /analyze result to avoid recomputing entities


class CompareIn(BaseModel):
    articles: list[ArticleIn] = Field(..., min_length=2, max_length=5)


class GroupIn(BaseModel):
    articles: list[ArticleIn] = Field(..., min_length=1)
    threshold: float | None = Field(None, ge=0, le=1)


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": models.loaded_status()}


@app.post("/analyze")
def analyze(req: AnalyzeIn):
    try:
        return analyze_article(req.title, req.body, req.explain_top_k)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/explain")
def explain(req: ExplainIn):
    return explain_sentence(req.text, method=req.method)


class WordSentenceIn(BaseModel):
    index: int
    text: str
    p_biased: float


class WordsIn(BaseModel):
    sentences: list[WordSentenceIn] = Field(..., max_length=400)


@app.post("/bias-words")
def bias_words(req: WordsIn):
    """Highlighted words of a stored article from the word-level model (scripts/reexplain.py --words)."""
    if not words.available():
        raise HTTPException(503, f"No word model in {config.BIAS_WORDS_MODEL_DIR} (train it with notebooks/train_word_model.py)")
    gate, thr = words.settings()
    sents = [s.model_dump() for s in req.sentences]
    marked = words.sentence_words(sents)
    return {"highlight_words": words.highlight(sents, per_sentence=marked),
            "sentence_words": {str(i): w for i, w in marked.items()},     # JSON keys are strings
            "sentence_gate": gate, "word_threshold": thr}


@app.post("/explain-sentences")
def explain_many(req: ExplainManyIn):
    """Explanations for given sentences of a stored article (scripts/reexplain.py): refreshes the highlighted
    words without re-analysing the whole article."""
    explanations = []
    for s in req.sentences:
        e = explain_sentence(s.text, method=req.method)
        e["index"] = s.index
        explanations.append(e)
    return {"explanations": explanations, "highlight_words": top_words(explanations, names=name_words(req.entities))}


@app.post("/compare")
def compare(req: CompareIn):
    return compare_articles([a.model_dump() for a in req.articles])


@app.post("/group")
def group(req: GroupIn):
    groups, reps, link, blocked, topics = group_stories([a.model_dump() for a in req.articles], req.threshold, details=True)
    # representatives: per group, the article per outlet to compare; link_similarity: per article, its
    # strongest similarity to another article of its group (a weak link just above the threshold = check it)
    # blocked_links: similar pairs kept apart because they name different places and no common person
    # topics: broader chains of related events (e.g. one war), for "related coverage" and topic views
    return {"groups": groups, "representatives": reps, "link_similarity": link, "blocked_links": blocked,
            "topics": topics}
