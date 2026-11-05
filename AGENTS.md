# Engineering standards

- Fastify owns database access, authentication, authorization, validation, business rules, and mutations. Keep database clients and SQL out of Next.js.
- Use shared Zod contracts and typed errors; distinguish authentication, permission, validation, conflict, and service failures.
- Infer auth types from Better Auth. Keep roles server-controlled (`input: false`), enforce permissions in Fastify, and retain CSRF/origin checks. Never log secrets, cookies, tokens, or magic links.
- Separate internal and public URLs, validate required configuration at startup, and never expose internal URLs to the browser.
- Use supported transactions for mutations and audit records. Submission approval does not publish or change directory content; public claims must be explicitly published and confirmed.
- Reproduce defects, verify the affected behavior and browser/API boundary, and report verification limits. Use `pnpm check` and relevant package tests.
- Remove superseded flows and preserve unrelated work. Keep the README focused on setup, development, and concise deployment steps; do not add publishing guides or historical verification reports.
