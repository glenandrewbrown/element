/** Custom DOM events for cross-component communication. */

export const EV_FIT_BOARD = "element:fit-board" as const;
export const EV_CREATE_COMMENT = "element:create-comment" as const;
export const EV_OPEN_PREFERENCES = "element:open-preferences" as const;
export const EV_START_RENAME = "element:start-rename" as const;
/** Tidy the current Board — auto-layout + animated glide (Feedback #3b). Fired
 *  by the Toolbar button, the ⌘-shortcut, and the command palette; handled in
 *  GraphCanvas (which owns the layout + glide). */
export const EV_TIDY = "element:tidy" as const;
