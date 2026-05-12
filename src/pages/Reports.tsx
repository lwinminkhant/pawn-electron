import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Package,
  TrendingDown,
  Users as UsersIcon,
  Wallet,
} from "lucide-react";
import {
  Badge,
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
  StatCard,
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
import {
  cn,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatMMK,
  formatWeight,
} from "../utils/format";
import {
  getCurrentBusinessDate,
  setCurrentBusinessDateYmd,
  useBusinessDate,
} from "../utils/businessDate";
import {
  loadPawnItemOverdueThresholds,
  loadPawnItemTypes,
  savePawnItemOverdueThresholds,
  type PawnItemOverdueThresholds,
} from "../utils/itemTypes";
import { usesGoldJewelleryStorage } from "../utils/storageUtils";

type BadgeTone =
  | "neutral"
  | "brass"
  | "success"
  | "warning"
  | "danger"
  | "info";

/* ---------------- Daily ---------------- */
interface Transaction {
  pawnId?: number | null;
  time: string;
  type: string;
  customer: string;
  itemType: string;
  itemDescription: string;
  physicalNumber?: string | null;
  grossWeight?: number | null;
  amount: number;
  user: string | null;
}

interface DailyStats {
  pawnOut: number;
  redeemIn: number;
  interest: number;
}

interface DailyPawn {
  id: number;
  customerId: number;
  customerName: string;
  item: {
    type: string;
    description: string;
    photo?: string;
    weight: number;
    netWeight?: number;
  };
  physicalNumber?: string | null;
  loanAmount: number;
  interestRate: number;
  maxAvailableAmount?: number;
  storageLocation?: string | null;
  slotNumber?: number | null;
  sequence?: number | null;
  status: string;
  createdAt: string;
  lastPaymentDate?: string;
  redeemedAt?: string;
  redeemedInterest?: number;
}

interface DailyPawnTransaction {
  id: number;
  date: string;
  type: string;
  amount: number;
  description?: string;
  user?: string;
}

type DailySortKey = "time" | "type" | "customer" | "item" | "amount" | "user";
type DailySortDirection = "asc" | "desc";

const typeTone = (type: string): BadgeTone => {
  if (type === "PAWN") return "warning";
  if (type === "REDEEM_BA") return "success";
  if (
    type === "REDEEM_I" ||
    type === "PAID_INTEREST" ||
    type === "DATE_INTEREST"
  )
    return "info";
  return "info";
};

const getTxTone = (type: string): BadgeTone => {
  if (type === "PAWN" || type === "PLUS_AMOUNT") return "warning";
  if (type === "PAID_INTEREST" || type === "REDEEM_I") return "info";
  if (type === "MINUS_AMOUNT" || type === "REDEEM_BA") return "success";
  return "neutral";
};

const isOutgoingReportAmount = (type: string): boolean =>
  type === "PAWN" || type === "PLUS_AMOUNT";

const getReportAmount = (type: string, amount: number): number =>
  isOutgoingReportAmount(type) ? -Math.abs(amount) : Math.abs(amount);

const getReportAmountTone = (
  type: string
): "danger" | "success" => (isOutgoingReportAmount(type) ? "danger" : "success");

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

const DetailField = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <p className="eyebrow">{label}</p>
    <div className="text-[14px] font-medium mt-0.5 text-[var(--text-primary)]">
      {children}
    </div>
  </div>
);

