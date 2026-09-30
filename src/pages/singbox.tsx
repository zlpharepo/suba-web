import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DownloadIcon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { ErrorAlert, Loading, PageHeader } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { formatTime, stripAnsi } from "@/lib/format";
import type {
  CoreAction,
  Installation,
  Runtime,
  VersionView,
} from "@/lib/types";

export function SingboxPage() {
  const core = useQuery({ queryKey: ["singbox"], queryFn: api.singbox.get });

  return (
    <>
      <PageHeader
        title="sing-box"
        description="Install a core, choose the collections that become outbounds, and run it."
      />
      {core.isPending && <Loading />}
      {core.error && <ErrorAlert error={core.error} />}
      {core.data && (
        <div className="grid gap-6">
          {core.data.note && (
            <Alert>
              <AlertDescription>{core.data.note}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Process />
            <Settings
              version={core.data.version}
              collections={core.data.collections}
            />
          </div>
          <Versions />
        </div>
      )}
    </>
  );
}

function Process() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["singbox", "status"],
    queryFn: () => api.singbox.status(),
    refetchInterval: 2000,
  });

  const act = useMutation({
    mutationFn: (action: CoreAction) => api.singbox.act(action),
    onSuccess: (running) => {
      queryClient.setQueryData(["singbox", "status"], running);
      void queryClient.invalidateQueries({ queryKey: ["singbox"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const running = status.data?.running ?? false;
  const lastExit = status.data?.exits.at(-1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Process
          <Badge variant={running ? "default" : "outline"}>
            {running ? "running" : "stopped"}
          </Badge>
        </CardTitle>
        <CardDescription>
          {running
            ? `pid ${status.data?.pid} · started ${formatTime(status.data?.started_at)}`
            : lastExit
              ? `last exit ${formatTime(lastExit.at)} · ${
                  lastExit.signal !== null
                    ? `signal ${lastExit.signal}`
                    : `status ${lastExit.code}`
                }`
              : "Not started since this instance began."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex gap-2">
          <Button
            onClick={() => act.mutate("start")}
            disabled={running || act.isPending}
          >
            <PlayIcon /> Start
          </Button>
          <Button
            variant="outline"
            onClick={() => act.mutate("restart")}
            disabled={!running || act.isPending}
          >
            <RotateCwIcon /> Restart
          </Button>
          <Button
            variant="outline"
            onClick={() => act.mutate("stop")}
            disabled={!running || act.isPending}
          >
            <SquareIcon /> Stop
          </Button>
        </div>
        {status.error && <ErrorAlert error={status.error} />}
        <pre className="bg-muted h-72 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
          {status.data?.log.length
            ? status.data.log.map(stripAnsi).join("\n")
            : "No output."}
        </pre>
      </CardContent>
    </Card>
  );
}

const NO_VERSION = "__none__";

function Settings({
  version,
  collections,
}: {
  version: string | null;
  collections: string[];
}) {
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: ["singbox", "versions"],
    queryFn: api.singbox.versions,
  });
  const known = useQuery({
    queryKey: ["collections"],
    queryFn: api.collections.list,
  });

  const [chosenVersion, setChosenVersion] = useState(version ?? NO_VERSION);
  const [chosen, setChosen] = useState(collections);

  const installed = (versions.data ?? []).filter(
    (item) => item.installation.status === "installed",
  );
  const names = Object.keys(known.data ?? {}).sort();
  const choices = [...names, ...chosen.filter((name) => !names.includes(name))];

  const save = useMutation({
    mutationFn: () =>
      api.singbox.choose(
        chosenVersion === NO_VERSION ? null : chosenVersion,
        chosen,
      ),
    onSuccess: (core) => {
      queryClient.setQueryData(["singbox"], core);
      void queryClient.invalidateQueries({ queryKey: ["singbox", "versions"] });
      toast.success("Settings saved");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggle = (name: string, checked: boolean) =>
    setChosen(
      checked ? [...chosen, name] : chosen.filter((item) => item !== name),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          Take effect on the next start or restart.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <span className="text-sm font-medium">Version</span>
          <Select value={chosenVersion} onValueChange={setChosenVersion}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_VERSION}>none</SelectItem>
              {installed.map((item) => (
                <SelectItem key={item.version} value={item.version}>
                  {item.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">
            Collections contributing outbounds
          </span>
          {choices.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No collections defined.
            </p>
          )}
          {choices.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={chosen.includes(name)}
                onCheckedChange={(checked) => toggle(name, checked === true)}
              />
              {name}
              {!names.includes(name) && (
                <span className="text-destructive text-xs">(missing)</span>
              )}
            </label>
          ))}
        </div>
        <div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Versions() {
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: ["singbox", "versions"],
    queryFn: api.singbox.versions,
    refetchInterval: (query) =>
      query.state.data?.some(
        (item) => item.installation.status === "downloading",
      )
        ? 1000
        : false,
  });
  const releases = useQuery({
    queryKey: ["singbox", "releases"],
    queryFn: api.singbox.releases,
    staleTime: 5 * 60 * 1000,
  });
  const [release, setRelease] = useState<string>("");
  const picked = release || releases.data?.stable || "";

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["singbox"] });
  };

  const install = useMutation({
    mutationFn: (version: string) => api.singbox.install(version),
    onSuccess: (view) => {
      toast.success(`Installing ${view.version}`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const uninstall = useMutation({
    mutationFn: (version: string) => api.singbox.uninstall(version),
    onSuccess: (_, version) => {
      toast.success(`Removed ${version}`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Versions</CardTitle>
        <CardDescription>
          Downloaded from GitHub for this platform; 1.14.0 or newer.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={picked}
            onValueChange={setRelease}
            disabled={!releases.data}
          >
            <SelectTrigger className="w-56">
              <SelectValue
                placeholder={
                  releases.isPending ? "Loading releases…" : "Release"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {releases.data?.versions.map((item) => (
                <SelectItem key={item.version} value={item.version}>
                  {item.version}
                  {item.version === releases.data.stable && " (stable)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => install.mutate(picked)}
            disabled={!picked || install.isPending}
          >
            <DownloadIcon /> Install
          </Button>
          {releases.error && (
            <span className="text-destructive text-sm">
              {errorMessage(releases.error)}
            </span>
          )}
        </div>

        {versions.isPending && <Loading />}
        {versions.error && <ErrorAlert error={versions.error} />}
        {versions.data && versions.data.length === 0 && (
          <p className="text-muted-foreground text-sm">Nothing installed.</p>
        )}
        {versions.data && versions.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Installation</TableHead>
                <TableHead>Runtime</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.data.map((item) => (
                <VersionRow
                  key={item.version}
                  item={item}
                  onUninstall={() => uninstall.mutate(item.version)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function VersionRow({
  item,
  onUninstall,
}: {
  item: VersionView;
  onUninstall: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {item.version}
        {item.current && <Badge className="ml-2">current</Badge>}
      </TableCell>
      <TableCell>{installation(item.installation)}</TableCell>
      <TableCell>{runtime(item.runtime)}</TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {item.platform ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        {item.installation.status === "installed" && (
          <ConfirmButton
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${item.version}`}
            title={`Remove ${item.version}?`}
            description="The binary and its schema are deleted. The current version cannot be removed."
            confirmLabel="Remove"
            onConfirm={onUninstall}
          >
            <Trash2Icon />
          </ConfirmButton>
        )}
      </TableCell>
    </TableRow>
  );
}

function installation(value: Installation): string {
  switch (value.status) {
    case "downloading":
      return value.progress.percentage === null
        ? "downloading"
        : `downloading ${value.progress.percentage}%`;
    case "installed":
      return `installed ${formatTime(value.installed_at)}`;
    case "failed":
      return `failed: ${value.error}`;
    case "not-installed":
      return "not installed";
  }
}

function runtime(value: Runtime): string {
  switch (value.status) {
    case "running":
      return `running (pid ${value.pid})`;
    case "failed":
      return `failed: ${value.error}`;
    default:
      return value.status;
  }
}
