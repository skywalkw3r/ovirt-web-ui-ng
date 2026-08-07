// Fired by the masthead GlobalSearchBox and the nav keyboard shortcuts —
// CommandPalette owns its open state, so external triggers arrive as a
// window event rather than lifted state. Lives here (not in the palette)
// so hooks/ never has to import from components/.
export const OPEN_GLOBAL_SEARCH_EVENT = 'console:open-global-search'
