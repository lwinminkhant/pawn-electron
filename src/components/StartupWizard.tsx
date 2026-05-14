import React, { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Database, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageLoader,
  Select,
} from "./ui";
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettingsPayload,
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

type WizardStep = "database" | "application";

interface StartupWizardProps {
  onComplete: () => void;
}

const StartupWizard: React.FC<StartupWizardProps> = ({ onComplete }) => {
  const [loading, setLoading] = useState(true);
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [step, setStep] = useState<WizardStep>("database");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingDatabase, setSavingDatabase] = useState(false);
  const [savingApplication, setSavingApplication] = useState(false);

  const [adminName, setAdminName] = useState("Shop Administrator");
  const [adminUserName, setAdminUserName] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [dbTimeZone, setDbTimeZone] = useState("Asia/Bangkok");
  const [goldRate, setGoldRate] = useState(DEFAULT_APP_SETTINGS.goldRate);
  const [oneKyatInGrams, setOneKyatInGrams] = useState(
    DEFAULT_APP_SETTINGS.oneKyatInGrams,
  );
  const [itemTypesText, setItemTypesText] = useState(
    DEFAULT_APP_SETTINGS.itemTypes.join(", "),
  );

  const normalizedItemTypes = useMemo(
    () =>
      itemTypesText
        .split(",")
        .map((itemType) => itemType.trim())
        .filter(Boolean),
    [itemTypesText],
  );

  const loadStatus = useEffectEvent(async () => {
    if (!window.desktopSetup?.getStatus) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const desktopStatus = await window.desktopSetup.getStatus();
      if (desktopStatus?.databaseUrl) {
        setDatabaseUrl(desktopStatus.databaseUrl);
      }

      if (!desktopStatus?.configExists || !desktopStatus?.apiHealthy) {
        setStep("database");
        if (desktopStatus?.lastError) {
          setError(desktopStatus.lastError);
        }
        return;
      }

      const setupStatus = await window.electron.api.setup.getStatus();
      if (!setupStatus?.success) {
        setStep("application");
        setError(setupStatus?.message || "The API is running, but setup status could not be loaded.");
        return;
      }

      const settingsResult = await window.electron.api.settings.getAppSettings();
      if (settingsResult?.success) {
        const normalized = normalizeAppSettings(settingsResult.settings);
        setGoldRate(normalized.goldRate);
        setOneKyatInGrams(normalized.oneKyatInGrams);
        setDbTimeZone(normalized.dbTimeZone || "Asia/Bangkok");
        setItemTypesText(normalized.itemTypes.join(", "));
      }

      if (setupStatus.setup?.completed) {
        onComplete();
        return;
      }

      setStep("application");
      if (setupStatus.setup?.defaultAdminCredentials) {
        setNotice("Default admin credentials are still active. Finish setup to replace them.");
      }
    } catch (setupError) {
      console.error("Failed to load startup wizard status", setupError);
      setStep("database");
      setError("Failed to inspect local startup status.");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleSaveDatabase = async () => {
    if (!window.desktopSetup?.saveRuntimeConfig) return;

    setSavingDatabase(true);
    setError(null);
    setNotice(null);

    try {
      const result = await window.desktopSetup.saveRuntimeConfig({ databaseUrl });
      if (!result?.success) {
        setError(result?.message || "Failed to save the database connection.");
        return;
      }

      setNotice("Database connection saved. The local API is now running.");
      await loadStatus();
    } catch (setupError) {
      console.error("Failed to save database config", setupError);
      setError("Failed to start the local API with that database connection.");
    } finally {
      setSavingDatabase(false);
    }
  };

  const handleCompleteSetup = async () => {
    setSavingApplication(true);
    setError(null);
    setNotice(null);

    try {
      const settingsPayload: AppSettingsPayload = normalizeAppSettings({
        ...DEFAULT_APP_SETTINGS,
        dbTimeZone,
        goldRate,
        itemTypes: normalizedItemTypes,
        oneKyatInGrams,
      });

      const result = await window.electron.api.setup.bootstrap({
        adminUser: {
          name: adminName.trim(),
          password: adminPassword.trim(),
          userName: adminUserName.trim(),
        },
        dbTimeZone: dbTimeZone.trim(),
        settings: settingsPayload,
      });

      if (!result?.success) {
        setError(result?.message || "Failed to complete application setup.");
        return;
      }

      onComplete();
    } catch (setupError) {
      console.error("Failed to complete setup", setupError);
      setError("The setup wizard could not finish the application bootstrap.");
    } finally {
      setSavingApplication(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading startup wizard..." />;
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)] px-6 py-8">
      <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[20px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-6">
          <p className="eyebrow mb-3">First Launch</p>
          <h1 className="text-[28px] font-semibold tracking-tight leading-tight">
            Set up the database and the application once.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">
            This desktop build expects a Postgres database. The wizard stores the
            connection locally, starts the bundled API, and creates the initial
            admin account and settings.
          </p>

          <div className="mt-8 space-y-3">
            <StepRow
              active={step === "database"}
              complete={step === "application"}
              icon={<Database size={15} />}
              title="Database"
              description="Save the Postgres connection and start the local API."
            />
            <StepRow
              active={step === "application"}
              complete={false}
              icon={<SlidersHorizontal size={15} />}
              title="Application"
              description="Create the admin login and default operating settings."
            />
          </div>
        </aside>

        <div className="space-y-4">
          {error ? (
            <Banner tone="danger" title="Setup issue">
              {error}
            </Banner>
          ) : null}
          {notice ? (
            <Banner tone="info" title="Setup progress">
              {notice}
            </Banner>
          ) : null}

          {step === "database" ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database size={16} className="text-[var(--brass)]" />
                  <div>
                    <h2 className="text-[15px] font-semibold">Database connection</h2>
                    <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                      Example: `postgres://postgres:postgres@localhost:5432/pawn`
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="space-y-5">
                <Field
                  label="Postgres database URL"
                  hint="The desktop app stores this on the current machine and uses it to start the bundled API."
                  required
                >
                  <Input
                    type="text"
                    value={databaseUrl}
                    onChange={(event) => setDatabaseUrl(event.target.value)}
                    placeholder="postgres://user:password@host:5432/database"
                    autoFocus
                  />
                </Field>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void handleSaveDatabase()}
                    loading={savingDatabase}
                    disabled={!databaseUrl.trim()}
                  >
                    {savingDatabase ? "Starting API..." : "Save and continue"}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[var(--success)]" />
                  <div>
                    <h2 className="text-[15px] font-semibold">Application bootstrap</h2>
                    <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                      Replace the default admin account and save the initial shop settings.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Admin name" required>
                    <Input
                      type="text"
                      value={adminName}
                      onChange={(event) => setAdminName(event.target.value)}
                      placeholder="Shop Administrator"
                    />
                  </Field>
                  <Field label="Admin username" required>
                    <Input
                      type="text"
                      value={adminUserName}
                      onChange={(event) => setAdminUserName(event.target.value)}
                      placeholder="admin"
                    />
                  </Field>
                </div>

                <Field
                  label="Admin password"
                  hint="This replaces the default password shipped by the bootstrap script."
                  required
                >
                  <Input
                    type="password"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                    placeholder="Choose a secure password"
                  />
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Database time zone" required>
                    <Select
                      value={dbTimeZone}
                      onChange={(event) => setDbTimeZone(event.target.value)}
                    >
                      {DB_TIME_ZONE_OPTIONS.map((timeZone) => (
                        <option key={timeZone} value={timeZone}>
                          {timeZone}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Item types" hint="Comma-separated pawn item types." required>
                    <Input
                      type="text"
                      value={itemTypesText}
                      onChange={(event) => setItemTypesText(event.target.value)}
                      placeholder="Gold, Electronics, Watch"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Gold rate" required>
                    <Input
                      type="number"
                      value={goldRate}
                      onChange={(event) => setGoldRate(event.target.value)}
                      placeholder="80000"
                    />
                  </Field>

                  <Field label="One kyat in grams" required>
                    <Input
                      type="number"
                      value={oneKyatInGrams}
                      onChange={(event) => setOneKyatInGrams(event.target.value)}
                      placeholder="16.606"
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--hairline)] pt-5">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep("database")}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void handleCompleteSetup()}
                    loading={savingApplication}
                    disabled={
                      !adminName.trim() ||
                      !adminUserName.trim() ||
                      !adminPassword.trim() ||
                      normalizedItemTypes.length === 0
                    }
                  >
                    {savingApplication ? "Finishing setup..." : "Finish setup"}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

const StepRow: React.FC<{
  active: boolean;
  complete: boolean;
  description: string;
  icon: React.ReactNode;
  title: string;
}> = ({ active, complete, description, icon, title }) => (
  <div
    className={[
      "rounded-[14px] border px-4 py-3 transition-colors",
      active
        ? "border-[var(--brass)] bg-[var(--brass-soft)]/60"
        : complete
          ? "border-[var(--success)]/40 bg-[var(--success-soft)]/60"
          : "border-[var(--hairline)] bg-[var(--surface-canvas)]",
    ].join(" ")}
  >
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)]">
        {icon}
      </span>
      <div>
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      </div>
    </div>
  </div>
);

export default StartupWizard;
