import React, { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Badge, Button, Dialog, Money, Table, TBody, TD, TH, THead, TR, Textarea } from "./ui";
import { formatDateTime, formatDecimal, formatWeight } from "../utils/format";
import { usesGoldJewelleryStorage } from "../utils/storageUtils";

export interface SettlementPawn {
  id: number;
  customerId: number;
  customerName: string;
  physicalNumber?: string | null;
  storageLocation?: string;
  sequence?: number;
  item: {
    type: string;
    description: string;
    photo?: string;
    weight: number;
    netWeight?: number;
  };
  loanAmount: number;
  interestRate: number;
  status: string;
  createdAt: string;
  lastPaymentDate?: string;
  hasInterestPayments?: boolean;
  daysDue?: number;
  currentInterestDue?: number;
  maxAvailableAmount?: number;
  redeemedAt?: string;
  redeemedInterest?: number;
  redeemedPrincipal?: number;
  note?: string | null;
}

interface PawnTransaction {
  id: number;
  date: string;
  type: string;
  amount: number;
  description?: string;
  user?: string;
}

interface CustomerProfile {
  id: number;
  name: string;
  phone?: string;
  nrc?: string;
  address?: string;
  photo?: string;
}

type BadgeTone = "neutral" | "brass" | "success" | "warning" | "danger" | "info";

const statusTone = (status: string): BadgeTone => {
  if (status === "PAWN") return "brass";
  if (status === "REDEEMED") return "success";
  if (status === "EXPIRED") return "danger";
  return "neutral";
};

const statusLabel = (status: string): string => {
  if (status === "PAWN") return "Active";
  if (status === "REDEEMED") return "Redeemed";
  if (status === "EXPIRED") return "Expired";
  return status;
};

const getTxTone = (type: string): BadgeTone => {
  if (type === "PAWN" || type === "PLUS_AMOUNT") return "warning";
  if (type === "PAID_INTEREST" || type === "REDEEM_I") return "info";
  if (type === "MINUS_AMOUNT" || type === "REDEEM_BA") return "success";
  return "neutral";
};

const DetailField: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div>
    <p className="eyebrow">{label}</p>
    <div className="text-[14px] font-medium mt-0.5 text-[var(--text-primary)]">
      {children}
    </div>
  </div>
);

