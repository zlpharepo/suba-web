import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  makePattern,
  PATTERN_KINDS,
  patternKind,
  patternText,
} from "@/lib/pattern";
import type { Pattern, PatternKind } from "@/lib/types";

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
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onChange([...value, makePattern("keyword", "")])}
        >
          <PlusIcon /> Add
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-muted-foreground text-xs">None.</p>
      )}
      {value.map((pattern, index) => (
        <div key={index} className="flex gap-2">
          <Select
            value={patternKind(pattern)}
            onValueChange={(kind) =>
              replace(
                index,
                makePattern(kind as PatternKind, patternText(pattern)),
              )
            }
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PATTERN_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {kind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={patternText(pattern)}
            onChange={(event) =>
              replace(
                index,
                makePattern(patternKind(pattern), event.target.value),
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove pattern"
            onClick={() => onChange(value.filter((_, at) => at !== index))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
