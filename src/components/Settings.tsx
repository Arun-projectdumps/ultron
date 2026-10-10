import { useState } from 'react';
import { useStore, selectTheme } from '../state/store';
import { openEditor } from '../theme/themes';
import { Dialog, Field } from './Dialog';
import { ShortcutsEditor } from './ShortcutsEditor';
import { IconPalette } from './Icons';
import styles from './Settings.module.css';

export function Settings({ onClose, initialTab = 'general' }: { onClose(): void; initialTab?: 'general' | 'shortcuts' }) {
  const settings = useStore((s) => s.data!.settings);
  const theme = useStore(selectTheme);
  const update = useStore((s) => s.update);
  const [tab, setTab] = useState(initialTab);

  return (
    <Dialog title="Settings" onClose={onClose} wide={tab === 'shortcuts'}>
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'general'} className={tab === 'general' ? styles.on : ''} onClick={() => setTab('general')}>General</button>
        <button type="button" role="tab" aria-selected={tab === 'shortcuts'} className={tab === 'shortcuts' ? styles.on : ''} onClick={() => setTab('shortcuts')}>Shortcuts</button>
      </div>
      {tab === 'general' ? (
        <>
          <Field label="Claude command" hint={<>What the Claude button runs, e.g. <code>claude --continue</code>.</>}>
            <input
              className="field"
              value={settings.claudeCommand}
              onChange={(e) => update((d) => void (d.settings.claudeCommand = e.target.value))}
              spellCheck={false}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </Field>
          <Field label="Appearance" hint="Intro text and glow, background, emblem, colors and fonts live in the theme.">
            <div>
              <button type="button" className="btn" onClick={() => { onClose(); openEditor(theme); }}>
                <IconPalette /> Edit theme “{theme.name}”…
              </button>
            </div>
          </Field>
        </>
      ) : (
        <ShortcutsEditor />
      )}
    </Dialog>
  );
}
