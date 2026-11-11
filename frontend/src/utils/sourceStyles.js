// One colour per news outlet, used for source chips on the Compare page.
// Outlets that are not listed (a new spider added later) get a stable colour from the fallback list,
// so nothing needs editing when the crawler gains a source.
const KNOWN = {
  'Dawn': 'bg-blue-500 text-white border-blue-600',
  'Geo News': 'bg-emerald-500 text-[#061e13] border-emerald-600',
  'Express Tribune': 'bg-amber-400 text-slate-900 border-amber-500',
  'The Nation': 'bg-violet-500 text-white border-violet-600',
  'Aaj News': 'bg-rose-500 text-white border-rose-600',
};

const FALLBACK = [
  'bg-cyan-500 text-slate-900 border-cyan-600',
  'bg-orange-500 text-white border-orange-600',
  'bg-teal-500 text-slate-900 border-teal-600',
  'bg-fuchsia-500 text-white border-fuchsia-600',
  'bg-lime-400 text-slate-900 border-lime-500',
  'bg-slate-500 text-white border-slate-600',
];

export const sourceStyle = (source) => {
  if (KNOWN[source]) return KNOWN[source];
  const name = String(source || '');
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
};
