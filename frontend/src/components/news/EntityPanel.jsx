import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Building2, MapPin, Tag } from 'lucide-react';

// FR-15: the people, organisations and places the article mentions (named entity recognition,
// spaCy in the ML service), most mentioned first. Clicking a name searches the news for it.
const GROUPS = [
  { key: 'people', title: 'People', icon: Users, cls: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  { key: 'organisations', title: 'Organisations & groups', icon: Building2, cls: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  { key: 'places', title: 'Places', icon: MapPin, cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  { key: 'other', title: 'Events, laws & other', icon: Tag, cls: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
];
const PREVIEW = 8;

const Group = ({ group, items }) => {
  const [open, setOpen] = useState(false);
  const Icon = group.icon;
  const shown = open ? items : items.slice(0, PREVIEW);
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
        <Icon size={13} /> {group.title} <span className="text-gray-600 normal-case tracking-normal font-medium">({items.length})</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((e) => (
          <Link key={e.name} to={`/feed?q=${encodeURIComponent(e.name)}`} title={`Mentioned ${e.count} time${e.count === 1 ? '' : 's'} · search the news for ${e.name}`}
            className={`px-2 py-0.5 rounded-md border text-xs hover:brightness-125 ${group.cls}`}>
            {e.name}{e.count > 1 && <span className="opacity-60"> ×{e.count}</span>}
          </Link>
        ))}
        {items.length > PREVIEW && (
          <button type="button" onClick={() => setOpen(!open)} className="px-2 py-0.5 text-xs text-gray-400 hover:text-white">
            {open ? 'show less' : `+${items.length - PREVIEW} more`}
          </button>
        )}
      </div>
    </div>
  );
};

const EntityPanel = ({ entities }) => {
  const groups = GROUPS.filter((g) => entities?.[g.key]?.length);
  return (
    <div className="bg-bg-card rounded-2xl border border-gray-800 p-4 shadow-xl">
      <h3 className="text-base font-bold text-white mb-3">People, Organisations & Places</h3>
      {groups.length === 0
        ? <p className="text-sm text-gray-400">No people, organisations or places were recognised in this article.</p>
        : <div className="space-y-4">{groups.map((g) => <Group key={g.key} group={g} items={entities[g.key]} />)}</div>}
    </div>
  );
};

export default EntityPanel;
