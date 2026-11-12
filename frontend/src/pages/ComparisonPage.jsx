import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import SideBySideLayout from '../components/comparison/SideBySideLayout';
import ChangedWordsPanel from '../components/comparison/ChangedWordsPanel';
import SentimentBarChart from '../components/charts/SentimentBarChart';
import { fetchArticleById, fetchComparison, fetchStory, fetchStories } from '../services/newsService';
import { Download, Share2, Layers, X, Plus, ChevronDown } from 'lucide-react';

import { sourceStyle } from '../utils/sourceStyles';

// The story (storyId) covered by the most of the wanted outlets, newest first. Used to pick
// articles that are actually about the same event, so the comparison below has something to show.
const bestStory = (pool, sources, accept = () => true) => {
  const byStory = new Map();
  for (const a of pool) {
    if (!a.storyId || !sources.includes(a.source) || !accept(a)) continue;
    const entry = byStory.get(a.storyId) || { outlets: new Set(), newest: 0 };
    entry.outlets.add(a.source);
    entry.newest = Math.max(entry.newest, new Date(a.publishedAt).getTime() || 0);
    byStory.set(a.storyId, entry);
  }
  let best = null;
  for (const [storyId, e] of byStory) {
    if (e.outlets.size < 2) continue;
    if (!best || e.outlets.size > best.size || (e.outlets.size === best.size && e.newest > best.newest)) {
      best = { storyId, size: e.outlets.size, newest: e.newest, outlets: [...e.outlets] };
    }
  }
  return best;
};

// The two articles whose bias differs most (optionally: the most different partner for one article)
const mostDifferentPair = (articles, mustInclude) => {
  const scored = articles.filter((a) => typeof a.biasScore === 'number');
  let best = null;
  for (let i = 0; i < articles.length; i += 1) {
    for (let j = i + 1; j < articles.length; j += 1) {
      const [a, b] = [articles[i], articles[j]];
      if (mustInclude && a.id !== mustInclude && b.id !== mustInclude) continue;
      const gap = scored.includes(a) && scored.includes(b) ? Math.abs(a.biasScore - b.biasScore) : -1;
      if (!best || gap > best.gap) best = { ids: [a.id, b.id], gap };
    }
  }
  return best ? best.ids : articles.slice(0, 2).map((a) => a.id);
};

// Newest article of each outlet in a story (at most 5), using `withId` for its own outlet
const onePerOutlet = (articles, withId) => {
  const perOutlet = new Map();
  [...articles].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .forEach((a) => { if (!perOutlet.has(a.source)) perOutlet.set(a.source, a); });
  const chosen = articles.find((a) => a.id === withId);
  if (chosen) perOutlet.set(chosen.source, chosen);
  return [...perOutlet.values()].slice(0, 5);
};

