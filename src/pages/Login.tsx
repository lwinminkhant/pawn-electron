import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";
import { Button, Field, Input, Banner, ThemeToggle } from "../components/ui";
import { initTheme } from "../utils/theme";

interface LoginProps {
  onLogin: (user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initTheme();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const electronBridge = (window as any).electron;
      if (!electronBridge?.ipcRenderer?.invoke) {
        setError(
          t('pages.login.desktopBridgeUnavailable')
        );
        return;
      }

      const result = await electronBridge.ipcRenderer.invoke("login", {
        username,
        password,
      });

      if (result.success) {
        onLogin(result.user);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(t('pages.login.errorOccurredDuringLogin'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)] flex">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Left plate */}
      <aside className="hidden lg:flex w-[44%] relative border-r border-[var(--hairline)] bg-[var(--surface-raised)] flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[7px] bg-[var(--brass)] flex items-center justify-center"
            aria-hidden
          >
            <span className="text-[var(--brass-text-on)] text-[18px] font-bold mono">
              P
            </span>
          </div>
          <div>
            <div className="text-[18px] font-semibold tracking-tight">
              {t('pages.login.pawn')}
            </div>
            <div className="text-[11px] mono text-[var(--text-muted)] mt-0.5">
              {t('pages.login.counterLedger')}
            </div>
          </div>
        </div>

        <div className="max-w-md">
          <p className="eyebrow mb-4">{t('pages.login.theCounter')}</p>
          <h1 className="text-[32px] leading-[1.15] font-semibold tracking-tight text-[var(--text-primary)]">
            {t('pages.login.counterTagline')}
          </h1>
          <p className="mt-4 text-[14px] text-[var(--text-secondary)] leading-relaxed">
            {t('pages.login.taglineBody')}
          </p>
        </div>

        <div className="flex items-center gap-8 text-[11px] mono text-[var(--text-muted)]">
          <span className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--success)]"
              aria-hidden
            />
            {t('pages.login.localEncrypted')}
          </span>
          <span>v0.1</span>
        </div>
      </aside>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div
              className="w-8 h-8 rounded-[5px] bg-[var(--brass)] flex items-center justify-center"
              aria-hidden
            >
              <span className="text-[var(--brass-text-on)] text-[14px] font-bold mono">
                P
              </span>
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold">{t('pages.login.pawn')}</div>
              <div className="text-[10px] mono text-[var(--text-muted)]">
                {t('pages.login.counterLedger')}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <p className="eyebrow mb-2">{t('pages.login.signIn')}</p>
            <h2 className="text-[22px] font-semibold tracking-tight">
              {t('pages.login.welcomeBack')}
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">
              {t('pages.login.enterCredentials')}
            </p>
          </div>

          {error && (
            <div className="mb-5">
              <Banner tone="danger">{error}</Banner>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label={t('pages.login.username')} htmlFor="login-username" required>
              <Input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('pages.login.usernamePlaceholder')}
                autoComplete="username"
                autoFocus
                required
              />
            </Field>

            <Field label={t('pages.login.password')} htmlFor="login-password" required>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('pages.login.passwordPlaceholder')}
                autoComplete="current-password"
                required
              />
            </Field>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                leadingIcon={!loading ? <KeyRound size={15} /> : undefined}
              >
                {loading ? t('pages.login.signingIn') : t('pages.login.signIn')}
              </Button>
            </div>
          </form>

          <p className="mt-8 text-[11px] text-[var(--text-muted)] text-center">
            Need help? Contact your shop administrator.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
