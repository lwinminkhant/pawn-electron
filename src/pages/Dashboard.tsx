import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCcw,
  Package,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Inbox,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Money,
  Button,
  EmptyState,
  PageLoader,
  Dialog,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "../components/ui";
import {
  formatDate,
  formatDateTime,
  formatDecimal,
  localCalendarDateYmd,
  formatNumber,
  formatWeight,
} from "../utils/format";
import { getCurrentBusinessDate, useBusinessDate } from "../utils/businessDate";
import { getCalendarDaysDue, getConfiguredDbTimeZone } from "../utils/timeZone";

interface DashboardStats {
  totalPawns: number;
  activePawns: number;
  totalLoanValue: number;
  interestEarned: number;
  todayPawns: number;
  todayRedemptions: number;
}

interface RecentTransaction {
  id: number;
  pawnId: number;
  type: string;
  customerName: string;
  amount: number;
  date: string;
}

interface ExpiringPawn {
  id: number;
  customerName: string;
  loanAmount: number;
  createdAt: string;
  daysRemaining: number;
}

interface Pawn {
  id: number;
  customerId: number;
  customerName: string;
  itemType: string;
  itemDescription: string;
  weight: number;
  loanAmount: number;
  interestRate: number;
  maxAvailableAmount?: number;
  status: string;
  createdAt: string;
  lastPaymentDate?: string;
  redeemedAt?: string;
  redeemedInterest?: number;
  redeemedPrincipal?: number;
}

interface PawnTransaction {
  id: number;
  date: string;
  type: string;
  amount: number;
  description?: string;
  user?: string;
}

type BadgeTone =
  | "neutral"
  | "brass"
  | "success"
  | "warning"
  | "danger"
  | "info";

const getTxTone = (type: string): BadgeTone => {
  if (type === "PAWN" || type === "PLUS_AMOUNT") return "warning";
  if (type === "PAID_INTEREST" || type === "REDEEM_I") return "info";
  if (type === "MINUS_AMOUNT" || type === "REDEEM_BA") return "success";
  return "neutral";
};

const getTransactionLabel = (type: string): string => {
  if (type === "PAWN") return "Pawn";
  if (type === "PLUS_AMOUNT") return "Add Amount";
  if (type === "MINUS_AMOUNT") return "Minus Amount";
  if (type === "PAID_INTEREST") return "Interest Payment";
  if (type === "REDEEM_BA") return "Redeem Principal";
  if (type === "REDEEM_I") return "Redeem Interest";
  if (type === "DATE_INTEREST") return "Date Interest";
  return type;
};

