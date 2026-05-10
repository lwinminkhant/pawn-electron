import { useEffect, useRef, useState } from "react";
import type { SettlementPawn } from "../components/SettlementTicketDetailsDialog";
import { replaceSettlementCart } from "../utils/settlementCart";

type SettlementMode = "redeem" | "interest";

type UseSettlementTicketsLoaderOptions = {
  mode: SettlementMode;
  cartIds: number[];
  onLoaded?: (pawns: SettlementPawn[]) => void;
  onMessage?: (message: string | null) => void;
};

export const useSettlementTicketsLoader = ({
  mode,
  cartIds,
  onLoaded,
  onMessage,
}: UseSettlementTicketsLoaderOptions) => {
  const [pawns, setPawns] = useState<SettlementPawn[]>([]);
  const [loading, setLoading] = useState(false);
  const onLoadedRef = useRef(onLoaded);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
    onMessageRef.current = onMessage;
  }, [onLoaded, onMessage]);

  useEffect(() => {
    let cancelled = false;

    const loadPawns = async () => {
      if (cartIds.length === 0) {
        setPawns([]);
        onLoadedRef.current?.([]);
        onMessageRef.current?.(null);
        return;
      }

      setLoading(true);
      const nextPawns: SettlementPawn[] = [];
      const nextValidIds: number[] = [];
      const errors: string[] = [];

      for (const pawnId of cartIds) {
        try {
          const result = await window.electron.ipcRenderer.invoke("get-pawn", {
            pawnId,
          });
          if (result.success && result.pawn) {
            nextPawns.push(result.pawn as SettlementPawn);
            nextValidIds.push(pawnId);
          } else {
            errors.push(result.message || `Ticket #${pawnId} could not be loaded`);
          }
        } catch (error) {
          console.error("Error loading pawn:", error);
          errors.push(`Ticket #${pawnId} could not be loaded`);
        }
      }

      if (cancelled) return;

      setPawns(nextPawns);
      onLoadedRef.current?.(nextPawns);
      onMessageRef.current?.(errors.length > 0 ? errors.join(" ") : null);

      if (nextValidIds.length !== cartIds.length) {
        replaceSettlementCart(mode, nextValidIds);
      }

      setLoading(false);
    };

    void loadPawns();
    return () => {
      cancelled = true;
    };
  }, [cartIds, mode]);

  return { pawns, setPawns, loading };
};
