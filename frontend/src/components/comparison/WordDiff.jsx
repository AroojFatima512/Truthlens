import React from 'react';

// Shows word-level changes from the backend: [{ op: 'equal'|'replace'|'delete'|'insert', a, b }]
//   side="a"    the first text: words the second text changed or dropped are struck through in red
//   side="b"    the second text: words it changed or added are marked in green
//   side="both" one line: removed words in red, added words in green (used for article versions)
const DEL = 'rounded px-0.5 bg-red-500/20 text-red-200 line-through decoration-red-400/80';
const INS = 'rounded px-0.5 bg-emerald-500/20 text-emerald-200 font-medium';

const WordDiff = ({ ops = [], side = 'both', className = '' }) => {
  const parts = [];
  ops.forEach((o, i) => {
    const push = (text, cls, kind) => { if (text) parts.push({ key: `${i}-${kind}`, text, cls }); };
    if (o.op === 'equal') push(side === 'b' ? o.b : o.a, '', 'eq');
    else if (o.op === 'replace') {
      if (side !== 'b') push(o.a, DEL, 'del');
      if (side !== 'a') push(o.b, INS, 'ins');
    } else if (o.op === 'delete') { if (side !== 'b') push(o.a, DEL, 'del'); }
    else if (o.op === 'insert') { if (side !== 'a') push(o.b, INS, 'ins'); }
  });
  return (
    <span className={className}>
      {parts.map((p, i) => (
        <React.Fragment key={p.key}>
          {i > 0 && ' '}
          {p.cls ? <mark className={p.cls}>{p.text}</mark> : p.text}
        </React.Fragment>
      ))}
    </span>
  );
};

export const DiffLegend = ({ removedLabel = 'removed or replaced', addedLabel = 'added or used instead' }) => (
  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
    <span><mark className={DEL}>words</mark> {removedLabel}</span>
    <span><mark className={INS}>words</mark> {addedLabel}</span>
  </div>
);

export default WordDiff;
