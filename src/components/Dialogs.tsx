import { useCallback, useState } from 'react';
import { useStore, newId } from '../state/store';
import { addProject } from '../lib/shell';
import { basename } from '../lib/paths';
import { focusPane } from '../lib/terminals';
import { currentPane } from '../lib/shell';
import { backend, type Project, type Template } from '../backend';
import { Dialog, Field } from './Dialog';
import { Settings } from './Settings';

/** Renders whichever dialog the store says is open. */
export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const close = useCallback(() => {
    useStore.setState({ dialog: null });
    focusPane(currentPane());
  }, []);

  if (!dialog) return null;
  if (dialog.kind === 'project') return <ProjectDialog project={dialog.project} path={dialog.path} onClose={close} />;
  if (dialog.kind === 'template') return <TemplateDialog template={dialog.template} onClose={close} />;
  return <Settings onClose={close} initialTab={dialog.tab} />;
}

function ProjectDialog({ project, path: initialPath, onClose }: { project?: Project; path?: string; onClose(): void }) {
  const update = useStore((s) => s.update);
  const [path, setPath] = useState(project?.path ?? initialPath ?? '');
  const [name, setName] = useState(project?.name ?? (initialPath ? basename(initialPath) : ''));

  const save = () => {
    if (project) {
      update((d) => {
        const p = d.projects.find((x) => x.id === project.id);
        if (p) Object.assign(p, { name: name.trim() || basename(path), path });
      });
      useStore.setState((s) => ({ missing: { ...s.missing, [project.id]: false } }));
    } else {
      addProject(name, path);
    }
    onClose();
  };

  return (
    <Dialog title={project ? 'Edit project' : 'Add project'} onClose={onClose} onSubmit={save} submitDisabled={!path}>
      <Field label="Name">
        <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={basename(path)} />
      </Field>
      <Field label="Folder">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          <button type="button" className="btn" onClick={async () => { const p = await backend.pickFolder(); if (p) setPath(p); }}>
            Choose…
          </button>
        </div>
      </Field>
    </Dialog>
  );
}

function TemplateDialog({ template, onClose }: { template?: Template; onClose(): void }) {
  const update = useStore((s) => s.update);
  const templates = useStore((s) => s.data?.templates ?? []);
  const categories = [...new Set(['Research', 'Thinking', 'Prototype', 'Bug fixing', ...templates.map((t) => t.category)])];
  const [title, setTitle] = useState(template?.title ?? '');
  const [category, setCategory] = useState(template?.category ?? 'Research');
  const [body, setBody] = useState(template?.body ?? '');

  const save = () => {
    update((d) => {
      const next = { title: title.trim(), category: category.trim() || 'Other', body };
      const existing = template && d.templates.find((t) => t.id === template.id);
      if (existing) Object.assign(existing, next);
      else d.templates.push({ id: newId(), ...next });
    });
    onClose();
  };

  return (
    <Dialog
      title={template ? 'Edit template' : 'New template'}
      onClose={onClose}
      onSubmit={save}
      submitDisabled={!title.trim() || !body.trim()}
    >
      <Field label="Title">
        <input className="field" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Explain this module" />
      </Field>
      <Field label="Category" hint="Pick one or type a new category.">
        <input className="field" list="tpl-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="tpl-categories">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
      <Field label="Prompt" hint={<>Placeholders like <code>{'{topic}'}</code> stay as text — edit them in the terminal after pasting.</>}>
        <textarea
          className="field"
          rows={7}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey) {
              e.preventDefault();
              if (title.trim() && body.trim()) save();
            }
          }}
          spellCheck={false}
        />
      </Field>
    </Dialog>
  );
}
