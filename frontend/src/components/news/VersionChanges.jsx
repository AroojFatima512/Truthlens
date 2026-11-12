import React, { useEffect, useState } from 'react';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import WordDiff, { DiffLegend } from '../comparison/WordDiff';
import { fetchArticleVersions } from '../../services/newsService';
import { formatDate } from '../../utils/formatters';

// FR-09: every saved version of this article and exactly which words changed between them
// (the crawler keeps earlier versions in article_snapshots). Newest change first.
const PREVIEW = 5;

const Transition = ({ t, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const changed = t.changes.filter((c) => c.type === 'changed').length;
  const added = t.changes.filter((c) => c.type === 'added').length;
  const removed = t.changes.filter((c) => c.type === 'removed').length;
  const nothing = !t.headlineOps && !t.textChanged;
  const shown = all ? t.changes : t.changes.slice(0, PREVIEW);

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0b1626]">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
        <div>
          <p className="text-sm font-semibold text-white">Version {t.fromVersion} → {t.toVersion}</p>
          <p className="text-[11px] text-gray-400">
            {t.toDate ? `Seen ${formatDate(t.toDate)}` : ''}
            {nothing ? ' · text unchanged' : ` · ${[t.headlineOps && 'headline', changed && `${changed} sentence${changed === 1 ? '' : 's'} reworded`, added && `${added} added`, removed && `${removed} removed`].filter(Boolean).join(', ')}`}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {nothing && <p className="text-xs text-gray-400">Only details such as the update time changed; the headline and text are the same.</p>}
          {t.textChanged && !t.comparable && <p className="text-xs text-gray-400">The text of the earlier version was not saved, so the words can't be compared.</p>}
          {t.headlineOps && (
            <div className="rounded-lg bg-[#0f1f35] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Headline</p>
              <p className="text-sm text-white leading-6"><WordDiff ops={t.headlineOps} side="both" /></p>
            </div>
          )}
          {shown.map((c, i) => (
            <div key={i} className="rounded-lg bg-[#0f1f35] p-2.5 text-sm leading-6 text-gray-200">
              {c.type === 'changed' && <WordDiff ops={c.ops} side="both" />}
              {c.type === 'added' && <><span className="text-[10px] uppercase tracking-wider text-emerald-400 mr-2">Added</span><mark className="rounded px-0.5 bg-emerald-500/20 text-emerald-200">{c.text}</mark></>}
              {c.type === 'removed' && <><span className="text-[10px] uppercase tracking-wider text-red-400 mr-2">Removed</span><mark className="rounded px-0.5 bg-red-500/20 text-red-200 line-through decoration-red-400/80">{c.text}</mark></>}
            </div>
          ))}
          {t.changes.length > PREVIEW && (
            <button type="button" onClick={() => setAll(!all)} className="text-xs text-blue-400 hover:text-blue-300">
              {all ? 'Show fewer' : `Show all ${t.changes.length} changes`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const VersionChanges = ({ articleId }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchArticleVersions(articleId).then(setData).catch(() => setData({ versions: [], transitions: [] }));
  }, [articleId]);
  if (!data) return null;

  return (
    <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 shadow-xl">
      <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2"><History size={17} className="text-blue-400" /> What Changed Between Versions</h3>
      {data.transitions.length === 0 ? (
        <p className="text-sm text-gray-400">Only one version of this article has been saved so far. If the outlet edits it, the crawler saves the new version and the changed words appear here.</p>
      ) : (
        <div className="space-y-3 mt-2">
          <p className="text-xs text-gray-400">{data.versions.length} saved versions. Words the outlet removed or replaced are struck through; new words are green.</p>
          <DiffLegend removedLabel="removed or replaced" addedLabel="new in the later version" />
          {data.transitions.map((t, i) => <Transition key={`${t.fromVersion}-${t.toVersion}`} t={t} defaultOpen={i === 0} />)}
        </div>
      )}
    </div>
  );
};

export default VersionChanges;
