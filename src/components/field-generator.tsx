import { useLayoutEffect, useRef, useState } from "react";
import { KeyRoundIcon } from "lucide-react";

import { CopyButton } from "@/components/shared";
import { api } from "@/lib/api";
import {
  applyGeneratedFields,
  generatedFields,
  validGenerationName,
  type FieldGeneration,
  type GeneratedFields,
} from "@/lib/generate";
import { humanize } from "@/lib/humanize";
import type { JsonObject } from "@/lib/schema";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { toast } from "@/ui/notify";
import { Popover } from "@/ui/popover";

export function FieldGenerator({
  plan,
  value,
  onChange,
}: {
  plan: FieldGeneration;
  value: JsonObject;
  onChange: (value: JsonObject) => void;
}) {
  const [name, setName] = useState(plan.name ?? "");
  const [pending, setPending] = useState(false);
  const [companion, setCompanion] = useState<GeneratedFields["companion"]>();
  const latest = useRef<{
    value: JsonObject;
    onChange: typeof onChange;
  } | null>(null);
  const inFlight = useRef(false);
  const invalidName = plan.name !== undefined && !validGenerationName(name);
  useLayoutEffect(() => {
    latest.current = { value, onChange };
    return () => {
      latest.current = null;
    };
  }, [value, onChange]);

  const generate = async () => {
    if (inFlight.current || invalidName) return;
    inFlight.current = true;
    setPending(true);
    setCompanion(undefined);
    try {
      // Mutation caches outlive dialogs; credentials belong only to the draft.
      const result = await api.singbox.generate(
        plan.command,
        plan.name === undefined ? undefined : name,
        plan.length,
      );
      if (!latest.current) return;
      if (result.command !== plan.command) {
        throw new Error("generate.output: unexpected command");
      }
      const generated = generatedFields(plan, result.output);
      const next = applyGeneratedFields(latest.current.value, value, generated);
      if (!next) {
        toast.error("generate.fields: the form changed; generate again");
        return;
      }
      latest.current.onChange(next);
      setCompanion(generated.companion);
    } catch {
      if (latest.current) {
        toast.error("generate.fields: generation failed; fields were not changed");
      }
    } finally {
      inFlight.current = false;
      if (latest.current) setPending(false);
    }
  };

  return (
    <Popover
      align="end"
      className="w-80"
      trigger={
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Generate ${plan.fields.map(humanize).join(" and ")}`}
        >
          <KeyRoundIcon />
          Generate
        </Button>
      }
    >
      <div className="grid gap-3">
        <span className="font-mono text-xs text-fg-muted">
          sing-box generate {plan.command}
        </span>
        <p className="text-xs text-fg-muted">
          Replaces {plan.fields.map(humanize).join(" and ")} in this draft.
          Apply and Save to keep the result.
        </p>
        {plan.name !== undefined && (
          <Input
            aria-label="Server Name"
            placeholder="Server Name"
            value={name}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        <Button
          variant="primary"
          disabled={invalidName}
          // Keep keyboard focus inside the popover while the request is pending.
          aria-disabled={pending || invalidName}
          className={pending ? "opacity-50" : undefined}
          onClick={() => void generate()}
        >
          {pending ? "Generating…" : "Generate and Fill"}
        </Button>
        {companion && (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between text-xs text-fg-muted">
              {companion.label}
              <CopyButton text={companion.value} />
            </div>
            <pre className="max-h-48 overflow-auto rounded-md bg-bg-muted p-2 font-mono text-xs break-all whitespace-pre-wrap">
              {companion.value}
            </pre>
          </div>
        )}
      </div>
    </Popover>
  );
}