const SettlementTicketDetailsDialog: React.FC<{
  pawn: SettlementPawn | null;
  open: boolean;
  onClose: () => void;
  footerExtras?: React.ReactNode;
  showRemarkAction?: boolean;
  onPawnUpdated?: (pawn: SettlementPawn) => void;
}> = ({ pawn, open, onClose, footerExtras, showRemarkAction = false, onPawnUpdated }) => {
  const [transactions, setTransactions] = useState<PawnTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [customerProfileOpen, setCustomerProfileOpen] = useState(false);
  const [loadingCustomerProfile, setLoadingCustomerProfile] = useState(false);
  const [editingRemark, setEditingRemark] = useState(false);
  const [remarkText, setRemarkText] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);
  const [remarkError, setRemarkError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !pawn) {
      if (!open) setTransactions([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingTransactions(true);
      try {
        const res = await window.electron.ipcRenderer.invoke(
          "get-pawn-transactions",
          { pawnId: pawn.id },
        );
        if (!cancelled && res.success && Array.isArray(res.transactions)) {
          setTransactions(res.transactions);
        } else if (!cancelled) {
          setTransactions([]);
        }
      } catch (error) {
        console.error("Error loading pawn transactions:", error);
        if (!cancelled) setTransactions([]);
      } finally {
        if (!cancelled) setLoadingTransactions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, pawn]);

  useEffect(() => {
    if (!open) {
      setCustomerProfile(null);
      setCustomerProfileOpen(false);
      setLoadingCustomerProfile(false);
      setEditingRemark(false);
      setRemarkText("");
      setRemarkError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !pawn) return;
    setRemarkText(pawn.note ?? "");
    setRemarkError(null);
  }, [open, pawn]);

  const openCustomerProfile = async () => {
    if (!pawn) return;
    setCustomerProfileOpen(true);
    setLoadingCustomerProfile(true);
    try {
      const res = await window.electron.ipcRenderer.invoke("list-customers");
      if (res.success && Array.isArray(res.customers)) {
        const match = res.customers.find(
          (customer: CustomerProfile) => customer.id === pawn.customerId,
        );
        setCustomerProfile(match ?? null);
      } else {
        setCustomerProfile(null);
      }
    } catch (error) {
      console.error("Error loading customer profile:", error);
      setCustomerProfile(null);
    } finally {
      setLoadingCustomerProfile(false);
    }
  };

  const saveRemark = async () => {
    if (!pawn) return;
    setSavingRemark(true);
    setRemarkError(null);
    try {
      const res = await window.electron.api.pawns.updateNote({
        pawnId: pawn.id,
        note: remarkText,
      });
      if (!res?.success) {
        setRemarkError(res?.message || "Failed to save remark");
        return;
      }
      onPawnUpdated?.({ ...pawn, note: remarkText.trim() || null });
      setEditingRemark(false);
    } catch (error) {
      console.error("Error saving pawn remark:", error);
      setRemarkError("Failed to save remark");
    } finally {
      setSavingRemark(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        size="lg"
        title={
          pawn ? (
            <span className="flex items-center gap-2 flex-wrap">
              <span className="mono">#{pawn.id}</span>
              <Badge tone={statusTone(pawn.status)} size="sm">
                {statusLabel(pawn.status)}
              </Badge>
            </span>
          ) : null
        }
        description={
          pawn ? (
            <button
              type="button"
              onClick={openCustomerProfile}
              className="text-left text-[var(--brass)] hover:underline"
            >
              {pawn.customerName}
            </button>
          ) : null
        }
        footer={
          <>
            {showRemarkAction && pawn && !editingRemark && (
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<MessageSquare size={14} />}
                onClick={() => {
                  setRemarkText(pawn.note ?? "");
                  setRemarkError(null);
                  setEditingRemark(true);
                }}
              >
                Remark
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            {footerExtras}
          </>
        }
      >
        {pawn && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <DetailField label="Count">
                <span className="mono">
                  {pawn.sequence != null ? `#${pawn.sequence}` : "—"}
                </span>
              </DetailField>
              <DetailField label="Principal">
                <Money amount={pawn.loanAmount} size="sm" />
              </DetailField>
              <DetailField label="Max Available Amount">
                <Money amount={pawn.maxAvailableAmount ?? null} size="sm" />
              </DetailField>
              <DetailField label="Interest Rate">
                {formatDecimal(pawn.interestRate, 2)}% / mo
              </DetailField>
            </div>

            <div>
              <p className="eyebrow">Item</p>
              {pawn.item.photo && (
                <img
                  src={pawn.item.photo}
                  alt="Pawn item"
                  className="w-32 h-24 rounded-[8px] object-cover border border-[var(--hairline)] mb-3"
                />
              )}
              <p className="text-[14px] font-semibold mt-0.5">
                {pawn.item.description}
              </p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {pawn.item.type}
              </p>
            </div>

            {(pawn.note || editingRemark) && (
              <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4 space-y-3">
                <p className="eyebrow">Remark</p>
                {editingRemark ? (
                  <>
                    <Textarea
                      value={remarkText}
                      onChange={(event) => setRemarkText(event.target.value)}
                      rows={3}
                      placeholder="Add remark for this ticket"
                    />
                    {remarkError && (
                      <p className="text-[12px] text-[var(--danger)]">
                        {remarkError}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEditingRemark(false);
                          setRemarkText(pawn.note ?? "");
                          setRemarkError(null);
                        }}
                        disabled={savingRemark}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={saveRemark}
                        disabled={savingRemark}
                      >
                        {savingRemark ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">
                    {pawn.note}
                  </p>
                )}
              </div>
            )}

            {usesGoldJewelleryStorage(pawn.item.type) && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailField label="Storage">
                  {pawn.storageLocation || pawn.physicalNumber || "—"}
                </DetailField>
                <DetailField label="Gross Weight">
                  <span className="mono">{formatWeight(pawn.item.weight)} g</span>
                </DetailField>
                <DetailField label="Net Weight">
                  <span className="mono">
                    {pawn.item.netWeight != null
                      ? `${formatWeight(pawn.item.netWeight)} g`
                      : "—"}
                  </span>
                </DetailField>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <DetailField label="Opened">
                {formatDateTime(pawn.createdAt)}
              </DetailField>
              <DetailField label="Last Interest Paid">
                {formatDateTime(pawn.lastPaymentDate || pawn.createdAt)}
              </DetailField>
            </div>

            <div>
              <p className="eyebrow mb-2">Ledger</p>
              {loadingTransactions ? (
                <p className="text-[12px] text-[var(--text-muted)]">
                  Loading transactions…
                </p>
              ) : transactions.length === 0 ? (
                <p className="text-[12px] text-[var(--text-muted)]">
                  No transactions recorded.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>When</TH>
                        <TH>Type</TH>
                        <TH align="right">Amount</TH>
                        <TH>Note</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {transactions.map((tx) => (
                        <TR key={tx.id}>
                          <TD mono muted>
                            {formatDateTime(tx.date)}
                          </TD>
                          <TD>
                            <Badge tone={getTxTone(tx.type)} size="sm">
                              {tx.type}
                            </Badge>
                          </TD>
                          <TD align="right" mono>
                            {tx.amount.toLocaleString()} MMK
                          </TD>
                          <TD muted>
                            {tx.description || "-"}
                            {tx.user ? ` (${tx.user})` : ""}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={customerProfileOpen}
        onClose={() => setCustomerProfileOpen(false)}
        size="md"
        title={customerProfile?.name || pawn?.customerName || "Customer"}
        footer={
          <Button
            type="button"
            variant="ghost"
            onClick={() => setCustomerProfileOpen(false)}
          >
            Close
          </Button>
        }
      >
        {loadingCustomerProfile ? (
          <p className="text-[12px] text-[var(--text-muted)]">
            Loading customer profile…
          </p>
        ) : customerProfile ? (
          <div className="space-y-4">
            {customerProfile.photo && (
              <img
                src={customerProfile.photo}
                alt={customerProfile.name}
                className="w-20 h-20 rounded-full object-cover border border-[var(--hairline)]"
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Customer ID">
                <span className="mono">{customerProfile.id}</span>
              </DetailField>
              <DetailField label="Phone">
                {customerProfile.phone || "—"}
              </DetailField>
              <DetailField label="NRC">
                {customerProfile.nrc || "—"}
              </DetailField>
              <DetailField label="Address">
                {customerProfile.address || "—"}
              </DetailField>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">
            Customer profile not found.
          </p>
        )}
      </Dialog>
    </>
  );
};

export default SettlementTicketDetailsDialog;
