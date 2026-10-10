import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { fuzzyScore } from '../lib/fuzzy';
import { currentPane, pasteText } from '../lib/shell';
import { focusPane } from '../lib/terminals';
import type { Template } from '../backend';
import { IconEdit, IconPlus, IconSearch, IconTrash } from './Icons';
import styles from './PromptMenu.module.css';

const CATEGORY_ORDER = ['Research', 'Thinking', 'Prototype', 'Bug fixing'];
const NEW = '__new__';

function categoryRank(c: string) {
  const i = CATEGORY_ORDER.indexOf(c);
  return i < 0 ? CATEGORY_ORDER.length : i;
}

export function PromptMenu() {
  const templates = useStore((s) => s.data?.templates ?? []);
  const set = useStore((s) => s.set);
  const update = useStore((s) => s.update);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const scored = templates
      .map((t) => ({ t, score: query.trim() ? fuzzyScore(query, t) : 0 }))
      .filter((x) => x.score >= 0);
    const byCat = new Map<string, { t: Template; score: number }[]>();
    for (const x of scored) {
      const list = byCat.get(x.t.category) ?? [];
      list.push(x);
      byCat.set(x.t.category, list);
    }
    const out = [...byCat.entries()].map(([category, items]) => ({
      category,
      items: items.sort((a, b) => b.score - a.score).map((x) => x.t),
      best: Math.max(...items.map((x) => x.score)),
    }));
    return out.sort((a, b) =>
      query.trim()
        ? b.best - a.best
        : categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category),
    );
  }, [templates, query]);

  const flat = useMemo(() => [...groups.flatMap((g) => g.items.map((t) => t.id)), NEW], [groups]);
  const active = flat[Math.min(cursor, flat.length - 1)];

  const close = (refocus = true) => {
    set({ promptsOpen: false });
    if (refocus) focusPane(currentPane());
  };
  const choose = (id: string) => {
    if (id === NEW) {
      set({ promptsOpen: false, dialog: { kind: 'template' } });
      return;
    }
    const t = templates.find((x) => x.id === id);
    close(false);
    if (t) pasteText(t.body);
  };

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-id="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const anchor = rootRef.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active) choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div ref={rootRef} className={styles.menu} role="dialog" aria-label="Prompt templates" onKeyDown={onKeyDown}>
      <div className={styles.search}>
        <IconSearch />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          spellCheck={false}
          aria-controls="prompt-results"
          aria-activedescendant={active ? `tpl-${active}` : undefined}
        />
        <span className="kbd">esc</span>
      </div>

      <div className={styles.results} ref={listRef} id="prompt-results" role="listbox">
        {groups.length === 0 && <div className={styles.none}>No templates match “{query}”.</div>}
        {groups.map((g) => (
          <section key={g.category}>
            <h3 className={styles.groupHeader}>{g.category}</h3>
            {g.items.map((t) => {
              const preview = t.body.split('\n').slice(0, 2).join(' ');
              return (
                <div
                  key={t.id}
                  id={`tpl-${t.id}`}
                  data-id={t.id}
                  role="option"
                  aria-selected={active === t.id}
                  className={`${styles.item} ${active === t.id ? styles.active : ''}`}
                  onMouseMove={() => active !== t.id && setCursor(flat.indexOf(t.id))}
                  onClick={() => choose(t.id)}
                >
                  <div className={styles.itemText}>
                    <div className={styles.title}>{t.title}</div>
                    <div className={styles.preview}>{preview}</div>
                  </div>
                  <div className={styles.itemActions} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-btn"
                      title="Edit"
                      onClick={() => set({ promptsOpen: false, dialog: { kind: 'template', template: t } })}
                    >
                      <IconEdit size={13} />
                    </button>
                    <button
                      className={`icon-btn danger ${confirmDelete === t.id ? styles.confirm : ''}`}
                      title={confirmDelete === t.id ? 'Click again to delete' : 'Delete'}
                      onClick={() => {
                        if (confirmDelete !== t.id) return setConfirmDelete(t.id);
                        update((d) => void (d.templates = d.templates.filter((x) => x.id !== t.id)));
                        setConfirmDelete(null);
                      }}
                      onMouseLeave={() => confirmDelete === t.id && setConfirmDelete(null)}
                    >
                      <IconTrash size={13} />
                      {confirmDelete === t.id && <span>Delete?</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div
        data-id={NEW}
        role="option"
        aria-selected={active === NEW}
        className={`${styles.newRow} ${active === NEW ? styles.active : ''}`}
        onMouseMove={() => active !== NEW && setCursor(flat.length - 1)}
        onClick={() => choose(NEW)}
      >
        <IconPlus size={14} /> New template
        <span className={styles.footHint}>↑↓ navigate · ↵ paste</span>
      </div>
    </div>
  );
}
