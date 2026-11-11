"""One category list for all outlets.

Each outlet names its sections differently (Geo "sci-tech", Tribune "technology", Dawn "sport", Tribune
"sports"...). Every article keeps the outlet's own `section` and also gets `category`, one of CATEGORIES,
so articles can be filtered, counted and used as reference labels for topic clustering.

Dawn files most print-edition reports under "newspaper" without saying which topic they are; those get
"news" (a general news report). Topic clustering is what sorts them further.
"""

CATEGORIES = ("pakistan", "world", "business", "sports", "entertainment", "technology", "health",
              "education", "lifestyle", "opinion", "offbeat", "news", "other")

_ALIASES = {
    "pakistan": "pakistan", "national": "pakistan", "karachi": "pakistan", "lahore": "pakistan",
    "islamabad": "pakistan", "peshawar": "pakistan", "punjab": "pakistan", "sindh": "pakistan",
    "balochistan": "pakistan", "khyber pakhtunkhwa": "pakistan", "k-p": "pakistan", "kp": "pakistan",
    "gilgit-baltistan": "pakistan", "ajk": "pakistan", "front page": "pakistan", "back page": "pakistan",
    "regional": "pakistan", "cities": "pakistan", "metro": "pakistan", "education": "education",
    "world": "world", "international": "world", "global": "world",
    "business": "business", "economy": "business", "markets": "business", "money": "business",
    "latest news": "news",
    "business & finance": "business",
    "sport": "sports", "sports": "sports", "cricket": "sports", "football": "sports",
    "entertainment": "entertainment", "lifestyle & entertainment": "entertainment", "showbiz": "entertainment", "film": "entertainment",
    "music": "entertainment", "tv": "entertainment", "royals": "entertainment", "images": "entertainment",
    "technology": "technology", "tech": "technology", "sci-tech": "technology", "science": "technology",
    "science & technology": "technology", "sci tech": "technology", "gadgets": "technology",
    "health": "health",
    "life & style": "lifestyle", "lifestyle": "lifestyle", "life-style": "lifestyle", "life style": "lifestyle", "fashion": "lifestyle", "food": "lifestyle",
    "travel": "lifestyle", "aurora": "lifestyle",
    "opinion": "opinion", "opinions": "opinion", "editorial": "opinion", "editorials": "opinion", "blogs": "opinion",
    "blog": "opinion", "columns": "opinion", "letters": "opinion", "prism": "opinion",
    "viral": "offbeat", "trending": "offbeat", "offbeat": "offbeat", "weird": "offbeat", "odd": "offbeat",
    "newspaper": "news", "latest": "news", "news": "news",
}


def categorize(section):
    """Outlet section name -> one of CATEGORIES ('other' when unknown, 'news' when missing)."""
    if not section:
        return "news"
    s = " ".join(str(section).lower().replace("_", " ").split())
    if s in _ALIASES:
        return _ALIASES[s]
    s2 = s.replace("-", " ")
    return _ALIASES.get(s2, "other")


def backfill(uri="mongodb://localhost:27017/", database="truthlens", recompute=False):
    """Set `category` from `section` for articles without one (or for all of them with recompute=True,
    after the list above changed). Does not touch versions."""
    from pymongo import MongoClient
    articles = MongoClient(uri)[database]["articles"]
    n = 0
    query = {} if recompute else {"category": {"$exists": False}}
    for doc in articles.find(query, {"section": 1, "category": 1}):
        category = categorize(doc.get("section"))
        if doc.get("category") != category:
            articles.update_one({"_id": doc["_id"]}, {"$set": {"category": category}})
            n += 1
    return n


if __name__ == "__main__":
    # python -m truthlens.categories          articles without a category
    # python -m truthlens.categories --all    recompute every article (after this file changed)
    import sys
    print(f"{backfill(recompute='--all' in sys.argv)} article(s) given a (new) category")
