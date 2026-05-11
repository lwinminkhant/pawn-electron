import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Calculator,
  Check,
  Package,
  Printer,
  ScanBarcode,
  ScanFace,
  User,
  X,
} from "lucide-react";
import { PawnReceipt } from "../components/PawnReceipt";
import WebcamCapture from "../components/WebcamCapture";
import FaceSearch from "../components/FaceSearch";
import ImageUpload from "../components/ImageUpload";

import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  Input,
  Money,
  Select,
  Textarea,
} from "../components/ui";
import {
  cn,
  formatDate,
  formatDateTime,
  formatNumber,
  formatWeight,
} from "../utils/format";
import { getCurrentBusinessDate, useBusinessDate } from "../utils/businessDate";
import {
  loadInterestTiersForItemType,
  type InterestTier,
} from "../utils/appSettings";
import {
  DEFAULT_PAWN_ITEM_TYPES,
  loadPawnItemDescriptionPresets,
  loadPawnItemOverdueThresholds,
  loadPawnItemTypes,
  type PawnItemOverdueThresholds,
} from "../utils/itemTypes";
import { usesGoldJewelleryStorage, type StorageInfo } from "../utils/storageUtils";

interface Customer {
  id: number;
  name: string;
  phone?: string;
  nrc?: string;
  address?: string;
  photo?: string;
  faceDescriptor?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (value: Date | string | number) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
};

const addUtcMonths = (value: Date, months: number) =>
  new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + months,
      value.getUTCDate(),
    ),
  );

const MYANMAR_TO_ENGLISH_DIGITS: Record<string, string> = {
  "၀": "0",
  "၁": "1",
  "၂": "2",
  "၃": "3",
  "၄": "4",
  "၅": "5",
  "၆": "6",
  "၇": "7",
  "၈": "8",
  "၉": "9",
};

const toEnglishDigits = (value: string): string =>
  value.replace(
    /[၀-၉]/g,
    (digit) => MYANMAR_TO_ENGLISH_DIGITS[digit] ?? digit
  );

const sanitizeNumericInput = (value: string, allowDecimal = false): string => {
  const normalized = toEnglishDigits(value);
  const cleaned = normalized.replace(
    allowDecimal ? /[^0-9.]/g : /[^0-9]/g,
    ""
  );
  if (!allowDecimal) return cleaned;
  const [whole = "", ...fractionParts] = cleaned.split(".");
  return fractionParts.length > 0 ? `${whole}.${fractionParts.join("")}` : whole;
};

const formatNumericInputDisplay = (
  value: string,
  allowDecimal = false
): string => {
  if (!value) return "";

  const sanitized = sanitizeNumericInput(value, allowDecimal);
  if (!sanitized) return "";

  if (!allowDecimal) {
    return formatNumber(Number(sanitized || 0));
  }

  const hasTrailingDot = sanitized.endsWith(".");
  const [whole = "", fraction = ""] = sanitized.split(".");
  const formattedWhole =
    whole.length > 0 ? formatNumber(Number(whole || 0)) : "0";

  if (hasTrailingDot) return `${formattedWhole}.`;
  if (sanitized.includes(".")) return `${formattedWhole}.${fraction}`;
  return formattedWhole;
};

