import { useState } from 'react';
import { useStore } from '../state/store';
import {
  addTab, closeAll, closeOthers, closeSide, closeTab, duplicateTab, moveTab, renameTab, selectTab, split, tabTitle, cwdOfPane,
} from '../lib/tabs';
import { hint } from '../lib/shortcuts';
import type { Tab } from '../backend';
import { openContextMenu } from './ContextMenu';
import { IconClose, IconPlus, IconSplitDown, IconSplitRight } from './Icons';
import styles from './TabBar.module.css';

export function TabBar() {
  const tabs = useStore((s) => s.layout.tabs);
  const activeId = useStore((s) => s.layout.activeTab);
  useStore((s) => s.panes); // re-render titles/dots when pane state changes
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: number | null } | null>(null);

  const tabMenu = (tab: Tab, i: number) => [
    { label: 'New Tab', hint: hint('newTab'), run: () => addTab(undefined, i + 1) },
    { label: 'Duplicate Tab', run: () => duplicateTab(tab.id) },
    { label: 'Rename…', run: () => setRenaming(tab.id) },
    { separator: true, label: '' },
    { label: 'Split Right', hint: hint('splitRight'), run: () => split('row', tab.activePane) },
    { label: 'Split Down', hint: hint('splitDown'), run: () => split('column', tab.activePane) },
    { separator: true, label: '' },
    { label: 'Move to Left', disabled: i === 0, run: () => moveTab(tab.id, i - 1) },
    { label: 'Move to Right', disabled: i === tabs.length - 1, run: () => moveTab(tab.id, i + 1) },
    { separator: true, label: '' },
    { label: 'Close', hint: hint('close'), run: () => closeTab(tab.id) },
    { label: 'Close Others', disabled: tabs.length < 2, run: () => closeOthers(tab.id) },
    { label: 'Close Tabs to the Left', disabled: i === 0, run: () => closeSide(tab.id, 'left') },
    { label: 'Close Tabs to the Right', disabled: i === tabs.length - 1, run: () => closeSide(tab.id, 'right') },
    { label: 'Close All', danger: true, run: closeAll },
  ];

  return (
    <div
      className={styles.bar}
      onContextMenu={(e) => {
        if ((e.target as Element).closest('[data-tab]')) return;
        openContextMenu(e, [
          { label: 'New Tab', hint: hint('newTab'), run: () => addTab() },
          { label: 'Close All', danger: true, run: closeAll },
        ]);
      }}
      onDoubleClick={(e) => e.target === e.currentTarget && addTab()}
    >
      <div className={styles.tabs} role="tablist">
        {tabs.map((tab, i) => {
          const { title, claude } = tabTitle(tab);
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              data-tab
              role="tab"
              aria-selected={active}
              title={cwdOfPane(tab.activePane) ?? ''}
              className={[
                styles.tab,
                active && styles.active,
                drag?.id === tab.id && styles.dragging,
                drag && drag.over === i && drag.id !== tab.id && styles.dropBefore,
              ].filter(Boolean).join(' ')}
              draggable={renaming !== tab.id}
              onMouseDown={(e) => e.button === 0 && selectTab(tab.id)}
              onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
              onDoubleClick={() => setRenaming(tab.id)}
              onContextMenu={(e) => {
                e.stopPropagation();
                openContextMenu(e, tabMenu(tab, i));
              }}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                setDrag({ id: tab.id, over: null });
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const over = e.clientX > r.left + r.width / 2 ? i + 1 : i;
                if (over !== drag.over) setDrag({ ...drag, over });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag?.over != null) {
                  const from = tabs.findIndex((t) => t.id === drag.id);
                  moveTab(drag.id, drag.over > from ? drag.over - 1 : drag.over);
                }
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
            >
              {claude && <span className={styles.dot} title="Claude running" />}
              {renaming === tab.id ? (
                <input
                  className={styles.rename}
                  autoFocus
                  defaultValue={tab.title ?? title}
                  onFocus={(e) => e.target.select()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    renameTab(tab.id, e.target.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span className={styles.title}>{title}</span>
              )}
              <button
                className={styles.close}
                title={`Close (${hint('close')})`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => closeTab(tab.id)}
              >
                <IconClose size={11} />
              </button>
            </div>
          );
        })}
        <button className={styles.add} onClick={() => addTab()} title={`New tab (${hint('newTab')})`}>
          <IconPlus size={13} />
        </button>
      </div>
      <div className={styles.tools}>
        <button className="icon-btn" onClick={() => split('row')} title={`Split right (${hint('splitRight')})`}><IconSplitRight size={14} /></button>
        <button className="icon-btn" onClick={() => split('column')} title={`Split down (${hint('splitDown')})`}><IconSplitDown size={14} /></button>
      </div>
    </div>
  );
}