const isOutgoingAmount = (type: string): boolean =>
  type === "PAWN" || type === "PLUS_AMOUNT";

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

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>({
    totalPawns: 0,
    activePawns: 0,
    totalLoanValue: 0,
    interestEarned: 0,
    todayPawns: 0,
    todayRedemptions: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<
    RecentTransaction[]
  >([]);
  const [expiringPawns, setExpiringPawns] = useState<ExpiringPawn[]>([]);
  const [allPawns, setAllPawns] = useState<Pawn[]>([]);
  const [detailPawn, setDetailPawn] = useState<Pawn | null>(null);
  const [detailTx, setDetailTx] = useState<PawnTransaction[]>([]);
  const [detailTxLoading, setDetailTxLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const businessDateYmd = useBusinessDate();
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    if (!detailPawn) {
      setDetailTx([]);
      setDetailTxLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailTxLoading(true);
      try {
        const res = await window.electron.ipcRenderer.invoke(
          "get-pawn-transactions",
          { pawnId: detailPawn.id }
        );
        if (!cancelled && res.success && Array.isArray(res.transactions)) {
          setDetailTx(res.transactions);
        } else if (!cancelled) {
          setDetailTx([]);
        }
      } catch (error) {
        console.error("Error loading pawn transactions:", error);
        if (!cancelled) setDetailTx([]);
      } finally {
        if (!cancelled) setDetailTxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailPawn]);

  const openDetail = (id: number) => {
    const pawn = allPawns.find((p) => p.id === id);
    if (pawn) setDetailPawn(pawn);
  };

  const loadDashboardData = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    try {
      const pawnsResult = await window.electron.ipcRenderer.invoke(
        "list-pawns"
      );

      if (!pawnsResult.success || !Array.isArray(pawnsResult.pawns)) {
        if (requestId !== loadRequestIdRef.current) return;
        setAllPawns([]);
        setRecentTransactions([]);
        setExpiringPawns([]);
        setStats({
          totalPawns: 0,
          activePawns: 0,
          totalLoanValue: 0,
          interestEarned: 0,
          todayPawns: 0,
          todayRedemptions: 0,
        });
        return;
      }

      const nextAllPawns = pawnsResult.pawns as Pawn[];
      const activePawns = nextAllPawns.filter((p) => p.status === "PAWN");

      const totalLoanValue = activePawns.reduce(
        (sum: number, p) => sum + p.loanAmount,
        0
      );

      const redeemedPawns = nextAllPawns.filter(
        (p) => p.status === "REDEEMED" && p.redeemedAt
      );
      const interestEarned = redeemedPawns.reduce((sum: number, p) => {
        if (typeof p.redeemedInterest === "number") {
          return sum + p.redeemedInterest;
        }
        const created = new Date(p.createdAt);
        const redeemed = new Date(p.redeemedAt!);
        const months =
          (redeemed.getTime() - created.getTime()) /
          (1000 * 60 * 60 * 24 * 30);
        const interest = p.loanAmount * (p.interestRate / 100) * months;
        return sum + interest;
      }, 0);

      const todayPawns = nextAllPawns.filter((p) => {
        return localCalendarDateYmd(new Date(p.createdAt)) === businessDateYmd;
      }).length;

      const todayRedemptions = redeemedPawns.filter((p) => {
        return (
          p.redeemedAt &&
          localCalendarDateYmd(new Date(p.redeemedAt)) === businessDateYmd
        );
      }).length;

      const recentResult = await window.electron.ipcRenderer.invoke(
        "get-recent-transactions",
        { limit: 6 }
      );

      const expiring = activePawns
        .map((p) => {
          const created = new Date(p.createdAt);
          const daysPassed = getCalendarDaysDue(
            created,
            getCurrentBusinessDate(),
          );
          const daysRemaining = 90 - daysPassed;

          return {
            id: p.id,
            customerName: p.customerName,
            loanAmount: p.loanAmount,
            createdAt: p.createdAt,
            daysRemaining,
          };
        })
        .filter(
          (p: ExpiringPawn) => p.daysRemaining <= 15 && p.daysRemaining >= 0
        )
        .sort(
          (a: ExpiringPawn, b: ExpiringPawn) =>
            a.daysRemaining - b.daysRemaining
        );

      if (requestId !== loadRequestIdRef.current) return;

      setAllPawns(nextAllPawns);
      setStats({
        totalPawns: nextAllPawns.length,
        activePawns: activePawns.length,
        totalLoanValue,
        interestEarned,
        todayPawns,
        todayRedemptions,
      });
      setRecentTransactions(
        recentResult.success && Array.isArray(recentResult.transactions)
          ? recentResult.transactions
          : []
      );
      setExpiringPawns(expiring);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [businessDateYmd]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  if (loading) {
    return <PageLoader label="Loading dashboard…" />;
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.dashboard')}
        title={t('pages.dashboard.title')}
        description={getCurrentBusinessDate().toLocaleDateString("en-US", {
          timeZone: getConfiguredDbTimeZone(),
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
        actions={
          <Button
            variant="secondary"
            size="md"
            leadingIcon={<RefreshCcw size={14} />}
            onClick={loadDashboardData}
          >
            {t('pages.dashboard.refresh')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          accent
          label={t('pages.dashboard.totalPawns')}
          value={formatNumber(stats.totalPawns)}
          hint={t('pages.dashboard.allTime')}
        />
        <StatCard
          label={t('common.active')}
          value={formatNumber(stats.activePawns)}
          hint={t('pages.dashboard.openTickets')}
        />
        <StatCard
          label={t('pages.dashboard.loanValue')}
          value={<Money amount={stats.totalLoanValue} size="xl" strong />}
          hint={t('pages.dashboard.outstanding')}
        />
        <StatCard
          label={t('pages.dashboard.interestEarned')}
          value={<Money amount={stats.interestEarned} size="xl" strong />}
          hint={t('pages.dashboard.fromRedemptions')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardBody className="flex items-center justify-between">
            <div>
              <p className="eyebrow">{t('pages.dashboard.todayPawns')}</p>
              <p className="mono text-[36px] font-semibold leading-none mt-2 text-[var(--text-primary)]">
                {stats.todayPawns < 100
                  ? stats.todayPawns.toString().padStart(2, "0")
                  : formatNumber(stats.todayPawns)}
              </p>
              <p className="text-[12px] text-[var(--text-muted)] mt-2">
                {t('pages.dashboard.newTicketsOpened')}
              </p>
            </div>
            <div
              className="w-12 h-12 rounded-[10px] bg-[var(--brass-soft)] text-[var(--brass)] flex items-center justify-center"
              aria-hidden
            >
              <Package size={22} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center justify-between">
            <div>
              <p className="eyebrow">{t('pages.dashboard.todayRedemptions')}</p>
              <p className="mono text-[36px] font-semibold leading-none mt-2 text-[var(--text-primary)]">
                {stats.todayRedemptions < 100
                  ? stats.todayRedemptions.toString().padStart(2, "0")
                  : formatNumber(stats.todayRedemptions)}
              </p>
              <p className="text-[12px] text-[var(--text-muted)] mt-2">
                {t('pages.dashboard.ticketsClosed')}
              </p>
            </div>
            <div
              className="w-12 h-12 rounded-[10px] bg-[var(--success-soft)] text-[var(--success)] flex items-center justify-center"
              aria-hidden
            >
              <CheckCircle2 size={22} />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <h3 className="text-[14px] font-semibold tracking-tight">
                {t('pages.dashboard.recentTransactions')}
              </h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {t('pages.dashboard.last6TicketMovements')}
              </p>
            </div>
          </CardHeader>
          {recentTransactions.length === 0 ? (
            <EmptyState
              icon={<Inbox size={28} strokeWidth={1.5} />}
              title={t('pages.dashboard.noTransactionsYet')}
              description={t('pages.dashboard.openANewPawn')}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.type')}</TH>
                  <TH>{t('common.customer')}</TH>
                  <TH>{t('common.when')}</TH>
                  <TH align="right">{t('common.amount')}</TH>
                </TR>
              </THead>
              <TBody>
                {recentTransactions.map((tx) => (
                  <TR
                    key={tx.id}
                    className="cursor-pointer hover:bg-[var(--surface-hover)]"
                    onClick={() => openDetail(tx.pawnId)}
                  >
                    <TD>
                      <Badge tone={getTxTone(tx.type)} dot>
                        {isOutgoingAmount(tx.type) ? (
                          <ArrowUpRight size={11} />
                        ) : (
                          <ArrowDownLeft size={11} />
                        )}
                        {getTransactionLabel(tx.type)}
                      </Badge>
                    </TD>
                    <TD>{tx.customerName}</TD>
                    <TD muted>
                      <span className="mono text-[12px]">
                        {formatDateTime(tx.date)}
                      </span>
                    </TD>
                    <TD align="right">
                      <Money
                        amount={
                          isOutgoingAmount(tx.type)
                            ? -Math.abs(tx.amount)
                            : Math.abs(tx.amount)
                        }
                        tone={isOutgoingAmount(tx.type) ? "danger" : "success"}
                        signed
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  size={14}
                  className="text-[var(--warning)]"
                  aria-hidden
                />
                <div>
                  <h3 className="text-[14px] font-semibold tracking-tight">
                    {t('pages.dashboard.expiringSoon')}
                  </h3>
                  <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                    {t('pages.dashboard.within15Days')}
                  </p>
                </div>
              </div>
              {expiringPawns.length > 0 && (
                <Badge tone="warning">{expiringPawns.length}</Badge>
              )}
            </div>
          </CardHeader>
          {expiringPawns.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={28} strokeWidth={1.5} />}
              title={t('pages.dashboard.allClear')}
              description={t('pages.dashboard.noPawnsExpiring')}
            />
          ) : (
            <div className="divide-y divide-[var(--hairline)] max-h-[420px] overflow-y-auto">
              {expiringPawns.map((pawn) => (
                <div
                  key={pawn.id}
                  className="px-5 py-3.5 flex items-start justify-between gap-3 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                  onClick={() => openDetail(pawn.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium truncate">
                      {pawn.customerName}
                    </p>
                    <p className="mono text-[11px] text-[var(--text-muted)] mt-0.5">
                      #{pawn.id}
                    </p>
                    <div className="mt-2">
                      <Badge
                        tone={
                          pawn.daysRemaining <= 5
                            ? "danger"
                            : pawn.daysRemaining <= 10
                            ? "warning"
                            : "neutral"
                        }
                        dot
                      >
                        {pawn.daysRemaining} {t('pages.dashboard.daysLeft')}
                      </Badge>
                    </div>
                  </div>
                  <Money amount={pawn.loanAmount} size="sm" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog
        open={!!detailPawn}
        onClose={() => setDetailPawn(null)}
        title={detailPawn ? `Ticket #${detailPawn.id}` : "Ticket details"}
        description={detailPawn ? `${detailPawn.customerName} · ${detailPawn.status}` : undefined}
        size="lg"
      >
        {detailPawn && (
          <div className="space-y-6">
            <div>
              <p className="eyebrow">{t('common.item')}</p>
              <p className="text-[14px] font-semibold mt-0.5">
                {detailPawn.itemDescription}
              </p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {detailPawn.itemType} ·{" "}
                <span className="mono">{formatWeight(detailPawn.weight ?? 0)}</span> g
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--hairline)]">
              <DetailField label={t('pages.dashboard.customerId')}>
                <span className="mono">{detailPawn.customerId}</span>
              </DetailField>
              <DetailField label={t('common.principal')}>
                <Money amount={detailPawn.loanAmount} size="sm" />
              </DetailField>
              <DetailField label={t('pages.dashboard.interestRate')}>
                <span className="mono">
                  {formatDecimal(detailPawn.interestRate, 2)}% / mo
                </span>
              </DetailField>
              {detailPawn.maxAvailableAmount != null && detailPawn.maxAvailableAmount > 0 && (
                <DetailField label={t('pages.dashboard.maxAvailable')}>
                  <Money amount={detailPawn.maxAvailableAmount} size="sm" />
                </DetailField>
              )}
              <DetailField label={t('pages.dashboard.opened')}>{formatDateTime(detailPawn.createdAt)}</DetailField>
              <DetailField label={t('pages.dashboard.lastInterestPaid')}>
                {detailPawn.lastPaymentDate ? formatDate(detailPawn.lastPaymentDate) : "—"}
              </DetailField>
              {detailPawn.redeemedAt && (
                <DetailField label={t('pages.dashboard.redeemed')}>
                  {formatDateTime(detailPawn.redeemedAt)}
                </DetailField>
              )}
              {(detailPawn.redeemedInterest ?? 0) > 0 && (
                <DetailField label={t('pages.dashboard.interestAtRedemption')}>
                  <Money amount={detailPawn.redeemedInterest ?? 0} size="sm" />
                </DetailField>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--hairline)]">
              <h4 className="text-[13px] font-semibold tracking-tight mb-3">
                {t('pages.dashboard.ledgerActivity')}
              </h4>
              {detailTxLoading ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  {t('common.loadingTransactions')}
                </p>
              ) : detailTx.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  {t('common.noTransactions')}
                </p>
              ) : (
                <div className="rounded-[8px] border border-[var(--hairline)] overflow-x-auto max-h-[min(280px,40vh)] overflow-y-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>When</TH>
                        <TH>Type</TH>
                        <TH align="right">Amount</TH>
                        <TH>Staff</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {detailTx.map((tx) => (
                        <TR key={tx.id}>
                          <TD className="whitespace-nowrap text-[12px]">
                            {formatDateTime(tx.date)}
                          </TD>
                          <TD>
                            <Badge tone={getTxTone(tx.type)} size="sm">
                              {tx.type}
                            </Badge>
                          </TD>
                          <TD className="text-right">
                            <Money amount={tx.amount} size="sm" />
                          </TD>
                          <TD className="text-[12px] text-[var(--text-muted)] max-w-[120px] truncate">
                            {tx.user && tx.user !== "Unknown" ? tx.user : "—"}
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
    </div>
  );
};

export default Dashboard;
