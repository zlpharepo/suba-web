import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api, session } from "@/lib/api";
import { useConfirmDiscard, useDraftProtection } from "@/lib/draft-protection";
import { useTarget } from "@/lib/target";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import { PageHeader } from "@/ui/layout";
import { Card, ErrorNote, Skeleton } from "@/ui/misc";

export function SettingsPage() {
  const { t } = useTranslation();
  const { localClient } = useTarget();
  const account = useQuery(
    { queryKey: ["account"], queryFn: api.account.get, retry: false },
    localClient,
  );
  const settings = useQuery(
    { queryKey: ["system", "settings"], queryFn: api.settings.get, retry: false },
    localClient,
  );

  return (
    <div className="max-w-2xl">
      <PageHeader title={t("common.settings")} />
      <div className="grid gap-6">
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold text-fg">{t("common.account")}</h2>
          <Card className="p-5">
            {account.error ? (
              <ErrorNote error={account.error} />
            ) : account.data ? (
              <div className="grid gap-5">
                <UsernameForm username={account.data.username} />
                <div className="border-t border-border pt-5">
                  <PasswordForm />
                </div>
              </div>
            ) : (
              <Skeleton className="h-52" />
            )}
          </Card>
        </section>
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold text-fg">{t("settings.subscription")}</h2>
          <Card className="p-5">
            {settings.error ? (
              <ErrorNote error={settings.error} />
            ) : settings.data ? (
              <PrefixForm
                key={settings.data.subscription_prefix}
                initial={settings.data.subscription_prefix}
              />
            ) : (
              <Skeleton className="h-24" />
            )}
          </Card>
        </section>
        <UpdatesPanel />
        <SessionActions />
      </div>
    </div>
  );
}

function SessionActions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { localClient } = useTarget();
  const confirmDiscard = useConfirmDiscard();
  const [othersSignedOut, setOthersSignedOut] = useState(false);
  const others = useMutation({
    mutationFn: api.auth.logoutOthers,
    onSuccess: () => setOthersSignedOut(true),
  });
  const logout = useMutation({
    mutationFn: api.auth.logout,
    onSettled: () => {
      session.clear();
      queryClient.clear();
      localClient.clear();
      void navigate({ to: "/login", ignoreBlocker: true });
    },
  });

  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-semibold text-fg">{t("settings.sessions")}</h2>
      <Card className="grid gap-3 p-5">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setOthersSignedOut(false);
              others.mutate();
            }}
            disabled={others.isPending || logout.isPending}
          >
            {others.isPending
              ? t("settings.signingOut")
              : othersSignedOut
                ? t("settings.othersSignedOut")
                : t("settings.signOutOthers")}
          </Button>
          <Button
            onClick={() => {
              if (confirmDiscard()) logout.mutate();
            }}
            disabled={others.isPending || logout.isPending}
          >
            {logout.isPending ? t("settings.signingOut") : t("settings.signOut")}
          </Button>
        </div>
        {others.error && <ErrorNote error={others.error} />}
      </Card>
    </section>
  );
}

function UpdatesPanel() {
  const { t } = useTranslation();
  const { localClient } = useTarget();
  const web = useQuery(
    { queryKey: ["system", "web"], queryFn: api.web.status, retry: false },
    localClient,
  );
  const system = useQuery(
    { queryKey: ["system", "info"], queryFn: api.system.info, retry: false },
    localClient,
  );
  const update = useMutation({
    mutationFn: api.web.install,
    onSuccess: () => window.location.reload(),
  });
  const latest = web.data?.latest_version;
  const current = web.data?.installed_version;
  const available =
    latest && (!current || current.localeCompare(latest, undefined, { numeric: true }) < 0);

  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-semibold text-fg">{t("settings.updates")}</h2>
      <Card className="grid gap-5 p-5">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-fg">{t("common.web")}</span>
            <span className="font-mono text-xs text-fg-muted">
              {current ?? t("common.unknown")}
            </span>
          </div>
          {web.error ? (
            <ErrorNote error={web.error} />
          ) : web.isPending ? (
            <Skeleton className="h-6" />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-fg-muted">
                {latest
                  ? t("settings.latest", { version: latest })
                  : t("settings.releaseUnavailable")}
              </span>
              <Button
                size="sm"
                onClick={() => update.mutate()}
                disabled={!available || update.isPending}
              >
                {update.isPending ? t("settings.updating") : t("settings.updateWeb")}
              </Button>
            </div>
          )}
          {update.error && <ErrorNote error={update.error} />}
        </div>
        <div className="grid gap-2 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-fg">{t("common.server")}</span>
            <span className="font-mono text-xs text-fg-muted">
              {system.data?.version ?? t("common.unknown")}
            </span>
          </div>
          {system.error && <ErrorNote error={system.error} />}
          <p className="text-xs text-fg-muted">{t("settings.serverUpgrade")}</p>
        </div>
      </Card>
    </section>
  );
}

