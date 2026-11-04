import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

// Keep email-safe inline styles aligned with the web light theme and auth card.
const fontFamily = "Arial, Helvetica, sans-serif";

export function EmailFrame({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f7f8fa", color: "#171717", fontFamily, margin: "0" }}>
        <Section style={{ padding: "40px 20px" }}>
          <Container style={{ maxWidth: "480px" }}>
            <Text style={{ color: "#171717", fontSize: "16px", fontWeight: 700, margin: "0 0 24px" }}>
              YT Equity
            </Text>
            <Section style={{ backgroundColor: "#ffffff", border: "1px solid #e5e5e5", borderRadius: "20px", boxShadow: "0 12px 40px -14px rgba(15, 23, 42, 0.18), 0 1px 4px rgba(15, 23, 42, 0.05)", padding: "28px" }}>
              {children}
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return <Heading style={{ color: "#171717", fontFamily, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.6px", lineHeight: "1.3", margin: "0 0 12px" }}>{children}</Heading>;
}

export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return <Button href={href} style={{ backgroundColor: "#171717", borderRadius: "8px", color: "#ffffff", fontFamily, fontSize: "14px", fontWeight: 500, lineHeight: "20px", margin: "8px 0", padding: "10px 16px", textDecoration: "none" }}>{children}</Button>;
}

export function EmailCopy({ children }: { children: ReactNode }) {
  return <Text style={{ color: "#666666", fontFamily, fontSize: "14px", lineHeight: "24px", margin: "16px 0" }}>{children}</Text>;
}
