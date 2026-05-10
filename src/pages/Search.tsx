import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Eye, Kanban, Printer, Ticket } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  PageHeader,
  SearchInput,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../components/ui";
import { InterestVoucher } from "../components/InterestVoucher";
import { cn, formatDate, formatDateTime, formatWeight } from "../utils/format";
import {
  loadPawnItemOverdueThresholds,
  loadPawnItemTypes,
  type PawnItemOverdueThresholds,
} from "../utils/itemTypes";
import { addSettlementCartTicket } from "../utils/settlementCart";
import SettlementTicketDetailsDialog, {
  type SettlementPawn,
} from "../components/SettlementTicketDetailsDialog";
import { usesGoldJewelleryStorage } from "../utils/storageUtils";

type NavTarget = "redeem" | "interest";

type PawnStatus = "PAWN" | "REDEEMED" | "EXPIRED";
type StatusFilter = PawnStatus | "all";
type SearchSortKey =
  | "id"
  | "customerName"
  | "item"
  | "createdAt"
  | "lastPaymentDate"
  | "activeUntil"
  | "status"
  | "loanAmount";
type SearchSortDirection = "asc" | "desc";

interface Pawn extends SettlementPawn {
  id: number;
  slotNumber?: number | null;
}

type VoucherData = {
  pawnId: number;
  physicalNumber?: string;
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

type BadgeTone = "neutral" | "brass" | "success" | "warning" | "danger" | "info";
const DAY_MS = 24 * 60 * 60 * 1000;

const statusTone = (status: string): BadgeTone => {
  if (status === "PAWN") return "brass";
  if (status === "REDEEMED") return "success";
  if (status === "EXPIRED") return "danger";
  return "neutral";
};

const getInterestBaseDate = (pawn: Pawn) =>
  new Date(pawn.lastPaymentDate || pawn.createdAt);

const addUtcMonths = (value: Date, months: number) =>
  new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + months,
      value.getUTCDate(),
    ),
  );

const startOfUtcDay = (value: Date | string | number) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
};

const getActiveUntilDate = (
  pawn: Pawn,
  itemOverdueThresholds: PawnItemOverdueThresholds,
) => {
  const date = startOfUtcDay(getInterestBaseDate(pawn));
  const threshold = itemOverdueThresholds[pawn.item.type] ?? { months: 0, days: 0 };
  const withMonths = addUtcMonths(date, Math.max(0, threshold.months));
  return new Date(withMonths.getTime() + Math.max(0, threshold.days) * DAY_MS);
};

