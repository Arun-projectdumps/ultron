import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { activeTab, setRatio } from '../lib/layout';
import { attach, focusPane } from '../lib/terminals';
import { setActivePane, setRatioAction, closePane, split } from '../lib/tabs';
import { launchClaude, restartShell } from '../lib/shell';
import { hint } from '../lib/shortcuts';
import type { PaneNode, Tab } from '../backend';
import { BootOverlay } from './BootOverlay';
import { TabBar } from './TabBar';
import { openContextMenu } from './ContextMenu';
import styles from './Workspace.module.css';

/** Tab bar + the active tab's split tree. Inactive tabs' terminals stay alive, detached. */
export function Workspace() {
  const tab = useStore((s) => activeTab(s.layout));
  return (
    <div className={styles.workspace}>
      <TabBar />
      <div className={styles.area}>{tab && <Node key={tab.id} tab={tab} node={tab.root} />}</div>
    </div>
  );
}

function Node({ tab, node }: { tab: Tab; node: PaneNode }) {
  if (node.type === 'pane') return <Pane key={node.id} tabId={tab.id} paneId={node.id} cwd={node.cwd} solo={tab.root === node} />;
  return <Split tab={tab} node={node} />;
}

function Split({ tab, node }: { tab: Tab; node: Extract<PaneNode, { type: 'split' }> }) {
  const ref = useRef<HTMLDivElement>(null);
  const row = node.dir === 'row';

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = ref.current!;
    const rect = el.getBoundingClientRect();
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = row ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      const ratio = Math.min(0.88, Math.max(0.12, r));
      // Live drag only touches CSS; the layout (and saved file) updates once on release.
      el.style.setProperty('--ratio', String(ratio));
      el.dataset.ratio = String(ratio);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const ratio = Number(el.dataset.ratio ?? node.ratio);
      const t = useStore.getState().layout.tabs.find((x) => x.id === tab.id);
      if (t) setRatioAction(tab.id, setRatio(t.root, node.id, ratio));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      className={`${styles.split} ${row ? styles.row : styles.column}`}
      style={{ '--ratio': node.ratio } as React.CSSProperties}
    >
      <div className={styles.child} style={{ flexGrow: 'var(--ratio)' } as React.CSSProperties}>
        <Node tab={tab} node={node.a} />
      </div>
      <div
        className={styles.divider}
        onPointerDown={onPointerDown}
        onDoubleClick={() => {
          const t = useStore.getState().layout.tabs.find((x) => x.id === tab.id);
          if (t) setRatioAction(tab.id, setRatio(t.root, node.id, 0.5));
        }}
        role="separator"
        aria-orientation={row ? 'vertical' : 'horizontal'}
        title="Drag to resize · double-click to even out"
      />
      <div className={styles.child} style={{ flexGrow: 'calc(1 - var(--ratio))' } as React.CSSProperties}>
        <Node tab={tab} node={node.b} />
      </div>
    </div>
  );
}

function Pane({ tabId, paneId, cwd, solo }: { tabId: string; paneId: string; cwd?: string; solo: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const flashAt = useStore((s) => (s.flash?.pane === paneId ? s.flash.at : 0));
  const focused = useStore((s) => {
    const t = s.layout.tabs.find((x) => x.id === tabId);
    return t?.activePane === paneId;
  });

  useEffect(() => {
    const detach = attach(paneId, hostRef.current!, cwd);
    if (useStore.getState().introKey === null && focused) focusPane(paneId);
    return detach;
  }, [paneId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`${styles.pane} ${focused && !solo ? styles.focused : ''} ${focused ? styles.isActive : ''}`}
      data-pane={paneId}
      onMouseDown={() => setActivePane(paneId)}
      onContextMenu={(e) => {
        setActivePane(paneId);
        openContextMenu(e, [
          { label: 'Launch Claude', run: () => launchClaude(paneId) },
          { separator: true, label: '' },
          { label: 'Split Right', hint: hint('splitRight'), run: () => split('row', paneId) },
          { label: 'Split Down', hint: hint('splitDown'), run: () => split('column', paneId) },
          { separator: true, label: '' },
          { label: 'Restart Shell', run: () => restartShell(paneId) },
          { label: 'Close Pane', hint: hint('close'), run: () => closePane(paneId) },
        ]);
      }}
    >
      <div className={styles.inner}>
        <span className={styles.surface} aria-hidden />
        <span className={styles.edge} aria-hidden />
        <div ref={hostRef} className={styles.host} />
        <BootOverlay paneId={paneId} />
        <span key={flashAt} className={`${styles.flash} ${flashAt ? styles.flashOn : ''}`} aria-hidden />
      </div>
      <span className={styles.ring} aria-hidden />
      <span className={styles.notchTL} aria-hidden />
      <span className={styles.notchBR} aria-hidden />
    </div>
  );
}
