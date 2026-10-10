/** Single-quote a path for zsh: ' becomes '\'' */
export const shellQuote = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;

export const tildify = (p: string, home: string) =>
  home && (p === home || p.startsWith(home + '/')) ? '~' + p.slice(home.length) : p;

export const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;
