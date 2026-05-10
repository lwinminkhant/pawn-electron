const PAWN_FOCUS = "pawnFocusId";
const PAWN_CURRENT_KEY = "currentTicketId";
const PAWN_LOAD_EVENT = "pawn:loadTicket";
const PAWN_CURRENT_EVENT = "pawn:currentTicket";
const PAWN_UNLOAD_EVENT = "pawn:unloadTicket";

export function setPawnFocus(id: number) {
  sessionStorage.setItem(PAWN_FOCUS, String(id));
}

export function consumePawnFocus(): number | null {
  const v = sessionStorage.getItem(PAWN_FOCUS);
  if (v) sessionStorage.removeItem(PAWN_FOCUS);
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/** Ask any mounted page (Redeem / Interest) to load the given ticket. */
export function requestLoadTicket(id: number) {
  setPawnFocus(id);
  window.dispatchEvent(new CustomEvent(PAWN_LOAD_EVENT, { detail: { id } }));
}

/** Subscribe to load-ticket requests from the title bar. Returns a cleanup. */
export function onLoadTicket(handler: (id: number) => void) {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ id: number }>).detail;
    if (detail && Number.isFinite(detail.id)) handler(detail.id);
  };
  window.addEventListener(PAWN_LOAD_EVENT, listener);
  return () => window.removeEventListener(PAWN_LOAD_EVENT, listener);
}

/** Read the last known loaded ticket id (survives page navigation). */
export function getCurrentTicketId(): number | null {
  const v = sessionStorage.getItem(PAWN_CURRENT_KEY);
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Broadcast (and persist) which ticket is currently loaded on the active page. */
export function publishCurrentTicket(id: number | null) {
  if (id != null && Number.isFinite(id) && id > 0) {
    sessionStorage.setItem(PAWN_CURRENT_KEY, String(id));
  } else {
    sessionStorage.removeItem(PAWN_CURRENT_KEY);
  }
  window.dispatchEvent(
    new CustomEvent(PAWN_CURRENT_EVENT, { detail: { id } }),
  );
}

/** Subscribe to the currently loaded ticket id. Returns a cleanup. */
export function onCurrentTicket(handler: (id: number | null) => void) {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ id: number | null }>).detail;
    handler(detail?.id ?? null);
  };
  window.addEventListener(PAWN_CURRENT_EVENT, listener);
  return () => window.removeEventListener(PAWN_CURRENT_EVENT, listener);
}

/** Ask mounted pages to drop their loaded ticket and clear persistence. */
export function requestUnloadTicket() {
  publishCurrentTicket(null);
  window.dispatchEvent(new CustomEvent(PAWN_UNLOAD_EVENT));
}

/** Subscribe to unload-ticket requests (from the title-bar cross). */
export function onUnloadTicket(handler: () => void) {
  const listener = () => handler();
  window.addEventListener(PAWN_UNLOAD_EVENT, listener);
  return () => window.removeEventListener(PAWN_UNLOAD_EVENT, listener);
}
