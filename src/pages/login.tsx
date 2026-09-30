import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ErrorAlert } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, session } from "@/lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const status = useQuery({
    queryKey: ["system", "status"],
    queryFn: api.system.status,
  });
  const firstLogin = status.data?.administrator_configured === false;

  const login = useMutation({
    mutationFn: () => api.auth.login(username, password),
    onSuccess: ({ access_token }) => {
      session.set(access_token);
      void navigate({ to: "/" });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>SubA</CardTitle>
          <CardDescription>
            {firstLogin
              ? "No administrator yet: the first sign-in creates it."
              : "Sign in to manage subscriptions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                minLength={3}
                maxLength={64}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={firstLogin ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                maxLength={128}
              />
            </div>
            {login.error && (
              <ErrorAlert error={login.error} title="Sign-in failed" />
            )}
            <Button type="submit" disabled={login.isPending}>
              {firstLogin ? "Create administrator" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
