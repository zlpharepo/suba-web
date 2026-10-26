import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  DownloadIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";

import { CopyButton } from "@/components/shared";
import { errorMessage } from "@/lib/api";
import { useDraftProtection } from "@/lib/draft-protection";
import { useApi } from "@/lib/target";
import type { DeliveryToken } from "@/lib/types";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Menu } from "@/ui/popover";
import { toast } from "@/ui/notify";
import { buttonClass } from "@/ui/styles";

/** The subscription links of whatever owns them, a collection or a user. */
export function DeliveryLinks({
  links,
  mint,
  revoke,
  onChange,
}: {
  links: DeliveryToken[];
  /** Mints a link under `label`; an existing one is replaced, which is how a link rotates. */
  mint: (label: string) => Promise<unknown>;
  revoke: (label: string) => Promise<unknown>;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  const minting = useMutation({
    mutationFn: mint,
    onSuccess: () => {
      setLabel("");
      setAdding(false);
      onChange();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const revoking = useMutation({
    mutationFn: revoke,
    onSuccess: onChange,
    onError: (error) => toast.error(errorMessage(error)),
  });

  useDraftProtection({
    dirty: adding && label !== "",
    saving: minting.isPending || revoking.isPending,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    minting.mutate(label.trim());
  };

  return (
    <div className="border-t border-border">
      {links.map((link) => (
        <TokenRow
          key={link.name}
          link={link}
          onRotate={() => minting.mutate(link.name)}
          onRevoke={() => revoking.mutate(link.name)}
        />
      ))}
      {adding ? (
        <form className="flex items-center gap-2 px-4 py-2.5" onSubmit={submit}>
          <Input
            autoFocus
            placeholder="Name, e.g. phone"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            pattern="[A-Za-z0-9._\-]{1,64}"
            title="1-64 letters, digits, dot, underscore or dash"
            required
            className="h-7 max-w-56"
          />
          <Button size="sm" variant="primary" type="submit" disabled={minting.isPending}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
        >
          <KeyRoundIcon className="size-3.5" />
          {links.length === 0 ? "Add a subscription link" : "Add another link"}
        </button>
      )}
    </div>
  );
}

function TokenRow({
  link,
  onRotate,
  onRevoke,
}: {
  link: DeliveryToken;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const api = useApi();
  const url = api.subscriptionUrl(link.path, window.location.origin);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 last-of-type:border-b-0 sm:gap-3">
      <span className="w-20 shrink-0 truncate text-[13px] font-medium text-fg sm:w-28">
        {link.name}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">{url}</code>
      <div className="flex shrink-0 items-center">
        <CopyButton text={url} label="Copy link" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open"
          title="Open"
          className={buttonClass("ghost", "sm", true)}
        >
          <ExternalLinkIcon />
        </a>
        <Menu
          trigger={
            <button type="button" aria-label="More" className={buttonClass("ghost", "sm", true)}>
              <MoreHorizontalIcon />
            </button>
          }
          items={[
            {
              label: "Download",
              icon: <DownloadIcon />,
              onSelect: () => window.open(`${url}/download`, "_self"),
            },
            {
              label: "Rotate",
              icon: <RotateCwIcon />,
              onSelect: () => setConfirm("rotate"),
            },
            "separator",
            {
              label: "Revoke",
              icon: <Trash2Icon />,
              danger: true,
              onSelect: () => setConfirm("revoke"),
            },
          ]}
        />
      </div>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        width="sm"
        title={confirm === "rotate" ? `Rotate ${link.name}?` : `Revoke ${link.name}?`}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm === "rotate") onRotate();
                else onRevoke();
                setConfirm(null);
              }}
            >
              {confirm === "rotate" ? "Rotate" : "Revoke"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-muted">
          {confirm === "rotate"
            ? "This link stops working and a new one replaces it."
            : "This link stops working."}
        </p>
      </Dialog>
    </div>
  );
}
