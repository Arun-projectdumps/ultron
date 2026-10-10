import { useEffect, useState } from 'react';
import { RgbaColorPicker } from 'react-colorful';
import { parse, toCss, toHex } from '../theme/color';
import { isValidColor } from '../theme/derive';
import { IconDropper } from './Icons';
import styles from './ColorField.module.css';

declare global {
  interface Window { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }
}

interface Props {
  label: string;
  value: string;
  onChange(v: string): void;
  alpha?: boolean;
  hint?: string;
}

/** Swatch + hex field; expands to a picker with RGB(A) inputs and an eyedropper. */
export function ColorField({ label, value, onChange, alpha, hint }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const rgba = parse(value);
  const set = (c: { r: number; g: number; b: number; a: number }) => onChange(toCss({ ...c, a: alpha ? c.a : 1 }));

  return (
    <div className={styles.field}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.swatch}
          style={{ '--c': value } as React.CSSProperties}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title={`Edit ${label}`}
        />
        <span className={styles.label}>
          {label}
          {hint && <span className={styles.hint}>{hint}</span>}
        </span>
        <input
          className={styles.hex}
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            if (isValidColor(e.target.value)) onChange(e.target.value.trim());
          }}
          onBlur={() => setText(value)}
        />
      </div>
      {open && (
        <div className={styles.picker}>
          <RgbaColorPicker color={{ ...rgba, a: alpha ? rgba.a : 1 }} onChange={set} className={alpha ? '' : styles.noAlpha} />
          <div className={styles.channels}>
            {(['r', 'g', 'b'] as const).map((k) => (
              <label key={k}>
                <span>{k.toUpperCase()}</span>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={Math.round(rgba[k])}
                  onChange={(e) => set({ ...rgba, [k]: Math.max(0, Math.min(255, Number(e.target.value))) })}
                />
              </label>
            ))}
            {alpha && (
              <label>
                <span>A</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={+rgba.a.toFixed(2)}
                  onChange={(e) => set({ ...rgba, a: Math.max(0, Math.min(1, Number(e.target.value))) })}
                />
              </label>
            )}
            {window.EyeDropper && (
              <button
                type="button"
                className="icon-btn"
                title="Pick a color from the screen"
                onClick={async () => {
                  try {
                    const { sRGBHex } = await new window.EyeDropper!().open();
                    onChange(alpha && rgba.a < 1 ? toCss({ ...parse(sRGBHex), a: rgba.a }) : toHex(parse(sRGBHex)));
                  } catch { /* cancelled */ }
                }}
              >
                <IconDropper size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
