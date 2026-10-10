import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, type MenuItem } from '../state/store';
import styles from './ContextMenu.module.css';

export const openContextMenu = (e: { clientX: number; clientY: number; preventDefault(): void }, items: MenuItem[]) => {
  e.preventDefault();
  useStore.setState({ contextMenu: { x: e.clientX, y: e.clientY, items } });
};

export function ContextMenu() {
  const menu = useStore((s) => s.contextMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const close = () => useStore.setState({ contextMenu: null });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, innerWidth - r.width - 6), y: Math.min(menu.y, innerHeight - r.height - 6) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div ref={ref} className={styles.menu} style={{ left: pos.x, top: pos.y }} role="menu">
      {menu.items.map((item, i) =>
        item.separator ? (
          <div key={i} className={styles.sep} />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`${styles.item} ${item.danger ? styles.danger : ''}`}
            disabled={item.disabled}
            onClick={() => {
              close();
              item.run?.();
            }}
          >
            <span>{item.label}</span>
            {item.hint && <span className={styles.hint}>{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
