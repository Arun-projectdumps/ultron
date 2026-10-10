import { useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { backend } from '../backend';
import { toast } from '../state/store';
import { commitDraft, discardDraft, updateDraft } from '../theme/themes';
import { NOCTURNE } from '../theme/nocturne';
import { deriveTerminal, deriveTokens, extractPalette, PRESETS } from '../theme/derive';
import { contrast } from '../theme/color';
import { mediaUrl, renderStill } from '../theme/media';
import { fontFamilyOf } from '../theme/apply';
import {
  ANSI_NAMES, FONT_CHOICES, TOKEN_NAMES, defaultMedia,
  type IntroStyle, type MediaFit, type MediaSlot, type Theme, type ThemeMedia,
} from '../theme/types';
import { ColorField } from './ColorField';
import { MediaLayer } from './MediaLayer';
import { glowVars, introStyles } from './Intro';
import { IconReplay, IconUpload, IconWand, IconClose } from './Icons';
import styles from './ThemeEditor.module.css';

type Section = 'colors' | 'media' | 'intro';

/** Side panel; the whole app behind it previews the draft live. */
export function ThemeEditor() {
  const draft = useStore((s) => s.draft)!;
  const [section, setSection] = useState<Section>('colors');
  const [saving, setSaving] = useState(false);

  return (
    <aside className={styles.panel} aria-label="Theme editor">
      <header className={styles.header}>
        <span className="section-label">Theme editor</span>
        <button className="icon-btn" onClick={discardDraft} title="Close without saving"><IconClose size={14} /></button>
      </header>
      <div className={styles.nameRow}>
        <input
          className="field"
          value={draft.name}
          disabled={draft.builtin}
          onChange={(e) => updateDraft((t) => void (t.name = e.target.value))}
          aria-label="Theme name"
        />
      </div>
      <div className={styles.tabs} role="tablist">
        {(['colors', 'media', 'intro'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={section === s} className={section === s ? styles.tabOn : ''} onClick={() => setSection(s)}>
            {s === 'colors' ? 'Colors' : s === 'media' ? 'Media' : 'Intro'}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {section === 'colors' && <ColorsSection theme={draft} />}
        {section === 'media' && <MediaSection theme={draft} />}
        {section === 'intro' && <IntroSection theme={draft} />}
      </div>
      <footer className={styles.footer}>
        <button className="btn btn-ghost" onClick={() => useStore.setState({ introKey: Date.now() })}><IconReplay /> Preview intro</button>
        <span className={styles.spacer} />
        <button className="btn" onClick={discardDraft}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={saving || !draft.name.trim()}
          onClick={async () => {
            setSaving(true);
            try { await commitDraft(); } catch (err) { toast(`Save failed: ${(err as Error).message}`); } finally { setSaving(false); }
          }}
        >
          Save theme
        </button>
      </footer>
    </aside>
  );
}

// ---------------------------------------------------------------- colors

function setSimple(accent: string, base: string) {
  updateDraft((t) => {
    t.colors.accent = accent;
    t.colors.base = base;
    t.colors.tokens = deriveTokens(accent, base);
    t.colors.terminal = deriveTerminal(t.colors.tokens);
  });
}

function ColorsSection({ theme }: { theme: Theme }) {
  const { colors } = theme;
  const [palette, setPalette] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const bg = theme.media.background;
  const textRatio = contrast(colors.tokens.text, colors.tokens.bg);
  const mutedRatio = contrast(colors.tokens['text-muted'], colors.tokens.bg);

  const pickFromBackground = async () => {
    if (!bg) return;
    setBusy(true);
    try {
      const still = await renderStill(mediaUrl(theme.id, bg.file), { ...bg, grayscale: 0, brightness: 1, blur: 0, keepReds: false });
      const colorsFound = await extractPalette(still.url);
      setPalette(colorsFound);
      if (!colorsFound.length) toast('No strong colors found in the background.');
    } catch {
      toast('Could not read the background image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Segmented
        value={colors.mode}
        options={[['simple', 'Simple'], ['advanced', 'Advanced']]}
        onChange={(mode) => updateDraft((t) => void (t.colors.mode = mode))}
      />

      <Group title="Presets">
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className={`${styles.preset} ${colors.accent.toLowerCase() === p.accent ? styles.presetOn : ''}`}
              style={{ '--c': p.accent, '--b': p.base } as React.CSSProperties}
              onClick={() => setSimple(p.accent, p.base)}
              title={p.name}
            >
              <span />
              {p.name}
            </button>
          ))}
        </div>
      </Group>

      {colors.mode === 'simple' ? (
        <Group title="Colors" note="Everything else (surfaces, borders, glows, hover states, cursor, selection) is derived, keeping text contrast ≥ 4.5:1.">
          <ColorField label="Accent" value={colors.accent} onChange={(c) => setSimple(c, colors.base)} />
          <ColorField label="Base" hint="background tint" value={colors.base} onChange={(c) => setSimple(colors.accent, c)} />
        </Group>
      ) : (
        <>
          <Group title="Tokens">
            {TOKEN_NAMES.map((k) => (
              <ColorField
                key={k}
                label={k}
                alpha
                value={colors.tokens[k]}
                onChange={(c) => updateDraft((t) => void (t.colors.tokens[k] = c))}
              />
            ))}
          </Group>
          <Group title="Terminal">
            {(['foreground', 'cursor', 'selection'] as const).map((k) => (
              <ColorField key={k} label={k} alpha={k === 'selection'} value={colors.terminal[k]} onChange={(c) => updateDraft((t) => void (t.colors.terminal[k] = c))} />
            ))}
            <div className={styles.ansiPreview}>
              {ANSI_NAMES.map((k) => <span key={k} style={{ background: colors.terminal[k] }} title={k} />)}
            </div>
            {ANSI_NAMES.map((k) => (
              <ColorField key={k} label={k} value={colors.terminal[k]} onChange={(c) => updateDraft((t) => void (t.colors.terminal[k] = c))} />
            ))}
          </Group>
        </>
      )}

      <Group title="From background">
        <button className="btn" disabled={!bg || busy} onClick={pickFromBackground}>
          <IconWand /> {busy ? 'Reading…' : 'Pick colors from background'}
        </button>
        {!bg && <p className={styles.note}>Add a background in Media first.</p>}
        {palette && palette.length > 0 && (
          <>
            <div className={styles.palette}>
              {palette.map((c, i) => (
                <button key={c + i} style={{ background: c }} title={`Use ${c} as accent`} onClick={() => setSimple(c, colors.base)}>
                  {i === 0 && <span>suggested</span>}
                </button>
              ))}
            </div>
            <p className={styles.note}>Click a swatch to use it as the accent.</p>
          </>
        )}
      </Group>

      <p className={`${styles.note} ${textRatio < 4.5 || mutedRatio < 4.5 ? styles.warn : ''}`}>
        Contrast on background: text {textRatio.toFixed(1)}:1 · muted {mutedRatio.toFixed(1)}:1
        {(textRatio < 4.5 || mutedRatio < 4.5) && ' (below 4.5:1)'}
      </p>
    </>
  );
}

// ---------------------------------------------------------------- media

const SLOTS: { slot: MediaSlot; label: string; accept: string; note: string; full: boolean }[] = [
  { slot: 'background', label: 'Background', accept: '.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm', note: 'PNG, JPG, WebP, GIF, MP4 or WebM.', full: true },
  { slot: 'intro', label: 'Intro screen', accept: '.png,.jpg,.jpeg,.gif,.mp4,.webm', note: 'Shown behind the intro text. PNG, JPG, GIF, MP4 or WebM.', full: true },
  { slot: 'emblem', label: 'Emblem', accept: '.svg,.png', note: 'SVG or PNG. Replaces the crescent-and-blade crest.', full: false },
  { slot: 'boot', label: 'Claude boot animation', accept: '.gif,.mp4,.webm', note: 'Optional. GIF, MP4 or WebM, shown while Claude starts.', full: false },
];

function MediaSection({ theme }: { theme: Theme }) {
  const ffmpeg = useStore((s) => s.user.ffmpeg);
  return (
    <>
      {SLOTS.map((s) => <SlotEditor key={s.slot} theme={theme} {...s} />)}
      <p className={styles.note}>
        Files are stored in <code>~/.ultron/themes/{theme.id}/</code>.{' '}
        {ffmpeg ? 'GIFs are converted to MP4 on upload (much lighter to play).' : 'Install ffmpeg to convert GIFs to MP4 on upload.'}
      </p>
    </>
  );
}

function SlotEditor({ theme, slot, label, accept, note, full }: { theme: Theme; slot: MediaSlot; label: string; accept: string; note: string; full: boolean }) {
  const media = theme.media[slot];
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const builtinDefault = theme.id === 'nocturne' ? NOCTURNE.media[slot] : undefined;
  const set = (patch: Partial<ThemeMedia>) => updateDraft((t) => void (t.media[slot] = { ...t.media[slot]!, ...patch }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const r = await backend.uploadThemeMedia(theme.id, slot, file);
      const kind = r.kind === 'font' ? 'image' : r.kind;
      const keep = media ? { opacity: media.opacity, brightness: media.brightness, blur: media.blur, grayscale: media.grayscale, keepReds: media.keepReds, fit: media.fit } : {};
      const preset = slot === 'background' ? { opacity: 0.35, grayscale: 1, keepReds: true, brightness: 0.85 } : {};
      updateDraft((t) => void (t.media[slot] = defaultMedia(r.file, kind, { ...preset, ...keep, animate: false })));
      if (r.converted) toast('GIF converted to MP4 (lighter to play).');
    } catch (err) {
      toast(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Group title={label}>
      <div className={styles.slotTop}>
        <div className={styles.slotPreview}>
          {media ? (
            <MediaLayer themeId={theme.id} media={{ ...media, opacity: 1, fit: slot === 'emblem' || slot === 'boot' ? 'contain' : media.fit }} animate={false} />
          ) : (
            <span>{slot === 'emblem' ? 'Built-in crest' : slot === 'boot' ? 'Traced emblem' : 'None'}</span>
          )}
        </div>
        <div className={styles.slotButtons}>
          <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
          <button className="btn" disabled={uploading} onClick={() => input.current?.click()}>
            <IconUpload /> {uploading ? 'Uploading…' : media ? 'Replace…' : 'Upload…'}
          </button>
          {media && (
            <button className="btn btn-ghost btn-danger" onClick={() => updateDraft((t) => void delete t.media[slot])}>Remove</button>
          )}
          {builtinDefault && media?.file !== builtinDefault.file && (
            <button className="btn btn-ghost" onClick={() => updateDraft((t) => void (t.media[slot] = structuredClone(builtinDefault)))}>Use default</button>
          )}
        </div>
      </div>
      <p className={styles.note}>{note}</p>
      {media && (
        <>
          <Slider label="Opacity" value={media.opacity} min={0} max={1} step={0.01} onChange={(v) => set({ opacity: v })} />
          {slot !== 'emblem' && (
            <Slider label="Brightness" value={media.brightness} min={0.1} max={1.8} step={0.01} onChange={(v) => set({ brightness: v })} />
          )}
          {full && (
            <>
              <Slider label="Blur" value={media.blur} min={0} max={30} step={0.5} unit="px" onChange={(v) => set({ blur: v })} />
              <Slider label="Grayscale" value={media.grayscale} min={0} max={1} step={0.01} onChange={(v) => set({ grayscale: v })} />
              <Toggle
                label="Keep red & orange lights"
                note={media.kind === 'image' || !media.animate ? 'Desaturates everything except reds.' : 'Applies to stills only.'}
                checked={media.keepReds}
                onChange={(v) => set({ keepReds: v })}
              />
              <label className={styles.inline}>
                <span>Position</span>
                <select className="field" value={media.fit} onChange={(e) => set({ fit: e.target.value as MediaFit })}>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="center">Center (actual size)</option>
                  <option value="focus">Focus point</option>
                </select>
              </label>
              {media.fit === 'focus' && (
                <>
                  <Slider label="Focus X" value={media.focusX} min={0} max={100} step={1} unit="%" onChange={(v) => set({ focusX: v })} />
                  <Slider label="Focus Y" value={media.focusY} min={0} max={100} step={1} unit="%" onChange={(v) => set({ focusY: v })} />
                </>
              )}
            </>
          )}
          {slot === 'background' && media.kind !== 'image' && (
            <Toggle
              label="Animate background"
              note="Off shows the first frame as a still. When on, it pauses while the window is hidden or after 60 s idle."
              checked={media.animate}
              onChange={(v) => set({ animate: v })}
            />
          )}
        </>
      )}
    </Group>
  );
}

// ---------------------------------------------------------------- intro

const STYLES: [IntroStyle, string][] = [['chrome', 'Chrome 3D'], ['flat', 'Flat'], ['glow', 'Glow'], ['outline', 'Outline']];

function IntroSection({ theme }: { theme: Theme }) {
  const { intro } = theme;
  const username = useStore((s) => s.user.username);
  const fontInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Theme['intro']>) => updateDraft((t) => void (t.intro = { ...t.intro, ...patch }));
  const setGlow = (patch: Partial<Theme['intro']['glow']>) => updateDraft((t) => void (t.intro.glow = { ...t.intro.glow, ...patch }));

  const uploadFont = async (file: File) => {
    try {
      const r = await backend.uploadThemeMedia(theme.id, 'font', file);
      set({ font: 'custom', customFont: r.file });
    } catch (err) {
      toast(`Font upload failed: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <Group title="Text">
        <label className={styles.stack}>
          <span>Title</span>
          <input className="field" value={intro.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className={styles.stack}>
          <span>Subtitle</span>
          <input className="field" value={intro.subtitle} placeholder={`${username} (your macOS username)`} onChange={(e) => set({ subtitle: e.target.value })} />
        </label>
      </Group>

      <Group title="Font">
        <div className={styles.fontRow}>
          <select className="field" value={intro.font} onChange={(e) => set({ font: e.target.value })}>
            {FONT_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
            {intro.customFont && <option value="custom">Uploaded font</option>}
          </select>
          <input ref={fontInput} type="file" accept=".ttf,.otf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadFont(f); }} />
          <button className="btn" onClick={() => fontInput.current?.click()}><IconUpload /> .ttf/.otf</button>
        </div>
        <div className={styles.fontSample} style={{ fontFamily: fontFamilyOf(theme) }}>
          <span className="chrome-text"><span className="ex">{intro.title || 'WELCOME BACK'}</span><span className="face">{intro.title || 'WELCOME BACK'}</span></span>
        </div>
      </Group>

      <Group title="Glow under text">
        <Toggle label="Glow" checked={intro.glow.enabled} onChange={(v) => setGlow({ enabled: v })} />
        {intro.glow.enabled && (
          <>
            <ColorField label="Glow color" hint="independent of the accent" value={intro.glow.color} onChange={(c) => setGlow({ color: c })} />
            <Slider label="Intensity" value={intro.glow.intensity} min={0} max={1} step={0.01} onChange={(v) => setGlow({ intensity: v })} />
            <Slider label="Size" value={intro.glow.size} min={0.5} max={2} step={0.01} unit="×" onChange={(v) => setGlow({ size: v })} />
          </>
        )}
        {/* Live preview: the same glow layer the intro uses, updating as you drag. */}
        <div className={styles.glowPreview} style={{ ...glowVars(intro.glow), fontFamily: fontFamilyOf(theme) } as React.CSSProperties}>
          {intro.glow.enabled && <div className={`${introStyles.horizon} ${styles.glowLayer}`} />}
          <span className="chrome-text"><span className="ex">{intro.title || 'WELCOME BACK'}</span><span className="face">{intro.title || 'WELCOME BACK'}</span></span>
        </div>
      </Group>

      <Group title="Style">
        <Segmented value={intro.style} options={STYLES} onChange={(v) => set({ style: v })} />
        <Slider label="Duration" value={intro.duration} min={2} max={6} step={0.1} unit="s" onChange={(v) => set({ duration: v })} />
        <Toggle label="Play on launch" checked={intro.playOnLaunch} onChange={(v) => set({ playOnLaunch: v })} />
        <Toggle label="Rain effect" checked={intro.rain} onChange={(v) => set({ rain: v })} />
        <Toggle label="Emblem" checked={intro.emblem} onChange={(v) => set({ emblem: v })} />
      </Group>

      <button className="btn btn-primary" onClick={() => useStore.setState({ introKey: Date.now() })}><IconReplay /> Preview intro</button>
    </>
  );
}

// ---------------------------------------------------------------- bits

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      <h3 className="section-label">{title}</h3>
      {note && <p className={styles.note}>{note}</p>}
      {children}
    </section>
  );
}

function Slider({ label, value, min, max, step, unit = '', onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange(v: number): void }) {
  const shown = unit === '×' ? `${Math.round(value * 100)}%` : unit === 'px' || unit === 's' || unit === '%' ? `${+value.toFixed(1)}${unit}` : max <= 1 ? `${Math.round(value * 100)}%` : value.toFixed(2);
  return (
    <label className={styles.slider}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} />
      <output>{shown}</output>
    </label>
  );
}

function Toggle({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.switch} aria-hidden />
      <span className={styles.toggleText}>
        {label}
        {note && <small>{note}</small>}
      </span>
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <div className={styles.segmented} role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={v === value} className={v === value ? styles.segOn : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}
