// Minimal 16px stroke icon set (no icon font).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
});

export const IconPlay = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" /></svg>);
export const IconFolder = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" /></svg>);
export const IconRestart = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8" /><path d="M2.5 2.5v3h3" /></svg>);
export const IconPlus = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 3v10M3 8h10" /></svg>);
export const IconSearch = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3.3 3.3" /></svg>);
export const IconChevron = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m4.5 6.5 3.5 3.5 3.5-3.5" /></svg>);
export const IconEdit = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M10.5 2.8 13.2 5.5 6 12.7l-3.2.5.5-3.2z" /></svg>);
export const IconTrash = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>);
export const IconGear = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="8" cy="8" r="2" /><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /></svg>);
export const IconSidebar = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M6 3v10" /></svg>);
export const IconGrip = ({ size, ...p }: P) => (<svg {...base(size)} {...p} stroke="none" fill="currentColor"><circle cx="6" cy="4.5" r="1" /><circle cx="10" cy="4.5" r="1" /><circle cx="6" cy="8" r="1" /><circle cx="10" cy="8" r="1" /><circle cx="6" cy="11.5" r="1" /><circle cx="10" cy="11.5" r="1" /></svg>);
export const IconLocate = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="8" cy="8" r="4.5" /><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" /></svg>);
export const IconReplay = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.8" /><path d="M13.5 2.5v3h-3" /><path d="M7 6v4l3-2z" fill="currentColor" stroke="none" /></svg>);
export const IconPower = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 2.5V8" /><path d="M4.8 4.6a4.8 4.8 0 1 0 6.4 0" /></svg>);
export const IconPalette = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 2a6 6 0 0 0 0 12c.9 0 1.3-.6 1.3-1.2 0-.8-.6-1-.6-1.7 0-.6.5-1 1.1-1H11a3 3 0 0 0 3-3C14 4.4 11.3 2 8 2z" /><circle cx="5" cy="7.5" r=".9" fill="currentColor" stroke="none" /><circle cx="7.2" cy="4.9" r=".9" fill="currentColor" stroke="none" /><circle cx="10.4" cy="5.4" r=".9" fill="currentColor" stroke="none" /></svg>);
export const IconCheck = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m3.5 8.5 3 3 6-7" /></svg>);
export const IconCopy = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7" /></svg>);
export const IconDownload = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" /></svg>);
export const IconUpload = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 10.5v-8M4.8 5.5 8 2.3l3.2 3.2M3 13.5h10" /></svg>);
export const IconClose = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m4 4 8 8M12 4l-8 8" /></svg>);
export const IconSplitRight = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M8 3v10" /></svg>);
export const IconSplitDown = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 8h12" /></svg>);
export const IconDropper = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m9.5 4.5 2 2M3 13l1-3 5.8-5.8a1.4 1.4 0 0 1 2 2L6 12z" /><path d="m10.5 3.5 1-1a1.4 1.4 0 0 1 2 2l-1 1" /></svg>);
export const IconWand = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m3 13 7.5-7.5M9.5 4.5l2 2" /><path d="M12.5 1.8v1.6M11.7 2.6h1.6M13.8 6.8v1.4M13.1 7.5h1.4M6.5 1.8v1.4M5.8 2.5h1.4" /></svg>);