const Pawn: React.FC = () => {
  const { t } = useTranslation();

  // ---------- Customer ----------
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showStorageInfo, setShowStorageInfo] = useState(false);
  const customerSuggestRef = useRef<HTMLDivElement>(null);
  const [showFaceSearch, setShowFaceSearch] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    nrc: "",
    address: "",
    photo: "",
    faceDescriptor: "",
  });

  // ---------- Item ----------
  const [itemTypes, setItemTypes] = useState<string[]>(() => loadPawnItemTypes());
  const [interestTiers, setInterestTiers] = useState<InterestTier[]>(() =>
    loadInterestTiersForItemType(loadPawnItemTypes()[0] ?? DEFAULT_PAWN_ITEM_TYPES[0]),
  );
  const [itemOverdueThresholds, setItemOverdueThresholds] =
    useState<PawnItemOverdueThresholds>(() =>
      loadPawnItemOverdueThresholds(loadPawnItemTypes()),
    );
  const [itemType, setItemType] = useState(() => itemTypes[0] ?? DEFAULT_PAWN_ITEM_TYPES[0]);
  const [itemDescriptionPresets, setItemDescriptionPresets] = useState(() =>
    loadPawnItemDescriptionPresets(itemTypes)
  );
  const [physicalNumber, setPhysicalNumber] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPhoto, setItemPhoto] = useState("");
  const [weight, setWeight] = useState("");
  const [nonGoldWeight, setNonGoldWeight] = useState("");
  const [kyat, setKyat] = useState("");
  const [pe, setPe] = useState("");
  const [yway, setYway] = useState("");
  const [nonGoldKyat, setNonGoldKyat] = useState("");
  const [nonGoldPe, setNonGoldPe] = useState("");
  const [nonGoldYway, setNonGoldYway] = useState("");
  const [oneKyatInGrams, setOneKyatInGrams] = useState("16.606");

  useEffect(() => {
    const refreshItemTypes = () => {
      const nextTypes = loadPawnItemTypes();
      const nextItemType =
        nextTypes.includes(itemType) ? itemType : nextTypes[0] ?? DEFAULT_PAWN_ITEM_TYPES[0];
      setItemTypes(nextTypes);
      setItemOverdueThresholds(loadPawnItemOverdueThresholds(nextTypes));
      setItemDescriptionPresets(loadPawnItemDescriptionPresets(nextTypes));
      setItemType(nextItemType);
      setInterestTiers(loadInterestTiersForItemType(nextItemType));
    };

    refreshItemTypes();
    window.addEventListener("storage", refreshItemTypes);
    window.addEventListener("pawn-item-types-updated", refreshItemTypes);
    return () => {
      window.removeEventListener("storage", refreshItemTypes);
      window.removeEventListener("pawn-item-types-updated", refreshItemTypes);
    };
  }, [itemType]);

  const suggestedItemDescriptions = itemDescriptionPresets[itemType] ?? [];
  const formattedWeightInput = formatNumericInputDisplay(weight, true);

  const getDueDateForItemType = useCallback(
    (baseDate: Date, currentItemType: string) => {
      const threshold = itemOverdueThresholds[currentItemType] ?? { months: 0, days: 0 };
      const start = startOfUtcDay(baseDate);
      const withMonths = addUtcMonths(start, Math.max(0, threshold.months));
      return new Date(withMonths.getTime() + Math.max(0, threshold.days) * DAY_MS);
    },
    [itemOverdueThresholds],
  );

  useEffect(() => {
    if (usesGoldJewelleryStorage(itemType)) setPhysicalNumber("");
  }, [itemType]);

  useEffect(() => {
    const savedStandard = localStorage.getItem("oneKyatInGrams");
    let standardVal = 16.606;
    if (savedStandard) {
      setOneKyatInGrams(savedStandard);
      standardVal = parseFloat(savedStandard);
    }
    const rate = parseFloat(goldRate);
    if (!isNaN(rate) && !isNaN(standardVal)) {
      setGoldPricePerKyat((rate * standardVal).toFixed(0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateMyanmarWeightFromGrams = (gramVal: string) => {
    const g = parseFloat(gramVal);
    const standard = parseFloat(oneKyatInGrams);
    if (isNaN(g) || isNaN(standard) || standard === 0) {
      setKyat("");
      setPe("");
      setYway("");
      return;
    }
    const totalYway = (g / standard) * 128;
    const k = Math.floor(totalYway / 128);
    const remainderYway = totalYway % 128;
    const p = Math.floor(remainderYway / 8);
    const y = remainderYway % 8;
    setKyat(k.toString());
    setPe(p.toString());
    setYway(y.toFixed(2));
  };

  const updateGramsFromMyanmar = (k: string, p: string, y: string) => {
    const kyatVal = parseFloat(k) || 0;
    const peVal = parseFloat(p) || 0;
    const ywayVal = parseFloat(y) || 0;
    const standard = parseFloat(oneKyatInGrams);
    if (isNaN(standard) || standard === 0) {
      setWeight("");
      return;
    }
    const totalYway = kyatVal * 128 + peVal * 8 + ywayVal;
    const grams = (totalYway / 128) * standard;
    setWeight(grams.toFixed(3));
  };

  const handleGramChange = (val: string) => {
    const sanitized = sanitizeNumericInput(val, true);
    setWeight(sanitized);
    updateMyanmarWeightFromGrams(sanitized);
  };

  const handleMyanmarChange = (
    field: "kyat" | "pe" | "yway",
    val: string
  ) => {
    const sanitized = sanitizeNumericInput(val, true);
    let newKyat = kyat;
    let newPe = pe;
    let newYway = yway;
    if (field === "kyat") {
      setKyat(sanitized);
      newKyat = sanitized;
    }
    if (field === "pe") {
      setPe(sanitized);
      newPe = sanitized;
    }
    if (field === "yway") {
      setYway(sanitized);
      newYway = sanitized;
    }
    updateGramsFromMyanmar(newKyat, newPe, newYway);
  };

  const updateNonGoldMyanmarWeightFromGrams = (gramVal: string) => {
    const g = parseFloat(gramVal);
    const standard = parseFloat(oneKyatInGrams);
    if (isNaN(g) || isNaN(standard) || standard === 0) {
      setNonGoldKyat("");
      setNonGoldPe("");
      setNonGoldYway("");
      return;
    }
    const totalYway = (g / standard) * 128;
    const k = Math.floor(totalYway / 128);
    const remainderYway = totalYway % 128;
    const p = Math.floor(remainderYway / 8);
    const y = remainderYway % 8;
    setNonGoldKyat(k.toString());
    setNonGoldPe(p.toString());
    setNonGoldYway(y.toFixed(2));
  };

  const updateNonGoldGramsFromMyanmar = (
    k: string,
    p: string,
    y: string
  ) => {
    const kyatVal = parseFloat(k) || 0;
    const peVal = parseFloat(p) || 0;
    const ywayVal = parseFloat(y) || 0;
    const standard = parseFloat(oneKyatInGrams);
    if (isNaN(standard) || standard === 0) {
      setNonGoldWeight("");
      return;
    }
    const totalYway = kyatVal * 128 + peVal * 8 + ywayVal;
    const grams = (totalYway / 128) * standard;
    setNonGoldWeight(grams.toFixed(3));
  };

  const handleNonGoldGramChange = (val: string) => {
    const sanitized = sanitizeNumericInput(val, true);
    setNonGoldWeight(sanitized);
    updateNonGoldMyanmarWeightFromGrams(sanitized);
  };

  const handleNonGoldMyanmarChange = (
    field: "kyat" | "pe" | "yway",
    val: string
  ) => {
    const sanitized = sanitizeNumericInput(val, true);
    let newKyat = nonGoldKyat;
    let newPe = nonGoldPe;
    let newYway = nonGoldYway;
    if (field === "kyat") {
      setNonGoldKyat(sanitized);
      newKyat = sanitized;
    }
    if (field === "pe") {
      setNonGoldPe(sanitized);
      newPe = sanitized;
    }
    if (field === "yway") {
      setNonGoldYway(sanitized);
      newYway = sanitized;
    }
    updateNonGoldGramsFromMyanmar(newKyat, newPe, newYway);
  };

  const [loanAmount, setLoanAmount] = useState("");
  const [interestRate, setInterestRate] = useState("3");
  const formattedLoanAmountInput = formatNumericInputDisplay(loanAmount);

  useEffect(() => {
    const amount = parseFloat(loanAmount) || 0;
    const tiers = [...interestTiers].sort((a, b) => b.minAmount - a.minAmount);
    const match = tiers.find((t) => amount >= t.minAmount);
    if (match) setInterestRate(match.rate.toString());
    else setInterestRate("3");
  }, [interestTiers, loanAmount]);

  useEffect(() => {
    setInterestTiers(loadInterestTiersForItemType(itemType));
  }, [itemType]);

  const [goldRate, setGoldRate] = useState(() => {
    const saved = localStorage.getItem("goldRate");
    return saved ? saved : "80000";
  });
  const [goldPricePerKyat, setGoldPricePerKyat] = useState("");

  const handleGoldRateChange = (val: string) => {
    setGoldRate(val);
    const rate = parseFloat(val);
    const standard = parseFloat(oneKyatInGrams);
    if (!isNaN(rate) && !isNaN(standard)) {
      setGoldPricePerKyat((rate * standard).toFixed(0));
    } else {
      setGoldPricePerKyat("");
    }
  };

  const handleGoldPricePerKyatChange = (val: string) => {
    setGoldPricePerKyat(val);
    const pricePerKyat = parseFloat(val);
    const standard = parseFloat(oneKyatInGrams);
    if (!isNaN(pricePerKyat) && !isNaN(standard) && standard !== 0) {
      setGoldRate((pricePerKyat / standard).toFixed(2));
    } else {
      setGoldRate("");
    }
  };

  const netGoldWeight = () => {
    const total = parseFloat(weight) || 0;
    const nonGold = parseFloat(nonGoldWeight) || 0;
    return Math.max(0, total - nonGold);
  };

  const calculateMaxLoan = () => {
    const netWeight = netGoldWeight();
    const rate = parseFloat(goldRate) || 0;
    return Math.round(netWeight * rate);
  };

  const applyCalculatedLoan = () => {
    setLoanAmount(calculateMaxLoan().toString());
  };

  const handleLoanAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = e.key.toLowerCase();

    if (key === "e" || e.key === "န") {
      e.preventDefault();
      setLoanAmount((current) => sanitizeNumericInput(`${current}000`));
      return;
    }

    if (key === "w" || e.key === "တ") {
      e.preventDefault();
      setLoanAmount((current) => sanitizeNumericInput(`${current}00`));
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [storageInfoLoading, setStorageInfoLoading] = useState(false);
  const [storageInfoError, setStorageInfoError] = useState<string | null>(null);
  const usesStorage = usesGoldJewelleryStorage(itemType);
  const businessDateYmd = useBusinessDate();

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (customerSearch.trim() === "") {
      setFilteredCustomers([]);
      setShowDropdown(false);
      return;
    }
    const query = customerSearch.toLowerCase();
    const filtered = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.phone && c.phone.toLowerCase().includes(query)) ||
        (c.nrc && c.nrc.toLowerCase().includes(query)) ||
        (c.address && c.address.toLowerCase().includes(query))
    );
    setFilteredCustomers(filtered);
    // Do not reopen the list after picking an existing customer (search text still matches).
    setShowDropdown(Boolean(!selectedCustomer && filtered.length > 0));
    setHighlightedIndex(-1);
  }, [customerSearch, customers, selectedCustomer]);

  const loadCustomers = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "list-customers",
        {}
      );
      if (result.success) setCustomers(result.customers);
    } catch (error) {
      console.error("Error loading customers:", error);
    }
  };

  const loadStorageInfo = useCallback(async () => {
    if (!usesGoldJewelleryStorage(itemType)) {
      setStorageInfo(null);
      setStorageInfoError(null);
      setShowStorageInfo(false);
      setStorageInfoLoading(false);
      return;
    }

    try {
      setStorageInfoLoading(true);
      setStorageInfoError(null);
      const result = await window.electron.ipcRenderer.invoke(
        "get-storage-info",
        { itemType, date: businessDateYmd }
      );
      if (result.success) {
        setStorageInfo(result.storageInfo);
        if (!result.storageInfo) {
          setStorageInfoError("No storage info returned.");
        }
      } else {
        setStorageInfo(null);
        setStorageInfoError(result?.message || "Failed to load storage info.");
      }
    } catch (error) {
      setStorageInfo(null);
      setStorageInfoError(
        error instanceof Error ? error.message : "Failed to load storage info."
      );
      console.error("Error loading storage info:", error);
    } finally {
      setStorageInfoLoading(false);
    }
  }, [businessDateYmd, itemType]);

  useEffect(() => {
    loadStorageInfo();
  }, [loadStorageInfo]);

  useEffect(() => {
    if (!usesStorage) return;
    void loadStorageInfo();
  }, [businessDateYmd, loadStorageInfo, usesStorage]);

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setNewCustomer({
      name: customer.name,
      phone: customer.phone || "",
      nrc: customer.nrc || "",
      address: customer.address || "",
      photo: customer.photo || "",
      faceDescriptor: customer.faceDescriptor || "",
    });
    setShowDropdown(false);
    setShowFaceSearch(false);
  };

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    if (selectedCustomer && value !== selectedCustomer.name) {
      setSelectedCustomer(null);
      setNewCustomer({ name: value, phone: "", nrc: "", address: "", photo: "", faceDescriptor: "" });
    } else if (!selectedCustomer) {
      setNewCustomer((prev) => ({ ...prev, name: value }));
    }
  };

  const handleFaceSelect = (customerId: number) => {
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      handleCustomerSelect(customer);
    }
  };

  useEffect(() => {
    if (!showDropdown) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = customerSuggestRef.current;
      if (root && !root.contains(e.target as Node)) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [showDropdown]);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredCustomers.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredCustomers.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (
          highlightedIndex >= 0 &&
          highlightedIndex < filteredCustomers.length
        ) {
          handleCustomerSelect(filteredCustomers[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
    if (dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll("[data-dropdown-item]");
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  };

  const handleConfirmPawn = async () => {
    if (!selectedCustomer && !customerSearch.trim()) {
      setMessage({
        type: "error",
        text: t('pages.pawn.pleaseEnterFullName'),
      });
      return;
    }
    if (!itemDescription) {
      setMessage({ type: "error", text: t('pages.pawn.pleaseEnterItemDescription') });
      return;
    }
    if (!loanAmount || parseFloat(loanAmount) <= 0) {
      setMessage({ type: "error", text: t('pages.pawn.pleaseEnterValidLoanAmount') });
      return;
    }
    if (usesStorage && parseFloat(loanAmount) > maxLoan) {
      setMessage({
        type: "error",
        text: t('pages.pawn.loanAmountCannotBeGreater', { max: formatNumber(maxLoan) }),
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const customerData = selectedCustomer
        ? {
            ...selectedCustomer,
            photo: newCustomer.photo || selectedCustomer.photo,
            faceDescriptor: newCustomer.faceDescriptor || selectedCustomer.faceDescriptor,
          }
        : {
            name: newCustomer.name,
            phone: newCustomer.phone,
            nrc: newCustomer.nrc,
            address: newCustomer.address,
            photo: newCustomer.photo,
            faceDescriptor: newCustomer.faceDescriptor,
          };

      const result = await window.electron.ipcRenderer.invoke("create-pawn", {
        customer: customerData,
        item: {
          type: itemType,
          physicalNumber: physicalNumber.trim(),
          description: itemDescription,
          photo: itemPhoto,
          weight: usesStorage ? parseFloat(weight) || 0 : undefined,
          nonGoldWeight: usesStorage ? parseFloat(nonGoldWeight) || 0 : undefined,
        },
        loanAmount: parseFloat(loanAmount),
        maxAvailableAmount: usesStorage ? calculateMaxLoan() : parseFloat(loanAmount),
        interestRate: parseFloat(interestRate) || 3,
      });

      setMessage({
        type: "success",
        text: t('pages.pawn.pawnCreatedSuccess', { pawnId: result.pawnId }),
      });

      const pawnDate = getCurrentBusinessDate();
      const dueDate = getDueDateForItemType(pawnDate, itemType);

      const savedStorageInfo: StorageInfo | null = result.storageInfo || null;
      setReceiptData({
        pawnId: result.pawnId,
        physicalNumber: physicalNumber.trim() || undefined,
        storageLocation: savedStorageInfo?.storageLocation,
        slotNumber: savedStorageInfo?.slotNumber,
        sequence: savedStorageInfo?.sequence,
        customerName: customerData.name,
        customerPhone: customerData.phone || "-",
        customerAddress: customerData.address || "-",
        itemType: itemType,
        itemDescription: itemDescription,
        itemPhoto: itemPhoto || undefined,
        weight: parseFloat(weight) || 0,
        nonGoldWeight: parseFloat(nonGoldWeight) || 0,
        netWeight: netGoldWeight(),
        goldRate: parseInt(goldRate),
        loanAmount: parseFloat(loanAmount),
        interestRate: parseFloat(interestRate) || 3,
        pawnDate: formatDateTime(pawnDate),
        dueDate: formatDate(dueDate),
        showGoldDetails: usesStorage,
      });

      loadStorageInfo();

      setTimeout(() => {
        setSelectedCustomer(null);
        setCustomerSearch("");
        setNewCustomer({ name: "", phone: "", nrc: "", address: "", photo: "", faceDescriptor: "" });
        setItemType(itemTypes[0] ?? DEFAULT_PAWN_ITEM_TYPES[0]);
        setPhysicalNumber("");
        setItemDescription("");
        setItemPhoto("");
        setWeight("");
        setKyat("");
        setPe("");
        setYway("");
        setNonGoldWeight("");
        setNonGoldKyat("");
        setNonGoldPe("");
        setNonGoldYway("");
        setLoanAmount("");
        setInterestRate("3");
        setMessage(null);
      }, 3000);
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.message || t('pages.pawn.failedToCreatePawn'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const net = netGoldWeight();
  const maxLoan = calculateMaxLoan();
  const closeReceiptDialog = () => setReceiptData(null);
  const closeErrorDialog = () => setMessage(null);
  const handleItemPhotoChange = useCallback((image: string) => {
    setItemPhoto(image);
  }, []);
  const handleItemPhotoClear = useCallback(() => {
    setItemPhoto("");
  }, []);
  const numericLoanAmount = parseFloat(loanAmount) || 0;
  const exceedsMaxLoan = usesStorage && numericLoanAmount > maxLoan;
  const errorMessage = message?.type === "error" ? message.text : null;

  return (
    <div>
      {message?.type === "success" && (
        <div className="mb-6">
          <Banner tone="success">
            {message.text}
          </Banner>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleConfirmPawn();
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-5">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-[var(--brass)]" aria-hidden />
                  <h3 className="text-[14px] font-semibold tracking-tight">
                    {t('common.customer')}
                  </h3>
                </div>
                {!selectedCustomer && (
                  <Button
                    type="button"
                    variant={showFaceSearch ? "primary" : "secondary"}
                    size="sm"
                    leadingIcon={<ScanFace size={14} />}
                    onClick={() => setShowFaceSearch((v) => !v)}
                  >
                    {t('pages.pawn.faceSearch')}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {showFaceSearch && !selectedCustomer && (
                <FaceSearch
                  customers={customers}
                  onSelect={handleFaceSelect}
                  onClose={() => setShowFaceSearch(false)}
                />
              )}
              <div className="relative" ref={customerSuggestRef}>
                <Field
                  label={t('pages.pawn.fullName')}
                  htmlFor="pawn-customer-full-name"
                  hint={
                    selectedCustomer
                      ? undefined
                      : t('pages.pawn.fullNameHint')
                  }
                >
                  <Input
                    id="pawn-customer-full-name"
                    type="text"
                    placeholder={
                      selectedCustomer
                        ? undefined
                        : t('pages.pawn.searchPlaceholder')
                    }
                    value={selectedCustomer ? newCustomer.name : customerSearch}
                    onChange={(e) => {
                      if (!selectedCustomer)
                        handleCustomerSearchChange(e.target.value);
                    }}
                    onFocus={() =>
                      !selectedCustomer &&
                      customerSearch &&
                      setShowDropdown(filteredCustomers.length > 0)
                    }
                    onKeyDown={handleKeyDown}
                    disabled={!!selectedCustomer}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </Field>

                {showDropdown && filteredCustomers.length > 0 && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-20 mt-1 w-full bg-[var(--surface-raised)] border border-[var(--hairline)] rounded-[8px] max-h-60 overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {filteredCustomers.map((customer, index) => (
                      <button
                        type="button"
                        key={customer.id}
                        data-dropdown-item
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleCustomerSelect(customer)}
                        className={cn(
                          "w-full text-left px-4 py-2.5 border-b border-[var(--hairline)] last:border-b-0 transition-colors",
                          index === highlightedIndex
                            ? "bg-[var(--brass-soft)]"
                            : "hover:bg-[var(--surface-hover)]"
                        )}
                      >
                        <p className="text-[13.5px] font-medium">
                          {customer.name}
                          {customer.address?.trim() ? (
                            <span className="font-normal text-[var(--text-muted)]">
                              {" "}
                              — {customer.address}
                            </span>
                          ) : null}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {customer.phone && (
                            <span className="mono text-[11px] text-[var(--text-muted)]">
                              {customer.phone}
                            </span>
                          )}
                          {customer.nrc && (
                            <span className="text-[11px] text-[var(--text-muted)]">
                              NRC: {customer.nrc}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedCustomer && (
                  <div className="mt-2 inline-flex items-center gap-2">
                    <Badge tone="success" dot>
                      <Check size={11} /> {t('pages.pawn.existingCustomer')}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearch("");
                        setNewCustomer({
                          name: "",
                          phone: "",
                          nrc: "",
                          address: "",
                          photo: "",
                          faceDescriptor: "",
                        });
                      }}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)] p-0.5"
                      aria-label="Clear selection"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-[var(--hairline)]">
                <p className="eyebrow mb-3">
                  {selectedCustomer ? t('common.details') : t('pages.pawn.contactOptional')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('common.phone')} className="col-span-2">
                    <Input
                      type="text"
                      placeholder={t('pages.pawn.phonePlaceholder')}
                      inputMode="numeric"
                      monoDigits
                      value={newCustomer.phone}
                      onChange={(e) =>
                        setNewCustomer({
                          ...newCustomer,
                          phone: sanitizeNumericInput(e.target.value),
                        })
                      }
                      disabled={!!selectedCustomer}
                    />
                  </Field>
                  <Field label={t('common.nrc')} className="col-span-2">
                    <Input
                      type="text"
                      placeholder={t('pages.pawn.nrcPlaceholder')}
                      value={newCustomer.nrc}
                      onChange={(e) =>
                        setNewCustomer({
                          ...newCustomer,
                          nrc: e.target.value,
                        })
                      }
                      disabled={!!selectedCustomer}
                    />
                  </Field>
                  <Field label={t('common.address')} className="col-span-2">
                    <Textarea
                      placeholder={t('pages.pawn.addressPlaceholder')}
                      rows={3}
                      value={newCustomer.address}
                      onChange={(e) =>
                        setNewCustomer({
                          ...newCustomer,
                          address: e.target.value,
                        })
                      }
                      disabled={!!selectedCustomer}
                    />
                  </Field>
                  <div className="col-span-2">
                    <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium mb-1.5">
                      {t('common.photo')}
                    </p>
                    <WebcamCapture
                      currentPhoto={newCustomer.photo || (selectedCustomer ? selectedCustomer.photo : "")}
                      onCapture={(photo, faceDescriptor) =>
                        setNewCustomer({
                          ...newCustomer,
                          photo,
                          faceDescriptor: faceDescriptor || "",
                        })
                      }
                      onClear={() =>
                        setNewCustomer({
                          ...newCustomer,
                          photo: "",
                          faceDescriptor: "",
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="lg:col-span-7 space-y-6">
            {usesStorage && showStorageInfo && (
              <Card className="brass-edge">
                <CardBody>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ScanBarcode
                        size={14}
                        className="text-[var(--brass)]"
                        aria-hidden
                      />
                      <h4 className="text-[13px] font-semibold tracking-tight">
                        {t('pages.pawn.todaysStorage')}
                      </h4>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowStorageInfo(false)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5"
                        aria-label="Hide storage info"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  {storageInfo ? (
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="eyebrow">Location</p>
                        <p className="mono text-[18px] font-semibold mt-1">
                          {storageInfo.storageLocation}
                        </p>
                      </div>
                      <div>
                        <p className="eyebrow">Today Count</p>
                        <p className="mono text-[18px] font-semibold mt-1">
                          {storageInfo.sequence}
                        </p>
                      </div>
                      <div>
                        <p className="eyebrow">Slot</p>
                        <p className="mono text-[18px] font-semibold mt-1 text-[var(--brass)]">
                          {storageInfo.slotNumber}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-canvas)] px-4 py-3">
                      <p className="text-[13px] text-[var(--text-muted)]">
                        {storageInfoLoading
                          ? "Loading storage info..."
                          : storageInfoError ||
                            "Storage info is unavailable for this item/date."}
                      </p>
                      {!storageInfoLoading && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void loadStorageInfo()}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Package
                      size={14}
                      className="text-[var(--brass)]"
                      aria-hidden
                    />
                    <h3 className="text-[14px] font-semibold tracking-tight">
                      {t('common.item')}
                    </h3>
                    {usesStorage && !showStorageInfo && (
                      <button
                        type="button"
                        onClick={() => setShowStorageInfo(true)}
                        className="ml-2 text-[11px] text-[var(--brass)] hover:underline"
                      >
                        {t('pages.pawn.showStorageInfo')}
                      </button>
                    )}
                  </div>
                  {usesStorage && (
                    <div className="flex items-center gap-3 text-[12px]">
                      <label className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)]">
                          {t('pages.pawn.goldPerGram')}
                        </span>
                        <input
                          type="number"
                          value={goldRate}
                          onChange={(e) => handleGoldRateChange(e.target.value)}
                          className="w-24 h-8 px-2 text-[13px] mono bg-[var(--brass-softer)] border border-[var(--hairline)] rounded-[6px] focus:border-[var(--brass)] focus:outline-none font-semibold text-right"
                          placeholder="0"
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)]">{t('pages.pawn.perKyat')}</span>
                        <input
                          type="number"
                          value={goldPricePerKyat}
                          onChange={(e) =>
                            handleGoldPricePerKyatChange(e.target.value)
                          }
                          className="w-24 h-8 px-2 text-[13px] mono bg-[var(--brass-softer)] border border-[var(--hairline)] rounded-[6px] focus:border-[var(--brass)] focus:outline-none font-semibold text-right"
                          placeholder="0"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-end">
                  <Field label={t('common.type')} className="flex-1">
                    <Select
                      value={itemType}
                      onChange={(e) => setItemType(e.target.value)}
                    >
                      {itemTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="md:shrink-0 md:self-end">
                    <ImageUpload
                      currentImage={itemPhoto}
                      onChange={handleItemPhotoChange}
                      onClear={handleItemPhotoClear}
                      alt="Pawn item"
                    />
                  </div>
                </div>

                {!usesStorage && (
                  <Field label={t('pages.pawn.physicalNumber')} hint={t('pages.pawn.physicalNumberHint')}>
                    <Input
                      type="text"
                      value={physicalNumber}
                      onChange={(e) => setPhysicalNumber(e.target.value)}
                      placeholder={t('pages.pawn.physicalNumberPlaceholder')}
                      monoDigits
                    />
                  </Field>
                )}

                <Field
                  label={t('pages.pawn.description')}
                  hint={
                    suggestedItemDescriptions.length > 0
                      ? t('pages.pawn.descriptionHint')
                      : undefined
                  }
                >
                  <Textarea
                    rows={2}
                    placeholder={t('pages.pawn.descriptionPlaceholder')}
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                  />
                  {suggestedItemDescriptions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestedItemDescriptions.map((preset) => {
                        const active = itemDescription.trim() === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setItemDescription(preset)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                              active
                                ? "border-[var(--brass)] bg-[var(--brass-softer)] text-[var(--brass)]"
                                : "border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--brass)] hover:text-[var(--text-primary)]"
                            )}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Field>

                {usesStorage && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <Field label={t('pages.pawn.totalWeightG')}>
                          <Input
                            type="text"
                            inputMode="decimal"
                            monoDigits
                            placeholder={t('pages.pawn.totalWeightPlaceholder')}
                            value={formattedWeightInput}
                            onChange={(e) => handleGramChange(e.target.value)}
                          />
                        </Field>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <MyanmarCell
                            label={t('pages.pawn.kyat')}
                            value={kyat}
                            onChange={(v) => handleMyanmarChange("kyat", v)}
                          />
                          <MyanmarCell
                            label={t('pages.pawn.pe')}
                            value={pe}
                            onChange={(v) => handleMyanmarChange("pe", v)}
                          />
                          <MyanmarCell
                            label={t('pages.pawn.yway')}
                            value={yway}
                            onChange={(v) => handleMyanmarChange("yway", v)}
                          />
                        </div>
                      </div>

                      <div>
                        <Field label={t('pages.pawn.nonGoldWeightG')}>
                          <Input
                            type="text"
                            inputMode="decimal"
                            monoDigits
                            placeholder={t('pages.pawn.nonGoldWeightPlaceholder')}
                            value={nonGoldWeight}
                            onChange={(e) =>
                              handleNonGoldGramChange(e.target.value)
                            }
                          />
                        </Field>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <MyanmarCell
                            label={t('pages.pawn.kyat')}
                            value={nonGoldKyat}
                            onChange={(v) =>
                              handleNonGoldMyanmarChange("kyat", v)
                            }
                          />
                          <MyanmarCell
                            label={t('pages.pawn.pe')}
                            value={nonGoldPe}
                            onChange={(v) => handleNonGoldMyanmarChange("pe", v)}
                          />
                          <MyanmarCell
                            label={t('pages.pawn.yway')}
                            value={nonGoldYway}
                            onChange={(v) =>
                              handleNonGoldMyanmarChange("yway", v)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-4 py-3 bg-[var(--brass-softer)] border border-[var(--hairline)] rounded-[8px]">
                      <div>
                        <p className="eyebrow">{t('pages.pawn.netGoldWeight')}</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {t('pages.pawn.totalMinusNonGold')}
                        </p>
                      </div>
                      <p className="mono text-[24px] font-semibold text-[var(--brass)]">
                        {formatWeight(net)}
                        <span className="text-[var(--text-muted)] text-[13px] font-normal ml-1">
                          {t('pages.pawn.g')}
                        </span>
                      </p>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-[14px] font-semibold tracking-tight">
                  {t('pages.pawn.loanTerms')}
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label={t('pages.pawn.loanAmountMmk')} className="md:col-span-2">
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={t('pages.pawn.loanAmountPlaceholder')}
                        monoDigits
                        value={formattedLoanAmountInput}
                        onKeyDown={handleLoanAmountKeyDown}
                        onChange={(e) =>
                          setLoanAmount(sanitizeNumericInput(e.target.value))
                        }
                        className="flex-1"
                      />
                      {usesStorage && (
                        <Button
                          type="button"
                          variant="secondary"
                          leadingIcon={<Calculator size={14} />}
                          onClick={applyCalculatedLoan}
                        >
                          {t('pages.pawn.calculate')}
                        </Button>
                      )}
                    </div>
                  </Field>
                  <Field label={t('pages.pawn.interestPerMonth')}>
                    <Input
                      type="number"
                      step="0.1"
                      monoDigits
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder={t('pages.pawn.interestPlaceholder')}
                    />
                  </Field>
                </div>

                {usesStorage && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)]">
                      <span>
                        {t('pages.pawn.basedOn')} {formatWeight(net)} g ×{" "}
                        <span className="mono">
                          {formatNumber(parseFloat(goldRate || "0"))}
                        </span>{" "}
                        MMK/g
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {t('pages.pawn.max')} <Money amount={maxLoan} size="sm" tone="brass" />
                      </span>
                    </div>
                    {exceedsMaxLoan && (
                      <Banner tone="warning">
                        {t('pages.pawn.loanAmountGreaterThanMax')} (
                        <span className="mono">{formatNumber(maxLoan)}</span> MMK).
                      </Banner>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-[var(--hairline)] flex items-center justify-between gap-4">
                  <div className="text-[12px] text-[var(--text-muted)]">
                    {t('pages.pawn.tipPressEnter')}
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={isSubmitting}
                    leadingIcon={
                      !isSubmitting ? <Check size={16} /> : undefined
                    }
                  >
                    {isSubmitting ? t('pages.pawn.processing') : t('pages.pawn.confirmPawn')}
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </form>

      {receiptData && (
        <>
          <Dialog
            open={Boolean(receiptData)}
            onClose={closeReceiptDialog}
            closeOnBackdrop={false}
            size="md"
            title={t('pages.pawn.pawnCreatedSuccessfully')}
            description={t('pages.pawn.ticketReady', { pawnId: receiptData.pawnId })}
            footer={
              <Button
                type="button"
                variant="primary"
                leadingIcon={<Printer size={15} />}
                onClick={() => window.print()}
              >
                {t('pages.pawn.printReceipt')}
              </Button>
            }
          >
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2">
                <Badge tone="success" dot>
                  <Check size={11} /> {t('pages.pawn.saved')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="eyebrow">{t('common.ticket')}</p>
                  <p className="mono text-[16px] font-semibold mt-1">
                    #{receiptData.pawnId}
                  </p>
                </div>
                <div>
                  <p className="eyebrow">{t('common.amount')}</p>
                  <div className="mt-1">
                    <Money amount={receiptData.loanAmount} size="md" />
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="eyebrow">{t('common.customer')}</p>
                  <p className="text-[14px] font-medium mt-1">
                    {receiptData.customerName}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="eyebrow">{t('common.item')}</p>
                  <p className="text-[14px] font-medium mt-1">
                    {receiptData.itemDescription}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">
                    {receiptData.itemType}
                    {receiptData.showGoldDetails && (
                      <>
                        {" "}
                        · <span className="mono">{formatWeight(receiptData.weight)}</span> g
                      </>
                    )}
                  </p>
                </div>
              </div>
              <p className="text-[12px] text-[var(--text-muted)]">
                {t('pages.pawn.printReceiptNow')}
              </p>
            </div>
          </Dialog>
          <PawnReceipt {...receiptData} />
        </>
      )}

      <Dialog
        open={Boolean(errorMessage)}
        onClose={closeErrorDialog}
        size="sm"
        title={t('pages.pawn.cannotConfirmPawn')}
        description={errorMessage ?? undefined}
        footer={
          <Button type="button" variant="primary" onClick={closeErrorDialog}>
            {t('common.ok')}
          </Button>
        }
      >
        <div className="inline-flex items-center gap-2">
          <Badge tone="danger" dot>
            <X size={11} /> {t('common.error')}
          </Badge>
        </div>
      </Dialog>
    </div>
  );
};

/* ---------- Small helper for Kyat/Pe/Yway cell ---------- */

interface MyanmarCellProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

const MyanmarCell: React.FC<MyanmarCellProps> = ({
  label,
  value,
  onChange,
}) => (
  <div>
    <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
      {label}
    </label>
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-0.5 w-full h-8 px-2 text-[13px] mono bg-[var(--surface-raised)] border border-[var(--hairline)] rounded-[5px] focus:border-[var(--brass)] focus:outline-none"
      placeholder="0"
    />
  </div>
);

export default Pawn;
