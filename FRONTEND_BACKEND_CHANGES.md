# TruthLens: frontend and backend changes (13 Nov)

The ML service is already updated: it gives articles a bias level of Low (below 35), Moderate (35–59) or High (60 and above), and stores a new `is_opinion` field on articles. The changes below make the website match it.

## Backend

1. **Opinion category uses the ML flag.** In `lib/categories.js` (or wherever an article's category label is worked out), add this as the first rule:
   `if (a.is_opinion === true) return 'Opinion';`
   Then keep the existing section regex rules.
   - Add `is_opinion: 1` to every MongoDB projection that feeds the category: `LIST_PROJECTION` in `routes/articles.js`, `lib/articleIndex.js`, and any story or search projection.
   - Reason: Dawn files print editorials under "newspaper", so editorials were shown as news. The ML side now detects them from section, URL, byline, headline and page tags.

2. **Pass the flag to the frontend.** In `adapters/toFrontend.js`, add `isOpinion: !!a.is_opinion` to the article objects, for both the card/list adapter and the detail adapter.

3. **Bias level filter.** `GET /api/feed?bias=` and `GET /api/stories?bias=` must filter on the stored `analysis.bias.level` (Low / Moderate / High), not on score ranges.
   - If any route or aggregation still uses score cut-offs (30, 60, 70), change them to: Low < 35, Moderate 35–59, High ≥ 60.
   - Search: `Select-String -Path routes\*.js,lib\*.js -Pattern "30|70|bias.*score"`

4. **Model metrics.** There is a new `model_metrics` document with `model: "sentiment"`, holding `accuracy`, `macroF1`, `perClassF1`, `testSize` and `annotatorKappa`.
   - If the landing page or admin page lists model metrics, also return the newest `sentiment` document.
   - The `bias-sentence` document now holds the test-sheets 1 + 4 result (699 sentences, accuracy 0.918). The landing page needs no code change, because it already reads the newest document per model.

5. **Before the evaluation:** remove `DEV_2FA_CODE` from the backend `.env`. Make sure `.env` stays out of GitHub.

## Frontend

1. **`src/utils/biasColorMapper.js`**: in `getBiasColor`, `getBiasColorHex` and `getBiasLabel`:
   - `if (score <= 30)` → `if (score < 35)`
   - `if (score <= 60)` → `if (score < 60)`

2. **`src/components/dashboard/SavedArticlesTab.jsx`**:
   ```js
   if (biasFilter === 'Low Bias') matchesBias = bias < 35;
   else if (biasFilter === 'Medium Bias') matchesBias = bias >= 35 && bias < 60;
   else if (biasFilter === 'High Bias') matchesBias = bias >= 60;
   ```
   Change the option labels to `Low Bias (&lt;35%)`, `Medium Bias (35–59%)` and `High Bias (60%+)`.

3. **`src/components/comparison/SideBySideLayout.jsx`**, around line 57: `article.biasScore >= 40` → `article.biasScore >= 35`.

4. **Check for leftover cut-offs:**
   `Get-ChildItem src -Recurse -Include *.js,*.jsx | Select-String -Pattern "<= ?30|<= ?60|> ?70|>= ?40"`
   Only lines unrelated to bias should remain. For example, `SimilarityScore.jsx` uses 40 for similarity, which is fine.

5. **`src/pages/AdminDashboardPage.jsx`, crawl dropdown.** A crawl with 3 articles per outlet took 8–9 minutes, not 1:
   ```jsx
   <option value={3}>3 per outlet (quick test, about 10 min)</option>
   <option value={30}>30 per outlet (can take an hour)</option>
   <option value={100}>100 per outlet (several hours)</option>
   ```
   Change the toast text "This takes a few minutes." to "About 10 minutes for 3 per outlet, longer for more."

6. **Opinion tag.** Optional, but it helps the demo. When `article.isOpinion` is true, show a small grey "Opinion" pill next to the category on `NewsCard`, `NewsFeedPage` cards and `NewsDetailPage`. Then readers can see why an editorial is not in the side-by-side comparison of a news story.

7. **Landing page model card.** Optional. If a `sentiment` metric is returned, show "Sentiment: accuracy X, macro-F1 Y (human-labelled news sentences)" under the bias numbers.

## Quick test after the changes

- **Feed:** an article with a score of 34 shows Low (green), 35 shows Moderate, and 60 shows High. The badge, the filter and the saved-articles filter all agree.
- **Opinion:** open a Dawn or Nation editorial. Its category is Opinion, and it is not in a news story's comparison.
- **Admin:** the dropdown shows the new times.
- **Backend tests:** run `node --test test/*.test.js` in the backend folder. Every test should pass.
