import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ErrorAlert, Loading, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";

export function OverviewPage() {
  const info = useQuery({
    queryKey: ["system", "info"],
    queryFn: api.system.info,
  });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers.list,
  });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: api.collections.list,
  });
  const core = useQuery({
    queryKey: ["singbox"],
    queryFn: api.singbox.get,
    retry: false,
  });

  return (
    <>
      <PageHeader title="Overview" />
      <div className="grid gap-4 md:grid-cols-3">
        <Count
          title="Providers"
          to="/providers"
          count={providers.data && Object.keys(providers.data).length}
        />
        <Count
          title="Collections"
          to="/collections"
          count={collections.data && Object.keys(collections.data).length}
        />
        {core.isSuccess && (
          <Card>
            <CardHeader>
              <CardDescription>sing-box</CardDescription>
              <CardTitle>
                <Link to="/sing-box" className="hover:underline">
                  {core.data.running ? "Running" : "Stopped"}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              {core.data.version
                ? `Version ${core.data.version}`
                : "No version chosen"}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Formats this build serves</CardTitle>
        </CardHeader>
        <CardContent>
          {info.isPending && <Loading />}
          {info.error && <ErrorAlert error={info.error} />}
          {info.data && (
            <div className="grid gap-3">
              {info.data.formats.map((format) => (
                <div
                  key={format.name}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Badge>{format.name}</Badge>
                  {format.protocols.support === "everything" ? (
                    <span className="text-muted-foreground text-sm">
                      every protocol
                    </span>
                  ) : (
                    format.protocols.kinds.map((kind) => (
                      <Badge key={kind} variant="outline">
                        {kind}
                      </Badge>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Count({
  title,
  to,
  count,
}: {
  title: string;
  to: string;
  count: number | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">
          <Link to={to} className="hover:underline">
            {count ?? "—"}
          </Link>
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