const ComparisonPage = () => {
  const { id1, id2 } = useParams();
  const [searchParams] = useSearchParams();

  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [topic, setTopic] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [pool, setPool] = useState([]);       // real articles the page can pick from
  const [pinned, setPinned] = useState({});   // source -> article chosen through the URL
  const [category, setCategory] = useState('All Categories');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [comparison, setComparison] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [focusIds, setFocusIds] = useState([]);      // the two articles compared sentence by sentence
  const [preferredId, setPreferredId] = useState(null);
  const [showSourceMenu, setShowSourceMenu] = useState(false);



  useEffect(() => {
    const loadInitialComparison = async () => {
      setLoading(true);
      try {
        if (id1 && id2 && !searchParams.has('ids')) {
          const [a, b] = await Promise.all([fetchArticleById(id1), fetchArticleById(id2)]);
          const validArticles = [a, b].filter(Boolean);
          if (validArticles.length >= 2) {
            const story = a.storyId ? await fetchStory(a.storyId) : [];
            setPool([...validArticles, ...story.filter((s) => !validArticles.some((v) => v.id === s.id))]);
            setPinned(Object.fromEntries(validArticles.map((article) => [article.source, article])));
            setSelectedSources(Array.from(new Set(validArticles.map((article) => article.source))));
            setSelectedArticles(validArticles);
          }
          return;
        }

        // /compare?story=<id>[&with=<articleId>]: every outlet that covered the story, side by side
        const showStory = async (storyId, withId) => {
          const articles = await fetchStory(storyId);
          const chosen = onePerOutlet(articles, withId);
          setPool(articles);
          setPinned(Object.fromEntries(chosen.map((a) => [a.source, a])));
          setSelectedSources(chosen.map((a) => a.source));
          setPreferredId(withId || null);
          setFocusIds([]);
        };
        if (searchParams.get('story')) {
          await showStory(searchParams.get('story'), searchParams.get('with'));
          return;
        }

        const ids = searchParams.get('ids');
        if (ids) {
          const requested = ids.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 5);
          const articles = (await Promise.all(requested.map((articleId) => fetchArticleById(articleId)))).filter(Boolean);
          if (articles.length >= 2) {
            setPool(articles);
            setPinned(Object.fromEntries(articles.map((article) => [article.source, article])));
            setSelectedSources(Array.from(new Set(articles.map((article) => article.source))));
            setSelectedArticles(articles);
            setTopic(articles[0]?.topicTags?.[0] || articles[0]?.category || topic);
          }
        }
        else {
          // No articles chosen yet: open the newest story that several outlets covered, with all its
          // outlets side by side. "Browse stories" picks another one.
          const { items } = await fetchStories({ pageSize: 1 });
          if (items?.[0]) await showStory(items[0].storyId);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialComparison();
  }, [id1, id2, searchParams]);

  useEffect(() => {
    const normalizedTopic = (topic || '').toLowerCase().trim();
    const matchTopic = (article) => {
      if (!normalizedTopic) return true;
      const haystack = `${article.headline} ${article.summary} ${article.category} ${article.topicTags?.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedTopic);
    };

    // Prefer one story for every selected outlet: the story of an article picked through the URL,
    // otherwise the story (matching the topic, if one is typed) that most of the selected outlets covered.
    const pinnedStory = selectedSources.map((source) => pinned[source]?.storyId).find(Boolean);
    const storyId = pinnedStory
      || bestStory(pool, selectedSources, matchTopic)?.storyId
      || (!normalizedTopic && bestStory(pool, selectedSources)?.storyId);

    const articles = selectedSources
      .map((source) => {
        if (pinned[source]) return pinned[source];
        const candidates = pool
          .filter((article) => article.source === source)
          .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        const sameStory = storyId && candidates.find((article) => article.storyId === storyId);
        return sameStory || candidates.find(matchTopic) || candidates[0];
      })
      .filter(Boolean);

    setSelectedArticles(articles);
  }, [selectedSources, topic, pool, pinned]);

  // real comparison whenever exactly two articles are on screen
  useEffect(() => {
    if (focusIds.length !== 2) { setComparison(null); return; }
    setComparison(null);
    fetchComparison(focusIds[0], focusIds[1]).then(setComparison).catch(() => setComparison(null));
  }, [focusIds]);

  const filteredArticles = useMemo(
    () => selectedArticles.filter((article) => {
      const categoryMatch = category === 'All Categories' || article.category === category;
      const startMatch = !startDate || new Date(article.publishedAt) >= new Date(startDate);
      const endMatch = !endDate || new Date(article.publishedAt) <= new Date(endDate);
      return categoryMatch && startMatch && endMatch;
    }),
    [selectedArticles, category, startDate, endDate]
  );

  // Which two of the articles on screen get the detailed (sentence-level) comparison. With exactly two
  // it is those two; with more, the most different pair until the reader picks another one.
  useEffect(() => {
    const ids = filteredArticles.map((a) => a.id);
    if (ids.length < 2) { setFocusIds([]); return; }
    setFocusIds((prev) => (prev.length === 2 && prev.every((id) => ids.includes(id)) && ids.length > 2
      ? prev
      : ids.length === 2 ? ids : mostDifferentPair(filteredArticles, ids.includes(preferredId) ? preferredId : null)));
  }, [filteredArticles, preferredId]);
  const pairArticles = focusIds.map((id) => filteredArticles.find((a) => a.id === id)).filter(Boolean);
  const setFocus = (slot, id) => setFocusIds((prev) => {
    const next = [...prev]; next[slot] = id;
    if (next[0] === next[1]) next[1 - slot] = prev[slot];   // picking the other side's article swaps them
    return next;
  });

  const sentimentCounts = useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    filteredArticles.forEach((article) => {
      counts[article.sentiment] = (counts[article.sentiment] || 0) + 1;
    });
    return counts;
  }, [filteredArticles]);

  const similarityScore = comparison?.semanticSimilarity ?? null;   // from the ML comparison; null = not the same story

  const overallSimilarityPercentage = similarityScore == null ? 0 : Math.round(similarityScore * 100);

  const currentComparison = useMemo(() => {
    if (comparison && pairArticles.length === 2) return comparison;
    return {
      topic,
      semanticSimilarity: similarityScore,
      keyDifferences: [],   // only real differences from the backend are shown
    };
  }, [comparison, pairArticles.length, topic, similarityScore]);

  // Everything in the text panels below comes from the stored ML comparison of the two articles on screen.
  const hasComparison = Boolean(comparison && pairArticles.length === 2);
  const diffs = currentComparison.keyDifferences || [];
  const framingDiffs = diffs.filter((d) => d.type === 'framing');     // same sentence, different wording
  const omissionDiffs = diffs.filter((d) => d.type === 'omission');   // names one outlet mentions and the other does not
  const additionDiffs = diffs.filter((d) => d.type === 'addition');   // sentences with no match in the other outlet
  const noComparisonText = pairArticles.length === 2
    ? 'These two articles are not grouped as the same story, so there is nothing to compare.'
    : 'Select exactly two sources covering the same story to see their differences.';

  const summaryText = useMemo(() => {
    if (!hasComparison) return noComparisonText;
    const [a, b] = pairArticles;
    const level = (x) => (x.biasLevel ? ` (${x.biasLevel})` : '');
    return `${a.source} and ${b.source} cover this story with ${overallSimilarityPercentage}% content similarity. `
      + `${a.source} scores ${a.biasScore}% bias${level(a)} and ${b.source} ${b.biasScore}%${level(b)}, a difference of ${comparison.biasDifference} points. `
      + `Sentiment: ${comparison.sentimentShift}.`;
  }, [hasComparison, pairArticles, overallSimilarityPercentage, comparison, noComparisonText]);

  const takeaways = useMemo(() => {
    if (filteredArticles.length < 2) return [];
    const scored = filteredArticles.filter((x) => typeof x.biasScore === 'number');
    const items = [];
    if (scored.length >= 2) {
      const most = scored.reduce((m, x) => (x.biasScore > m.biasScore ? x : m));
      const least = scored.reduce((m, x) => (x.biasScore < m.biasScore ? x : m));
      items.push(most.biasScore === least.biasScore
        ? `All selected outlets score the same bias (${most.biasScore}%).`
        : `${most.source} uses the most loaded wording (${most.biasScore}% bias); ${least.source} the least (${least.biasScore}%).`);
    }
    if (hasComparison) {
      items.push(`${framingDiffs.length} matching sentence(s) are worded differently between ${pairArticles.map((x) => x.source).join(' and ')}.`);
      items.push(omissionDiffs.length
        ? `${omissionDiffs.map((d) => d.source).join(' and ')} leave out people, places or organisations the other outlet names.`
        : 'Both outlets mention the same people, places and organisations.');
    }
    return items;
  }, [filteredArticles, hasComparison, framingDiffs, omissionDiffs, pairArticles]);

  const overallBiasTrend = useMemo(
    () => filteredArticles.map((article) => ({ source: article.source, bias: article.biasScore })),
    [filteredArticles]
  );

  const uniqueCategories = useMemo(
    () => ['All Categories', ...Array.from(new Set(pool.map((article) => article.category)))],
    [pool]
  );

  const handleTopicSubmit = (event) => {
    event.preventDefault();
    setPinned({});
    setTopic(topicInput.trim());
  };


  // "Add Source" offers only outlets that covered THIS story and are not on screen yet
  const storySources = useMemo(() => Array.from(new Set(pool.map((article) => article.source).filter(Boolean))).sort(), [pool]);
  const availableSources = storySources.filter((source) => !selectedSources.includes(source));
  const addSource = (source) => {
    if (selectedSources.length >= 5 || selectedSources.includes(source)) return;
    setSelectedSources((prev) => [...prev, source]);
    setShowSourceMenu(false);
  };

  const removeSource = (source) => {
    if (selectedSources.length <= 2) return;
    setSelectedSources((prev) => prev.filter((item) => item !== source));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-dark">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg-dark text-white">
      <div className="lg:hidden flex items-center justify-between p-4 bg-[#0A1128] border-b border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-500">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
      </div>

      <div className="flex flex-1 w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <div className="flex-1 w-full">
          <div className="bg-bg-card border-b border-gray-800 pt-6 pb-6">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Layers size={24} className="text-blue-400" />
                    <div>
                      <p className="text-sm text-gray-400 uppercase tracking-[0.2em]">Compare News</p>
                      <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Cross-Source Comparison</h1>
                    </div>
                  </div>
                  <p className="max-w-2xl text-sm text-gray-400">
                    Every outlet's version of the story side by side, with their narrative differences, sentiment and bias.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <Link to="/feed?view=stories" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 transition">
                    <Layers size={16} /> Browse stories
                  </Link>
                  {/* Opens the browser's print dialog; choose "Save as PDF" to keep the report */}
                  <button onClick={() => window.print()} title="Print or save this comparison as a PDF" className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl text-sm font-semibold text-white">
                    <Download size={16} />
                    Export Report
                  </button>
                </div>
              </div>
            </div>
          </div>

          <main className="flex-1 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <section className="bg-bg-card border border-gray-800 rounded-3xl p-4 shadow-xl mb-10">
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-gray-500">Outlets that covered this story <span className="normal-case tracking-normal text-gray-600">· click × to leave one out (at least 2 stay), Add Source to bring one back</span></span>
                  <div className="flex flex-wrap gap-2">
                    {selectedSources.map((source) => (
                      <button
                        key={source}
                        type="button"
                        onClick={() => removeSource(source)}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${sourceStyle(source)}`}
                      >
                        {source}
                        {selectedSources.length > 2 && <X size={14} className="text-gray-200" />}
                      </button>
                    ))}

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowSourceMenu((open) => !open)}
                        aria-expanded={showSourceMenu}
                        className="inline-flex items-center gap-2 rounded-full border border-blue-500 bg-blue-500/10 px-4 py-2 text-sm text-blue-100 hover:bg-blue-500/15 transition"
                      >
                        <Plus size={14} />
                        Add Source
                        <ChevronDown size={14} />
                      </button>

                      {showSourceMenu && (
                        <div className="absolute left-0 mt-2 w-60 rounded-2xl border border-gray-800 bg-[#06101d] p-2 shadow-2xl shadow-black/40 z-20">
                          {availableSources.length === 0 && (
                            <p className="px-4 py-3 text-sm text-gray-400">No other source available for this story.</p>
                          )}
                          {availableSources.map((source) => (
                            <button
                              key={source}
                              type="button"
                              onClick={() => addSource(source)}
                              className="w-full flex items-center gap-2 text-left rounded-xl px-4 py-2.5 text-sm text-white hover:bg-gray-900 transition"
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${sourceStyle(source)}`} />
                              {source}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            </section>

            <section className="mb-10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm text-gray-400 uppercase tracking-[0.3em]">Comparison Overview</p>
                  <h2 className="text-2xl font-bold text-white">Selected sources · {filteredArticles.length} articles</h2>
                </div>
                <div className="inline-flex items-center gap-3 text-sm text-gray-400">
                  <span className="font-semibold text-white">{selectedSources.length} sources</span>
                  <span>•</span>
                  <span>{category === 'All Categories' ? 'All categories' : category}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-400">
                <span>Sort by: <strong className="text-white">Relevance</strong></span>
                <span className="rounded-full border border-gray-700 bg-[#0c1727] px-3 py-2">{filteredArticles.length} articles matched</span>
              </div>
              <div className="mt-6">
                <SideBySideLayout articles={filteredArticles} focusIds={filteredArticles.length > 2 ? focusIds : []} />
              </div>
            </section>

            {/* With 3+ outlets: choose which two get the sentence-by-sentence comparison */}
            {filteredArticles.length > 2 && pairArticles.length === 2 && (
              <section className="mb-6 rounded-2xl border border-blue-900/60 bg-[#081b34] p-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-300 font-semibold">Detailed comparison:</span>
                {[0, 1].map((slot) => (
                  <React.Fragment key={slot}>
                    {slot === 1 && <span className="text-slate-500">vs</span>}
                    <select aria-label={slot ? 'Second outlet' : 'First outlet'} value={focusIds[slot]} onChange={(e) => setFocus(slot, e.target.value)}
                      className="rounded-lg border border-gray-700 bg-[#0c1727] px-3 py-1.5 text-white focus:outline-none focus:border-blue-500">
                      {filteredArticles.map((a) => <option key={a.id} value={a.id}>{a.source} ({a.biasScore}% bias)</option>)}
                    </select>
                  </React.Fragment>
                ))}
                <span className="text-xs text-slate-400">The panels below compare these two. It starts on the most different pair.</span>
              </section>
            )}

            <div className="grid gap-8 xl:grid-cols-[1.7fr_0.9fr]">
              <div className="space-y-8">
                <div className="bg-[#081b34] rounded-3xl border border-blue-900/60 p-6 shadow-[0_30px_60px_rgba(0,0,0,0.25)]">
                  <div className="flex flex-col gap-3 mb-6">
                    <div className="flex items-center gap-3">
                      <span className="h-10 w-1 rounded-full bg-blue-400" />
                      <div>
                        <h3 className="text-xl font-bold text-white">Framing & Narrative Differences</h3>
                        <p className="text-sm text-slate-300">Compare loaded language, emphasis, and missing story elements across the chosen sources.</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.24em] text-slate-400">
                      <span className="rounded-full bg-blue-500/10 px-3 py-2 text-blue-200">Emotional language</span>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-2 text-emerald-200">Narrative focus</span>
                      <span className="rounded-full bg-amber-500/10 px-3 py-2 text-amber-200">Missing elements</span>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-4">
                      <h4 className="text-sm uppercase tracking-[0.3em] text-blue-300">Emotional / Loaded Language</h4>
                      <div className="space-y-3">
                        {!hasComparison && <p className="text-sm text-slate-400">{noComparisonText}</p>}
                        {hasComparison && framingDiffs.length === 0 && <p className="text-sm text-slate-400">No sentence is worded differently between these two articles.</p>}
                        {hasComparison && framingDiffs.length > 0 && (
                          <p className="text-xs text-slate-400">{framingDiffs.length} reworded sentence{framingDiffs.length === 1 ? '' : 's'} · word by word in "Changed Words" below</p>
                        )}
                        <div className="space-y-3 max-h-[30rem] overflow-y-auto pr-1">
                        {framingDiffs.map((diff, index) => {
                          const colorClass = diff.type === 'framing' ? 'border-blue-500/40 bg-blue-950/70 text-blue-100' : diff.type === 'omission' ? 'border-amber-500/40 bg-amber-950/70 text-amber-100' : 'border-emerald-500/40 bg-emerald-950/70 text-emerald-100';
                          return (
                            <div key={`difference-${index}`} className={`rounded-3xl border p-4 ${colorClass}`}>
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{diff.type === 'framing' ? 'Loaded language' : diff.type === 'omission' ? 'Missing detail' : 'Narrative note'}</span>
                                <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-slate-300">{diff.source}</span>
                              </div>
                              <p className="text-sm leading-6">{diff.detail}</p>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm uppercase tracking-[0.3em] text-emerald-300">Focus Differences</h4>
                      <div className="space-y-3">
                        {!hasComparison && <p className="text-sm text-slate-400">{noComparisonText}</p>}
                        {additionDiffs.map((diff, index) => (
                          <div key={`focus-${index}`} className="rounded-3xl border border-emerald-500/20 bg-[#07201d] p-4">
                            <p className="text-sm text-slate-200">{diff.detail}</p>
                          </div>
                        ))}
                        {hasComparison && comparison.sentimentShift && (
                          <div className="rounded-3xl border border-slate-600/60 bg-[#071a2d] p-4">
                            <p className="text-sm text-slate-200">Tone: {comparison.sentimentShift}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 sm:col-span-2">
                      <h4 className="text-sm uppercase tracking-[0.3em] text-amber-300">Missing / Less Emphasized Aspects</h4>
                      <div className="space-y-3">
                        {!hasComparison && <p className="text-sm text-slate-400">{noComparisonText}</p>}
                        {hasComparison && omissionDiffs.length === 0 && <p className="text-sm text-slate-400">Both outlets mention the same people, places and organisations.</p>}
                        {omissionDiffs.map((diff, index) => (
                          <div key={`missing-${index}`} className="rounded-3xl border border-amber-500/30 bg-[#2f2210] p-4">
                            <p className="text-sm text-slate-100"><span className="font-semibold">{diff.source}:</span> {diff.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {hasComparison && <ChangedWordsPanel comparison={comparison} />}

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="bg-bg-card rounded-3xl border border-gray-800 p-6 shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-4">Comparison Summary</h3>
                    <p className="text-gray-300 leading-relaxed">{summaryText}</p>
                  </div>

                  <div className="bg-bg-card rounded-3xl border border-gray-800 p-6 shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-4">Key Takeaways</h3>
                    <ul className="space-y-3">
                      {takeaways.length === 0 && <li className="text-gray-400">Select at least two sources to see the takeaways.</li>}
                      {takeaways.map((text) => (
                        <li key={text} className="flex items-start gap-3">
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-400" />
                          <span className="text-gray-300">{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <aside className="space-y-6 xl:sticky xl:top-8">
                <div className="bg-bg-card rounded-3xl border border-gray-800 p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Overall Similarity</p>
                      <p className="text-3xl font-bold text-white">{similarityScore == null ? '–' : `${overallSimilarityPercentage}%`}</p>
                    </div>
                    <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-slate-900 text-white text-lg font-semibold">
                      {similarityScore == null ? '–' : `${overallSimilarityPercentage}%`}
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">
                    {similarityScore == null
                      ? noComparisonText
                      : `These articles are ${overallSimilarityPercentage >= 70 ? 'highly similar in content' : overallSimilarityPercentage >= 45 ? 'moderately aligned' : 'noticeably different in content'} (Sentence-BERT similarity of the full text).`}
                  </p>
                </div>

                <div className="bg-bg-card rounded-3xl border border-gray-800 p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Bias Comparison</h3>
                    <span className="text-sm text-gray-500">{filteredArticles.length} sources</span>
                  </div>
                  <div className="space-y-4">
                    {overallBiasTrend.map((item) => (
                      <div key={item.source} className="space-y-2">
                        <div className="flex items-center justify-between text-sm text-gray-400">
                          <span>{item.source}</span>
                          <span>{item.bias}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${item.bias}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-bg-card rounded-3xl border border-gray-800 p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Sentiment Comparison</h3>
                    <span className="text-sm text-gray-500">{filteredArticles.length} articles</span>
                  </div>
                  <div className="h-52">
                    <SentimentBarChart sentimentData={sentimentCounts} />
                  </div>
                </div>

              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default ComparisonPage;
