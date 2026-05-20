import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  Clock3,
  Coins,
  Package,
  Plus,
  RefreshCcw,
  Scale,
  Trash2,
} from "lucide-react";
import {
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
} from "../components/ui";
import {
  type CameraDeviceInfo,
  getStoredCameraId,
  listVideoInputDevices,
} from "../utils/cameraPreferences";
import {
  loadPawnItemTypes,
  loadPawnItemDescriptionPresets,
  loadPawnItemOverdueThresholds,
  type PawnItemDescriptionPresets,
  type PawnItemOverdueThresholds,
} from "../utils/itemTypes";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_INTEREST_TIERS,
  loadInterestTiersForItemType,
  normalizeAppSettings,
  syncAppSettingsToLocalCache,
  type AppSettingsPayload,
  type InterestTier,
  type InterestTierByItemType,
} from "../utils/appSettings";

const DB_TIME_ZONE_OPTIONS = [
  "UTC",
  "Asia/Bangkok",
  "Asia/Kolkata",
  "Asia/Kuala_Lumpur",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Yangon",
];

export type SettingsHeaderAction = {
  label: string;
  loading: boolean;
  onClick: () => void;
};

interface SettingsProps {
  onHeaderActionChange?: (action: SettingsHeaderAction | null) => void;
}

