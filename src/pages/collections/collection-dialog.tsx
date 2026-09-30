import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PatternsEditor } from "@/components/patterns-editor";
import { ErrorAlert } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Collection, Pattern } from "@/lib/types";

export function CollectionDialog({
  open,
  onOpenChange,
  name,
  collection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name?: string;
  collection?: Collection;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {name ? `Edit collection ${name}` : "New collection"}
          </DialogTitle>
        </DialogHeader>
        {open && (
          <CollectionForm
            initialName={name}
            collection={collection}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CollectionForm({
  initialName,
  collection,
  onDone,
}: {
  initialName?: string;
  collection?: Collection;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const info = useQuery({
    queryKey: ["system", "info"],
    queryFn: api.system.info,
  });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers.list,
  });

  const [name, setName] = useState(initialName ?? "");
  const [members, setMembers] = useState<string[]>(collection?.providers ?? []);
  const [format, setFormat] = useState(collection?.format ?? "base64");
  const [includes, setIncludes] = useState<Pattern[]>(
    collection?.includes ?? [],
  );
  const [excludes, setExcludes] = useState<Pattern[]>(
    collection?.excludes ?? [],
  );

  // A member may name a provider that does not exist (yet); it stays listed.
  const known = Object.keys(providers.data ?? {}).sort();
  const choices = [
    ...known,
    ...members.filter((member) => !known.includes(member)),
  ];

  const save = useMutation({
    // A PUT replaces the whole definition, tokens included, and tokens change
    // elsewhere; the ones on disk are read again so an edit cannot revoke them.
    mutationFn: async () => {
      const current = initialName
        ? await api.collections.get(initialName)
        : undefined;
      return api.collections.put(name.trim(), {
        providers: members,
        includes,
        excludes,
        format,
        tokens: current?.tokens,
      });
    },
    onSuccess: () => {
      toast.success(`Saved ${name.trim()}`);
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const toggle = (member: string, checked: boolean) =>
    setMembers(
      checked
        ? [...members, member]
        : members.filter((item) => item !== member),
    );

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="collection-name">Name</Label>
          <Input
            id="collection-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={initialName !== undefined}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label>Format</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(info.data?.formats ?? [{ name: format }]).map(({ name }) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Providers</Label>
        {choices.length === 0 && (
          <p className="text-muted-foreground text-xs">
            No providers defined yet.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {choices.map((member) => (
            <label key={member} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={members.includes(member)}
                onCheckedChange={(checked) => toggle(member, checked === true)}
              />
              {member}
              {!known.includes(member) && (
                <span className="text-destructive text-xs">(missing)</span>
              )}
            </label>
          ))}
        </div>
      </div>

      <PatternsEditor
        label="Excludes (applied first)"
        value={excludes}
        onChange={setExcludes}
      />
      <PatternsEditor
        label="Includes"
        value={includes}
        onChange={setIncludes}
      />

      {save.error && <ErrorAlert error={save.error} title="Could not save" />}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
