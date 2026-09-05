import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The right-hand end of the breadcrumb bar, lent to the page below it.
 *
 * The trail is the Shell's — it is the same bar on every screen — but a page
 * sometimes has one control that belongs on that line rather than inside its
 * first panel: the way back off a detail page, which reads as part of the trail
 * and not as part of the record. Rendering it in the page and nudging it upward
 * would only look aligned until something above it changed height, so the Shell
 * keeps a node on the row and the page fills it through a portal.
 *
 * Null until the bar has mounted, and null on a screen with no trail at all —
 * the dashboard — where `CrumbActions` renders nothing rather than dropping the
 * control somewhere else.
 */
export const CrumbSlotContext = createContext<HTMLElement | null>(null);

export function CrumbActions({ children }: { children: ReactNode }) {
  const slot = useContext(CrumbSlotContext);
  return slot ? createPortal(children, slot) : null;
}