function useReauthenticate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return () => {
    session.clear();
    queryClient.clear();
    void navigate({ to: "/login", ignoreBlocker: true });
  };
}

function UsernameForm({ username: initial }: { username: string }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(initial);
  const [current, setCurrent] = useState("");
  const reauthenticate = useReauthenticate();
  const change = useMutation({
    mutationFn: () => api.account.changeUsername(username, current),
    onSuccess: reauthenticate,
  });
  useDraftProtection({ dirty: username !== initial || !!current, saving: change.isPending });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (username !== initial) change.mutate();
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label={t("common.username")}>
        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
          minLength={3}
          maxLength={64}
        />
      </Field>
      <Field label={t("settings.currentPassword")}>
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
          minLength={6}
          maxLength={128}
        />
      </Field>
      {change.error && <ErrorNote error={change.error} />}
      <div>
        <Button type="submit" variant="primary" disabled={username === initial || change.isPending}>
          {t("settings.changeUsername")}
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const reauthenticate = useReauthenticate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation({
    mutationFn: () => api.account.changePassword(current, next),
    onSuccess: reauthenticate,
  });
  useDraftProtection({ dirty: !!(current || next || confirmation), saving: change.isPending });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (next !== confirmation) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate();
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <h3 className="text-sm font-medium text-fg">{t("common.password")}</h3>
      <Field label={t("settings.currentPassword")}>
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
          minLength={6}
          maxLength={128}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("settings.newPassword")}>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
            minLength={6}
            maxLength={128}
          />
        </Field>
        <Field label={t("settings.confirmPassword")}>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
              setMismatch(false);
            }}
            required
            minLength={6}
            maxLength={128}
            aria-invalid={mismatch}
          />
        </Field>
      </div>
      {mismatch && (
        <p role="alert" className="text-sm text-danger">
          {t("settings.passwordMismatch")}
        </p>
      )}
      {change.error && <ErrorNote error={change.error} />}
      <div>
        <Button type="submit" variant="primary" disabled={change.isPending}>
          {t("settings.changePassword")}
        </Button>
      </div>
    </form>
  );
}

function PrefixForm({ initial }: { initial: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [prefix, setPrefix] = useState(initial);
  const dirty = prefix !== initial;
  const save = useMutation({
    mutationFn: () => api.settings.update(prefix),
    onSuccess: (settings) => {
      queryClient.setQueryData(["system", "settings"], settings);
    },
  });
  useDraftProtection({ dirty, saving: save.isPending });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || !window.confirm(t("settings.prefixWarning"))) return;
    save.mutate();
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label={t("settings.deliveryPrefix")}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-subtle">/</span>
          <Input
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            required
            maxLength={64}
            pattern="[A-Za-z0-9_-]+"
            className="max-w-64 font-mono"
          />
        </div>
      </Field>
      {save.error && <ErrorNote error={save.error} />}
      <div>
        <Button type="submit" variant="primary" disabled={!dirty || save.isPending}>
          {t("settings.savePrefix")}
        </Button>
      </div>
    </form>
  );
}
