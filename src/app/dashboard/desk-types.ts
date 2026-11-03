/**
 * Shared view-model types for the reception desk.
 *
 * These existed only as side-effects of importing legacy widget components
 * (`leads-widget.tsx`). Moving them here lets the widgets themselves be deleted
 * without dragging a dead import into the shell.
 */

/** A lead as the desk needs it: enough to badge the count and link out. */
export type DeskLead = {
  createdAt: string;
  fullName: string;
  goal: string | null;
  id: string;
  phoneNumber: string;
  request: string | null;
  source: string;
  status: string;
};
