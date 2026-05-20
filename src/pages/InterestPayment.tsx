import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { InterestVoucher } from "../components/InterestVoucher";
import { NonGoldInterestVoucher } from "../components/NonGoldInterestVoucher";
import {
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  Money,
  Select,
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
import { formatDate, formatNumber } from "../utils/format";
import { getCurrentBusinessDate, useBusinessDate } from "../utils/businessDate";
import {
  addCalendarDays,
  getCalendarDaysDue,
  getConfiguredDbTimeZone,
  setConfiguredDbTimeZone,
} from "../utils/timeZone";
import { usesGoldJewelleryStorage } from "../utils/storageUtils";
import {
  clearSettlementCart,
  getSettlementCartIds,
  onSettlementCartChange,
  removeSettlementCartTicket,
} from "../utils/settlementCart";
import type {
  BatchInterestRequestItem,
  BatchSettlementResult,
} from "../../shared/contracts/settlement";
import {
  calculateInterestAmountForPeriod,
  getElapsedMonthsAndDays,
} from "../../shared/settlement/calculations";

type Notice = {
  type: "success" | "error";
  text: string;
};

type AdjustmentDialogState = {
  open: boolean;
  success: boolean;
  title: string;
  description: string;
};

type PaymentPlan = "all" | "1m" | "2m" | "3m" | "custom";

type TicketPaymentChoice = {
  plan: PaymentPlan;
  customMonths: string;
};

type InterestPaymentRow = {
  pawn: SettlementPawn;
  choice: TicketPaymentChoice;
  daysDue: number;
  daysToPay: number;
  amountToPay: number;
  period: {
    months: number;
    days: number;
  };
  nextPaidUntilDate: Date;
};

type InterestVoucherData = {
  pawnId: number;
  physicalNumber?: string | null;
  storageLocation?: string;
  sequence?: number;
  customerName: string;
  customerAddress?: string;
  itemType: string;
  itemDescription: string;
  weight: number;
  netWeight?: number;
  loanAmount: number;
  interestRate: number;
  amountPaid: number;
  lastInterestPaidDate: string;
  paidUntilDate: string;
  expireDate: string;
};

type PrincipalAdjustmentType = "PLUS_AMOUNT" | "MINUS_AMOUNT";
const MIN_PRINCIPAL_AMOUNT = 20_000;

const defaultChoice = (): TicketPaymentChoice => ({
  plan: "all",
  customMonths: "",
});

const InterestPayment: React.FC<{
  viewMode?: "collect" | "adjustment";
}> = ({ viewMode = "collect" }) => {
  const { t } = useTranslation();
  const [cartIds, setCartIds] = useState<number[]>(() =>
    getSettlementCartIds("interest"),
  );
  const [message, setMessage] = useState<Notice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successResult, setSuccessResult] =
    useState<BatchSettlementResult | null>(null);
  const [choices, setChoices] = useState<Record<number, TicketPaymentChoice>>(
    {},
  );
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentType, setAdjustmentType] =
    useState<PrincipalAdjustmentType>("PLUS_AMOUNT");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [dbTimeZone, setDbTimeZone] = useState(getConfiguredDbTimeZone());
  const [detailPawn, setDetailPawn] = useState<SettlementPawn | null>(null);
  const [voucherData, setVoucherData] = useState<InterestVoucherData | null>(null);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
  const [submittedRows, setSubmittedRows] = useState<InterestPaymentRow[]>([]);
  const [adjustmentDialog, setAdjustmentDialog] = useState<AdjustmentDialogState>({
    open: false,
    success: true,
    title: "",
    description: "",
  });
  const { pawns, setPawns, loading } = useSettlementTicketsLoader({
    mode: "interest",
    cartIds,
    onLoaded: (nextPawns) => {
      setChoices((current) => {
        const next: Record<number, TicketPaymentChoice> = {};
        for (const pawn of nextPawns) {
          next[pawn.id] = current[pawn.id] ?? defaultChoice();
        }
        return next;
      });
    },
    onMessage: (text) => {
      setMessage(text ? { type: "error", text } : null);
    },
  });
  useBusinessDate();

  useEffect(() => onSettlementCartChange("interest", setCartIds), []);

  useEffect(() => {
    if (cartIds.length > 0 && successResult) {
      setSuccessResult(null);
      setSubmittedRows([]);
    }
  }, [cartIds, successResult]);

  useEffect(() => {
    let cancelled = false;
    const loadDbTimeZone = async () => {
      try {
        const result = await window.electron.api.settings.getDbTimeZone();
        if (!cancelled && result?.success && result.dbTimeZone) {
          setDbTimeZone(
            setConfiguredDbTimeZone(
              String(
                result.dbTimeZone.configured ||
                  result.dbTimeZone.active ||
                  getConfiguredDbTimeZone(),
              ),
            ),
          );
        }
      } catch (error) {
        console.error("Error loading database time zone:", error);
      }
    };
    void loadDbTimeZone();
    return () => {
      cancelled = true;
    };
  }, []);


  const getLastPaymentDate = (pawn: SettlementPawn) =>
    new Date(pawn.lastPaymentDate || pawn.createdAt);

  const getDaysDue = (pawn: SettlementPawn) =>
    typeof pawn.daysDue === "number"
      ? Math.max(0, pawn.daysDue)
      : getCalendarDaysDue(
          getLastPaymentDate(pawn),
          getCurrentBusinessDate(),
          dbTimeZone,
        );

  const getResolvedDaysToPay = (
    pawn: SettlementPawn,
    choice: TicketPaymentChoice,
  ) => {
    const daysDue = getDaysDue(pawn);
    if (choice.plan === "all") return daysDue;
    if (choice.plan === "1m") return Math.min(30, daysDue);
    if (choice.plan === "2m") return Math.min(60, daysDue);
    if (choice.plan === "3m") return Math.min(90, daysDue);
    const months = Math.max(0, Math.floor(Number(choice.customMonths) || 0));
    return Math.min(months * 30, daysDue);
  };

  const rows: InterestPaymentRow[] = pawns.map((pawn) => {
    const choice = choices[pawn.id] ?? defaultChoice();
    const baseDate = getLastPaymentDate(pawn);
    const daysDue = getDaysDue(pawn);
    const daysToPay = getResolvedDaysToPay(pawn, choice);
    const nextPaidUntilDate =
      daysToPay > 0
        ? addCalendarDays(baseDate, daysToPay, dbTimeZone)
        : baseDate;
    const amountToPay =
      choice.plan === "all" && typeof pawn.currentInterestDue === "number"
        ? Math.max(0, pawn.currentInterestDue)
        : calculateInterestAmountForPeriod(
            pawn.loanAmount,
            pawn.interestRate,
            baseDate,
            nextPaidUntilDate,
          );
    const period = getElapsedMonthsAndDays(baseDate, nextPaidUntilDate);

    return {
      pawn,
      choice,
      daysDue,
      daysToPay,
      amountToPay,
      period,
      nextPaidUntilDate,
    };
  });

  const payableRows = rows.filter((row) => row.daysToPay > 0 && row.amountToPay > 0);

  const totalInterest = payableRows.reduce(
    (sum, row) => sum + row.amountToPay,
    0,
  );

  const handleChoiceUpdate = (
    pawnId: number,
    patch: Partial<TicketPaymentChoice>,
  ) => {
    setChoices((current) => ({
      ...current,
      [pawnId]: {
        ...(current[pawnId] ?? defaultChoice()),
        ...patch,
      },
    }));
  };

  const handleRemoveTicket = (pawnId: number) => {
    removeSettlementCartTicket("interest", pawnId);
    setChoices((current) => {
      const next = { ...current };
      delete next[pawnId];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (payableRows.length === 0) {
      setMessage({
        type: "error",
        text: t('pages.interest.noneHavePayableInterest'),
      });
      return;
    }

    const tickets: BatchInterestRequestItem[] = payableRows.map((row) => ({
      pawnId: row.pawn.id,
      daysToPay: row.daysToPay,
      amount: row.amountToPay,
    }));

    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = await window.electron.api.pawns.batchPayInterest({
        tickets,
      });
      if (!result.success) {
        setMessage({
          type: "error",
          text: result.message || t('pages.interest.failedToPayInterest'),
        });
        return;
      }

      setSuccessResult(result as BatchSettlementResult);
      setSubmittedRows(rows);
      clearSettlementCart("interest");
      setChoices({});
      setPawns([]);
    } catch (error) {
      console.error("Error paying interest:", error);
      setMessage({
        type: "error",
        text: t('pages.interest.errorOccurredPayingInterest'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeVoucherDialog = () => {
    setVoucherDialogOpen(false);
    setVoucherData(null);
  };

  const handlePrintVoucher = (pawnId: number) => {
    const successRow = successResult?.results.find((row) => row.pawnId === pawnId);
    const sourceRow = submittedRows.find((row) => row.pawn.id === pawnId);
    if (!successRow || !sourceRow || !successRow.newLastPaymentDate) return;

    setVoucherData({
      pawnId,
      physicalNumber: sourceRow.pawn.physicalNumber,
      storageLocation: sourceRow.pawn.storageLocation,
      sequence: sourceRow.pawn.sequence,
      customerName: sourceRow.pawn.customerName,
      itemType: sourceRow.pawn.item.type,
      itemDescription: sourceRow.pawn.item.description,
      weight: sourceRow.pawn.item.weight,
      netWeight: sourceRow.pawn.item.netWeight,
      loanAmount: sourceRow.pawn.loanAmount,
      interestRate: sourceRow.pawn.interestRate,
      amountPaid: successRow.total,
      lastInterestPaidDate: successRow.newLastPaymentDate,
      paidUntilDate: successRow.newLastPaymentDate,
      expireDate: successRow.newLastPaymentDate,
    });
    setVoucherDialogOpen(true);
  };

  const singlePawn = pawns.length === 1 ? pawns[0] : null;
  const currentPrincipal = singlePawn?.loanAmount ?? 0;
  const adjustmentInterestDue = Math.max(0, singlePawn?.currentInterestDue ?? 0);
  const adjustmentDaysDue = Math.max(0, singlePawn?.daysDue ?? 0);
  const availableToReduce = Math.max(0, currentPrincipal - MIN_PRINCIPAL_AMOUNT);
  const availableToIncrease = singlePawn
    ? Math.max(
        0,
        (singlePawn.maxAvailableAmount ?? singlePawn.loanAmount) -
          singlePawn.loanAmount,
      )
    : 0;
  const adjustmentLimit =
    adjustmentType === "PLUS_AMOUNT" ? availableToIncrease : availableToReduce;
  const adjustmentAmountNumber = Math.round(Number(adjustmentAmount) || 0);
  const projectedPrincipal = Math.max(
    0,
    adjustmentType === "PLUS_AMOUNT"
      ? currentPrincipal + adjustmentAmountNumber
      : currentPrincipal - adjustmentAmountNumber,
  );
  const projectedCustomerPays =
    adjustmentType === "MINUS_AMOUNT"
      ? adjustmentInterestDue + adjustmentAmountNumber
      : Math.max(adjustmentInterestDue - adjustmentAmountNumber, 0);
  const projectedCustomerReceives =
    adjustmentType === "PLUS_AMOUNT"
      ? Math.max(adjustmentAmountNumber - adjustmentInterestDue, 0)
      : 0;
  const quickAdjustmentAmounts = buildAdjustmentQuickAmounts(adjustmentLimit);
  const isAdjustmentAmountValid =
    adjustmentAmountNumber > 0 && adjustmentAmountNumber <= adjustmentLimit;
  const canAdjustPrincipal = isAdjustmentAmountValid;

  useEffect(() => {
    if (!singlePawn) return;
    if (adjustmentType === "PLUS_AMOUNT" && availableToIncrease <= 0) {
      setAdjustmentType("MINUS_AMOUNT");
    }
  }, [adjustmentType, availableToIncrease, singlePawn]);

  const handleAdjustPrincipal = async () => {
    if (!singlePawn) return;
    const amount = adjustmentAmountNumber;
    if (amount <= 0) {
      setMessage({ type: "error", text: t('pages.interest.enterValidAdjustmentAmount') });
      return;
    }
    if (adjustmentType === "PLUS_AMOUNT" && amount > availableToIncrease) {
      setMessage({
        type: "error",
        text: t('pages.interest.increaseAmountCannotExceed', { amount: formatNumber(availableToIncrease) }),
      });
      return;
    }
    if (adjustmentType === "MINUS_AMOUNT" && amount > availableToReduce) {
      setMessage({
        type: "error",
        text: t('pages.interest.reduceAmountCannotExceed', { amount: formatNumber(availableToReduce) }),
      });
      return;
    }

    setIsAdjusting(true);
    setMessage(null);
    try {
      const result = await window.electron.api.pawns.adjustWithInterest({
        pawnId: singlePawn.id,
        amount,
        adjustmentType,
      });
      if (!result.success) {
        setAdjustmentDialog({
          open: true,
          success: false,
          title: t('pages.interest.adjustmentUnsuccessful'),
          description: result.message || t('pages.interest.failedToAdjustPrincipal'),
        });
        clearSettlementCart("interest");
        setChoices({});
        setPawns([]);
        return;
      }

      const refreshed = await window.electron.ipcRenderer.invoke("get-pawn", {
        pawnId: singlePawn.id,
      });
      if (refreshed.success && refreshed.pawn) {
        const updatedPawn = refreshed.pawn as SettlementPawn;
        setVoucherData({
          pawnId: updatedPawn.id,
          physicalNumber: updatedPawn.physicalNumber,
          storageLocation: updatedPawn.storageLocation,
          sequence: updatedPawn.sequence,
          customerName: updatedPawn.customerName,
          itemType: updatedPawn.item.type,
          itemDescription: updatedPawn.item.description,
          weight: updatedPawn.item.weight,
          netWeight: updatedPawn.item.netWeight,
          loanAmount: updatedPawn.loanAmount,
          interestRate: updatedPawn.interestRate,
          amountPaid: updatedPawn.loanAmount,
          lastInterestPaidDate: updatedPawn.lastPaymentDate || updatedPawn.createdAt,
          paidUntilDate: updatedPawn.lastPaymentDate || updatedPawn.createdAt,
          expireDate: updatedPawn.lastPaymentDate || updatedPawn.createdAt,
        });
      }

      setAdjustmentAmount("");
      setAdjustmentDialog({
        open: true,
        success: true,
        title: t('pages.interest.adjustmentSavedSuccessfully'),
        description: t('pages.interest.adjustmentSavedSummary', {
          principal: formatNumber(result.newLoanAmount ?? projectedPrincipal),
          pay: formatNumber(result.totalCustomerPays ?? projectedCustomerPays),
          receive: formatNumber(result.totalCustomerReceives ?? projectedCustomerReceives),
        }),
      });
      clearSettlementCart("interest");
      setChoices({});
      setPawns([]);
    } catch (error) {
      console.error("Error adjusting principal:", error);
      setAdjustmentDialog({
        open: true,
        success: false,
        title: t('pages.interest.adjustmentUnsuccessful'),
        description: t('pages.interest.errorOccurredAdjustingPrincipal'),
      });
      clearSettlementCart("interest");
      setChoices({});
      setPawns([]);
    } finally {
      setIsAdjusting(false);
    }
  };

  const renderSuccess = () => (
    <Card>
      <CardHeader>
        <h3 className="text-[15px] font-semibold tracking-tight">
          {t('pages.interest.batchInterestCompleted')}
        </h3>
      </CardHeader>
      <CardBody className="space-y-5">
        <Banner tone="success">
          {t('pages.interest.interestCollectedFor', { count: successResult?.results.length ?? 0 })}
        </Banner>
        <div className="overflow-x-auto">
          <Table>
                      <THead>
                        <TR>
                          <TH>{t('common.ticket')}</TH>
                          <TH>{t('common.customer')}</TH>
                          <TH align="right">{t('common.principal')}</TH>
                          <TH align="right">{t('pages.interest.daysPaid')}</TH>
                          <TH align="right">{t('common.interest')}</TH>
                          <TH>{t('pages.interest.paidUntil')}</TH>
                          <TH align="right">{t('common.action')}</TH>
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
                  <TD align="right" mono>
                    {row.daysToPay ?? 0}
                  </TD>
                  <TD align="right">
                    <Money amount={row.interest} size="sm" strong />
                  </TD>
                  <TD>{row.newLastPaymentDate ? formatDate(row.newLastPaymentDate) : "—"}</TD>
                  <TD align="right">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Printer size={14} />}
                      onClick={() => handlePrintVoucher(row.pawnId)}
                      disabled={!row.newLastPaymentDate}
                    >
                      {t("common.print")}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4">
          <Summary label={t('pages.interest.collectedInterest')} value={successResult?.totals.interest ?? 0} strong />
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={() => setSuccessResult(null)}>
            {t('pages.interest.startAnotherBatch')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div>
      {message && (
        <div className="mb-6">
          <Banner tone={message.type === "success" ? "success" : "danger"}>
            {message.text}
          </Banner>
        </div>
      )}

      <div className="w-full space-y-6">
        {successResult ? (
          renderSuccess()
        ) : rows.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                title={t('pages.interest.noTicketsInCart')}
                description={t('pages.interest.noTicketsInCartDesc')}
              />
            </CardBody>
          </Card>
        ) : (
          <>
            {viewMode === "collect" ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-tight">
                      {t('pages.interest.selectedTickets')}
                    </h3>
                    <p className="text-[12px] text-[var(--text-muted)] mt-1">
                      {t('pages.interest.ticketsInCart', { count: rows.length })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => clearSettlementCart("interest")}
                  >
                    {t('pages.interest.clearCart')}
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-6">
                {loading ? (
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {t('pages.interest.loadingTickets')}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>{t('common.ticket')}</TH>
                          <TH>{t('common.customer')}</TH>
                          <TH>{t('pages.interest.paidUntil')}</TH>
                          <TH align="right">{t('pages.interest.daysDue')}</TH>
                          <TH>{t('pages.interest.plan')}</TH>
                          <TH align="right">{t('common.principal')}</TH>
                          <TH align="right">{t('pages.interest.amount')}</TH>
                          <TH align="right">{t('common.action')}</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {rows.map((row) => (
                          <TR key={row.pawn.id}>
                            <TD mono>#{row.pawn.id}</TD>
                            <TD>
                              <div className="font-medium">
                                {row.pawn.customerName}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)]">
                                {row.pawn.item.description}
                              </div>
                            </TD>
                            <TD>{formatDate(getLastPaymentDate(row.pawn))}</TD>
                            <TD align="right" mono>
                              {row.daysDue}
                            </TD>
                            <TD>
                              <div className="grid grid-cols-[160px_100px] gap-2">
                                <Select
                                  value={row.choice.plan}
                                  onChange={(event) =>
                                    handleChoiceUpdate(row.pawn.id, {
                                      plan: event.target.value as PaymentPlan,
                                    })
                                  }
                                >
                                  <option value="all">{t('pages.interest.allDue')}</option>
                                  <option value="1m">{t('pages.interest.oneMonth')}</option>
                                  <option value="2m">{t('pages.interest.twoMonths')}</option>
                                  <option value="3m">{t('pages.interest.threeMonths')}</option>
                                  <option value="custom">{t('pages.interest.custom')}</option>
                                </Select>
                                <Input
                                  value={row.choice.customMonths}
                                  onChange={(event) =>
                                    handleChoiceUpdate(row.pawn.id, {
                                      customMonths: event.target.value.replace(
                                        /\D+/g,
                                        "",
                                      ),
                                    })
                                  }
                                  placeholder={t('pages.interest.monthsPlaceholder')}
                                  inputMode="numeric"
                                  monoDigits
                                  disabled={row.choice.plan !== "custom"}
                                />
                              </div>
                            </TD>
                            <TD align="right">
                              <Money amount={row.pawn.loanAmount} size="sm" />
                            </TD>
                            <TD align="right">
                              <div className="space-y-1">
                                <Money amount={row.amountToPay} size="sm" strong />
                                <div className="text-[11px] text-[var(--text-muted)]">
                                  {row.period.months} month(s) {row.period.days} day(s)
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)]">
                                  {t('pages.interest.until')} {formatDate(row.nextPaidUntilDate)}
                                </div>
                              </div>
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

                <div className="flex justify-end">
                  <div className="w-full max-w-[320px] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4 space-y-4">
                    <Summary label={t('pages.interest.ticketsPayable')} value={payableRows.length} plain />
                    <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        {t('pages.interest.collectedInterest')}
                      </p>
                      <div className="mt-2">
                        <Money amount={totalInterest} size="md" strong />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handleSubmit}
                      disabled={isSubmitting || payableRows.length === 0}
                    >
                      {isSubmitting ? t('pages.interest.collecting') : t('pages.interest.collectInterest')}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
            ) : singlePawn ? (
              <Card>
                <CardHeader>
                  <div className="space-y-1">
                    <h3 className="text-[15px] font-semibold tracking-tight">
                      {t('pages.interest.singleTicketPrincipalAdjustment')}
                    </h3>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {t('pages.interest.principalAdjustmentHelper')}
                    </p>
                  </div>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-raised)] px-4 py-4">
                    <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-3">
                      <AdjustmentMeta
                        label={t('common.ticket')}
                        value={`#${singlePawn.id}`}
                      />
                      <AdjustmentMeta
                        label={t('common.customer')}
                        value={singlePawn.customerName}
                      />
                      <AdjustmentMeta
                        label={t('common.item')}
                        value={singlePawn.item.description || singlePawn.item.type}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Eye size={14} />}
                      onClick={() => setDetailPawn(singlePawn)}
                    >
                      {t('common.view')}
                    </Button>
                  </div>
                  {adjustmentInterestDue > 0 ? (
                    <Banner tone="warning">
                      <div className="font-medium">
                        {t('pages.interest.interestWillBeCollectedOnSave')}
                      </div>
                      <div className="text-[12px] mt-1">
                        {t('pages.interest.adjustmentInterestDueSummary', {
                          days: adjustmentDaysDue,
                          amount: formatNumber(adjustmentInterestDue),
                        })}
                      </div>
                    </Banner>
                  ) : null}
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_360px]">
                    <div className="space-y-4">
                      <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4 space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <AdjustmentStat
                            label={t('pages.interest.currentPrincipal')}
                            value={currentPrincipal}
                          />
                          <AdjustmentStat
                            label={t('pages.interest.adjustmentLimit')}
                            value={adjustmentLimit}
                          />
                          <AdjustmentStat
                            label={t('pages.interest.interestCollectedNow')}
                            value={adjustmentInterestDue}
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setAdjustmentType("MINUS_AMOUNT")}
                            disabled={isAdjusting}
                            className={
                              adjustmentType === "MINUS_AMOUNT"
                                ? "rounded-[14px] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-4 text-left transition-colors"
                                : "rounded-[14px] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-4 text-left transition-colors hover:border-[var(--danger)]/35"
                            }
                          >
                            <div className="flex items-center gap-2 text-[var(--danger)]">
                              <Minus size={16} />
                              <span className="text-[14px] font-semibold">{t('pages.interest.reduce')}</span>
                            </div>
                            <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
                              {t('pages.interest.availableToReduce', { amount: formatNumber(availableToReduce) })}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdjustmentType("PLUS_AMOUNT")}
                            disabled={isAdjusting || availableToIncrease <= 0}
                            className={
                              adjustmentType === "PLUS_AMOUNT"
                                ? "rounded-[14px] border border-[var(--success)] bg-[var(--success-soft)] px-4 py-4 text-left transition-colors"
                                : "rounded-[14px] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-4 text-left transition-colors hover:border-[var(--success)]/35 disabled:opacity-50"
                            }
                          >
                            <div className="flex items-center gap-2 text-[var(--success)]">
                              <Plus size={16} />
                              <span className="text-[14px] font-semibold">{t('pages.interest.increase')}</span>
                            </div>
                            <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
                              {t('pages.interest.availableToIncrease', { amount: formatNumber(availableToIncrease) })}
                            </p>
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4 space-y-4">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                          <Field
                            label={t('pages.interest.adjustmentAmount')}
                            hint={t('pages.interest.minimumPrincipalAfterAdjustment', {
                              amount: formatNumber(MIN_PRINCIPAL_AMOUNT),
                            })}
                          >
                            <Input
                              value={adjustmentAmount}
                              onChange={(event) =>
                                setAdjustmentAmount(event.target.value.replace(/\D+/g, ""))
                              }
                              placeholder="0"
                              inputMode="numeric"
                              monoDigits
                              className="h-12 text-[18px] font-semibold"
                            />
                          </Field>
                          <AdjustmentStat
                            label={
                              adjustmentType === "PLUS_AMOUNT"
                                ? t('pages.interest.principalIncrease')
                                : t('pages.interest.principalReduction')
                            }
                            value={adjustmentAmountNumber}
                            strong
                          />
                        </div>
                        {quickAdjustmentAmounts.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {quickAdjustmentAmounts.map((amount) => (
                              <Button
                                key={amount}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="border border-[var(--hairline)] bg-[var(--surface)]"
                                onClick={() => setAdjustmentAmount(String(amount))}
                                disabled={isAdjusting}
                              >
                                {formatNumber(amount)}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[16px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-4 space-y-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          {t('pages.interest.projectedPrincipal')}
                        </p>
                        <div className="mt-2 rounded-[14px] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-4">
                          <Money amount={projectedPrincipal} size="md" strong />
                        </div>
                      </div>
                      <div className="grid gap-3">
                        <CashFlowStat
                          label={t('pages.interest.customerPay')}
                          value={projectedCustomerPays}
                          tone="danger"
                        />
                        <CashFlowStat
                          label={t('pages.interest.customerReceives')}
                          value={projectedCustomerReceives}
                          tone="success"
                        />
                      </div>
                      <Button
                        type="button"
                        variant={adjustmentType === "PLUS_AMOUNT" ? "primary" : "secondary"}
                        leadingIcon={adjustmentType === "PLUS_AMOUNT" ? <Plus size={14} /> : <Minus size={14} />}
                        onClick={handleAdjustPrincipal}
                        disabled={isAdjusting || !canAdjustPrincipal}
                        loading={isAdjusting}
                        fullWidth
                      >
                        {t('pages.interest.saveAdjustment')}
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardBody>
                  <EmptyState
                    title={t('pages.interest.principalAdjustmentNeedsOneTicket')}
                    description={t('pages.interest.principalAdjustmentNeedsOneTicketDesc')}
                  />
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>

      <SettlementTicketDetailsDialog
        pawn={detailPawn}
        open={detailPawn != null}
        onClose={() => setDetailPawn(null)}
      />

      {voucherData && (
        <>
          <Dialog
            open={voucherDialogOpen}
            onClose={closeVoucherDialog}
            title={`Interest voucher #${voucherData.pawnId}`}
            description={`${voucherData.customerName} • ${voucherData.itemDescription || voucherData.itemType}`}
            footer={
              <>
                <Button type="button" variant="ghost" onClick={closeVoucherDialog}>
                  Close
                </Button>
                <Button type="button" leadingIcon={<Printer size={14} />} onClick={() => window.print()}>
                  {t("common.print")}
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              <div className="text-[13px] text-[var(--text-secondary)]">
                Paid until {formatDate(voucherData.paidUntilDate)}
              </div>
              <Money amount={voucherData.amountPaid} size="md" strong />
            </div>
          </Dialog>
          {usesGoldJewelleryStorage(voucherData.itemType) ? (
            <InterestVoucher {...voucherData} />
          ) : (
            <NonGoldInterestVoucher {...voucherData} />
          )}
        </>
      )}

      <Dialog
        open={adjustmentDialog.open}
        onClose={() =>
          setAdjustmentDialog((current) => ({ ...current, open: false }))
        }
        title={adjustmentDialog.title}
        description={adjustmentDialog.description}
        size="sm"
        footer={
          <>
            {adjustmentDialog.success && voucherData && (
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<Printer size={14} />}
                onClick={() => window.print()}
              >
                {t("common.print")}
              </Button>
            )}
            <Button
              type="button"
              onClick={() =>
                setAdjustmentDialog((current) => ({ ...current, open: false }))
              }
            >
              {t("common.ok")}
            </Button>
          </>
        }
      >
        <div
          className={
            adjustmentDialog.success
              ? "rounded-[12px] border border-[var(--success)]/25 bg-[var(--success-soft)] px-4 py-4 text-[var(--success)]"
              : "rounded-[12px] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-4 py-4 text-[var(--danger)]"
          }
        >
          <p className="text-[14px] font-semibold">
            {adjustmentDialog.success ? t("common.success") : t("common.error")}
          </p>
        </div>
      </Dialog>
    </div>
  );
};

const Summary: React.FC<{
  label: string;
  value: number;
  strong?: boolean;
  plain?: boolean;
}> = ({ label, value, strong, plain }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[12.5px] text-[var(--text-secondary)]">{label}</span>
    {plain ? (
      <span className="mono text-[13px] font-semibold">{value}</span>
    ) : (
      <Money amount={value} size="sm" strong={strong} />
    )}
  </div>
);

const AdjustmentStat: React.FC<{
  label: string;
  value: number;
  strong?: boolean;
}> = ({ label, value, strong }) => (
  <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2.5">
    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
      {label}
    </p>
    <div className="mt-1">
      <Money amount={value} size="sm" strong={strong} />
    </div>
  </div>
);

const AdjustmentMeta: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2.5">
    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
      {label}
    </p>
    <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)] break-words">
      {value || "—"}
    </p>
  </div>
);

const CashFlowStat: React.FC<{
  label: string;
  value: number;
  tone: "success" | "danger";
}> = ({ label, value, tone }) => (
  <div
    className={
      tone === "danger"
        ? "rounded-[12px] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-4 py-3"
        : "rounded-[12px] border border-[var(--success)]/25 bg-[var(--success-soft)] px-4 py-3"
    }
  >
    <p
      className={
        tone === "danger"
          ? "text-[11px] uppercase tracking-[0.16em] text-[var(--danger)]"
          : "text-[11px] uppercase tracking-[0.16em] text-[var(--success)]"
      }
    >
      {label}
    </p>
    <div className="mt-2">
      <Money
        amount={value}
        size="md"
        strong
        tone={tone}
      />
    </div>
  </div>
);

function buildAdjustmentQuickAmounts(limit: number): number[] {
  if (limit < 1_000) return [];
  const roundToThousand = (value: number) =>
    Math.max(1_000, Math.floor(value / 1_000) * 1_000);
  return Array.from(
    new Set(
      [limit / 4, limit / 2, limit].map((value) => roundToThousand(value)),
    ),
  ).filter((value) => value > 0 && value <= limit);
}

export default InterestPayment;
