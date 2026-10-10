import { useState } from 'react';
import { useStore } from '../state/store';
import { currentPane } from '../lib/shell';
import { hint } from '../lib/shortcuts';
import { backend } from '../backend';
import { addProjectFromPicker, launchClaude, openFolder, openProject, restartShell } from '../lib/shell';
import type { Project } from '../backend';
import { IconEdit, IconFolder, IconGear, IconLocate, IconPlay, IconPlus, IconRestart, IconSidebar, IconTrash } from './Icons';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const switching = useStore((s) => !!s.panes[currentPane()]?.switching);
  const booting = useStore((s) => !!s.panes[currentPane()]?.booting);
  const projects = useStore((s) => s.data?.projects ?? []);
  const set = useStore((s) => s.set);

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
    >
      <div className={styles.section}>
        <div className={styles.header}>
          <span className="section-label">Actions</span>
          <button className="icon-btn" onClick={() => set({ sidebarCollapsed: !collapsed })} title={`Toggle sidebar (${hint('sidebar')})`}>
            <IconSidebar size={14} />
          </button>
        </div>
        <button className={`btn btn-primary ${styles.action}`} onClick={() => launchClaude()} disabled={switching || booting} title={`Launch Claude (${hint('claude')})`}>
          <IconPlay /> <span className={styles.label}>Claude</span>
        </button>
        <button className={`btn ${styles.action}`} onClick={openFolder} disabled={switching} title={`Open folder (${hint('openFolder')})`}>
          <IconFolder /> <span className={styles.label}>Open…</span>
          <span className={`kbd ${styles.hint}`}>{hint('openFolder')}</span>
        </button>
        <button className={`btn ${styles.action}`} onClick={() => restartShell()} title="Restart shell">
          <IconRestart /> <span className={styles.label}>Restart</span>
        </button>
      </div>

      <div className={`${styles.section} ${styles.projects}`}>
        <div className={styles.header}>
          <span className="section-label">Projects</span>
          <button className="icon-btn" onClick={addProjectFromPicker} title="Add project">
            <IconPlus size={14} />
          </button>
        </div>
        <ProjectList projects={projects} disabled={switching} />
        {!projects.length && !collapsed && (
          <button className={styles.empty} onClick={addProjectFromPicker}>
            Save folders you return to. Click one to open it in Claude.
          </button>
        )}
      </div>

      <div className={styles.footer}>
        <button className={`btn btn-ghost ${styles.action}`} onClick={() => set({ dialog: { kind: 'settings' } })} title={`Settings (${hint('settings')})`}>
          <IconGear /> <span className={styles.label}>Settings</span>
        </button>
      </div>
    </aside>
  );
}

function ProjectList({ projects, disabled }: { projects: Project[]; disabled: boolean }) {
  const cwd = useStore((s) => s.panes[currentPane()]?.status.cwd);
  const missing = useStore((s) => s.missing);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const update = useStore((s) => s.update);
  const set = useStore((s) => s.set);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const move = (from: string, to: string) => {
    if (from === to) return;
    update((d) => {
      const i = d.projects.findIndex((p) => p.id === from);
      const [item] = d.projects.splice(i, 1);
      const j = d.projects.findIndex((p) => p.id === to);
      d.projects.splice(i <= j ? j + 1 : j, 0, item);
    });
  };

  const locate = async (id: string) => {
    const path = await backend.pickFolder();
    if (!path) return;
    update((d) => {
      const p = d.projects.find((x) => x.id === id);
      if (p) p.path = path;
    });
    useStore.setState((s) => ({ missing: { ...s.missing, [id]: false } }));
  };

  return (
    <ul className={`${styles.list} ${disabled ? styles.disabled : ''}`}>
      {projects.map((p) => {
        const isMissing = missing[p.id];
        const active = cwd === p.path;
        return (
          <li
            key={p.id}
            className={[
              styles.item,
              active && styles.activeItem,
              isMissing && styles.missing,
              dragId === p.id && styles.dragging,
              overId === p.id && dragId !== p.id && styles.dropTarget,
            ].filter(Boolean).join(' ')}
            draggable={!collapsed}
            onDragStart={(e) => {
              setDragId(p.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(p.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) move(dragId, p.id);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
          >
            <button
              className={styles.row}
              onClick={() => (isMissing ? locate(p.id) : openProject(p.id))}
              disabled={disabled}
              title={isMissing ? `${p.path} (not found — click to locate)` : p.path}
            >
              <span className={styles.initial}>{p.name.slice(0, 1).toUpperCase()}</span>
              <span className={styles.name}>{p.name}</span>
            </button>
            {!collapsed && (
              <span className={styles.rowActions}>
                {isMissing ? (
                  <button className={`icon-btn ${styles.locate}`} onClick={() => locate(p.id)} title="Locate…">
                    <IconLocate size={13} /> <span>Locate…</span>
                  </button>
                ) : (
                  <button className="icon-btn" onClick={() => set({ dialog: { kind: 'project', project: p } })} title="Rename">
                    <IconEdit size={13} />
                  </button>
                )}
                <button
                  className="icon-btn danger"
                  onClick={() => update((d) => void (d.projects = d.projects.filter((x) => x.id !== p.id)))}
                  title="Remove from list (folder is not touched)"
                >
                  <IconTrash size={13} />
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