const SearchPage: React.FC<{
  onNavigate: (page: NavTarget) => void;
}> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [pawns, setPawns] = useState<Pawn[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PAWN");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SearchSortKey>("id");
  const [sortDirection, setSortDirection] =
    useState<SearchSortDirection>("desc");
  const [detailPawn, setDetailPawn] = useState<Pawn | null>(null);
  const [voucherData, setVoucherData] = useState<VoucherData | null>(null);
  const [itemOverdueThresholds, setItemOverdueThresholds] =
    useState<PawnItemOverdueThresholds>({});

  const statusLabel = (status: string): string => {
    if (status === "PAWN") return t('pages.customers.active');
    if (status === "REDEEMED") return t('pages.customers.redeemed');
    if (status === "EXPIRED") return t('pages.customers.expired');
    return status;
  };

  const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: "PAWN", label: t('pages.customers.active') },
    { id: "REDEEMED", label: t('pages.customers.redeemed') },
    { id: "EXPIRED", label: t('pages.customers.expired') },
    { id: "all", label: t('common.all') },
  ];

  const listTitle = (filter: StatusFilter): string => {
    if (filter === "all") return t('pages.search.allTickets');
    if (filter === "PAWN") return t('pages.search.activePawns');
    if (filter === "REDEEMED") return t('pages.search.redeemedTickets');
    return t('pages.search.expiredTickets');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = statusFilter === "all" ? {} : { status: statusFilter };
        const pr = await window.electron.ipcRenderer.invoke(
          "list-pawns",
          payload
        );
        if (!cancelled && pr.success && Array.isArray(pr.pawns))
          setPawns(pr.pawns);
      } catch (e) {
        console.error(e);
        if (!cancelled) setPawns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  useEffect(() => {
    const syncThresholds = () => {
      setItemOverdueThresholds(loadPawnItemOverdueThresholds(loadPawnItemTypes()));
    };

    syncThresholds();
    window.addEventListener("pawn-item-types-updated", syncThresholds);
    window.addEventListener("storage", syncThresholds);
    return () => {
      window.removeEventListener("pawn-item-types-updated", syncThresholds);
      window.removeEventListener("storage", syncThresholds);
    };
  }, []);

  useEffect(() => {
    if (!voucherData) return;

    let cancelled = false;
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        window.print();
        window.setTimeout(() => {
          if (!cancelled) setVoucherData(null);
        }, 0);
      });

      if (cancelled) {
        window.cancelAnimationFrame(secondFrame);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
    };
  }, [voucherData]);

  const closeDetail = () => {
    setDetailPawn(null);
    setVoucherData(null);
  };

  const handlePrint = async () => {
    if (!detailPawn) return;
    try {
      const customerResult = await window.electron.api.customers.list();
      const customer =
        customerResult?.success && Array.isArray(customerResult.customers)
          ? customerResult.customers.find(
              (entry: { id: number; address?: string }) =>
                entry.id === detailPawn.customerId,
            )
          : null;
      const expireDate = getActiveUntilDate(
        detailPawn,
        itemOverdueThresholds,
      ).toISOString();
      const nextVoucherData: VoucherData = {
        pawnId: detailPawn.id,
        physicalNumber: detailPawn.physicalNumber ?? undefined,
        storageLocation: detailPawn.storageLocation ?? undefined,
        sequence: detailPawn.sequence ?? undefined,
        customerName: detailPawn.customerName,
        customerAddress: customer?.address || "-",
        itemType: detailPawn.item.type,
        itemDescription: detailPawn.item.description,
        weight: detailPawn.item.weight,
        netWeight: detailPawn.item.netWeight,
        loanAmount: detailPawn.loanAmount,
        interestRate: detailPawn.interestRate,
        amountPaid: detailPawn.loanAmount,
        lastInterestPaidDate: detailPawn.lastPaymentDate || detailPawn.createdAt,
        paidUntilDate: expireDate,
        expireDate,
      };

      setVoucherData(null);
      window.setTimeout(() => {
        setVoucherData(nextVoucherData);
      }, 0);
    } catch (error) {
      console.error("Error preparing voucher print:", error);
    }
  };

  const handleDetailPawnUpdated = (updatedPawn: SettlementPawn) => {
    setPawns((current) =>
      current.map((pawn) =>
        pawn.id === updatedPawn.id ? { ...pawn, ...updatedPawn } : pawn,
      ),
    );
    setDetailPawn((current) =>
      current?.id === updatedPawn.id ? { ...current, ...updatedPawn } : current,
    );
  };

  const q = query.trim().toLowerCase();
  const filteredPawns = q
    ? pawns.filter(
        (p) =>
          p.id.toString().includes(query.trim()) ||
          p.customerName.toLowerCase().includes(q) ||
          (p.physicalNumber || "").toLowerCase().includes(q) ||
          (p.storageLocation || "").toLowerCase().includes(q) ||
          p.item.description.toLowerCase().includes(q) ||
          p.item.type.toLowerCase().includes(q)
      )
    : pawns;

  const sortedPawns = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredPawns].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "id":
          comparison = a.id - b.id;
          break;
        case "customerName":
          comparison = a.customerName.localeCompare(b.customerName);
          break;
        case "item":
          comparison = `${a.item.type} ${a.item.description}`.localeCompare(
            `${b.item.type} ${b.item.description}`
          );
          break;
        case "createdAt":
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "lastPaymentDate":
          comparison =
            getInterestBaseDate(a).getTime() - getInterestBaseDate(b).getTime();
          break;
        case "activeUntil":
          comparison =
            getActiveUntilDate(a, itemOverdueThresholds).getTime() -
            getActiveUntilDate(b, itemOverdueThresholds).getTime();
          break;
        case "status":
          comparison = statusLabel(a.status).localeCompare(statusLabel(b.status));
          break;
        case "loanAmount":
          comparison = a.loanAmount - b.loanAmount;
          break;
      }

      if (comparison !== 0) return comparison * direction;
      return b.id - a.id;
    });
  }, [filteredPawns, itemOverdueThresholds, sortDirection, sortKey]);

  const toggleSort = (key: SearchSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(
      key === "id" || key === "createdAt" || key === "lastPaymentDate"
        ? "desc"
        : "asc"
    );
  };

  const SortHeader = ({
    label,
    sortBy,
    align = "left",
  }: {
    label: string;
    sortBy: SearchSortKey;
    align?: "left" | "right";
  }) => {
    const active = sortKey === sortBy;
    const Icon = active && sortDirection === "desc" ? ChevronDown : ChevronUp;

    return (
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
          align === "right" && "ml-auto",
          active
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        )}
      >
        <span>{label}</span>
        <Icon
          size={12}
          className={active ? "opacity-100" : "opacity-35"}
          aria-hidden
        />
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.admin')}
        title={t('pages.search.title')}
        description={t('pages.search.desc')}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={statusFilter === id ? "primary" : "secondary"}
            onClick={() => setStatusFilter(id)}
            disabled={loading}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="mb-6 max-w-xl">
        <SearchInput
          placeholder={t('pages.search.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Kanban
                size={14}
                className="text-[var(--brass)]"
                aria-hidden
              />
              <h3 className="text-[14px] font-semibold tracking-tight">
                {listTitle(statusFilter)}
              </h3>
            </div>
            <Badge tone="neutral">{filteredPawns.length}</Badge>
          </div>
        </CardHeader>
        {loading ? (
          <CardBody>
            <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">
              {t('pages.search.loadingTickets')}
            </p>
          </CardBody>
        ) : filteredPawns.length === 0 ? (
          <CardBody>
            <EmptyState
              title={
                q
                  ? t('pages.search.noMatchingTickets')
                  : statusFilter === "PAWN"
                    ? t('pages.search.noActivePawns')
                    : statusFilter === "all"
                      ? t('pages.search.noTicketsYet')
                      : t('pages.search.noTicketsStatus', { status: statusLabel(statusFilter).toLowerCase() })
              }
              description={
                q
                  ? t('pages.search.tryDifferentOrWiden')
                  : t('pages.search.changeFilterOrCreateNew')
              }
            />
          </CardBody>
        ) : (
          <div className="max-h-[min(540px,60vh)] overflow-y-auto">
            <Table>
              <THead>
                <TR>
                  <TH>
                    <SortHeader label={t('common.ticket')} sortBy="id" />
                  </TH>
                  <TH>
                    <SortHeader label={t('common.customer')} sortBy="customerName" />
                  </TH>
                  <TH>
                    <SortHeader label={t('common.item')} sortBy="item" />
                  </TH>
                  <TH>
                    <SortHeader label={t('pages.search.opened')} sortBy="createdAt" />
                  </TH>
                  <TH>
                    <SortHeader label={t('pages.search.lastPaid')} sortBy="lastPaymentDate" />
                  </TH>
                  <TH>
                    <SortHeader label={t('pages.search.activeUntil')} sortBy="activeUntil" />
                  </TH>
                  {statusFilter === "all" && (
                    <TH>
                      <SortHeader label={t('common.status')} sortBy="status" />
                    </TH>
                  )}
                  <TH align="right">
                    <SortHeader
                      label={t('pages.search.loanAmount')}
                      sortBy="loanAmount"
                      align="right"
                    />
                  </TH>
                  <TH align="right">{t('pages.search.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {sortedPawns.map((pawn) => (
                  <TR
                    key={pawn.id}
                    className="cursor-pointer"
                    onClick={() => setDetailPawn(pawn)}
                  >
                    <TD>
                      <span className="mono font-medium text-[var(--brass)]">
                        #{pawn.id}
                      </span>
                    </TD>
                    <TD>
                      <span className="font-medium">{pawn.customerName}</span>
                    </TD>
                    <TD>
                      <div className="min-w-0 flex items-center gap-3">
                        {pawn.item.photo && (
                          <img
                            src={pawn.item.photo}
                            alt=""
                            className="w-10 h-10 rounded-[6px] object-cover border border-[var(--hairline)] shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium">
                            {pawn.item.description}
                          </div>
                          <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                            {pawn.item.type}
                            {usesGoldJewelleryStorage(pawn.item.type) && (
                              <>
                                {" "}
                                · <span className="mono">{formatWeight(pawn.item.weight)}</span> g
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap" muted mono>
                      {formatDateTime(pawn.createdAt)}
                    </TD>
                    <TD className="whitespace-nowrap" muted mono>
                      {formatDate(pawn.lastPaymentDate || pawn.createdAt)}
                    </TD>
                    <TD className="whitespace-nowrap" mono>
                      {formatDate(getActiveUntilDate(pawn, itemOverdueThresholds))}
                    </TD>
                    {statusFilter === "all" && (
                      <TD>
                        <Badge tone={statusTone(pawn.status)} size="sm">
                          {statusLabel(pawn.status)}
                        </Badge>
                      </TD>
                    )}
                    <TD align="right">
                      <Money amount={pawn.loanAmount} size="sm" strong />
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          leadingIcon={<Eye size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailPawn(pawn);
                          }}
                        >
                          {t('common.view')}
                        </Button>
                        {pawn.status === "PAWN" ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            leadingIcon={<Ticket size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              addSettlementCartTicket("redeem", pawn.id);
                              onNavigate("redeem");
                            }}
                          >
                            {t('pages.search.addToRedeem')}
                          </Button>
                        ) : (
                          <span className="text-[12px] text-[var(--text-muted)] whitespace-nowrap">
                            {t('common.closed')}
                          </span>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <SettlementTicketDetailsDialog
        open={detailPawn != null}
        onClose={closeDetail}
        pawn={detailPawn}
        showRemarkAction
        onPawnUpdated={handleDetailPawnUpdated}
        footerExtras={
          <>
            {detailPawn && (
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<Printer size={14} />}
                onClick={handlePrint}
              >
                {t('common.print')}
              </Button>
            )}
            {detailPawn?.status === "PAWN" && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  leadingIcon={<Ticket size={14} />}
                  onClick={() => {
                    const id = detailPawn.id;
                    closeDetail();
                    addSettlementCartTicket("interest", id);
                    onNavigate("interest");
                  }}
                >
                  {t('pages.search.addToInterest')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  leadingIcon={<Ticket size={14} />}
                  onClick={() => {
                    const id = detailPawn.id;
                    closeDetail();
                    addSettlementCartTicket("redeem", id);
                    onNavigate("redeem");
                  }}
                >
                  {t('pages.search.addToRedeem')}
                </Button>
              </>
            )}
          </>
        }
      />

      {voucherData && <InterestVoucher {...voucherData} />}
    </div>
  );
};

export default SearchPage;
