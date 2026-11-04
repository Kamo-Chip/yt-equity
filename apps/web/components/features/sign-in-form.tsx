"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { requestMagicLink, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import styles from "./public-form.module.css";
function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending}>
      {pending ? "Sending…" : "Email sign-in link"}
    </Button>
  );
}
export function SignInForm() {
  const [state, action] = useActionState(requestMagicLink, {
    ok: false,
    message: "",
  } satisfies ActionState);
  const [email, setEmail] = useState("");
  return (
    <form action={action} className={`mt-6 ${styles.form} ${styles.card}`}>
      <Field>
        <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
        <Input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          maxLength={320}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={state.message ? "sign-in-message" : undefined}
        />
      </Field>
      {state.message && (
        <p
          id="sign-in-message"
          role={state.ok ? "status" : "alert"}
          className={`${styles.message} ${state.ok ? "text-muted-foreground" : styles.error}`}
        >
          {state.message}
        </p>
      )}
      <Submit />
    </form>
  );
}
