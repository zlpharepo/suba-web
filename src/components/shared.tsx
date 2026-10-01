import { useState } from "react";
import { CheckIcon, CopyIcon, PlusIcon, XIcon } from "lucide-react";

import {
  makePattern,
  PATTERN_KINDS,
  patternKind,
  patternText,
} from "@/lib/pattern";
import type { Pattern, PatternKind } from "@/lib/types";
import { Button, IconButton } from "@/ui/button";
import { Input } from "@/ui/input";
import { Select } from "@/ui/select";
import { toast } from "@/ui/notify";

/** The include/exclude lists, one row per pattern. */
export function PatternsEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Pattern[];
  onChange: (value: Pattern[]) => void;
}) {
  const replace = (index: number, pattern: Pattern) =>
    onChange(value.map((item, at) => (at === index ? pattern : item)));

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-fg">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange([...value, makePattern("keyword", "")])}
        >
          <PlusIcon />
          Add
        </Button>
      </div>
      {value.map((pattern, index) => (
        <div key={index} className="flex gap-2">
          {/* `controlClass` carries `w-full`, so the width lives on a wrapper. */}
          <div className="w-24 shrink-0 sm:w-28">
            <Select<PatternKind>
              aria-label="Match by"
              value={patternKind(pattern)}
              onChange={(kind) =>
                replace(index, makePattern(kind, patternText(pattern)))
              }
              options={PATTERN_KINDS.map((kind) => ({
                value: kind,
                label: kind,
              }))}
            />
          </div>
          <Input
            className="font-mono"
            value={patternText(pattern)}
            onChange={(event) =>
              replace(
                index,
                makePattern(patternKind(pattern), event.target.value),
              )
            }
            placeholder={patternKind(pattern) === "regex" ? "^US" : "text"}
          />
          <IconButton
            label="Remove"
            onClick={() => onChange(value.filter((_, at) => at !== index))}
          >
            <XIcon />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  return (
    <IconButton
      label={label}
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          },
          () => toast.error("Copying needs a secure (https) page"),
        );
      }}
    >
      {done ? <CheckIcon className="text-success" /> : <CopyIcon />}
    </IconButton>
  );
}
