import React, { useState, useEffect } from "react";
import { IdCard, MapPin, Phone, ScanFace, Ticket, Users as UsersIcon } from "lucide-react";
import FaceSearch from "../components/FaceSearch";
import { useTranslation } from "react-i18next";
import WebcamCapture from "../components/WebcamCapture";

import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Money,
  SearchInput,
  Textarea,
} from "../components/ui";
import { formatDateTime } from "../utils/format";
import { addSettlementCartTicket } from "../utils/settlementCart";
import SettlementTicketDetailsDialog, {
  type SettlementPawn,
} from "../components/SettlementTicketDetailsDialog";

type NavTarget = "redeem" | "interest";

interface Customer {
  id: number;
  name: string;
  phone?: string;
  nrc?: string;
  address?: string;
  remark?: string;
  photo?: string;
  faceDescriptor?: string;
}

interface Pawn extends Omit<SettlementPawn, "customerName" | "interestRate"> {
  id: number;
  customerName?: string;
  itemType?: string;
  itemDescription?: string;
  weight?: number;
  netWeight?: number;
  interestRate?: number;
}

type BadgeTone =
  | "neutral"
  | "brass"
  | "success"
  | "warning"
  | "danger"
  | "info";

const statusTone = (status: string): BadgeTone => {
  if (status === "PAWN") return "brass";
  if (status === "REDEEMED") return "success";
  if (status === "EXPIRED") return "danger";
  return "neutral";
};

