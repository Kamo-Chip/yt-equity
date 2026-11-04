"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { submitContribution, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import styles from "./public-form.module.css";

const initial: ActionState = { ok: false, message: "" };
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : label}
    </Button>
  );
}

function ContributionFields({
  initialChannelId,
  initialMode,
  initialClaimId,
  onSuccess,
}: {
  initialChannelId: string;
  initialMode: "report" | "correction" | "dispute";
  initialClaimId?: string;
  onSuccess: (message: string) => void;
}) {
  const [channelId, setChannelId] = useState(initialChannelId);
  const [mode, setMode] = useState(initialMode);
  const [claimId, setClaimId] = useState(initialClaimId);
  const [state, action] = useActionState(submitContribution, initial);
  const [explanation, setExplanation] = useState("");
  const [sources, setSources] = useState([{ id: 0, value: "" }]);
  const nextSourceId = useRef(1);
  const [email, setEmail] = useState("");
  const [type, setType] = useState("");
  const [optionalOpen, setOptionalOpen] = useState(false);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const isDispute = mode === "dispute";
  const errors = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) onSuccess(state.message);
    else if (state.message) {
      if (state.fieldErrors?.contactEmail || state.fieldErrors?.type)
        setOptionalOpen(true);
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
    }
  }, [state, onSuccess]);

  return (
    <form
      ref={formRef}
      id="contribute"
      action={action}
      // React resets native selects after actions; preserve the draft until success.
      onReset={(event) => event.preventDefault()}
      className={`${styles.form} ${styles.card}`}
    >
      <Field>
        <FieldLabel htmlFor={`${id}-channel`}>Channel handle or ID</FieldLabel>
        <Input
          id={`${id}-channel`}
          name="channelId"
          required
          maxLength={120}
          placeholder="@channel or UC…"
          value={channelId}
          onChange={(e) => {
            setChannelId(e.target.value);
            setClaimId(undefined);
          }}
          aria-invalid={!!errors.channelId}
          aria-describedby={`${id}-channel-hint${errors.channelId ? ` ${id}-channel-error` : ""}`}
        />
        <FieldDescription id={`${id}-channel-hint`}>
          Use a YouTube handle or channel ID, rather than a full URL.
        </FieldDescription>
        {errors.channelId && (
          <FieldError id={`${id}-channel-error`}>{errors.channelId}</FieldError>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-contribution`}>
          Contribution type
        </FieldLabel>
        <NativeSelect
          id={`${id}-contribution`}
          name="contribution"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as typeof mode);
            setClaimId(undefined);
          }}
        >
          <NativeSelectOption value="report">
            Report ownership or funding
          </NativeSelectOption>
          <NativeSelectOption value="correction">
            Suggest a correction
          </NativeSelectOption>
          <NativeSelectOption value="dispute">
            Dispute a record
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      <input type="hidden" name="claimId" value={claimId ?? ""} />
      <Field>
        <FieldLabel htmlFor={`${id}-explanation`}>
          {isDispute ? "What needs correcting?" : "What should we know?"}
        </FieldLabel>
        <Textarea
          id={`${id}-explanation`}
          name="explanation"
          required
          minLength={10}
          maxLength={4000}
          rows={3}
          placeholder={
            isDispute
              ? "For example: This ownership record is outdated. The company sold its stake in…"
              : mode === "report"
                ? "For example: This channel was acquired by…"
                : "For example: The channel’s owner has changed to…"
          }
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          aria-invalid={!!errors.explanation}
          aria-describedby={
            errors.explanation ? `${id}-explanation-error` : undefined
          }
        />
        {errors.explanation && (
          <FieldError id={`${id}-explanation-error`}>
            {errors.explanation}
          </FieldError>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-source-0`}>Source link</FieldLabel>
        <FieldDescription id={`${id}-source-hint`}>
          Link to an announcement, article, or other evidence.
        </FieldDescription>
        <div className={styles.links}>
          {sources.map((source, index) => {
            const error =
              errors[`sources.${index}`] ??
              (index === 0 ? errors.sources : undefined);
            return (
              <div className={styles.linkRow} key={source.id}>
                <div className={styles.linkField}>
                  <Input
                    id={`${id}-source-${source.id}`}
                    name="sources"
                    type="url"
                    required
                    maxLength={2048}
                    aria-label={
                      index === 0 ? undefined : `Source link ${index + 1}`
                    }
                    placeholder="https://example.com/article"
                    value={source.value}
                    onChange={(e) =>
                      setSources((items) =>
                        items.map((item) =>
                          item.id === source.id
                            ? { ...item, value: e.target.value }
                            : item,
                        ),
                      )
                    }
                    aria-invalid={!!error}
                    aria-describedby={`${id}-source-hint${error ? ` ${id}-source-error-${source.id}` : ""}`}
                  />
                  {error && (
                    <FieldError id={`${id}-source-error-${source.id}`}>
                      {error}
                    </FieldError>
                  )}
                </div>
                {index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove source link ${index + 1}`}
                    onClick={() => {
                      setSources((items) =>
                        items.filter((item) => item.id !== source.id),
                      );
                      document.getElementById(`${id}-source-0`)?.focus();
                    }}
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {sources.length < 5 && (
          <Button
            type="button"
            variant="ghost"
            className={styles.addLink}
            onClick={() => {
              const sourceId = nextSourceId.current++;
              setSources((items) => [...items, { id: sourceId, value: "" }]);
              requestAnimationFrame(() =>
                document.getElementById(`${id}-source-${sourceId}`)?.focus(),
              );
            }}
          >
            <Plus size={16} />
            Add another link
          </Button>
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
          {!isDispute && (
            <Field>
              <FieldLabel htmlFor={`${id}-type`}>
                Relationship (optional)
              </FieldLabel>
              <NativeSelect
                id={`${id}-type`}
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-invalid={!!errors.type}
                aria-describedby={errors.type ? `${id}-type-error` : undefined}
              >
                <NativeSelectOption value="">Not sure</NativeSelectOption>
                <NativeSelectOption value="funding">Funding</NativeSelectOption>
                <NativeSelectOption value="acquisition">
                  Acquisition
                </NativeSelectOption>
              </NativeSelect>
              {errors.type && (
                <FieldError id={`${id}-type-error`}>{errors.type}</FieldError>
              )}
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor={`${id}-email`}>Email (optional)</FieldLabel>
            <Input
              id={`${id}-email`}
              name="contactEmail"
              type="email"
              autoComplete="email"
              maxLength={320}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.contactEmail}
              aria-describedby={`${id}-email-hint${errors.contactEmail ? ` ${id}-email-error` : ""}`}
            />
            <FieldDescription id={`${id}-email-hint`}>
              In case we need more information.
            </FieldDescription>
            {errors.contactEmail && (
              <FieldError id={`${id}-email-error`}>
                {errors.contactEmail}
              </FieldError>
            )}
          </Field>
        </div>
      </details>
      {state.message && !state.ok && (
        <p className={`${styles.message} ${styles.error}`} role="alert">
          {state.message}
        </p>
      )}
      <SubmitButton
        label={
          isDispute
            ? "Send dispute"
            : mode === "report"
              ? "Send report"
              : "Suggest update"
        }
      />
    </form>
  );
}

export function ContributionForm({
  channelId = "",
  mode = "report",
  claimId,
}: {
  channelId?: string;
  mode?: "report" | "correction" | "dispute";
  claimId?: string;
}) {
  const [draft, setDraft] = useState(0);
  const [confirmation, setConfirmation] = useState("");
  return confirmation ? (
    <div className={styles.success}>
      <div role="status" tabIndex={-1} ref={(element) => element?.focus()}>
        <strong>Report sent</strong>
        <p>{confirmation}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setConfirmation("");
          setDraft((value) => value + 1);
        }}
      >
        Submit another report
      </Button>
    </div>
  ) : (
    <ContributionFields
      key={draft}
      initialChannelId={draft ? "" : channelId}
      initialMode={draft ? "report" : mode}
      initialClaimId={draft ? undefined : claimId}
      onSuccess={setConfirmation}
    />
  );
}