const Settings: React.FC<SettingsProps> = ({ onHeaderActionChange }) => {
  const { t } = useTranslation();
  const [goldRate, setGoldRate] = useState("80000");
  const [oneKyatInGrams, setOneKyatInGrams] = useState("16.606");
  const [goldPricePerKyat, setGoldPricePerKyat] = useState("");
  const [itemTypes, setItemTypes] = useState<string[]>(() => loadPawnItemTypes());
  const [interestTiersByItemType, setInterestTiersByItemType] =
    useState<InterestTierByItemType>(() =>
      Object.fromEntries(
        loadPawnItemTypes().map((itemType) => [
          itemType,
          loadInterestTiersForItemType(itemType),
        ]),
      )
    );
  const [itemDescriptionPresets, setItemDescriptionPresets] =
    useState<PawnItemDescriptionPresets>(() =>
      loadPawnItemDescriptionPresets(loadPawnItemTypes())
    );
  const [itemOverdueThresholds, setItemOverdueThresholds] =
    useState<PawnItemOverdueThresholds>(() =>
      loadPawnItemOverdueThresholds(loadPawnItemTypes())
    );
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceInfo[]>([]);
  const [faceCameraId, setFaceCameraId] = useState("");
  const [ticketCameraId, setTicketCameraId] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);
  const [dbTimeZone, setDbTimeZone] = useState("UTC");
  const [businessDateChangeEnabled, setBusinessDateChangeEnabled] =
    useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const result = await window.electron.api.settings.getAppSettings();
        const normalized = normalizeAppSettings(
          result?.success ? result.settings : DEFAULT_APP_SETTINGS,
        );
        if (cancelled) return;
        syncAppSettingsToLocalCache(normalized);
        setGoldRate(normalized.goldRate);
        setOneKyatInGrams(normalized.oneKyatInGrams);
        setGoldPricePerKyat(normalized.goldPricePerKyat);
        setItemTypes(normalized.itemTypes);
        setInterestTiersByItemType(normalized.interestTiersByItemType);
        setItemDescriptionPresets(normalized.itemDescriptionPresets);
        setItemOverdueThresholds(normalized.itemOverdueThresholds);
        setBusinessDateChangeEnabled(normalized.businessDateChangeEnabled);
        setFaceCameraId(normalized.faceCameraId || getStoredCameraId("face") || "");
        setTicketCameraId(
          normalized.ticketCameraId || getStoredCameraId("ticket") || "",
        );
        setDbTimeZone(normalized.dbTimeZone || "UTC");
      } catch (error) {
        console.error("Failed to load settings", error);
        const fallbackTypes = loadPawnItemTypes();
        setItemTypes(fallbackTypes);
        setInterestTiersByItemType(
          Object.fromEntries(
            fallbackTypes.map((itemType) => [itemType, [...DEFAULT_INTEREST_TIERS]]),
          ),
        );
        setItemDescriptionPresets(loadPawnItemDescriptionPresets(fallbackTypes));
        setItemOverdueThresholds(loadPawnItemOverdueThresholds(fallbackTypes));
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCameraDevices = async () => {
    setCameraLoading(true);
    try {
      const devices = await listVideoInputDevices(true);
      setCameraDevices(devices);
    } catch (error) {
      console.error("Failed to load cameras", error);
      setMessage({
        type: "error",
          text: t('pages.settings.failedToLoadCameras'),
      });
    } finally {
      setCameraLoading(false);
    }
  };

  useEffect(() => {
    void loadCameraDevices();
  }, []);

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

  const handleStandardChange = (val: string) => {
    setOneKyatInGrams(val);
    const rate = parseFloat(goldRate);
    const standard = parseFloat(val);
    if (!isNaN(rate) && !isNaN(standard)) {
      setGoldPricePerKyat((rate * standard).toFixed(0));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const sortedInterestTiersByItemType = Object.fromEntries(
        Object.entries(interestTiersByItemType).map(([itemType, tiers]) => [
          itemType,
          [...tiers].sort((a, b) => a.minAmount - b.minAmount),
        ]),
      );
      const firstConfiguredItemType = itemTypes.find((itemType) => itemType.trim().length > 0);
      const legacyInterestTiers =
        (firstConfiguredItemType && sortedInterestTiersByItemType[firstConfiguredItemType]) ||
        [...DEFAULT_INTEREST_TIERS];
      const settingsPayload: AppSettingsPayload = normalizeAppSettings({
        interestTiers: legacyInterestTiers,
        interestTiersByItemType: sortedInterestTiersByItemType,
        goldRate,
        oneKyatInGrams,
        goldPricePerKyat,
        itemTypes,
        itemDescriptionPresets,
        itemOverdueThresholds,
        businessDateChangeEnabled,
        faceCameraId,
        ticketCameraId,
        dbTimeZone,
      });
      const settingsResult = await window.electron.api.settings.setAppSettings({
        settings: settingsPayload,
      });
      if (!settingsResult?.success) {
        throw new Error(settingsResult?.message || "Failed to save settings.");
      }
      const dbTimeZoneResult = await window.electron.api.settings.setDbTimeZone({
        timezone: dbTimeZone.trim(),
      });
      if (!dbTimeZoneResult?.success) {
        throw new Error(
          dbTimeZoneResult?.message || "ဒေတာဘေ့စ် အချိန်ဇုန်ကို မသိမ်းဆည်းနိုင်ပါ။"
        );
      }
      const savedSettings = normalizeAppSettings({
        ...(settingsResult.settings || settingsPayload),
        dbTimeZone:
          dbTimeZoneResult.dbTimeZone?.configured ||
          dbTimeZoneResult.dbTimeZone?.active ||
          dbTimeZone.trim(),
      });
      syncAppSettingsToLocalCache(savedSettings);
      setItemTypes(savedSettings.itemTypes);
      setInterestTiersByItemType(savedSettings.interestTiersByItemType);
      setItemDescriptionPresets(savedSettings.itemDescriptionPresets);
      setItemOverdueThresholds(savedSettings.itemOverdueThresholds);
      setBusinessDateChangeEnabled(savedSettings.businessDateChangeEnabled);
      setDbTimeZone(savedSettings.dbTimeZone);
      setMessage({ type: "success", text: t('pages.settings.settingsSavedSuccessfully') });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "ဆက်တင်များကို မသိမ်းဆည်းနိုင်ပါ။",
      });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    onHeaderActionChange?.({
      label: isSaving ? t('pages.settings.saving') : t('pages.settings.saveSettings'),
      loading: isSaving,
      onClick: handleSave,
    });

    return () => {
      onHeaderActionChange?.(null);
    };
  }, [handleSave, isSaving, onHeaderActionChange, t]);

  const ensureInterestTiersForItemType = (
    current: InterestTierByItemType,
    itemType: string,
  ): InterestTier[] => current[itemType] ?? [...DEFAULT_INTEREST_TIERS];

  const addTier = (itemType: string) => {
    setInterestTiersByItemType((current) => ({
      ...current,
      [itemType]: [
        ...ensureInterestTiersForItemType(current, itemType),
        { minAmount: 0, rate: 0 },
      ],
    }));
  };

  const removeTier = (itemType: string, index: number) => {
    setInterestTiersByItemType((current) => ({
      ...current,
      [itemType]: ensureInterestTiersForItemType(current, itemType).filter(
        (_, tierIndex) => tierIndex !== index,
      ),
    }));
  };

  const updateTier = (
    itemType: string,
    index: number,
    field: keyof InterestTier,
    value: number
  ) => {
    setInterestTiersByItemType((current) => {
      const nextTiers = [...ensureInterestTiersForItemType(current, itemType)];
      nextTiers[index] = { ...nextTiers[index], [field]: value };
      return {
        ...current,
        [itemType]: nextTiers,
      };
    });
  };

  const addItemType = () => {
    setItemTypes([...itemTypes, ""]);
  };

  const updateItemType = (index: number, value: string) => {
    const previousValue = itemTypes[index] ?? "";
    const next = [...itemTypes];
    next[index] = value;
    setItemTypes(next);
    const previousKey = previousValue.trim();
    const nextKey = value.trim();

    if (!previousKey || previousKey === nextKey) return;

    setItemDescriptionPresets((current) => {
      if (!(previousKey in current)) return current;
      const { [previousKey]: previousPresets = [], ...rest } = current;
      const nextPresets = nextKey
        ? [...(rest[nextKey] ?? []), ...previousPresets]
        : previousPresets;

      return nextKey
        ? { ...rest, [nextKey]: nextPresets }
        : { ...rest, [previousKey]: previousPresets };
    });

    setItemOverdueThresholds((current) => {
      if (!(previousKey in current)) return current;
      const { [previousKey]: previousThreshold, ...rest } = current;
      if (!nextKey) {
        return { ...rest, [previousKey]: previousThreshold };
      }
      if (nextKey in rest) {
        return rest;
      }
      return {
        ...rest,
        [nextKey]: previousThreshold,
      };
    });

    setInterestTiersByItemType((current) => {
      if (!(previousKey in current)) return current;
      const { [previousKey]: previousTiers, ...rest } = current;
      if (!nextKey) {
        return { ...rest, [previousKey]: previousTiers };
      }
      if (nextKey in rest) {
        return rest;
      }
      return {
        ...rest,
        [nextKey]: previousTiers,
      };
    });
  };

  const addItemDescriptionPreset = (itemType: string) => {
    const key = itemType.trim();
    setItemDescriptionPresets((current) => ({
      ...current,
      [key]: [...(current[key] ?? []), ""],
    }));
  };

  const updateItemDescriptionPreset = (
    itemType: string,
    presetIndex: number,
    value: string
  ) => {
    const key = itemType.trim();
    setItemDescriptionPresets((current) => {
      const nextPresets = [...(current[key] ?? [])];
      nextPresets[presetIndex] = value;
      return {
        ...current,
        [key]: nextPresets,
      };
    });
  };

  const removeItemDescriptionPreset = (itemType: string, presetIndex: number) => {
    const key = itemType.trim();
    setItemDescriptionPresets((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter((_, index) => index !== presetIndex),
    }));
  };

  const removeItemType = (index: number) => {
    const key = (itemTypes[index] ?? "").trim();
    setItemTypes(itemTypes.filter((_, itemIndex) => itemIndex !== index));
    if (!key) return;

    setItemDescriptionPresets((current) => {
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
    setItemOverdueThresholds((current) => {
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
    setInterestTiersByItemType((current) => {
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  };

  const updateItemOverdueThreshold = (itemType: string, value: string) => {
    const key = itemType.trim();
    if (!key) return;
    setItemOverdueThresholds((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? { months: 0, days: 0 }),
        months: Math.max(0, Math.floor(Number(value) || 0)),
      },
    }));
  };

  return (
    <div className="max-w-4xl">
      {message && (
        <div className="mb-6">
          <Banner tone={message.type === "success" ? "success" : "danger"}>
            {message.text}
          </Banner>
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock3 size={14} className="text-[var(--info)]" aria-hidden />
              <div>
                <h3 className="text-[14px] font-semibold tracking-tight">
                  {t('pages.settings.databaseTimeZone')}
                </h3>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {t('pages.settings.databaseTimeZoneDesc')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-6">
              <Field
                label={t('pages.settings.timeZone')}
                hint={t('pages.settings.chooseDatabaseTimeZone')}
              >
                <Select
                  value={dbTimeZone}
                  onChange={(e) => setDbTimeZone(e.target.value)}
                >
                  {DB_TIME_ZONE_OPTIONS.map((timeZone) => (
                    <option key={timeZone} value={timeZone}>
                      {timeZone}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Camera size={14} className="text-[var(--brass)]" aria-hidden />
                <div>
                  <h3 className="text-[14px] font-semibold tracking-tight">
                    {t('pages.settings.cameraAssignment')}
                  </h3>
                  <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                    {t('pages.settings.cameraAssignmentDesc')}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leadingIcon={<RefreshCcw size={13} />}
                onClick={() => void loadCameraDevices()}
                disabled={cameraLoading}
              >
                {cameraLoading ? t('common.loading') : t('pages.settings.refresh')}
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label={t('pages.settings.faceScanCamera')}
                hint={t('pages.settings.faceScanCameraHint')}
              >
                <select
                  value={faceCameraId}
                  onChange={(e) => setFaceCameraId(e.target.value)}
                  className="w-full h-10 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-canvas)] px-3 text-[13px] outline-none focus:border-[var(--brass)]"
                >
                  <option value="">{t('pages.settings.autoSelectPreferredFace')}</option>
                  {cameraDevices.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.label || t('pages.settings.cameraDevice', { id: camera.id })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t('pages.settings.ticketQrCamera')}
                hint={t('pages.settings.ticketQrCameraHint')}
              >
                <select
                  value={ticketCameraId}
                  onChange={(e) => setTicketCameraId(e.target.value)}
                  className="w-full h-10 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-canvas)] px-3 text-[13px] outline-none focus:border-[var(--brass)]"
                >
                  <option value="">{t('pages.settings.autoSelectPreferredTicket')}</option>
                  {cameraDevices.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.label || t('pages.settings.cameraDevice', { id: camera.id })}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-[var(--brass)]" aria-hidden />
                <div>
                  <h3 className="text-[14px] font-semibold tracking-tight">
                    {t('pages.settings.pawnItemTypes')}
                  </h3>
                  <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                    {t('pages.settings.pawnItemTypesDesc')}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leadingIcon={<Plus size={13} />}
                onClick={addItemType}
              >
                {t('pages.settings.addType')}
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-[var(--hairline)]">
              {itemTypes.map((itemType, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 items-center"
                >
                  <Input
                    type="text"
                    value={itemType}
                    onChange={(e) => updateItemType(index, e.target.value)}
                    placeholder={t('pages.settings.typePlaceholder')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItemType(index)}
                    aria-label={t('common.remove')}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock3 size={14} className="text-[var(--brass)]" aria-hidden />
              <div>
                <h3 className="text-[14px] font-semibold tracking-tight">
                  {t('pages.settings.businessDateControl')}
                </h3>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {t('pages.settings.businessDateControlDesc')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <label className="flex items-start gap-3 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-canvas)] p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={businessDateChangeEnabled}
                onChange={(e) => setBusinessDateChangeEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--hairline-strong)] text-[var(--brass)] focus:ring-[var(--brass-soft)]"
              />
              <div>
                <p className="text-[13px] font-medium text-[var(--text-primary)]">
                  {t('pages.settings.allowBusinessDateChange')}
                </p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">
                  {t('pages.settings.allowBusinessDateChangeHint')}
                </p>
              </div>
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package size={14} className="text-[var(--warning)]" aria-hidden />
              <div>
                <h3 className="text-[14px] font-semibold tracking-tight">
                  {t('pages.settings.overdueByItemType')}
                </h3>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {t('pages.settings.overdueByItemTypeDesc')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {itemTypes.map((itemType, index) => {
              const itemTypeKey = itemType.trim();
              return (
                <div
                  key={`${itemTypeKey || "overdue-type"}-${index}`}
                  className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px] gap-3 items-center"
                >
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">
                      {itemTypeKey || t('pages.settings.itemType', { index: index + 1 })}
                    </p>
                    {!itemTypeKey ? (
                      <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                        {t('pages.settings.nameItemTypeBeforeSetting')}
                      </p>
                    ) : null}
                  </div>
                  <Field label={t('pages.settings.months')}>
                    <Input
                      type="number"
                      min="0"
                      value={
                        itemTypeKey
                          ? String(itemOverdueThresholds[itemTypeKey]?.months ?? 0)
                          : "0"
                      }
                      onChange={(e) =>
                        updateItemOverdueThreshold(itemType, e.target.value)
                      }
                      placeholder={t('pages.settings.monthsPlaceholder')}
                      monoDigits
                      disabled={!itemTypeKey}
                    />
                  </Field>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package size={14} className="text-[var(--brass)]" aria-hidden />
              <div>
                <h3 className="text-[14px] font-semibold tracking-tight">
                  {t('pages.settings.itemDescriptionPresets')}
                </h3>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {t('pages.settings.itemDescriptionPresetsDesc')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            {itemTypes.map((itemType, index) => {
              const itemTypeKey = itemType.trim();
              const presets = itemDescriptionPresets[itemTypeKey] ?? [];
              const hasName = itemTypeKey.length > 0;

              return (
                <div
                  key={`${itemTypeKey || "item-type"}-${index}`}
                  className="rounded-[10px] border border-[var(--hairline)] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {itemTypeKey || t('pages.settings.itemType', { index: index + 1 })}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                        {hasName
                          ? t('pages.settings.suggestionsShown')
                          : t('pages.settings.nameItemTypeBeforeAdding')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Plus size={13} />}
                      onClick={() => addItemDescriptionPreset(itemType)}
                      disabled={!hasName}
                    >
                      {t('pages.settings.addPreset')}
                    </Button>
                  </div>

                  {presets.length > 0 ? (
                    <div className="space-y-2">
                      {presets.map((preset, presetIndex) => (
                        <div
                          key={`${itemTypeKey || "preset"}-${presetIndex}`}
                          className="grid grid-cols-[1fr_auto] gap-3 items-center"
                        >
                          <Input
                            type="text"
                            value={preset}
                            onChange={(e) =>
                              updateItemDescriptionPreset(
                                itemType,
                                presetIndex,
                                e.target.value
                              )
                            }
                            placeholder={t('pages.settings.presetPlaceholder')}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              removeItemDescriptionPreset(itemType, presetIndex)
                            }
                            aria-label={t('common.remove')}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {t('pages.settings.noPresetsYet')}
                    </p>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Coins size={14} className="text-[var(--brass)]" aria-hidden />
              <div>
                <h3 className="text-[14px] font-semibold tracking-tight">
                  {t('pages.settings.goldPriceGram')}
                </h3>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {t('pages.settings.goldPriceGramDesc')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="max-w-sm">
              <Field label={t('pages.settings.currentGoldRate')}>
                <Input
                  type="number"
                  value={goldRate}
                  onChange={(e) => handleGoldRateChange(e.target.value)}
                  placeholder={t('pages.settings.goldRatePlaceholder')}
                  monoDigits
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Scale
                size={14}
                className="text-[var(--text-muted)]"
                aria-hidden
              />
              <div>
                <h3 className="text-[14px] font-semibold tracking-tight">
                  {t('pages.settings.myanmarGoldStandard')}
                </h3>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {t('pages.settings.myanmarGoldStandardDesc')}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field
                label={t('pages.settings.oneKyatInGrams')}
                hint={t('pages.settings.oneKyatInGramsHint')}
              >
                <Input
                  type="number"
                  step="0.001"
                  value={oneKyatInGrams}
                  onChange={(e) => handleStandardChange(e.target.value)}
                  placeholder={t('pages.settings.oneKyatInGramsPlaceholder')}
                  monoDigits
                />
              </Field>
              <Field
                label={t('pages.settings.goldRateOneKyatthar')}
                hint={t('pages.settings.goldRateOneKyattharHint')}
              >
                <Input
                  type="number"
                  value={goldPricePerKyat}
                  onChange={(e) => handleGoldPricePerKyatChange(e.target.value)}
                  placeholder={t('pages.settings.goldRateOneKyattharPlaceholder')}
                  monoDigits
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <h3 className="text-[14px] font-semibold tracking-tight">
                {t('pages.settings.interestRateConfiguration')}
              </h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {t('pages.settings.interestRateConfigDesc')}
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-[var(--hairline)]">
              {itemTypes.map((itemType, itemTypeIndex) => {
                const itemTypeKey = itemType.trim();
                const hasName = itemTypeKey.length > 0;
                const tiers = hasName
                  ? ensureInterestTiersForItemType(interestTiersByItemType, itemTypeKey)
                  : [];

                return (
                  <div key={`${itemTypeKey || "item-type"}-${itemTypeIndex}`} className="px-5 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold">
                          {itemTypeKey || t('pages.settings.itemType', { index: itemTypeIndex + 1 })}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Plus size={13} />}
                        onClick={() => addTier(itemTypeKey)}
                        disabled={!hasName}
                      >
                        {t('pages.settings.addTier')}
                      </Button>
                    </div>

                    {!hasName ? (
                      <p className="text-[12px] text-[var(--text-muted)]">
                        {t('pages.settings.nameItemTypeBeforeSetting')}
                      </p>
                    ) : (
                      <div className="divide-y divide-[var(--hairline)] rounded-[10px] border border-[var(--hairline)]">
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-4 py-2.5 eyebrow">
                          <div>{t('pages.settings.minLoanAmount')}</div>
                          <div>{t('pages.settings.interestRate')}</div>
                          <div className="w-8 text-right">—</div>
                        </div>
                        {tiers.map((tier, index) => (
                          <div
                            key={`${itemTypeKey}-${index}`}
                            className="grid grid-cols-[1fr_1fr_auto] gap-3 px-4 py-3 items-center"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] text-[var(--text-muted)] mono">
                                &gt;
                              </span>
                              <Input
                                type="number"
                                value={tier.minAmount}
                                onChange={(e) =>
                                  updateTier(
                                    itemTypeKey,
                                    index,
                                    "minAmount",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                monoDigits
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.1"
                                value={tier.rate}
                                onChange={(e) =>
                                  updateTier(
                                    itemTypeKey,
                                    index,
                                    "rate",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                monoDigits
                              />
                              <span className="text-[13px] text-[var(--text-muted)]">
                                %
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTier(itemTypeKey, index)}
                              aria-label={t('common.remove')}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
