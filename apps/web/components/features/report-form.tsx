"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { submitReport, type ReportState } from "@/app/actions";
import styles from "./public-form.module.css";

const initial: ReportState = {
  ok: false,
  message: "",
  values: { explanation: "", contactEmail: "" },
};
function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send report"}
    </Button>
  );
}
export function ReportForm() {
  const [state, action] = useActionState(submitReport, initial);
  const [explanation, setExplanation] = useState("");
  const [email, setEmail] = useState("");
  const [optionalOpen, setOptionalOpen] = useState(false);
  const errors = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.fieldErrors?.contactEmail) setOptionalOpen(true);
    if (state.fieldErrors)
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
  }, [state]);
  if (state.ok)
    return (
      <div className={styles.success} role="status">
        <strong>Report sent</strong>
        <p>Thank you for helping improve YT Equity.</p>
      </div>
    );
  return (
    <form action={action} className={`${styles.form} ${styles.card}`}>
      <Field>
        <FieldLabel htmlFor="report-explanation">What happened?</FieldLabel>
        <Textarea
          id="report-explanation"
          name="explanation"
          required
          minLength={10}
          maxLength={4000}
          rows={3}
          placeholder="For example: A source link on a channel page no longer works…"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          aria-invalid={!!errors.explanation}
          aria-describedby={
            errors.explanation ? "report-explanation-error" : undefined
          }
        />
        {errors.explanation && (
          <FieldError id="report-explanation-error">
            {errors.explanation}
          </FieldError>
        )}
      </Field>
      <details
        className={styles.optional}
        open={optionalOpen}
        onToggle={(e) => setOptionalOpen(e.currentTarget.open)}
        onInvalidCapture={() => setOptionalOpen(true)}
      >
        <summary>Optional details</summary>
        <div className={styles.optionalContent}>
          <Field>
            <FieldLabel htmlFor="report-email">Email (optional)</FieldLabel>
            <Input
              id="report-email"
              name="contactEmail"
              type="email"
              autoComplete="email"
              maxLength={320}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.contactEmail}
              aria-describedby={`report-email-hint${errors.contactEmail ? " report-email-error" : ""}`}
            />
            <FieldDescription id="report-email-hint">
              In case we need more information.
            </FieldDescription>
            {errors.contactEmail && (
              <FieldError id="report-email-error">
                {errors.contactEmail}
              </FieldError>
            )}
          </Field>
        </div>
      </details>
      {state.message && (
        <p className={`${styles.message} ${styles.error}`} role="alert">
          {state.message}
        </p>
      )}
      <SendButton />
    </form>
  );
}
