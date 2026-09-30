import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTime } from "@/lib/format";
import type { NodeView } from "@/lib/types";

export function NodeTable({ nodes }: { nodes: NodeView[] }) {
  if (nodes.length === 0) {
    return <p className="text-muted-foreground text-sm">No nodes.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Protocol</TableHead>
          <TableHead>Endpoint</TableHead>
          <TableHead>Sources</TableHead>
          <TableHead>First seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nodes.map((node) => (
          <TableRow
            key={node.id}
            className={node.orphan ? "opacity-60" : undefined}
          >
            <TableCell className="font-medium">
              {node.name ?? (
                <span className="text-muted-foreground">unnamed</span>
              )}
              {node.orphan && (
                <Badge variant="outline" className="ml-2">
                  orphan
                </Badge>
              )}
            </TableCell>
            <TableCell>{node.protocol ?? "—"}</TableCell>
            <TableCell className="font-mono text-xs">
              {node.endpoint ?? "—"}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {node.sources.map((source) => (
                  <Badge
                    key={source.provider}
                    variant={source.serving ? "secondary" : "outline"}
                    title={source.name ?? undefined}
                  >
                    {source.provider}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {formatTime(node.first_seen)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
