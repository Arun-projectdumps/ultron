import type { AppData, Template } from './types';

export const SEED_TEMPLATES: Template[] = [
  {
    id: 'seed-research',
    title: 'Research a topic',
    category: 'Research',
    body: 'Research {topic}. Start by listing what you need to find out, then investigate each point. Cite files/lines or sources for every claim. End with a short summary and open questions.',
  },
  {
    id: 'seed-thinking',
    title: 'Think before coding',
    category: 'Thinking',
    body: 'Before writing any code, think through {problem}. Lay out 2–3 approaches with trade-offs, recommend one, and wait for my go-ahead.',
  },
  {
    id: 'seed-prototype',
    title: 'Quick prototype',
    category: 'Prototype',
    body: 'Build a quick, working prototype of {idea}. Favor speed over polish, keep it in as few files as possible, and tell me exactly how to run it.',
  },
  {
    id: 'seed-bug',
    title: 'Fix a bug properly',
    category: 'Bug fixing',
    body: "There's a bug: {describe}. Reproduce it first, find the root cause (not just the symptom), fix it, and add a test that would have caught it.",
  },
  {
    id: 'seed-review',
    title: 'Code review',
    category: 'Bug fixing',
    body: 'Review the changes in this repo (git diff). Flag bugs, risky logic and unclear naming, ordered by severity.',
  },
];

export const DEFAULT_DATA: AppData = {
  version: 1,
  projects: [],
  templates: SEED_TEMPLATES,
  settings: { claudeCommand: 'claude', themeId: 'nocturne' },
};

/** Fills in anything missing from a stored file (or seeds a fresh one). */
export function withDefaults(raw: Partial<AppData> | null | undefined): AppData {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_DATA);
  const s = (raw.settings ?? {}) as Partial<AppData['settings']>;
  return {
    version: 1,
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    templates: Array.isArray(raw.templates) ? raw.templates : structuredClone(SEED_TEMPLATES),
    settings: {
      claudeCommand: s.claudeCommand || 'claude',
      themeId: s.themeId || 'nocturne',
      ...(s.shortcuts && typeof s.shortcuts === 'object' ? { shortcuts: s.shortcuts } : {}),
    },
    layout: raw.layout && Array.isArray(raw.layout.tabs) && raw.layout.tabs.length ? raw.layout : undefined,
  };
}
