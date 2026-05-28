"use client";

import { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import { firebaseApp } from "@/lib/firebase/client-app";

type NotificationsConfig = {
  new_game_enabled: boolean;
  game_ending_enabled: boolean;
  game_ending_days_before: number;
  inactive_relaunch_enabled: boolean;
  inactive_relaunch_frequency_days: number;
  merchant_relaunch_enabled: boolean;
  merchant_relaunch_delay_7d_enabled: boolean;
  merchant_relaunch_delay_21d_enabled: boolean;
  prizeReminderEnabled: boolean;
};

type NotificationsConfigResponse = Partial<NotificationsConfig>;

type PrizeReminderDryRunResult = {
  eligiblePrizes?: number;
  pushSentCount?: number;
  emailSentCount?: number;
};

const defaultConfig: NotificationsConfig = {
  new_game_enabled: false,
  game_ending_enabled: false,
  game_ending_days_before: 7,
  inactive_relaunch_enabled: false,
  inactive_relaunch_frequency_days: 30,
  merchant_relaunch_enabled: false,
  merchant_relaunch_delay_7d_enabled: false,
  merchant_relaunch_delay_21d_enabled: false,
  prizeReminderEnabled: false,
};

const functionsClient = getFunctions(firebaseApp, "us-central1");
const getNotificationsConfigCallable = httpsCallable<void, NotificationsConfigResponse>(
  functionsClient,
  "adminGetNotificationsConfig",
);
const setNotificationsConfigCallable = httpsCallable<NotificationsConfig, NotificationsConfigResponse>(
  functionsClient,
  "adminSetNotificationsConfig",
);
const runPrizeReminderDryRunCallable = httpsCallable<void, PrizeReminderDryRunResult>(
  functionsClient,
  "adminRunPrizeReminderDryRun",
);
const sendPrizeReminderEmailTestCallable = httpsCallable<void, { ok?: boolean }>(
  functionsClient,
  "adminSendPrizeReminderEmailTest",
);

function normalizeNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function normalizeConfig(data?: Partial<NotificationsConfig> | null): NotificationsConfig {
  return {
    new_game_enabled: data?.new_game_enabled === true,
    game_ending_enabled: data?.game_ending_enabled === true,
    game_ending_days_before: normalizeNumber(
      data?.game_ending_days_before ?? defaultConfig.game_ending_days_before,
      defaultConfig.game_ending_days_before,
    ),
    inactive_relaunch_enabled: data?.inactive_relaunch_enabled === true,
    inactive_relaunch_frequency_days: normalizeNumber(
      data?.inactive_relaunch_frequency_days ?? defaultConfig.inactive_relaunch_frequency_days,
      defaultConfig.inactive_relaunch_frequency_days,
    ),
    merchant_relaunch_enabled: data?.merchant_relaunch_enabled === true,
    merchant_relaunch_delay_7d_enabled: data?.merchant_relaunch_delay_7d_enabled === true,
    merchant_relaunch_delay_21d_enabled: data?.merchant_relaunch_delay_21d_enabled === true,
    prizeReminderEnabled: data?.prizeReminderEnabled === true,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return "Connexion requise pour gerer les relances automatiques.";
      case "functions/permission-denied":
        return "Seuls les admins autorises peuvent modifier cette configuration.";
      case "functions/unavailable":
      case "functions/not-found":
        return "Le service de configuration des relances est indisponible.";
      default:
        return error.message || "Le backend a retourne une erreur.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Une erreur inattendue est survenue.";
}

function Toggle({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-[24px] w-[42px] rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-[#639922]" : "bg-[#D7D7D1]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
          checked ? "left-[21px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
      <div className="mb-4">
        <h2 className="text-[16px] font-medium text-[#1A1A1A]">{title}</h2>
        <p className="mt-1 text-[12px] text-[#666666]">{description}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#1A1A1A]">{title}</p>
          <p className="mt-1 text-[12px] text-[#666666]">{description}</p>
        </div>
        <Toggle checked={checked} disabled={disabled} onClick={onToggle} />
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export default function AutoRemindersPage() {
  const [config, setConfig] = useState<NotificationsConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [gameEndingDaysInput, setGameEndingDaysInput] = useState(String(defaultConfig.game_ending_days_before));
  const [inactiveFrequencyInput, setInactiveFrequencyInput] = useState(String(defaultConfig.inactive_relaunch_frequency_days));
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<PrizeReminderDryRunResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await getNotificationsConfigCallable();
        if (cancelled) return;

        const nextConfig = normalizeConfig(response.data);
        setConfig(nextConfig);
        setGameEndingDaysInput(String(nextConfig.game_ending_days_before));
        setInactiveFrequencyInput(String(nextConfig.inactive_relaunch_frequency_days));
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const canActivatePrizeReminder = useMemo(
    () => dryRunResult !== null && config.prizeReminderEnabled === false,
    [config.prizeReminderEnabled, dryRunResult],
  );

  const saveConfig = async (nextConfig: NotificationsConfig, successMessage: string, savingLabel: string) => {
    setSavingKey(savingLabel);
    setError(null);
    setSuccess(null);

    try {
      const response = await setNotificationsConfigCallable(nextConfig);
      const normalized = normalizeConfig({
        ...nextConfig,
        ...response.data,
      });

      setConfig(normalized);
      setGameEndingDaysInput(String(normalized.game_ending_days_before));
      setInactiveFrequencyInput(String(normalized.inactive_relaunch_frequency_days));
      setSuccess(successMessage);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
      throw saveError;
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggle = async (key: keyof NotificationsConfig, successMessage: string) => {
    const previousConfig = config;
    const nextConfig = {
      ...config,
      [key]: !config[key],
    } as NotificationsConfig;

    setConfig(nextConfig);

    try {
      await saveConfig(nextConfig, successMessage, String(key));
    } catch {
      setConfig(previousConfig);
    }
  };

  const handleNumberSave = async (
    key: "game_ending_days_before" | "inactive_relaunch_frequency_days",
    rawValue: string,
    successMessage: string,
  ) => {
    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Entre un nombre valide superieur ou egal a 0.");
      return;
    }

    const nextConfig = {
      ...config,
      [key]: parsed,
    };

    setConfig(nextConfig);
    await saveConfig(nextConfig, successMessage, key);
  };

  const handleDryRun = async () => {
    setDryRunLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await runPrizeReminderDryRunCallable();
      setDryRunResult(result.data ?? {});
      setSuccess("Dry run termine.");
    } catch (dryRunError) {
      setError(getErrorMessage(dryRunError));
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleSendEmailTest = async () => {
    setEmailTestLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await sendPrizeReminderEmailTestCallable();
      setSuccess("Email envoye a votre adresse admin.");
    } catch (emailTestError) {
      setError(getErrorMessage(emailTestError));
    } finally {
      setEmailTestLoading(false);
    }
  };

  const handleActivatePrizeReminder = async () => {
    const previousConfig = config;
    const nextConfig = {
      ...config,
      prizeReminderEnabled: true,
    };

    setConfig(nextConfig);

    try {
      await saveConfig(
        nextConfig,
        "Le rappel lot non reclame est maintenant active.",
        "prizeReminderEnabled",
      );
    } catch {
      setConfig(previousConfig);
    }
  };

  if (loading) {
    return (
      <section className="space-y-4 bg-[#F7F7F5] text-[#1A1A1A]">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-[180px] animate-pulse rounded-[12px] border border-[#E8E8E4] bg-white"
          />
        ))}
      </section>
    );
  }

  return (
    <section className="space-y-4 bg-[#F7F7F5] text-[#1A1A1A]">
      <div className="rounded-[12px] border border-[#E8E8E4] bg-white p-5">
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1A1A1A]">Relances auto</h1>
        <p className="mt-2 text-[13px] text-[#666666]">
          Gere les automatisations de notifications joueurs, commercants et rappels de lots.
        </p>
      </div>

      {error ? (
        <div className="rounded-[12px] border border-[#F09595] bg-[#FCEBEB] px-4 py-3 text-[12px] text-[#A32D2D]">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-[12px] border border-[#CFE2B3] bg-[#F3F8EA] px-4 py-3 text-[12px] text-[#3B6D11]">
          {success}
        </div>
      ) : null}

      <SectionCard
        title="Automatisations joueurs"
        description="Declenche les notifications automatiques liees a l activite et a l engagement des joueurs."
      >
        <ToggleRow
          title="Nouveau jeu disponible"
          description="Envoie une notification quand un nouveau jeu est publie."
          checked={config.new_game_enabled}
          disabled={savingKey !== null}
          onToggle={() => void handleToggle("new_game_enabled", "Automatisation nouveau jeu mise a jour.")}
        />

        <ToggleRow
          title="Jeu expire bientot"
          description="Previent les joueurs quelques jours avant la fin d un jeu."
          checked={config.game_ending_enabled}
          disabled={savingKey !== null}
          onToggle={() => void handleToggle("game_ending_enabled", "Automatisation jeu expirant bientot mise a jour.")}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] text-[#666666]">Jours avant expiration</span>
              <input
                type="number"
                min="0"
                value={gameEndingDaysInput}
                onChange={(event) => setGameEndingDaysInput(event.target.value)}
                className="min-h-[42px] w-full rounded-[8px] border border-[#E8E8E4] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleNumberSave("game_ending_days_before", gameEndingDaysInput, "Delai jeu expirant bientot enregistre.")}
              disabled={savingKey !== null}
              className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] font-medium text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingKey === "game_ending_days_before" ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </ToggleRow>

        <ToggleRow
          title="Relance joueurs inactifs"
          description="Relance automatiquement les joueurs inactifs selon une frequence definie."
          checked={config.inactive_relaunch_enabled}
          disabled={savingKey !== null}
          onToggle={() => void handleToggle("inactive_relaunch_enabled", "Automatisation joueurs inactifs mise a jour.")}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] text-[#666666]">Frequence en jours</span>
              <input
                type="number"
                min="0"
                value={inactiveFrequencyInput}
                onChange={(event) => setInactiveFrequencyInput(event.target.value)}
                className="min-h-[42px] w-full rounded-[8px] border border-[#E8E8E4] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleNumberSave("inactive_relaunch_frequency_days", inactiveFrequencyInput, "Frequence de relance joueurs inactifs enregistree.")}
              disabled={savingKey !== null}
              className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] font-medium text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingKey === "inactive_relaunch_frequency_days" ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </ToggleRow>
      </SectionCard>

      <SectionCard
        title="Automatisations commercants"
        description="Parametre les relances automatiques destinees aux commercants inactifs."
      >
        <ToggleRow
          title="Relance commercants inactifs"
          description="Active la logique generale de relance pour les commercants."
          checked={config.merchant_relaunch_enabled}
          disabled={savingKey !== null}
          onToggle={() => void handleToggle("merchant_relaunch_enabled", "Automatisation commercants inactifs mise a jour.")}
        />

        <ToggleRow
          title="Palier 7 jours"
          description="Declenche la relance du premier palier apres 7 jours."
          checked={config.merchant_relaunch_delay_7d_enabled}
          disabled={savingKey !== null}
          onToggle={() => void handleToggle("merchant_relaunch_delay_7d_enabled", "Palier commerçant 7 jours mis a jour.")}
        />

        <ToggleRow
          title="Palier 21 jours"
          description="Declenche la relance du second palier apres 21 jours."
          checked={config.merchant_relaunch_delay_21d_enabled}
          disabled={savingKey !== null}
          onToggle={() => void handleToggle("merchant_relaunch_delay_21d_enabled", "Palier commerçant 21 jours mis a jour.")}
        />
      </SectionCard>

      <SectionCard
        title="Rappel lot non reclame"
        description="Teste et active l automatisation de relance des lots non reclames."
      >
        <ToggleRow
          title="Activer le rappel lot non reclame"
          description="Permet l execution automatique des rappels de lots eligibles."
          checked={config.prizeReminderEnabled}
          disabled={savingKey !== null}
          onToggle={() => void handleToggle("prizeReminderEnabled", "Configuration du rappel lot non reclame mise a jour.")}
        />

        <div className="rounded-[10px] border border-[#E8E8E4] bg-[#F7F7F5] px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDryRun()}
              disabled={dryRunLoading || emailTestLoading || savingKey !== null}
              className="rounded-[8px] border border-[#185FA5] bg-white px-4 py-[10px] text-[12px] font-medium text-[#185FA5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {dryRunLoading ? "Dry run..." : "Lancer dry run"}
            </button>
            <button
              type="button"
              onClick={() => void handleSendEmailTest()}
              disabled={emailTestLoading || dryRunLoading || savingKey !== null}
              className="rounded-[8px] border border-[#E8E8E4] bg-white px-4 py-[10px] text-[12px] font-medium text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {emailTestLoading ? "Envoi..." : "Envoyer email test"}
            </button>
            {canActivatePrizeReminder ? (
              <button
                type="button"
                onClick={() => void handleActivatePrizeReminder()}
                disabled={savingKey !== null}
                className="rounded-[8px] border border-[#639922] bg-[#639922] px-4 py-[10px] text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingKey === "prizeReminderEnabled" ? "Activation..." : "Activer"}
              </button>
            ) : null}
          </div>

          {dryRunResult ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-3">
                <p className="text-[11px] text-[#999999]">Lots eligibles</p>
                <p className="mt-1 text-[18px] font-medium text-[#1A1A1A]">
                  {dryRunResult.eligiblePrizes ?? 0}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-3">
                <p className="text-[11px] text-[#999999]">Push envoyes</p>
                <p className="mt-1 text-[18px] font-medium text-[#1A1A1A]">
                  {dryRunResult.pushSentCount ?? 0}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#E8E8E4] bg-white px-3 py-3">
                <p className="text-[11px] text-[#999999]">Emails envoyes</p>
                <p className="mt-1 text-[18px] font-medium text-[#1A1A1A]">
                  {dryRunResult.emailSentCount ?? 0}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </section>
  );
}
