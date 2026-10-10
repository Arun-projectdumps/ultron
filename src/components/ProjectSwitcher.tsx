import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { addProjectFromPicker, currentPane, openProject } from '../lib/shell';
import { focusPane } from '../lib/terminals';
import { tildify } from '../lib/paths';
import { fuzzyScore } from '../lib/fuzzy';
import { hint } from '../lib/shortcuts';
import { IconPlus, IconSearch } from './Icons';
import styles from './Palette.module.css';

const ADD = '__add__';

/** ⌘P: searchable project list. Enter opens it in the active pane (/exit → cd → claude). */
export function ProjectSwitcher() {
  const open = useStore((s) => s.switcherOpen);
  if (!open) return null;
  return <Switcher />;
}

function Switcher() {
  const projects = useStore((s) => s.data?.projects ?? []);
  const missing = useStore((s) => s.missing);
  const home = useStore((s) => s.user.home);
  const cwd = useStore((s) => s.panes[currentPane()]?.status.cwd);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim();
    const list = projects
      .map((p) => ({ p, score: q ? fuzzyScore(q, { title: p.name, category: "", body: p.path }) : 0 }))
      .filter((x) => x.score >= 0 || !q);
    // No query: most recently opened first. With a query: best match first.
    list.sort((a, b) => (q ? b.score - a.score : (b.p.lastOpened ?? 0) - (a.p.lastOpened ?? 0)));
    return [...list.map((x) => x.p.id), ADD];
  }, [projects, query]);
  const active = results[Math.min(cursor, results.length - 1)];

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-id="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => {
    useStore.setState({ switcherOpen: false });
    focusPane(currentPane());
  };
  const choose = (id: string) => {
    useStore.setState({ switcherOpen: false });
    if (id === ADD) return void addProjectFromPicker();
    if (missing[id]) return focusPane(currentPane());
    openProject(id);
  };

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className={styles.palette}
        role="dialog"
        aria-label="Switch project"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % results.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + results.length) % results.length); }
          else if (e.key === 'Enter') { e.preventDefault(); if (active) choose(active); }
          else if (e.key === 'Escape') { e.preventDefault(); close(); }
        }}
      >
        <div className={styles.search}>
          <IconSearch />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Switch project…" spellCheck={false} />
          <span className="kbd">{hint('projects')}</span>
        </div>
        <div className={styles.results} ref={listRef} role="listbox">
          {results.length === 1 && (
            <div className={styles.none}>{projects.length ? `No projects match “${query}”.` : 'No saved projects yet.'}</div>
          )}
          {results.map((id) => {
            if (id === ADD) {
              return (
                <div key={id} data-id={id} role="option" aria-selected={active === id} className={`${styles.item} ${styles.add} ${active === id ? styles.active : ''}`} onMouseMove={() => active !== id && setCursor(results.indexOf(id))} onClick={() => choose(id)}>
                  <IconPlus size={14} /> Add project…
                </div>
              );
            }
            const p = projects.find((x) => x.id === id)!;
            return (
              <div
                key={id}
                data-id={id}
                role="option"
                aria-selected={active === id}
                className={`${styles.item} ${active === id ? styles.active : ''} ${missing[id] ? styles.missing : ''}`}
                onMouseMove={() => active !== id && setCursor(results.indexOf(id))}
                onClick={() => choose(id)}
              >
                <span className={styles.initial}>{p.name.slice(0, 1).toUpperCase()}</span>
                <span className={styles.text}>
                  <span className={styles.title}>{p.name}{cwd === p.path && <span className={styles.here}>current</span>}</span>
                  <span className={styles.sub}>{missing[id] ? 'Folder not found' : tildify(p.path, home)}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className={styles.foot}>↑↓ navigate · ↵ open in active pane (exits a running Claude first) · esc close</div>
      </div>
    </div>
  );
}