const DailyReport = () => {
  const { t } = useTranslation();
  const selectedDate = useBusinessDate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [staffFilter, setStaffFilter] = useState("all");
  const [stats, setStats] = useState<DailyStats>({
    pawnOut: 0,
    redeemIn: 0,
    interest: 0,
  });
  const [loading, setLoading] = useState(false);
  const [detailPawn, setDetailPawn] = useState<DailyPawn | null>(null);
  const [sortKey, setSortKey] = useState<DailySortKey>("time");
  const [sortDirection, setSortDirection] = useState<DailySortDirection>("desc");
  const totalIn = stats.redeemIn + stats.interest;
  const diff = totalIn - stats.pawnOut;

  const transactionTypes = useMemo(
    () => Array.from(new Set(transactions.map((tx) => tx.type))).sort(),
    [transactions]
  );

  const staffOptions = useMemo(
    () =>
      Array.from(
        new Set(
          transactions
            .map((tx) => (tx.user && tx.user !== "Unknown" ? tx.user : "—"))
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const normalizedStaff = tx.user && tx.user !== "Unknown" ? tx.user : "—";
      if (selectedTypes.length > 0 && !selectedTypes.includes(tx.type)) return false;
      if (staffFilter !== "all" && normalizedStaff !== staffFilter) return false;
      return true;
    });
  }, [selectedTypes, staffFilter, transactions]);

  const sortedTransactions = useMemo(() => {
    const getValue = (tx: Transaction) => {
      switch (sortKey) {
        case "time":
          return tx.time || "";
        case "type":
          return tx.type;
        case "customer":
          return tx.customer;
        case "item":
          return [
            tx.itemType,
            tx.itemDescription,
            tx.physicalNumber ?? "",
          ].join(" ");
        case "amount":
          return tx.amount;
        case "user":
          return tx.user && tx.user !== "Unknown" ? tx.user : "—";
      }
    };

    return [...filteredTransactions].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);

      if (typeof left === "number" && typeof right === "number") {
        return sortDirection === "asc" ? left - right : right - left;
      }

      const result = String(left).localeCompare(String(right), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sortDirection === "asc" ? result : -result;
    });
  }, [filteredTransactions, sortDirection, sortKey]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const result = await (window as any).electron.ipcRenderer.invoke(
          "get-daily-transactions",
          { date: selectedDate }
        );
        if (result.success) {
          setTransactions(result.transactions);
          setStats(result.stats);
        }
      } catch (error) {
        console.error("Error fetching daily report:", error);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [selectedDate]);

  useEffect(() => {
    setSelectedTypes((current) =>
      current.filter((type) => transactionTypes.includes(type))
    );
  }, [transactionTypes]);

  const openDetail = async (pawnId?: number | null) => {
    if (!pawnId) return;
    try {
      const result = await (window as any).electron.ipcRenderer.invoke(
        "get-pawn",
        { pawnId, includeInactive: true }
      );
      if (result.success && result.pawn) {
        setDetailPawn(result.pawn);
      }
    } catch (error) {
      console.error("Error loading pawn details:", error);
    }
  };

  const closeDetail = () => {
    setDetailPawn(null);
  };

  const toggleType = (type: string) => {
    setSelectedTypes((current) =>
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type]
    );
  };

  const toggleSort = (key: DailySortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const SortHeader = ({
    label,
    sortBy,
    align = "left",
  }: {
    label: string;
    sortBy: DailySortKey;
    align?: "left" | "right";
  }) => {
    const active = sortKey === sortBy;
    const Icon = active && sortDirection === "desc" ? ChevronDown : ChevronUp;

    return (
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className={cn(
          "flex w-full items-center gap-1 transition-colors",
          align === "right" && "justify-end",
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          label={t('pages.reports.out')}
          value={<Money amount={-Math.abs(stats.pawnOut)} tone="danger" strong signed />}
          hint={t('pages.reports.cashPaidOutToday')}
        />
        <StatCard
          label={t('pages.reports.cashIn')}
          value={<Money amount={stats.redeemIn} tone="success" strong signed />}
          hint={t('pages.reports.principalReturnedToday')}
        />
        <StatCard
          label={t('pages.reports.interest')}
          value={<Money amount={stats.interest} tone="success" strong signed />}
          hint={t('pages.reports.interestCollectedToday')}
          accent
        />
        <StatCard
          label={t('pages.reports.totalIn')}
          value={<Money amount={totalIn} tone="success" strong signed />}
          hint={t('pages.reports.totalCashReceivedToday')}
        />
        <StatCard
          label={t('pages.reports.diff')}
          value={
            <Money
              amount={diff}
              tone={diff < 0 ? "danger" : "success"}
              strong
              signed
            />
          }
          hint={t('pages.reports.netCashDifferenceToday')}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar
                size={14}
                className="text-[var(--text-muted)]"
                aria-hidden
              />
              <h3 className="text-[14px] font-semibold tracking-tight">
                {t('pages.reports.dailyTransactions')}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[var(--text-muted)] eyebrow">
                {t('common.date')}
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setCurrentBusinessDateYmd(e.target.value)}
                className="w-[160px]"
                monoDigits
              />
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={t('pages.reports.type')}>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTypes([])}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                    selectedTypes.length === 0
                      ? "border-[var(--brass)] bg-[var(--brass-soft)] text-[var(--brass)]"
                      : "border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {selectedTypes.length === 0 && <Check size={12} aria-hidden />}
                  {t('pages.reports.allTypes')}
                </button>
                {transactionTypes.map((type) => {
                  const active = selectedTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleType(type)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                        active
                          ? "border-[var(--brass)] bg-[var(--brass-soft)] text-[var(--brass)]"
                          : "border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                      )}
                      aria-pressed={active}
                    >
                      {active && <Check size={12} aria-hidden />}
                      {type}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={t('pages.reports.staff')}>
              <Select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
              >
                <option value="all">{t('pages.reports.allStaff')}</option>
                {staffOptions.map((staff) => (
                  <option key={staff} value={staff}>
                    {staff}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--hairline)] pt-3">
            <p className="text-[12px] text-[var(--text-muted)]">
              {t('pages.reports.showingTransactions', { shown: filteredTransactions.length, total: transactions.length })}
            </p>
            {(selectedTypes.length > 0 || staffFilter !== "all") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedTypes([]);
                  setStaffFilter("all");
                }}
              >
                {t('pages.reports.clearFilters')}
              </Button>
            )}
          </div>
          {loading ? (
            <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
              {t('pages.feedback.loading')}
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              title={t('pages.reports.noTransactions')}
              description={t('pages.reports.noActivityRecorded')}
            />
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              title={t('pages.reports.noMatchingTransactions')}
              description={t('pages.reports.tryChangingFilters')}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>
                    <SortHeader label={t('pages.reports.time')} sortBy="time" />
                  </TH>
                  <TH>{t('pages.reports.pawnId')}</TH>
                  <TH>
                    <SortHeader label={t('pages.reports.type')} sortBy="type" />
                  </TH>
                  <TH>
                    <SortHeader label={t('pages.reports.customer')} sortBy="customer" />
                  </TH>
                  <TH>
                    <SortHeader label={t('pages.reports.items')} sortBy="item" />
                  </TH>
                  <TH align="right">
                    <SortHeader label={t('pages.reports.amount')} sortBy="amount" align="right" />
                  </TH>
                  <TH>
                    <SortHeader label={t('pages.reports.user')} sortBy="user" />
                  </TH>
                </TR>
              </THead>
              <TBody>
                {sortedTransactions.map((t, i) => (
                  <TR
                    key={i}
                    className="cursor-pointer hover:bg-[var(--surface-hover)]"
                    onClick={() => openDetail(t.pawnId)}
                  >
                    <TD mono muted>
                      {t.time}
                    </TD>
                    <TD mono>
                      {t.pawnId ? `#${t.pawnId}` : "—"}
                    </TD>
                    <TD>
                      <Badge tone={typeTone(t.type)} size="sm">
                        {t.type}
                      </Badge>
                    </TD>
                    <TD>
                      <span className="font-medium">{t.customer}</span>
                    </TD>
                    <TD>
                      <div className="min-w-0">
                        <div className="font-medium">
                          {t.itemType || "—"}
                        </div>
                        {t.itemDescription && (
                          <div className="text-[12px] text-[var(--text-muted)]">
                            {t.itemDescription}
                          </div>
                        )}
                        <div className="text-[11px] text-[var(--text-muted)] mt-1">
                          {[
                            t.physicalNumber ? `No: ${t.physicalNumber}` : null,
                            usesGoldJewelleryStorage(t.itemType) &&
                              t.grossWeight != null
                              ? `${formatWeight(t.grossWeight)} g`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                    </TD>
                    <TD align="right">
                      <Money
                        amount={getReportAmount(t.type, t.amount)}
                        size="sm"
                        tone={getReportAmountTone(t.type)}
                        signed
                      />
                    </TD>
                    <TD muted>{t.user && t.user !== "Unknown" ? t.user : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <SettlementTicketDetailsDialog
        open={detailPawn != null}
        onClose={closeDetail}
        pawn={
          detailPawn
            ? {
                ...detailPawn,
                storageLocation: detailPawn.storageLocation ?? undefined,
                sequence: detailPawn.sequence ?? undefined,
              }
            : null
        }
      />
    </div>
  );
};

/* ---------------- Inventory ---------------- */
interface InventoryItem {
  id: number;
  physicalNumber?: string | null;
  itemType: string;
  description: string;
  photo?: string | null;
  grossWeight: number;
  netWeight: number;
  loanAmount: number;
  storageLocation: string;
  slotNumber: number;
  sequence?: number;
  status: string;
  createdAt: string;
}

type InventorySortKey =
  | "itemType"
  | "description"
  | "grossWeight"
  | "netWeight"
  | "loanAmount"
  | "storageLocation";

type InventorySortDirection = "asc" | "desc";

const InventoryReport = () => {
  const { t } = useTranslation();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailPawn, setDetailPawn] = useState<DailyPawn | null>(null);
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<InventorySortKey>("storageLocation");
  const [sortDirection, setSortDirection] =
    useState<InventorySortDirection>("asc");

  useEffect(() => {
    const run = async () => {
      try {
        const result = await (window as any).electron.ipcRenderer.invoke(
          "get-inventory"
        );
        if (result.success) setInventory(result.inventory);
      } catch (error) {
        console.error("Error loading inventory:", error);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const itemTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          inventory
            .map((item) => (item.itemType ?? "").trim())
            .filter(Boolean) as string[]
        )
      ).sort((a, b) => a.localeCompare(b)),
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    if (itemTypeFilter === "all") return inventory;
    return inventory.filter(
      (item) => (item.itemType ?? "").trim() === itemTypeFilter
    );
  }, [inventory, itemTypeFilter]);

  const totalNetWeight = useMemo(
    () =>
      filteredInventory.reduce((sum, item) => {
        if (!usesGoldJewelleryStorage(item.itemType)) return sum;
        return sum + (item.netWeight ?? 0);
      }, 0),
    [filteredInventory]
  );

  const sortedInventory = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredInventory].sort((a, b) => {
      const aItemType = a.itemType ?? "";
      const bItemType = b.itemType ?? "";
      const aDescription = a.description ?? "";
      const bDescription = b.description ?? "";
      const aStorageLocation = a.storageLocation ?? "";
      const bStorageLocation = b.storageLocation ?? "";

      switch (sortKey) {
        case "grossWeight":
          return ((a.grossWeight ?? 0) - (b.grossWeight ?? 0)) * direction;
        case "netWeight":
          return ((a.netWeight ?? 0) - (b.netWeight ?? 0)) * direction;
        case "loanAmount":
          return (a.loanAmount - b.loanAmount) * direction;
        case "itemType":
          return aItemType.localeCompare(bItemType) * direction;
        case "description":
          return aDescription.localeCompare(bDescription) * direction;
        case "storageLocation":
          return aStorageLocation.localeCompare(bStorageLocation) * direction;
      }
    });
  }, [filteredInventory, sortDirection, sortKey]);

  const toggleSort = (key: InventorySortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const SortHeader = ({
    label,
    sortBy,
    align,
  }: {
    label: string;
    sortBy: InventorySortKey;
    align?: "left" | "right";
  }) => {
    const active = sortKey === sortBy;
    const Icon = active && sortDirection === "desc" ? ChevronDown : ChevronUp;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-[var(--text-primary)]",
          align === "right" && "ml-auto"
        )}
      >
        <span>{label}</span>
        <Icon
          size={12}
          className={active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}
        />
      </button>
    );
  };

  const openDetail = async (pawnId: number) => {
    try {
      const result = await (window as any).electron.ipcRenderer.invoke(
        "get-pawn",
        { pawnId, includeInactive: true }
      );
      if (result.success && result.pawn) {
        setDetailPawn(result.pawn);
      }
    } catch (error) {
      console.error("Error loading inventory pawn details:", error);
    }
  };

  const closeDetail = () => {
    setDetailPawn(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Package
              size={14}
              className="text-[var(--text-muted)]"
              aria-hidden
            />
            <h3 className="text-[14px] font-semibold tracking-tight">
              {t('pages.reports.activeInventory')}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="neutral">
              Total Net: {formatWeight(totalNetWeight)} g
            </Badge>
            <Select
              value={itemTypeFilter}
              onChange={(e) => setItemTypeFilter(e.target.value)}
              className="w-[180px]"
            >
              <option value="all">{t('common.all')} Item Types</option>
              {itemTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            <Badge tone="neutral">{filteredInventory.length} {t('pages.reports.items')}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {loading ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
            {t('pages.reports.loadingInventory')}
          </div>
        ) : filteredInventory.length === 0 ? (
          <EmptyState
            title={t('pages.reports.noActiveInventory')}
            description={t('pages.reports.allItemsRedeemed')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('pages.reports.photo')}</TH>
                <TH>
                  <SortHeader
                    label={t('pages.reports.description')}
                    sortBy="description"
                  />
                </TH>
                <TH>
                  <SortHeader
                    label={t('pages.reports.itemType2')}
                    sortBy="itemType"
                  />
                </TH>
                <TH align="right">
                  <SortHeader
                    label="Gross Weight"
                    sortBy="grossWeight"
                    align="right"
                  />
                </TH>
                <TH align="right">
                  <SortHeader
                    label="Net Weight"
                    sortBy="netWeight"
                    align="right"
                  />
                </TH>
                <TH align="right">
                  <SortHeader
                    label={t('pages.reports.loanAmount')}
                    sortBy="loanAmount"
                    align="right"
                  />
                </TH>
                <TH>
                  <SortHeader
                    label={t('pages.reports.location')}
                    sortBy="storageLocation"
                  />
                </TH>
              </TR>
            </THead>
            <TBody>
              {sortedInventory.map((item) => (
                <TR
                  key={item.id}
                  className="cursor-pointer hover:bg-[var(--surface-hover)]"
                  onClick={() => openDetail(item.id)}
                >
                  <TD>
                    {item.photo ? (
                      <img
                        src={item.photo}
                        alt=""
                        className="w-10 h-10 rounded-[6px] object-cover border border-[var(--hairline)]"
                      />
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <div className="font-medium">{item.description || "—"}</div>
                    {item.physicalNumber && (
                      <div className="text-[12px] text-[var(--text-muted)] mono">
                        {item.physicalNumber}
                      </div>
                    )}
                  </TD>
                  <TD muted>{item.itemType || "—"}</TD>
                  <TD align="right" mono>
                    {usesGoldJewelleryStorage(item.itemType) && item.grossWeight != null
                      ? formatWeight(item.grossWeight)
                      : "—"}
                  </TD>
                  <TD align="right" mono>
                    {usesGoldJewelleryStorage(item.itemType) && item.netWeight != null
                      ? formatWeight(item.netWeight)
                      : "—"}
                  </TD>
                  <TD align="right">
                    <Money amount={item.loanAmount} size="sm" strong />
                  </TD>
                  <TD muted>
                    {item.storageLocation || "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>

      <SettlementTicketDetailsDialog
        open={detailPawn != null}
        onClose={closeDetail}
        pawn={
          detailPawn
            ? {
                ...detailPawn,
                storageLocation: detailPawn.storageLocation ?? undefined,
                sequence: detailPawn.sequence ?? undefined,
              }
            : null
        }
      />
    </Card>
  );
};

/* ---------------- Financial ---------------- */
interface FinancialSummary {
  activeLoans: number;
  redeemedPrincipal: number;
  totalInterest: number;
}

const FinancialReport = () => {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const result = await (window as any).electron.ipcRenderer.invoke(
          "get-financial-summary"
        );
        if (result.success) setSummary(result.summary);
      } catch (error) {
        console.error("Error loading financial summary:", error);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading)
    return (
      <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
        Loading financial data…
      </div>
    );
  if (!summary)
    return (
      <EmptyState
        title="No data"
        description="Failed to load financial summary."
      />
    );

  const totalValue =
    summary.activeLoans + summary.redeemedPrincipal + summary.totalInterest;
  const activePct = (summary.activeLoans / (totalValue || 1)) * 100;
  const interestPct = (summary.totalInterest / (totalValue || 1)) * 100;
  const redeemedPct = (summary.redeemedPrincipal / (totalValue || 1)) * 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Active Loan Portfolio"
          value={<Money amount={summary.activeLoans} size="lg" strong />}
          hint="Currently outstanding principal"
          accent
        />
        <StatCard
          label="Total Interest Collected"
          value={<Money amount={summary.totalInterest} size="lg" strong />}
          hint="Revenue from interest payments"
        />
        <StatCard
          label="Total Redeemed Principal"
          value={<Money amount={summary.redeemedPrincipal} size="lg" strong />}
          hint="Principal returned from redemptions"
        />
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-[14px] font-semibold tracking-tight">
            Portfolio Distribution
          </h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Bar
            label="Active Loans"
            value={activePct}
            tone="brass"
            display={`${activePct.toFixed(1)}%`}
          />
          <Bar
            label="Interest Collected"
            value={interestPct}
            tone="success"
            display={`${interestPct.toFixed(1)}%`}
          />
          <Bar
            label="Redeemed Principal"
            value={redeemedPct}
            tone="info"
            display={`${redeemedPct.toFixed(1)}%`}
          />
        </CardBody>
      </Card>
    </div>
  );
};

const Bar: React.FC<{
  label: string;
  value: number;
  tone: "brass" | "success" | "info";
  display: string;
}> = ({ label, value, tone, display }) => {
  const fill =
    tone === "brass"
      ? "bg-[var(--brass)]"
      : tone === "success"
        ? "bg-[var(--success)]"
        : "bg-[var(--info)]";
  return (
    <div>
      <div className="flex justify-between text-[13px] mb-1">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="mono font-medium">{display}</span>
      </div>
      <div className="w-full h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", fill)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
};

/* ---------------- Overdue ---------------- */
interface OverdueItem {
  id: number;
  customerName: string;
  phone: string;
  itemDescription: string;
  itemType: string;
  loanAmount: number;
  lastPaymentDate: string;
  physicalNumber?: string | null;
}

type OverdueNotice = {
  type: "success" | "danger";
  text: string;
};

interface PawnDetail {
  id: number;
  customerId: number;
  customerName: string;
  physicalNumber?: string | null;
  itemPhoto?: string | null;
  itemDescription: string;
  itemType: string;
  weight: number;
  netWeight?: number;
  loanAmount: number;
  interestRate: number;
  maxAvailableAmount?: number;
  storageLocation?: string;
  slotNumber?: number;
  sequence?: number;
  status: string;
  createdAt: string;
  lastPaymentDate?: string;
  redeemedAt?: string;
  redeemedInterest?: number;
}

type OverdueSortKey =
  | "pawnId"
  | "customerName"
  | "phone"
  | "itemType"
  | "item"
  | "lastPaymentDate"
  | "overdue"
  | "loanAmount";

type OverdueSortDirection = "asc" | "desc";

const parseDateAsLocal = (dateString: string): Date | null => {
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;
  if (dateString.includes("T")) return parsed;
  const parts = dateString.split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
};

const getDaysLate = (
  lastPaymentDate: string,
  thresholdDays: number,
  businessDate: Date,
) => {
  const today = new Date(
    businessDate.getUTCFullYear(),
    businessDate.getUTCMonth(),
    businessDate.getUTCDate()
  );
  const paidAt = parseDateAsLocal(lastPaymentDate);
  if (!paidAt) return -1;
  const paidAtDate = new Date(
    paidAt.getFullYear(),
    paidAt.getMonth(),
    paidAt.getDate()
  );
  return (
    Math.floor((today.getTime() - paidAtDate.getTime()) / (1000 * 3600 * 24)) -
    thresholdDays
  );
};

const getOverdueMonths = (daysLate: number) => {
  if (daysLate <= 0) return 0;
  return Math.floor(daysLate / 30);
};

const addLocalCalendarDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
};

const OverdueReport = () => {
  const { t } = useTranslation();
  const businessDateYmd = useBusinessDate();
  const [items, setItems] = useState<OverdueItem[]>([]);
  const [pawns, setPawns] = useState<PawnDetail[]>([]);
  const [itemOverdueThresholds, setItemOverdueThresholds] =
    useState<PawnItemOverdueThresholds>(() =>
      loadPawnItemOverdueThresholds(loadPawnItemTypes())
    );
  const [loading, setLoading] = useState(true);
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [thresholdItemType, setThresholdItemType] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [sortKey, setSortKey] = useState<OverdueSortKey>("lastPaymentDate");
  const [sortDirection, setSortDirection] =
    useState<OverdueSortDirection>("asc");
  const [detailPawn, setDetailPawn] = useState<PawnDetail | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expiring, setExpiring] = useState(false);
  const [message, setMessage] = useState<OverdueNotice | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSelectValue, setDragSelectValue] = useState(true);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    const syncThresholds = () => {
      setItemOverdueThresholds(loadPawnItemOverdueThresholds(loadPawnItemTypes()));
    };

    syncThresholds();
    window.addEventListener("pawn-item-types-updated", syncThresholds);
    return () => {
      window.removeEventListener("pawn-item-types-updated", syncThresholds);
    };
  }, []);

  const getItemThresholdConfig = (itemType?: string | null) => {
    const key = itemType?.trim() ?? "";
    return itemOverdueThresholds[key] ?? { months: 0, days: 0 };
  };

  const updateSelectedItemThreshold = (
    field: "months" | "days",
    value: string,
  ) => {
    if (thresholdItemType === "all") return;

    const normalizedValue = Math.max(0, Math.floor(Number(value) || 0));
    setItemOverdueThresholds((current) => {
      const next = {
        ...current,
        [thresholdItemType]: {
          ...(current[thresholdItemType] ?? { months: 0, days: 0 }),
          [field]: normalizedValue,
        },
      };
      savePawnItemOverdueThresholds(next, loadPawnItemTypes());
      window.dispatchEvent(new Event("pawn-item-types-updated"));
      return next;
    });
  };

  const getItemThresholdDays = (itemType?: string | null) =>
    getItemThresholdConfig(itemType).months * 30 +
    getItemThresholdConfig(itemType).days;

  const loadOverdueData = async () => {
    setLoading(true);
    try {
      const [overdueResult, pawnsResult] = await Promise.all([
        (window as any).electron.ipcRenderer.invoke("get-overdue-items", {
          thresholdDays: 0,
        }),
        (window as any).electron.ipcRenderer.invoke("list-pawns"),
      ]);
      if (overdueResult.success) setItems(overdueResult.overdueItems);
      if (pawnsResult.success) setPawns(pawnsResult.pawns);
    } catch (error) {
      console.error("Error loading overdue items:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverdueData();
  }, [businessDateYmd]);

  const itemTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items.map((item) => item.itemType?.trim()).filter(Boolean) as string[]
        )
      ).sort((a, b) => a.localeCompare(b)),
    [items]
  );

  useEffect(() => {
    if (thresholdItemType !== "all") return;
    if (itemTypeOptions.length === 0) return;
    setThresholdItemType(itemTypeOptions[0]);
  }, [itemTypeOptions, thresholdItemType]);

  const filteredItems = useMemo(() => items.filter((item) => {
    const daysLate = getDaysLate(
      item.lastPaymentDate,
      getItemThresholdDays(item.itemType),
      getCurrentBusinessDate()
    );
    if (daysLate < 0) return false;
    const lastPaymentDate = parseDateAsLocal(item.lastPaymentDate);
    if (!lastPaymentDate) return false;

    if (fromDate) {
      const from = parseDateAsLocal(fromDate);
      if (from) {
        from.setHours(0, 0, 0, 0);
        if (lastPaymentDate < from) return false;
      }
    }

    if (toDate) {
      const to = parseDateAsLocal(toDate);
      if (to) {
        to.setHours(23, 59, 59, 999);
        if (lastPaymentDate > to) return false;
      }
    }

    if (itemTypeFilter !== "all" && item.itemType !== itemTypeFilter) {
      return false;
    }

    return true;
  }), [businessDateYmd, items, fromDate, toDate, itemTypeFilter, itemOverdueThresholds]);

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => filteredItems.some((item) => item.id === id))
    );
  }, [filteredItems]);

  const sortedItems = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredItems].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "pawnId":
          comparison = a.id - b.id;
          break;
        case "customerName":
          comparison = String(a.customerName || "").localeCompare(String(b.customerName || ""));
          break;
        case "phone":
          comparison = String(a.phone || "").localeCompare(String(b.phone || ""));
          break;
        case "itemType":
          comparison = String(a.itemType || "").localeCompare(String(b.itemType || ""));
          break;
        case "item":
          comparison = `${a.id} ${a.itemDescription || ""}`.localeCompare(
            `${b.id} ${b.itemDescription || ""}`
          );
          break;
        case "lastPaymentDate":
          comparison =
            (parseDateAsLocal(a.lastPaymentDate)?.getTime() ?? 0) -
            (parseDateAsLocal(b.lastPaymentDate)?.getTime() ?? 0);
          break;
        case "overdue":
          comparison =
            getDaysLate(
              a.lastPaymentDate,
              getItemThresholdDays(a.itemType),
              getCurrentBusinessDate()
            ) -
            getDaysLate(
              b.lastPaymentDate,
              getItemThresholdDays(b.itemType),
              getCurrentBusinessDate()
            );
          break;
        case "loanAmount":
          comparison = a.loanAmount - b.loanAmount;
          break;
      }

      if (comparison !== 0) return comparison * direction;
      return a.id - b.id;
    });
  }, [businessDateYmd, filteredItems, itemOverdueThresholds, sortDirection, sortKey]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => sortedItems.filter((item) => selectedSet.has(item.id)),
    [selectedSet, sortedItems]
  );
  const printableItems = selectedItems.length > 0 ? selectedItems : sortedItems;
  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedSet.has(item.id));
  const someFilteredSelected =
    filteredItems.some((item) => selectedSet.has(item.id)) && !allFilteredSelected;
  const printableTotalLoan = printableItems.reduce(
    (sum, item) => sum + item.loanAmount,
    0
  );

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredItems.some((item) => item.id === id))
      );
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      filteredItems.forEach((item) => next.add(item.id));
      return Array.from(next);
    });
  };

  const handleExpireSelected = async () => {
    if (selectedItems.length === 0) return;
    const confirmed = window.confirm(
      `Expire ${selectedItems.length} overdue item${selectedItems.length !== 1 ? "s" : ""
      }? This will mark them as expired.`
    );
    if (!confirmed) return;

    setExpiring(true);
    setMessage(null);
    try {
      const result = await window.electron.api.pawns.batchExpire({
        pawnIds: selectedItems.map((item) => item.id),
      });
      if (!result?.success) {
        setMessage({
          type: "danger",
          text: result?.message || "Failed to expire selected overdue items",
        });
        return;
      }

      setMessage({
        type: "success",
        text:
          result?.message ||
          `${selectedItems.length} overdue item${selectedItems.length !== 1 ? "s" : ""
          } expired successfully`,
      });
      setSelectedIds([]);
      setDetailPawn((current) =>
        current && selectedItems.some((item) => item.id === current.id)
          ? null
          : current
      );
      await loadOverdueData();
    } catch (error) {
      console.error("Error expiring overdue items:", error);
      setMessage({
        type: "danger",
        text: "An error occurred while expiring overdue items",
      });
    } finally {
      setExpiring(false);
    }
  };

  const handlePrintPdf = () => {
    if (printableItems.length === 0) return;
    window.print();
  };

  const toggleSort = (key: OverdueSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const renderSortHeader = (
    label: string,
    sortBy: OverdueSortKey,
    align: "left" | "right" = "left"
  ) => {
    const active = sortKey === sortBy;
    const Icon = active && sortDirection === "desc" ? ChevronDown : ChevronUp;

    return (
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className={cn(
          "flex w-full items-center gap-1 transition-colors",
          align === "right" && "justify-end",
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

  const openDetail = (id: number) => {
    const pawn = pawns.find((entry) => entry.id === id);
    if (pawn) setDetailPawn(pawn);
  };

  if (loading)
    return (
      <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
        {t('pages.reports.checkingOverdue')}
      </div>
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              size={14}
              className="text-[var(--danger)]"
              aria-hidden
            />
            <div>
              <h3 className="text-[14px] font-semibold tracking-tight">
                {t('pages.reports.overdueItems')}
              </h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {t('pages.reports.overdueItemsDesc')}
              </p>
            </div>
          </div>
          <Badge tone="danger">{filteredItems.length}</Badge>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {message && (
          <Banner tone={message.type === "success" ? "success" : "danger"}>
            {message.text}
          </Banner>
        )}

        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <Field label={t('pages.reports.itemType')}>
            <Select
              value={itemTypeFilter}
              onChange={(e) => setItemTypeFilter(e.target.value)}
            >
              <option value="all">{t('pages.reports.allItemTypes')}</option>
              {itemTypeOptions.map((itemType) => (
                <option key={itemType} value={itemType}>
                  {itemType}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('pages.reports.fromLastPayment')}>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              monoDigits
            />
          </Field>
          <Field label={t('pages.reports.toLastPayment')}>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              monoDigits
            />
          </Field>
          <Field label="Threshold item type">
            <Select
              value={thresholdItemType}
              onChange={(e) => setThresholdItemType(e.target.value)}
            >
              <option value="all">{t('pages.reports.allItemTypes')}</option>
              {itemTypeOptions.map((itemType) => (
                <option key={itemType} value={itemType}>
                  {itemType}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Threshold months">
            <Input
              type="number"
              min="0"
              value={
                thresholdItemType === "all"
                  ? ""
                  : String(getItemThresholdConfig(thresholdItemType).months)
              }
              onChange={(e) => updateSelectedItemThreshold("months", e.target.value)}
              placeholder={t('pages.settings.monthsPlaceholder')}
              monoDigits
              disabled={thresholdItemType === "all"}
            />
          </Field>
          <Field label="Threshold days">
            <Input
              type="number"
              min="0"
              value={
                thresholdItemType === "all"
                  ? ""
                  : String(getItemThresholdConfig(thresholdItemType).days)
              }
              onChange={(e) => updateSelectedItemThreshold("days", e.target.value)}
              placeholder="0"
              monoDigits
              disabled={thresholdItemType === "all"}
            />
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={() => {
                setItemTypeFilter("all");
                setFromDate("");
                setToDate("");
              }}
            >
              {t('pages.reports.clearFilters')}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-[13px] text-[var(--text-secondary)]">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                ref={(node) => {
                  if (node) node.indeterminate = someFilteredSelected;
                }}
                onChange={toggleSelectAllFiltered}
              />
              <span>{t('pages.reports.selectAllFiltered')}</span>
            </label>
            <span>
              {t('pages.reports.selectedCount', { count: selectedItems.length })}
              {selectedItems.length > 0
                ? ` • ${formatMMK(
                  selectedItems.reduce((sum, item) => sum + item.loanAmount, 0)
                )}`
                : ""}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={handlePrintPdf}
              disabled={printableItems.length === 0}
            >
              Print / Save PDF
            </Button>
            <Button
              variant="danger"
              onClick={handleExpireSelected}
              disabled={selectedItems.length === 0}
              loading={expiring}
            >
              {t('pages.reports.expireSelected')}
            </Button>
          </div>
        </div>
      </CardBody>

      <div>
        {filteredItems.length === 0 ? (
          <EmptyState
            title={t('pages.reports.noOverdueItems')}
            description={t('pages.reports.noOverdueItemsMatch')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = someFilteredSelected;
                    }}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all overdue items"
                    className="accent-danger"
                  />
                </TH>
                <TH>{renderSortHeader(t('pages.reports.pawnId2'), "pawnId")}</TH>
                <TH>{renderSortHeader(t('pages.reports.customer2'), "customerName")}</TH>
                <TH>{renderSortHeader(t('pages.reports.contact'), "phone")}</TH>
                <TH>{renderSortHeader(t('pages.reports.itemType2'), "itemType")}</TH>
                <TH>{renderSortHeader(t('pages.reports.item2'), "item")}</TH>
                <TH>{renderSortHeader(t('pages.reports.lastPayment'), "lastPaymentDate")}</TH>
                <TH>{renderSortHeader(t('pages.reports.overdue'), "overdue")}</TH>
                <TH align="right">{renderSortHeader(t('pages.reports.loanAmount2'), "loanAmount", "right")}</TH>
              </TR>
            </THead>
            <TBody>
              {sortedItems.map((item) => {
                const threshold = getItemThresholdConfig(item.itemType);
                const thresholdDays = getItemThresholdDays(item.itemType);
                const daysOverdue = getDaysLate(
                  item.lastPaymentDate,
                  thresholdDays,
                  getCurrentBusinessDate()
                );
                const overdueMonths = getOverdueMonths(daysOverdue);
                const parsedLastPaymentDate = parseDateAsLocal(
                  item.lastPaymentDate
                );
                const overdueStartDate = parsedLastPaymentDate
                  ? addLocalCalendarDays(parsedLastPaymentDate, thresholdDays)
                  : null;
                const businessDate = getCurrentBusinessDate();
                return (
                  <TR
                    key={item.id}
                    className="cursor-pointer hover:bg-[var(--surface-hover)]"
                    onClick={() => openDetail(item.id)}
                  >
                    <TD
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setIsDragging(true);
                        const willSelect = !selectedSet.has(item.id);
                        setDragSelectValue(willSelect);
                        setSelectedIds((current) =>
                          willSelect && !current.includes(item.id)
                            ? [...current, item.id]
                            : !willSelect
                              ? current.filter((val) => val !== item.id)
                              : current
                        );
                      }}
                      onMouseEnter={() => {
                        if (isDragging) {
                          setSelectedIds((current) => {
                            if (dragSelectValue && !current.includes(item.id)) {
                              return [...current, item.id];
                            }
                            if (!dragSelectValue && current.includes(item.id)) {
                              return current.filter((val) => val !== item.id);
                            }
                            return current;
                          });
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSet.has(item.id)}
                        onChange={() => { }}
                        aria-label={`Select ticket #${item.id}`}
                        className="pointer-events-none accent-danger"
                      />
                    </TD>
                    <TD>
                      <span className="mono font-medium">#{item.id}</span>
                    </TD>
                    <TD>
                      <span className="font-medium">{item.customerName}</span>
                    </TD>
                    <TD muted mono>
                      {item.phone || "—"}
                    </TD>
                    <TD>
                      <span className="text-[var(--text-secondary)]">
                        {item.itemType || "—"}
                      </span>
                    </TD>
                    <TD>
                      <span className="mono text-[var(--brass)] font-medium">
                        #{item.id}
                      </span>{" "}
                      {item.physicalNumber && (
                        <span className="mono text-[var(--text-muted)]">
                          {item.physicalNumber}{" "}
                        </span>
                      )}
                      <span className="text-[var(--text-secondary)]">
                        {item.itemDescription}
                      </span>
                    </TD>
                    <TD>
                      <span className="mono text-[13px]">
                        {(
                          parsedLastPaymentDate ??
                          new Date(item.lastPaymentDate)
                        ).toLocaleDateString()}
                      </span>
                      <div className="mt-1">
                        <Badge tone="danger" size="sm">
                          {`${daysOverdue} days late • ${threshold.months} month${threshold.months !== 1 ? "s" : ""} + ${threshold.days} day${threshold.days !== 1 ? "s" : ""}`}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {`Overdue starts: ${overdueStartDate ? formatDate(overdueStartDate) : "—"} • Business date: ${formatDate(businessDate)}`}
                      </div>
                    </TD>
                    <TD mono>
                      {overdueMonths} month{overdueMonths !== 1 ? "s" : ""}
                    </TD>
                    <TD align="right">
                      <Money amount={item.loanAmount} size="sm" strong />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      <div id="print-receipt" className="print-only px-6 py-6">
        <div className="mb-5">
          <h1 className="text-[20px] font-semibold">Overdue Items Report</h1>
          <p className="text-[12px] mt-1">
            Generated on {formatDateTime(getCurrentBusinessDate())}
          </p>
          <p className="text-[12px] mt-1">
            {selectedItems.length > 0
              ? `Selected overdue items: ${selectedItems.length}`
              : `All filtered overdue items: ${printableItems.length}`}
          </p>
          <p className="text-[12px] mt-1">
            Total loan amount: {formatMMK(printableTotalLoan)}
          </p>
        </div>

        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left">Pawn ID</th>
              <th className="border border-black px-2 py-1 text-left">Customer</th>
              <th className="border border-black px-2 py-1 text-left">Phone</th>
              <th className="border border-black px-2 py-1 text-left">Item</th>
              <th className="border border-black px-2 py-1 text-left">Type</th>
              <th className="border border-black px-2 py-1 text-left">Last payment</th>
              <th className="border border-black px-2 py-1 text-left">Days late</th>
              <th className="border border-black px-2 py-1 text-right">Loan amount</th>
            </tr>
          </thead>
          <tbody>
            {printableItems.map((item) => {
              const daysLate = getDaysLate(
                item.lastPaymentDate,
                getItemThresholdDays(item.itemType),
                getCurrentBusinessDate()
              );
              return (
                <tr key={`print-${item.id}`}>
                  <td className="border border-black px-2 py-1">#{item.id}</td>
                  <td className="border border-black px-2 py-1">
                    {item.customerName}
                  </td>
                  <td className="border border-black px-2 py-1">
                    {item.phone || "—"}
                  </td>
                  <td className="border border-black px-2 py-1">
                    #{item.id}
                    {item.physicalNumber ? ` ${item.physicalNumber}` : ""}{" "}
                    {item.itemDescription}
                  </td>
                  <td className="border border-black px-2 py-1">
                    {item.itemType || "—"}
                  </td>
                  <td className="border border-black px-2 py-1">
                    {formatDate(item.lastPaymentDate)}
                  </td>
                  <td className="border border-black px-2 py-1">{daysLate}</td>
                  <td className="border border-black px-2 py-1 text-right">
                    {formatMMK(item.loanAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SettlementTicketDetailsDialog
        open={detailPawn != null}
        onClose={() => setDetailPawn(null)}
        pawn={
          detailPawn
            ? ({
                id: detailPawn.id,
                customerId: detailPawn.customerId,
                customerName: detailPawn.customerName,
                physicalNumber: detailPawn.physicalNumber,
                storageLocation: detailPawn.storageLocation,
                sequence: detailPawn.sequence,
                item: {
                  type: detailPawn.itemType,
                  description: detailPawn.itemDescription,
                  photo: detailPawn.itemPhoto ?? undefined,
                  weight: detailPawn.weight ?? 0,
                  netWeight: detailPawn.netWeight,
                },
                loanAmount: detailPawn.loanAmount,
                interestRate: detailPawn.interestRate,
                status: detailPawn.status,
                createdAt: detailPawn.createdAt,
                lastPaymentDate: detailPawn.lastPaymentDate,
                maxAvailableAmount: detailPawn.maxAvailableAmount,
                redeemedAt: detailPawn.redeemedAt,
                redeemedInterest: detailPawn.redeemedInterest,
              } satisfies SettlementPawn)
            : null
        }
      />
    </Card>
  );
};

/* ---------------- Top Customers ---------------- */
interface TopCustomer {
  customerId: number;
  name: string;
  phone: string;
  pawnCount: number;
  totalLoanAmount: number;
  totalInterestAmount: number;
}

interface CustomerReportPawn {
  id: number;
  customerId: number;
  customerName?: string;
  physicalNumber?: string | null;
  item: {
    type: string;
    description: string;
    photo?: string;
    weight: number;
    netWeight?: number;
  };
  loanAmount: number;
  interestRate?: number;
  status: string;
  createdAt: string;
  lastPaymentDate?: string;
  redeemedAt?: string;
}

type CustomerSortKey =
  | "rank"
  | "customer"
  | "phone"
  | "pawnCount"
  | "loan"
  | "interest";

const CustomerReport = () => {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<TopCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<CustomerSortKey>("rank");
  const [sortDirection, setSortDirection] = useState<DailySortDirection>("asc");
  const [selectedCustomer, setSelectedCustomer] = useState<TopCustomer | null>(null);
  const [customerPawns, setCustomerPawns] = useState<CustomerReportPawn[]>([]);
  const [pawnsLoading, setPawnsLoading] = useState(false);
  const [detailPawn, setDetailPawn] = useState<DailyPawn | null>(null);
  const [detailTx, setDetailTx] = useState<DailyPawnTransaction[]>([]);
  const [detailTxLoading, setDetailTxLoading] = useState(false);

  const sortedCustomers = useMemo(() => {
    const rows = customers.map((customer, index) => ({
      customer,
      rank: index + 1,
    }));

    const getValue = (
      row: { customer: TopCustomer; rank: number }
    ): string | number => {
      switch (sortKey) {
        case "rank":
          return row.rank;
        case "customer":
          return row.customer.name || "";
        case "phone":
          return row.customer.phone || "";
        case "pawnCount":
          return row.customer.pawnCount || 0;
        case "loan":
          return row.customer.totalLoanAmount || 0;
        case "interest":
          return row.customer.totalInterestAmount || 0;
      }
    };

    return rows.sort((left, right) => {
      const leftValue = getValue(left);
      const rightValue = getValue(right);

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return sortDirection === "asc"
          ? leftValue - rightValue
          : rightValue - leftValue;
      }

      const result = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sortDirection === "asc" ? result : -result;
    });
  }, [customers, sortDirection, sortKey]);

  useEffect(() => {
    const run = async () => {
      try {
        const result = await (window as any).electron.ipcRenderer.invoke(
          "get-top-customers"
        );
        if (result.success) setCustomers(result.topCustomers);
      } catch (error) {
        console.error("Error loading top customers:", error);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerPawns([]);
      setPawnsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setPawnsLoading(true);
      try {
        const result = await (window as any).electron.ipcRenderer.invoke(
          "get-customer-pawns",
          { customerId: selectedCustomer.customerId }
        );
        if (!cancelled && result.success && Array.isArray(result.pawns)) {
          setCustomerPawns(result.pawns);
        } else if (!cancelled) {
          setCustomerPawns([]);
        }
      } catch (error) {
        console.error("Error loading customer pawns:", error);
        if (!cancelled) setCustomerPawns([]);
      } finally {
        if (!cancelled) setPawnsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer]);

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
        const res = await (window as any).electron.ipcRenderer.invoke(
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
  }, [detailPawn?.id]);

  if (loading)
    return (
      <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
        Loading customer data…
      </div>
    );

  const toggleSort = (key: CustomerSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const openPawnDetail = async (pawnId?: number | null) => {
    if (!pawnId) return;
    try {
      const result = await (window as any).electron.ipcRenderer.invoke(
        "get-pawn",
        { pawnId, includeInactive: true }
      );
      if (result.success && result.pawn) {
        setDetailPawn(result.pawn);
      }
    } catch (error) {
      console.error("Error loading pawn details:", error);
    }
  };

  const closeCustomerDetail = () => {
    setSelectedCustomer(null);
    setCustomerPawns([]);
    setDetailPawn(null);
    setDetailTx([]);
    setPawnsLoading(false);
    setDetailTxLoading(false);
  };

  const closePawnDetail = () => {
    setDetailPawn(null);
    setDetailTx([]);
    setDetailTxLoading(false);
  };

  const SortHeader = ({
    label,
    sortBy,
    align = "left",
  }: {
    label: string;
    sortBy: CustomerSortKey;
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
    <Card>
      <CardBody className="p-0">
        {customers.length === 0 ? (
          <EmptyState
            title="No customer data"
            description="No customers to show yet."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>
                  <SortHeader label="Rank" sortBy="rank" />
                </TH>
                <TH>
                  <SortHeader label="Customer" sortBy="customer" />
                </TH>
                <TH>
                  <SortHeader label="Phone" sortBy="phone" />
                </TH>
                <TH align="right">
                  <SortHeader
                    label="Total Pawns"
                    sortBy="pawnCount"
                    align="right"
                  />
                </TH>
                <TH align="right">
                  <SortHeader label="Total Loan" sortBy="loan" align="right" />
                </TH>
                <TH align="right">
                  <SortHeader
                    label="Total Interest"
                    sortBy="interest"
                    align="right"
                  />
                </TH>
              </TR>
            </THead>
            <TBody>
              {sortedCustomers.map(({ customer: c, rank }) => (
                <TR
                  key={c.customerId}
                  className="cursor-pointer hover:bg-[var(--surface-hover)]"
                  onClick={() => setSelectedCustomer(c)}
                >
                  <TD>
                    <span className="mono text-[var(--text-muted)] font-medium">
                      #{rank}
                    </span>
                  </TD>
                  <TD>
                    <span className="font-medium">{c.name}</span>
                  </TD>
                  <TD muted mono>
                    {c.phone || "—"}
                  </TD>
                  <TD align="right" mono>
                    {c.pawnCount}
                  </TD>
                  <TD align="right">
                    <Money amount={c.totalLoanAmount || 0} size="sm" strong />
                  </TD>
                  <TD align="right">
                    <Money amount={c.totalInterestAmount || 0} size="sm" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>

      <Dialog
        open={selectedCustomer != null}
        onClose={closeCustomerDetail}
        size="lg"
        title={selectedCustomer?.name || t('pages.customers.details')}
        description={selectedCustomer?.phone || undefined}
        footer={
          <Button type="button" variant="ghost" onClick={closeCustomerDetail}>
            {t('common.close')}
          </Button>
        }
      >
        {selectedCustomer && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <DetailField label="Customer ID">
                <span className="mono">{selectedCustomer.customerId}</span>
              </DetailField>
              <DetailField label="Total Pawns">
                <span className="mono">{selectedCustomer.pawnCount}</span>
              </DetailField>
              <DetailField label="Total Loan">
                <Money amount={selectedCustomer.totalLoanAmount || 0} size="sm" />
              </DetailField>
              <DetailField label="Total Interest">
                <Money amount={selectedCustomer.totalInterestAmount || 0} size="sm" />
              </DetailField>
            </div>

            <div className="pt-2 border-t border-[var(--hairline)]">
              <h4 className="text-[13px] font-semibold tracking-tight mb-3">
                Pawn history
              </h4>
              {pawnsLoading ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  Loading customer pawns…
                </p>
              ) : customerPawns.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  No pawn history on file.
                </p>
              ) : (
                <div className="rounded-[8px] border border-[var(--hairline)] overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Pawn ID</TH>
                        <TH>Item</TH>
                        <TH>Status</TH>
                        <TH align="right">Loan</TH>
                        <TH>Opened</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {customerPawns.map((pawn) => (
                        <TR
                          key={pawn.id}
                          className="cursor-pointer hover:bg-[var(--surface-hover)]"
                          onClick={() => openPawnDetail(pawn.id)}
                        >
                          <TD mono>#{pawn.id}</TD>
                          <TD>
                            <div className="font-medium">
                              {pawn.item.description || "—"}
                            </div>
                            <div className="text-[12px] text-[var(--text-muted)]">
                              {pawn.item.type || "Unknown"}
                            </div>
                          </TD>
                          <TD>
                            <Badge tone={statusTone(pawn.status)} size="sm">
                              {statusLabel(pawn.status)}
                            </Badge>
                          </TD>
                          <TD align="right">
                            <Money amount={pawn.loanAmount || 0} size="sm" />
                          </TD>
                          <TD className="text-[12px] whitespace-nowrap">
                            {formatDateTime(pawn.createdAt)}
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
        open={detailPawn != null}
        onClose={closePawnDetail}
        size="lg"
        title={
          detailPawn ? (
            <span className="flex items-center gap-2 flex-wrap">
              <span className="mono">#{detailPawn.id}</span>
              <Badge tone={statusTone(detailPawn.status)} size="sm">
                {statusLabel(detailPawn.status)}
              </Badge>
            </span>
          ) : null
        }
        description={detailPawn?.customerName || selectedCustomer?.name}
        footer={
          <Button type="button" variant="ghost" onClick={closePawnDetail}>
            {t('common.close')}
          </Button>
        }
      >
        {detailPawn && (
          <div className="space-y-6">
            <div>
              <p className="eyebrow">Item</p>
              {detailPawn.item.photo && (
                <img
                  src={detailPawn.item.photo}
                  alt="Pawn item"
                  className="w-32 h-24 rounded-[8px] object-cover border border-[var(--hairline)] mb-3"
                />
              )}
              <p className="text-[14px] font-semibold mt-0.5">
                {detailPawn.item.description}
              </p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {detailPawn.item.type}
                {usesGoldJewelleryStorage(detailPawn.item.type) && (
                  <>
                    {" "}
                    · <span className="mono">{formatWeight(detailPawn.item.weight)}</span> g
                    {detailPawn.item.netWeight != null &&
                      detailPawn.item.netWeight > 0 && (
                        <>
                          {" "}
                          · Net{" "}
                          <span className="mono">
                            {formatWeight(detailPawn.item.netWeight)}
                          </span>{" "}
                          g
                        </>
                      )}
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--hairline)]">
              {detailPawn.storageLocation && (
                <DetailField label="Storage location">
                  <span className="mono">{detailPawn.storageLocation}</span>
                </DetailField>
              )}
              <DetailField label="Count">
                <span className="mono">
                  {detailPawn.sequence != null ? `#${detailPawn.sequence}` : "—"}
                </span>
              </DetailField>
              <DetailField label="Principal">
                <Money amount={detailPawn.loanAmount} size="sm" />
              </DetailField>
              <DetailField label="Interest rate">
                <span className="mono">
                  {formatDecimal(detailPawn.interestRate, 2)}% / mo
                </span>
              </DetailField>
              {detailPawn.maxAvailableAmount != null &&
                detailPawn.maxAvailableAmount > 0 && (
                  <DetailField label="Max available">
                    <Money amount={detailPawn.maxAvailableAmount} size="sm" />
                  </DetailField>
                )}
              <DetailField label="Opened">
                {formatDateTime(detailPawn.createdAt)}
              </DetailField>
              <DetailField label="Last interest paid">
                {detailPawn.lastPaymentDate
                  ? formatDate(detailPawn.lastPaymentDate)
                  : "—"}
              </DetailField>
              {detailPawn.redeemedAt && (
                <DetailField label="Redeemed">
                  {formatDateTime(detailPawn.redeemedAt)}
                </DetailField>
              )}
              {(detailPawn.redeemedInterest ?? 0) > 0 && (
                <DetailField label="Interest at redemption">
                  <Money amount={detailPawn.redeemedInterest ?? 0} size="sm" />
                </DetailField>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--hairline)]">
              <h4 className="text-[13px] font-semibold tracking-tight mb-3">
                Ledger activity
              </h4>
              {detailTxLoading ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  Loading transactions…
                </p>
              ) : detailTx.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  No transactions on file.
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
                            <Money
                              amount={getReportAmount(tx.type, tx.amount)}
                              size="sm"
                              tone={getReportAmountTone(tx.type)}
                              signed
                            />
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
    </Card>
  );
};

/* ---------------- Shell ---------------- */
const Reports = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<
    "daily" | "inventory" | "financial" | "overdue" | "customer"
  >("daily");

  const tabs: {
    id: typeof activeTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
      { id: "daily", label: t('pages.reports.dailyTransactions'), icon: <Calendar size={13} /> },
      { id: "inventory", label: t('pages.reports.inventory'), icon: <Package size={13} /> },
      { id: "financial", label: t('pages.reports.financial'), icon: <Wallet size={13} /> },
      { id: "overdue", label: t('pages.reports.overdue'), icon: <TrendingDown size={13} /> },
      { id: "customer", label: t('pages.reports.customers'), icon: <UsersIcon size={13} /> },
    ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "daily":
        return <DailyReport />;
      case "inventory":
        return <InventoryReport />;
      case "financial":
        return <FinancialReport />;
      case "overdue":
        return <OverdueReport />;
      case "customer":
        return <CustomerReport />;
      default:
        return <DailyReport />;
    }
  };

  return (
    <div>
      <div className="flex gap-1 border-b border-[var(--hairline)] overflow-x-auto mb-6 -mx-1 px-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-9 text-[13px] font-medium",
                "whitespace-nowrap transition-colors relative",
                active
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              {tab.icon}
              {tab.label}
              {active && (
                <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-[var(--brass)]" />
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-[400px]">{renderTabContent()}</div>
    </div>
  );
};

export default Reports;
