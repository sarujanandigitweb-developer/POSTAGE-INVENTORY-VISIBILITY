// Small line icons for the sidebar and header. Inline so there is no icon font
// or extra request, and so they inherit currentColor.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
const wrap = (d, size = 17) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...S} aria-hidden="true">{d}</svg>
);

export const IconInventory = p => wrap(<><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>, p?.size);
export const IconPostage   = p => wrap(<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="m3 7 9 6 9-6" /></>, p?.size);
export const IconPrice     = p => wrap(<><path d="M20.5 13.5 13 21a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.4 12V4.5A2 2 0 0 1 4.4 2.5H12a2 2 0 0 1 1.4.6l7.1 7.1a2 2 0 0 1 0 3.3Z" /><circle cx="7.3" cy="7.3" r="1.3" /></>, p?.size);
export const IconSlow      = p => wrap(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, p?.size);
export const IconDispatch  = p => wrap(<><path d="M2.5 7.5h11v9h-11z" /><path d="M13.5 10.5h4l3 3v3h-7z" /><circle cx="6.5" cy="18" r="1.6" /><circle cx="16.5" cy="18" r="1.6" /></>, p?.size);

export const IconContainer = p => wrap(<><rect x="2.5" y="6" width="19" height="12" rx="1.5" /><path d="M6.5 6v12M10.5 6v12M14.5 6v12M18.5 6v12" /></>, p?.size);

export const IconMenu   = p => wrap(<path d="M4 7h16M4 12h16M4 17h16" />, p?.size ?? 19);
export const IconSearch = p => wrap(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>, p?.size);
export const IconReset  = p => wrap(<><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5V10H9" /></>, p?.size);
export const IconDown   = p => wrap(<path d="m6 9 6 6 6-6" />, p?.size ?? 14);
export const IconLeft   = p => wrap(<path d="m14 6-6 6 6 6" />, p?.size ?? 14);
export const IconWarn   = p => wrap(<><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.5v.01" /></>, p?.size ?? 13);
export const IconExport = p => wrap(<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" />, p?.size ?? 15);
export const IconMoon   = p => wrap(<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />, p?.size ?? 15);
export const IconBox    = p => wrap(<><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>, p?.size ?? 20);

export const TAB_ICON = {
  inv: IconInventory, postage: IconPostage, fx: IconPrice, sm: IconSlow,
  pd: IconDispatch, cd: IconContainer,
};
