import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Trash2 } from "lucide-react";
import {
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../components/ui";
import SettlementTicketDetailsDialog, {
  type SettlementPawn,
} from "../components/SettlementTicketDetailsDialog";
import { useSettlementTicketsLoader } from "../hooks/useSettlementTicketsLoader";
import { formatDateTime, formatNumber } from "../utils/format";
import {
  clearSettlementCart,
  getSettlementCartIds,
  onSettlementCartChange,
  removeSettlementCartTicket,
} from "../utils/settlementCart";
import type {
  BatchRedeemRequestItem,
  BatchSettlementResult,
} from "../../shared/contracts/settlement";
import { calculateRedeemInterest } from "../../shared/settlement/calculations";

type Notice = {
  type: "success" | "error";
  text: string;
};

const parseDiscountValue = (value: string) => {
  const digits = value.replace(/\D+/g, "");
  return digits;
};

const Redeem: React.FC = () => {
  const { t } = useTranslation();
  const [cartIds, setCartIds] = useState<number[]>(() =>
    getSettlementCartIds("redeem"),
  );
  const [message, setMessage] = useState<Notice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discounts, setDiscounts] = useState<Record<number, string>>({});
  const [successResult, setSuccessResult] =
    useState<BatchSettlementResult | null>(null);
  const [detailPawn, setDetailPawn] = useState<SettlementPawn | null>(null);
  const { pawns, setPawns, loading } = useSettlementTicketsLoader({
    mode: "redeem",
    cartIds,
    onMessage: (text) => {
      setMessage(text ? { type: "error", text } : null);
    },
  });

  useEffect(() => onSettlementCartChange("redeem", setCartIds), []);

  useEffect(() => {
    if (cartIds.length > 0 && successResult) {
      setSuccessResult(null);
    }
  }, [cartIds, successResult]);

  const getInterestAmount = (pawn: SettlementPawn) =>
    calculateRedeemInterest(
      pawn.loanAmount,
      pawn.interestRate,
      pawn.lastPaymentDate,
      pawn.createdAt,
      new Date(),
      pawn.hasInterestPayments ?? false,
    );

  const getDiscountAmount = (pawnId: number, maxDiscount: number) =>
    Math.min(Number(discounts[pawnId] || 0), maxDiscount);

  const rows = pawns.map((pawn) => {
    const interestAmount = getInterestAmount(pawn);
    const discountAmount = getDiscountAmount(pawn.id, interestAmount);
    const total = pawn.loanAmount + interestAmount - discountAmount;
    return {
      pawn,
      interestAmount,
      discountAmount,
      total,
    };
  });

  const totals = rows.reduce(
    (summary, row) => ({
      principal: summary.principal + row.pawn.loanAmount,
      interest: summary.interest + row.interestAmount,
      discount: summary.discount + row.discountAmount,
      total: summary.total + row.total,
    }),
    { principal: 0, interest: 0, discount: 0, total: 0 },
  );

  const handleDiscountChange = (pawnId: number, value: string) => {
    setDiscounts((current) => ({
      ...current,
      [pawnId]: parseDiscountValue(value),
    }));
  };

  const handleRemoveTicket = (pawnId: number) => {
    removeSettlementCartTicket("redeem", pawnId);
    setDiscounts((current) => {
      const next = { ...current };
      delete next[pawnId];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (rows.length === 0) {
      setMessage({ type: "error", text: t('pages.redeem.addAtLeastOne') });
      return;
    }

    const tickets: BatchRedeemRequestItem[] = rows.map((row) => ({
      pawnId: row.pawn.id,
      totalAmount: row.total,
      discountAmount: row.discountAmount,
    }));

    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = await window.electron.api.pawns.batchRedeem({ tickets });
      if (!result.success) {
        setMessage({
          type: "error",
          text: result.message || t('pages.redeem.failedToRedeem'),
        });
        return;
      }

      setSuccessResult(result as BatchSettlementResult);
      clearSettlementCart("redeem");
      setDiscounts({});
      setPawns([]);
    } catch (error) {
      console.error("Error redeeming tickets:", error);
      setMessage({
        type: "error",
        text: t('pages.redeem.errorOccurredRedeeming'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSuccess = () => (
    <Card>
      <CardHeader>
        <h3 className="text-[15px] font-semibold tracking-tight">
          {t('pages.redeem.batchRedeemCompleted')}
        </h3>
      </CardHeader>
      <CardBody className="space-y-5">
        <Banner tone="success">
          {successResult?.results.length} {t('pages.redeem.wereRedeemedSuccessfully')}
        </Banner>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>{t('common.ticket')}</TH>
                <TH>{t('common.customer')}</TH>
                <TH align="right">{t('common.principal')}</TH>
                <TH align="right">{t('common.interest')}</TH>
                <TH align="right">{t('common.discount')}</TH>
                <TH align="right">{t('common.collected')}</TH>
              </TR>
            </THead>
            <TBody>
              {successResult?.results.map((row) => (
                <TR key={row.pawnId}>
                  <TD mono>#{row.pawnId}</TD>
                  <TD>{row.customerName}</TD>
                  <TD align="right">
                    <Money amount={row.principal} size="sm" />
                  </TD>
                  <TD align="right">
                    <Money amount={row.interest} size="sm" />
                  </TD>
                  <TD align="right">
                    <Money amount={-row.discount} size="sm" signed />
                  </TD>
                  <TD align="right">
                    <Money amount={row.total} size="sm" strong />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Summary label={t('common.principal')} value={successResult?.totals.principal ?? 0} />
          <Summary label={t('common.interest')} value={successResult?.totals.interest ?? 0} />
          <Summary
            label={t('common.discount')}
            value={-(successResult?.totals.discount ?? 0)}
            signed
          />
          <Summary label={t('common.collected')} value={successResult?.totals.total ?? 0} strong />
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={() => setSuccessResult(null)}>
            {t('pages.redeem.startAnotherBatch')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div>
      <PageHeader
        eyebrow={t('pages.redeem.ledgerRedeem')}
        title={t('pages.redeem.batchRedeem')}
        description={t('pages.redeem.batchRedeemDesc')}
      />

      {message && (
        <div className="mb-6">
          <Banner tone={message.type === "success" ? "success" : "danger"}>
            {message.text}
          </Banner>
        </div>
      )}

      <div className="max-w-6xl">
        {successResult ? (
          renderSuccess()
        ) : rows.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                title={t('pages.redeem.noTicketsInCart')}
                description={t('pages.redeem.noTicketsInCartDesc')}
              />
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">
                    {t('pages.redeem.selectedTickets')}
                  </h3>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">
                    {rows.length} {t('pages.redeem.ticketsReady')}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearSettlementCart("redeem")}
                >
                  {t('pages.redeem.clearCart')}
                </Button>
              </div>
            </CardHeader>
            <CardBody className="space-y-6">
              {loading ? (
                <p className="text-[12px] text-[var(--text-muted)]">
                  {t('pages.redeem.loadingTickets')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>{t('common.ticket')}</TH>
                        <TH>{t('common.customer')}</TH>
                        <TH>{t('common.item')}</TH>
                        <TH align="right">{t('common.principal')}</TH>
                        <TH align="right">{t('common.interest')}</TH>
                        <TH align="right">{t('common.discount')}</TH>
                        <TH align="right">Total</TH>
                        <TH align="right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((row) => (
                        <TR key={row.pawn.id}>
                          <TD mono>#{row.pawn.id}</TD>
                          <TD>
                            <div className="font-medium">{row.pawn.customerName}</div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {t('pages.redeem.openedDate', { date: formatDateTime(row.pawn.createdAt) })}
                            </div>
                          </TD>
                          <TD>
                            <div className="font-medium">
                              {row.pawn.item.description}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {row.pawn.item.type}
                            </div>
                          </TD>
                          <TD align="right">
                            <Money amount={row.pawn.loanAmount} size="sm" />
                          </TD>
                          <TD align="right">
                            <Money amount={row.interestAmount} size="sm" />
                          </TD>
                          <TD align="right">
                            <div className="w-[120px] ml-auto">
                              <Field
                                hint={t('pages.redeem.maxInterest', { amount: formatNumber(row.interestAmount) })}
                              >
                                <Input
                                  value={discounts[row.pawn.id] ?? ""}
                                  onChange={(event) =>
                                    handleDiscountChange(
                                      row.pawn.id,
                                      event.target.value,
                                    )
                                  }
                                  inputMode="numeric"
                                  placeholder="0"
                                  monoDigits
                                />
                              </Field>
                            </div>
                          </TD>
                          <TD align="right">
                            <Money amount={row.total} size="sm" strong />
                          </TD>
                          <TD align="right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                leadingIcon={<Eye size={14} />}
                                onClick={() => setDetailPawn(row.pawn)}
                              >
                                {t('common.view')}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                leadingIcon={<Trash2 size={14} />}
                                onClick={() => handleRemoveTicket(row.pawn.id)}
                              >
                                {t('common.remove')}
                              </Button>
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}

              <div className="grid md:grid-cols-[1fr_280px] gap-6 items-start">
                <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4">
                  <p className="text-[12px] font-medium text-[var(--text-secondary)]">
                    {t('pages.redeem.batchRules')}
                  </p>
                  <ul className="mt-2 text-[12px] text-[var(--text-muted)] space-y-1">
                    <li>{t('pages.redeem.onlyActiveTickets')}</li>
                    <li>{t('pages.redeem.discountAppliesAgainstInterest')}</li>
                    <li>{t('pages.redeem.ifOneTicketFails')}</li>
                  </ul>
                </div>

                <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4 space-y-3">
                  <Summary label={t('common.principal')} value={totals.principal} />
                  <Summary label={t('common.interest')} value={totals.interest} />
                  <Summary label={t('common.discount')} value={-totals.discount} signed />
                  <div className="pt-3 border-t border-[var(--hairline)]">
                    <Summary label={t('pages.redeem.collectedTotal')} value={totals.total} strong />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleSubmit}
                    disabled={isSubmitting || rows.length === 0}
                  >
                    {isSubmitting ? t('pages.redeem.redeeming') : t('pages.redeem.redeemSelectedTickets')}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <SettlementTicketDetailsDialog
        pawn={detailPawn}
        open={detailPawn != null}
        onClose={() => setDetailPawn(null)}
      />
    </div>
  );
};

const Summary: React.FC<{
  label: string;
  value: number;
  strong?: boolean;
  signed?: boolean;
}> = ({ label, value, strong, signed }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[12.5px] text-[var(--text-secondary)]">{label}</span>
    <Money amount={value} size="sm" strong={strong} signed={signed} />
  </div>
);

export default Redeem;
