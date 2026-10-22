import { useLayoutEffect, useRef, useState } from "react";
import { KeyRoundIcon } from "lucide-react";

import { CopyButton } from "@/components/shared";
import { api } from "@/lib/api";
import { validGenerationName } from "@/lib/generate";
import type { GenerateCommand } from "@/lib/types";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { toast } from "@/ui/notify";
import { Popover } from "@/ui/popover";
import { Select } from "@/ui/select";
import { buttonClass } from "@/ui/styles";

const COMMANDS: { command: GenerateCommand; needs?: "name" | "length" }[] = [
  { command: "uuid" },
  { command: "reality-keypair" },
  { command: "wg-keypair" },
  { command: "vapid-keypair" },
  { command: "rand", needs: "length" },
  { command: "tls-keypair", needs: "name" },
  { command: "ech-keypair", needs: "name" },
];

export function Generator({ iconOnly = false }: { iconOnly?: boolean }) {
  const [command, setCommand] = useState<GenerateCommand>("uuid");
  const [argument, setArgument] = useState("");
  const [pending, setPending] = useState(false);
  const [output, setOutput] = useState<string>();
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const needs = COMMANDS.find((item) => item.command === command)?.needs;
  const length = Number(argument);
  const invalid =
    needs === "name"
      ? !validGenerationName(argument)
      : needs === "length" &&
        (!Number.isInteger(length) || length < 1 || length > 4096);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const generate = async () => {
    if (inFlight.current || invalid) return;
    inFlight.current = true;
    setPending(true);
    setOutput(undefined);
    try {
      // Mutation caches outlive dialogs and must not retain generated credentials.
      const result = await api.singbox.generate(
        command,
        needs === "name" ? argument : undefined,
        needs === "length" ? length : undefined,
      );
      if (!mounted.current) return;
      if (
        result.command !== command ||
        typeof result.output !== "string" ||
        !result.output.trim()
      ) {
        throw new Error("generate.output: unexpected format");
      }
      setOutput(result.output);
    } catch {
      if (mounted.current) toast.error("generate.command: generation failed");
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  };

  return (
    <Popover
      align="end"
      className="w-88"
      trigger={
        <button
          type="button"
          aria-label={iconOnly ? "Generate Keys" : undefined}
          title={iconOnly ? "Generate Keys" : undefined}
          className={buttonClass("secondary", "md", iconOnly)}
        >
          <KeyRoundIcon />
          {!iconOnly && "Generate"}
        </button>
      }
    >
      <div className="grid gap-3">
        <p className="text-xs text-fg-muted">
          Copy the result into any field. This tool does not change the draft.
        </p>
        <div className="flex gap-2">
          <Select<GenerateCommand>
            className="flex-1 font-mono"
            aria-label="Command"
            value={command}
            disabled={pending}
            onChange={(next) => {
              setCommand(next);
              setArgument("");
              setOutput(undefined);
            }}
            options={COMMANDS.map((item) => ({
              value: item.command,
              label: item.command,
            }))}
          />
          <Button
            variant="primary"
            disabled={invalid}
            // Preserve the popover's keyboard focus while generation is pending.
            aria-disabled={pending || invalid}
            className={pending ? "opacity-50" : undefined}
            onClick={() => void generate()}
          >
            {pending ? "Generating…" : "Generate"}
          </Button>
        </div>
        {needs && (
          <Input
            type={needs === "length" ? "number" : "text"}
            aria-label={needs === "length" ? "Bytes" : "Server Name"}
            placeholder={needs === "length" ? "Bytes" : "Server Name"}
            min={needs === "length" ? 1 : undefined}
            max={needs === "length" ? 4096 : undefined}
            value={argument}
            disabled={pending}
            onChange={(event) => {
              setArgument(event.target.value);
              setOutput(undefined);
            }}
          />
        )}
        {output !== undefined && (
          <div className="relative rounded-md bg-bg-muted p-3 pr-10">
            <pre className="max-h-64 overflow-auto font-mono text-xs break-all whitespace-pre-wrap text-fg">
              {output}
            </pre>
            <div className="absolute top-1.5 right-1.5">
              <CopyButton text={output} />
            </div>
          </div>
        )}
      </div>
    </Popover>
  );
}
