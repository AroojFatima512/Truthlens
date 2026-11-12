import { useLayoutEffect } from 'react';

// Two-column pages (Compare, article page): the right column ([data-flow="side"]) floats on the right
// and the boxes on the left ([data-flow="main"], each display:flow-root) sit beside it while it lasts.
// Every box that starts below the right column automatically gets the full width.
//
// One case CSS can't decide well: a tall box that starts just before the right column ends would stay
// narrow for its whole height, leaving a big empty strip on the right. For that box this hook compares
// the two layouts and picks the one that leaves less empty space: stay beside the column, or start
// just below it (clear: right) and use the full width.
export default function useFlowAround(containerRef, deps = []) {
  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;

    const layout = () => {
      const side = c.querySelector('[data-flow="side"]');
      const items = [...c.querySelectorAll('[data-flow="main"]')];
      items.forEach((el) => { el.style.clear = ''; });
      if (!side || getComputedStyle(side).float === 'none') return;   // small screens: one column
      const sideBottom = side.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(side).marginBottom) || 0);
      const fullWidth = c.clientWidth;
      for (const el of items) {
        const r = el.getBoundingClientRect();
        if (r.top >= sideBottom - 1) break;          // this box and all later ones are already full width
        if (r.bottom <= sideBottom + 1) continue;    // fits completely beside the right column
        const overlap = sideBottom - r.top;          // how far the right column reaches into this box
        const emptyIfNarrow = (r.height - overlap) * (fullWidth - r.width);
        const emptyIfBelow = overlap * r.width;
        if (emptyIfBelow < emptyIfNarrow) { el.style.clear = 'right'; break; }
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(c);
    c.querySelectorAll('[data-flow]').forEach((el) => ro.observe(el));
    window.addEventListener('resize', schedule);
    return () => { ro.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