const Customers: React.FC<{
  onNavigate?: (page: NavTarget) => void;
}> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [customerPawns, setCustomerPawns] = useState<Pawn[]>([]);
  const [pawnsLoading, setPawnsLoading] = useState(false);
  const [showFaceSearch, setShowFaceSearch] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{type: "success" | "danger", text: string} | null>(null);
  const [detailPawn, setDetailPawn] = useState<Pawn | null>(null);

  const handleFaceSelect = (customerId: number) => {
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      handleSelect(customer);
      setShowFaceSearch(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "list-customers"
      );
      if (result.success) {
        setCustomers(result.customers);
        setSelectedCustomer((prev) => {
          if (!prev) return null;
          const next = result.customers.find((c: Customer) => c.id === prev.id);
          return next ?? null;
        });
      }
    } catch (error) {
      console.error("Error loading customers:", error);
    }
  };

  const loadCustomerPawns = async (customerId: number) => {
    setPawnsLoading(true);
    try {
      const listResult = await window.electron.ipcRenderer.invoke("list-pawns");
      if (listResult.success && Array.isArray(listResult.pawns)) {
        setCustomerPawns(
          (listResult.pawns as Pawn[])
            .filter((pawn) => pawn.customerId === customerId)
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
        );
        return;
      }

      const result = await window.electron.ipcRenderer.invoke(
        "get-customer-pawns",
        { customerId }
      );
      if (result.success) setCustomerPawns(result.pawns || []);
      else setCustomerPawns([]);
    } catch (error) {
      console.error("Error loading customer pawns:", error);
      setCustomerPawns([]);
    } finally {
      setPawnsLoading(false);
    }
  };

  const handleSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditing(false);
    setSaveMessage(null);
    setDetailPawn(null);
    loadCustomerPawns(customer.id);
  };

  const hasActivePawns = customerPawns.some((p) => p.status === "PAWN");

  const startEdit = () => {
    if (!selectedCustomer) return;
    setEditForm({ ...selectedCustomer });
    setIsEditing(true);
    setSaveMessage(null);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
    setSaveMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const result = await window.electron.ipcRenderer.invoke("update-customer", {
        id: editForm.id,
        name: editForm.name,
        phone: editForm.phone,
        nrc: editForm.nrc,
        address: editForm.address,
        remark: editForm.remark,
        photo: editForm.photo,
        faceDescriptor: editForm.faceDescriptor,
      });
      if (result.success) {
        setSaveMessage({ type: "success", text: t('common.success') });
        setIsEditing(false);
        loadCustomers();
        // Clear message after 3 seconds
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: "danger", text: result.message || t('common.error') });
      }
    } catch (error) {
      setSaveMessage({
        type: "danger",
        text: error instanceof Error ? error.message : t('common.error'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.nrc && c.nrc.toLowerCase().includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q))
      )
    : customers;

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UsersIcon
                  size={14}
                  className="text-[var(--brass)]"
                  aria-hidden
                />
                <h3 className="text-[14px] font-semibold tracking-tight">
                  {t("common.search")}
                </h3>
                <Badge tone="neutral">{filtered.length}</Badge>
              </div>
              <Button
                type="button"
                variant={showFaceSearch ? "primary" : "secondary"}
                size="sm"
                leadingIcon={<ScanFace size={14} />}
                onClick={() => setShowFaceSearch((v) => !v)}
              >
                {t('pages.customers.face')}
              </Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {showFaceSearch && (
              <FaceSearch
                customers={customers}
                onSelect={handleFaceSelect}
                onClose={() => setShowFaceSearch(false)}
              />
            )}

            <SearchInput
              placeholder={t('pages.customers.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="space-y-2 max-h-[min(420px,50vh)] lg:max-h-[min(560px,62vh)] overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <EmptyState
                  title={customers.length === 0 ? t('pages.customers.noCustomers') : t('pages.customers.noCustomers')}
                  description={
                    customers.length === 0
                      ? t('pages.customers.noCustomersDesc')
                      : t('pages.customers.tryDifferentSearch')
                  }
                />
              ) : (
                filtered.map((customer) => {
                  const isSelected = selectedCustomer?.id === customer.id;
                  return (
                    <button
                      type="button"
                      key={customer.id}
                      onClick={() => handleSelect(customer)}
                      className={`w-full text-left p-3.5 border rounded-[10px] transition-all ${
                        isSelected
                          ? "border-[var(--brass)] bg-[var(--brass-softer)]"
                          : "border-[var(--hairline)] hover:border-[var(--brass)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {customer.photo ? (
                          <img
                            src={customer.photo}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover border border-[var(--hairline)] shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[var(--brass-softer)] border border-[var(--hairline)] flex items-center justify-center shrink-0">
                            <span className="text-[14px] font-semibold text-[var(--brass)]">
                              {customer.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold truncate">
                            {customer.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                            {customer.phone && (
                              <span className="inline-flex items-center gap-1 mono">
                                <Phone size={11} /> {customer.phone}
                              </span>
                            )}
                            {customer.nrc && (
                              <span className="inline-flex items-center gap-1">
                                <IdCard size={11} /> {customer.nrc}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CardBody>
        </Card>

        <div className="lg:col-span-7 space-y-6">
          {selectedCustomer ? (
            <>
              <Card>
                {saveMessage && (
                  <div className="mx-4 mt-4">
                    <Banner tone={saveMessage.type}>{saveMessage.text}</Banner>
                  </div>
                )}
                {!isEditing ? (
                  <>
                    <CardHeader>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                          {selectedCustomer.photo ? (
                            <img
                              src={selectedCustomer.photo}
                              alt={selectedCustomer.name}
                              className="w-14 h-14 rounded-full object-cover border-2 border-[var(--brass)] shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-[var(--brass-softer)] border-2 border-[var(--brass)] flex items-center justify-center shrink-0">
                              <span className="text-[20px] font-bold text-[var(--brass)]">
                                {selectedCustomer.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <h3 className="text-[14px] font-semibold tracking-tight">
                              {selectedCustomer.name}
                            </h3>
                            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                              {t('pages.customers.contact')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" size="sm" onClick={startEdit} disabled={pawnsLoading}>
                            {t('pages.customers.editProfile')}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="eyebrow">{t('common.phone')}</p>
                          <p className="text-[14px] font-semibold mono mt-0.5">
                            {selectedCustomer.phone || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="eyebrow inline-flex items-center gap-1">
                            <IdCard size={11} /> {t('common.nrc')}
                          </p>
                          <p className="text-[14px] font-semibold mt-0.5">
                            {selectedCustomer.nrc || "—"}
                          </p>
                        </div>
                        {selectedCustomer.address && (
                          <div className="sm:col-span-2">
                            <p className="eyebrow inline-flex items-center gap-1">
                              <MapPin size={11} /> {t('common.address')}
                            </p>
                            <p className="text-[13.5px] mt-0.5">
                              {selectedCustomer.address}
                            </p>
                          </div>
                        )}
                        {selectedCustomer.remark && (
                          <div className="sm:col-span-2">
                            <p className="eyebrow">{t('pages.customers.remark')}</p>
                            <p className="text-[13.5px] mt-0.5 whitespace-pre-wrap">
                              {selectedCustomer.remark}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardBody>
                  </>
                ) : (
                  <form onSubmit={handleSave}>
                    <CardHeader>
                      <h3 className="text-[14px] font-semibold tracking-tight">
                        {t('pages.customers.editProfile')}
                      </h3>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      {editForm && (
                        <div className="grid grid-cols-2 gap-4">
                          <Field
                            label={t('pages.customers.fullName')}
                            className="col-span-2"
                            hint={hasActivePawns ? t('pages.customers.cannotChangeName') : undefined}
                          >
                            <Input
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              required
                              disabled={hasActivePawns}
                            />
                          </Field>
                          <Field label={t('common.phone')}>
                            <Input
                              value={editForm.phone || ""}
                              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            />
                          </Field>
                          <Field label={t('common.nrc')}>
                            <Input
                              value={editForm.nrc || ""}
                              onChange={(e) => setEditForm({ ...editForm, nrc: e.target.value })}
                            />
                          </Field>
                          <Field
                            label={t('common.address')}
                            className="col-span-2"
                            hint={hasActivePawns ? t('pages.customers.cannotChangeName') : undefined}
                          >
                            <Textarea
                              rows={2}
                              value={editForm.address || ""}
                              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                              disabled={hasActivePawns}
                            />
                          </Field>
                          <Field label={t('pages.customers.remark')} className="col-span-2">
                            <Textarea
                              rows={3}
                              value={editForm.remark || ""}
                              onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                            />
                          </Field>
                          <div className="col-span-2">
                            <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium mb-1.5">
                              {t('pages.customers.facialRecognitionSnapshot')}
                            </p>
                            <WebcamCapture
                              currentPhoto={editForm.photo}
                              onCapture={(photo, faceDescriptor) =>
                                setEditForm({
                                  ...editForm,
                                  photo,
                                  faceDescriptor: faceDescriptor || editForm.faceDescriptor,
                                })
                              }
                              onClear={() =>
                                setEditForm({ ...editForm, photo: "", faceDescriptor: "" })
                              }
                            />
                          </div>
                          <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-[var(--hairline)]">
                            <Button type="submit" variant="primary" loading={isSaving}>
                              {t('common.saveChanges')}
                            </Button>
                            <Button type="button" variant="ghost" onClick={cancelEdit}>
                              {t('common.cancel')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardBody>
                  </form>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="text-[14px] font-semibold tracking-tight">
                    {t('pages.customers.pawnHistoryTitle')}
                  </h3>
                </CardHeader>
                <CardBody>
                  {pawnsLoading ? (
                    <p className="text-[13px] text-[var(--text-muted)] py-4">
                      {t('common.loading')}
                    </p>
                  ) : customerPawns.length === 0 ? (
                    <EmptyState
                      title={t('pages.customers.noPawnHistory')}
                      description={t('pages.customers.noPawnHistoryDesc')}
                    />
                  ) : (
                    <div className="space-y-2 max-h-[min(400px,45vh)] overflow-y-auto pr-1">
                      {customerPawns.map((pawn) => (
                        <button
                          type="button"
                          key={pawn.id}
                          onClick={() => setDetailPawn(pawn)}
                          className="w-full text-left p-3 border border-[var(--hairline)] rounded-[10px] transition-all hover:border-[var(--brass)] hover:bg-[var(--surface-hover)]"
                          aria-label={`View details for ticket ${pawn.id}`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <p className="text-[13px] font-semibold">
                                <span className="mono text-[var(--brass)]">
                                  #{pawn.id}
                                </span>
                              </p>
                              <p className="text-[11.5px] text-[var(--text-muted)] mono">
                                {formatDateTime(pawn.createdAt)}
                              </p>
                            </div>
                            <Badge tone={statusTone(pawn.status)} size="sm">
                              {pawn.status}
                            </Badge>
                          </div>
                          <p className="text-[12.5px] text-[var(--text-secondary)]">
                            {pawn.item.description}
                          </p>
                          <div className="mt-1">
                            <Money amount={pawn.loanAmount} size="sm" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardBody className="min-h-[200px] flex items-center justify-center">
                <EmptyState
                  title={t("pages.customers.noSelected")}
                  description={t("pages.customers.noSelectedDesc")}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <SettlementTicketDetailsDialog
        open={detailPawn != null}
        onClose={() => setDetailPawn(null)}
        pawn={
          detailPawn
            ? {
                ...detailPawn,
                customerName: detailPawn.customerName ?? selectedCustomer?.name ?? "—",
                interestRate: detailPawn.interestRate ?? 0,
                item: {
                  ...detailPawn.item,
                  type: detailPawn.item.type || detailPawn.itemType || t('common.unknown'),
                  description: detailPawn.item.description || detailPawn.itemDescription || "—",
                  weight: detailPawn.item.weight ?? detailPawn.weight ?? 0,
                  netWeight: detailPawn.item.netWeight ?? detailPawn.netWeight,
                },
              }
            : null
        }
        footerExtras={
          <>
            {detailPawn?.status === "PAWN" && onNavigate && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  leadingIcon={<Ticket size={14} />}
                  onClick={() => {
                    const id = detailPawn.id;
                    setDetailPawn(null);
                    addSettlementCartTicket("interest", id);
                    onNavigate("interest");
                  }}
                  >
                    {t('pages.customers.addToInterest')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    leadingIcon={<Ticket size={14} />}
                    onClick={() => {
                      const id = detailPawn.id;
                      setDetailPawn(null);
                      addSettlementCartTicket("redeem", id);
                      onNavigate("redeem");
                    }}
                  >
                    {t('pages.customers.addToRedeem')}
                  </Button>
              </>
            )}
          </>
        }
      />
    </div>
  );
};

export default Customers;
