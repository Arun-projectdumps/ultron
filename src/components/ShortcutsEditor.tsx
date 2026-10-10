import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import {
  ACTIONS, DEFAULT_KEYMAP, altNote, comboFromEvent, conflictsOf, formatCombo, protectedReason, reservedReason, resolveKeymap, setKeymapOverrides,
  type ActionId, type Keymap,
} from '../lib/shortcuts';
import { IS_TAURI } from '../backend';
import { IconClose, IconPlus, IconRestart } from './Icons';
import styles from './ShortcutsEditor.module.css';

type Recording = { action: ActionId; index: number } | null;

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const label = (id: ActionId) => ACTIONS.find((a) => a.id === id)!.label;

/** Settings → Shortcuts. Saved to data.json as overrides (only actions that differ from default). */
export function ShortcutsEditor() {
  const overrides = useStore((s) => s.data?.settings.shortcuts);
  const update = useStore((s) => s.update);
  const keymap = useMemo(() => resolveKeymap(overrides), [overrides]);
  const [recording, setRecording] = useState<Recording>(null);
  const [error, setError] = useState<{ action: ActionId; text: string } | null>(null);
  const conflicts = useMemo(() => conflictsOf(keymap), [keymap]);

  const save = (next: Keymap) => {
    const overrides: Record<string, string[]> = {};
    for (const a of ACTIONS) if (!same(next[a.id], DEFAULT_KEYMAP[a.id])) overrides[a.id] = next[a.id];
    update((d) => {
      if (Object.keys(overrides).length) d.settings.shortcuts = overrides;
      else delete d.settings.shortcuts;
    });
    setKeymapOverrides(overrides); // live immediately, not after the next App render
  };

  // While recording, this listener owns the keyboard (capture phase, before the app and dialog).
  useEffect(() => {
    if (!recording) return;
    useStore.setState({ recording: true });
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) return setRecording(null);
      const combo = comboFromEvent(e);
      if (!combo) return; // just a modifier so far
      const blocked = protectedReason(combo);
      if (blocked) {
        setError({ action: recording.action, text: `${formatCombo(combo)}: ${blocked}` });
        return setRecording(null);
      }
      const next = structuredClone(keymap);
      const list = [...next[recording.action]];
      list[recording.index] = combo;
      next[recording.action] = [...new Set(list)];
      setError(null);
      setRecording(null);
      save(next);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      useStore.setState({ recording: false });
    };
  }, [recording, keymap]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = (id: ActionId, i: number) => {
    const next = structuredClone(keymap);
    next[id] = next[id].filter((_, j) => j !== i);
    save(next);
  };
  const resetOne = (id: ActionId) => save({ ...structuredClone(keymap), [id]: DEFAULT_KEYMAP[id] });

  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  const anyCustom = ACTIONS.some((a) => !same(keymap[a.id], DEFAULT_KEYMAP[a.id]));

  return (
    <div className={styles.editor}>
      <div className={styles.top}>
        <p className={styles.note}>
          Click a shortcut to record a new one (Esc cancels). ⌃C, ⌃D, Esc, ⇧↵, arrows and Tab always go to the terminal.
          {!IS_TAURI && ' On localhost, combos Safari/Chrome reserve are flagged; they work in the native app.'}
        </p>
        <button className="btn" disabled={!anyCustom} onClick={() => { setError(null); update((d) => void delete d.settings.shortcuts); setKeymapOverrides(undefined); }}>
          <IconRestart /> Reset to defaults
        </button>
      </div>
      <div className={styles.list}>
        {groups.map((g) => (
          <section key={g}>
            <h3 className="section-label">{g}</h3>
            {ACTIONS.filter((a) => a.group === g).map((a) => {
              const combos = keymap[a.id];
              const warnings = combos.flatMap((c) => {
                const out: string[] = [];
                const others = (conflicts.get(c) ?? []).filter((x) => x !== a.id);
                if (others.length) out.push(`${formatCombo(c)} is also ${others.map((o) => `“${label(o)}”`).join(', ')}; the first listed wins.`);
                const r = reservedReason(c);
                if (r) out.push(`${formatCombo(c)}: ${r}`);
                const alt = altNote(c);
                if (alt && !IS_TAURI && a.group !== 'Tabs & panes') out.push(alt);
                return out;
              });
              const custom = !same(combos, DEFAULT_KEYMAP[a.id]);
              return (
                <div key={a.id} className={styles.row}>
                  <span className={styles.label}>{a.label}</span>
                  <span className={styles.combos}>
                    {combos.map((c, i) => {
                      const rec = recording?.action === a.id && recording.index === i;
                      const warn = (conflicts.get(c)?.length ?? 0) > 1 || !!reservedReason(c);
                      return (
                        <span key={c + i} className={`${styles.chip} ${rec ? styles.rec : ''} ${warn ? styles.warnChip : ''}`}>
                          <button onClick={() => setRecording({ action: a.id, index: i })} title="Click, then press the new shortcut">
                            {rec ? 'Press keys…' : formatCombo(c)}
                          </button>
                          {!rec && <button className={styles.x} onClick={() => remove(a.id, i)} title="Remove"><IconClose size={9} /></button>}
                        </span>
                      );
                    })}
                    {recording?.action === a.id && recording.index === combos.length ? (
                      <span className={`${styles.chip} ${styles.rec}`}><button>Press keys…</button></span>
                    ) : (
                      combos.length < 3 && (
                        <button className={styles.add} onClick={() => setRecording({ action: a.id, index: combos.length })} title="Add a shortcut">
                          <IconPlus size={11} />
                        </button>
                      )
                    )}
                    {custom && <button className={styles.reset} onClick={() => resetOne(a.id)} title={`Default: ${DEFAULT_KEYMAP[a.id].map(formatCombo).join(', ') || 'none'}`}>default</button>}
                  </span>
                  {(warnings.length > 0 || error?.action === a.id) && (
                    <span className={styles.warnings}>
                      {error?.action === a.id && <span className={styles.err}>{error.text}</span>}
                      {warnings.map((w) => <span key={w}>{w}</span>)}
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
