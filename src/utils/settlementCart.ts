import type { SettlementMode } from "../../shared/contracts/settlement";

const CART_KEY_PREFIX = "settlementCart:";
const CART_EVENT_PREFIX = "settlement-cart:";
const SETTLEMENT_MODES: SettlementMode[] = ["redeem", "interest"];

const getCartKey = (mode: SettlementMode) => `${CART_KEY_PREFIX}${mode}`;
const getCartEvent = (mode: SettlementMode) => `${CART_EVENT_PREFIX}${mode}`;

const readCart = (mode: SettlementMode): number[] => {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(getCartKey(mode));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch {
    return [];
  }
};

const writeCart = (nextIds: number[]) => {
  const uniqueIds = Array.from(new Set(nextIds))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  for (const settlementMode of SETTLEMENT_MODES) {
    if (uniqueIds.length > 0) {
      window.sessionStorage.setItem(
        getCartKey(settlementMode),
        JSON.stringify(uniqueIds),
      );
    } else {
      window.sessionStorage.removeItem(getCartKey(settlementMode));
    }

    window.dispatchEvent(
      new CustomEvent(getCartEvent(settlementMode), {
        detail: { ids: uniqueIds },
      }),
    );
  }

  return uniqueIds;
};

export const getSettlementCartIds = (mode: SettlementMode) => readCart(mode);

export const addSettlementCartTicket = (mode: SettlementMode, pawnId: number) =>
  writeCart([...readCart(mode), pawnId]);

export const removeSettlementCartTicket = (
  mode: SettlementMode,
  pawnId: number,
) => writeCart(readCart(mode).filter((value) => value !== pawnId));

export const clearSettlementCart = (_mode: SettlementMode) =>
  writeCart([]);

export const replaceSettlementCart = (
  _mode: SettlementMode,
  pawnIds: number[],
) => writeCart(pawnIds);

export const onSettlementCartChange = (
  mode: SettlementMode,
  handler: (ids: number[]) => void,
) => {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ ids?: number[] }>).detail;
    handler(Array.isArray(detail?.ids) ? detail.ids : []);
  };

  window.addEventListener(getCartEvent(mode), listener);
  return () => window.removeEventListener(getCartEvent(mode), listener);
};
