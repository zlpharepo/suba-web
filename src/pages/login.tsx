import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api, session } from "@/lib/api";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import { ErrorNote } from "@/ui/misc";

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
    <div className="grid min-h-dvh place-items-center bg-bg-subtle px-4">
      <div className="w-full max-w-[22rem]">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-fg text-base font-bold text-bg">
            S
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            {firstLogin ? "Create the administrator" : "Sign in to SubA"}
          </h1>
        </div>
        <form
          className="grid gap-4 rounded-lg border border-border bg-bg p-5 shadow-[0_1px_2px_0_oklch(0_0_0/0.04)]"
          onSubmit={submit}
        >
          <Field label="Username">
            <Input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={64}
              autoFocus
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete={firstLogin ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              maxLength={128}
            />
          </Field>
          {login.error && <ErrorNote error={login.error} />}
          <Button
            type="submit"
            variant="primary"
            disabled={login.isPending}
            className="mt-1 w-full"
          >
            {firstLogin ? "Create and sign in" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
