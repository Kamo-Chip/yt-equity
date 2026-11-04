import { defineRailway, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/web/Dockerfile",
      watchPatterns: ["/apps/web/**", "/packages/contracts/**", "/scripts/validate-env.mjs", "/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/tsconfig.json", "/.dockerignore", "/.railway/**"],
    },
    deploy: { sleepApplication: false, restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    healthcheck: "/health",
    healthcheckTimeout: 300,
    replicas: { "us-east4-eqdc4a": 1 },
    domains: [{ domain: "www.ytequity.com", port: 3000 }],
  });
  const api = service("api", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/api/Dockerfile",
      watchPatterns: ["/apps/api/**", "/packages/db/**", "/packages/contracts/**", "/scripts/validate-env.mjs", "/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/tsconfig.json", "/.dockerignore", "/.railway/**"],
    },
    preDeploy: "pnpm db:migrate",
    deploy: { preDeployTimeoutSeconds: 300, sleepApplication: false, restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    replicas: { "us-east4-eqdc4a": 1 },
    domains: [{ domain: "api.ytequity.com", port: 4000 }],
  });

  return project("yt-equity", {
    variables: { managed: false },
    resources: [web, api],
  });
});
