import * as z from "zod";

// ── Wizard step types ──────────────────────────────────────────────────────

export type HostAdapter = "copilot" | "claude";

export type BackendStack =
  | "python-api"
  | "java-spring"
  | "dotnet-core"
  | "python-agentic";

export type FrontendStack =
  | "react-vite"
  | "flutter"
  | "android-compose"
  | "ios-swiftui"
  | "none";

export type BackendArchitecture =
  | "hexagonal"
  | "vertical-slice"
  | "layered"
  | "ddd-tactical";

export type FrontendArchitecture =
  | "feature-based"
  | "clean-frontend"
  | "mvvm"
  | "mvc";

export type DatabaseChoice =
  | "postgresql"
  | "mysql"
  | "mongodb"
  | "sqlite"
  | "none";

export type CloudProvider = "gcp" | "aws" | "azure" | "none";

export type CiCdTool = "github-actions" | "gitlab-ci" | "jenkins" | "none";

export type StartupDomain =
  | "fintech"
  | "healthtech"
  | "edtech"
  | "marketplace"
  | "developer-tools"
  | "ai-native"
  | "ecommerce"
  | "logistics"
  | "other";

export type DeliveryMode = "full-cycle" | "code-first" | "agentic-only";

// ── Wizard state (driven by wizard-schema.json, zero hardcode) ────────────

export const WizardStateSchema = z.object({
  projectName: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/),
  // svcName removed — wizard no longer collects it
  startupIdea: z.string().min(1).max(500).optional(),
  domain: z.enum(["fintech","healthtech","edtech","marketplace","developer-tools","ai-native","ecommerce","logistics","other"]).optional(),
  deliveryMode: z.enum(["full-cycle","code-first","agentic-only"]).default("full-cycle"),
  hostAdapter: z.enum(["copilot", "claude"]),
  backendStack: z.enum([
    "python-api",
    "java-spring",
    "dotnet-core",
    "python-agentic",
  ]),
  backendArchitecture: z
    .enum(["hexagonal", "vertical-slice", "layered", "ddd-tactical"])
    .default("hexagonal"),
  frontendStack: z
    .enum(["react-vite", "flutter", "android-compose", "ios-swiftui", "none"])
    .default("none"),
  frontendArchitecture: z
    .enum(["feature-based", "clean-frontend", "mvvm", "mvc"])
    .optional(),
  database: z
    .enum(["postgresql", "mysql", "mongodb", "sqlite", "none"])
    .default("postgresql"),
  cloud: z.enum(["gcp", "aws", "azure", "none"]).default("none"),
  cicd: z
    .enum(["github-actions", "gitlab-ci", "jenkins", "none"])
    .default("github-actions"),

  // Resolved template (step 11) — shape matches TemplateManifest
  resolvedTemplate: z
    .object({
      id: z.string(),
      name: z.string(),
      stack: z.string().optional(),
      version: z.string(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      rubricsAvailable: z.boolean().optional(),
      generatedTree: z.array(z.string()).optional(),
    })
    .optional(),

  // Final — step 12
  targetDirectory: z.string().optional(),

  // Brownfield extras
  maturityFrameworks: z.array(z.string()).optional(),
});

export type WizardState = z.infer<typeof WizardStateSchema>;

// ── Partial state for step navigation ────────────────────────────────────

export type WizardStatePartial = Partial<WizardState>;

// ── Wizard step definition (driven by wizard-schema.json) ────────────────

export interface WizardStep {
  readonly id: number;
  readonly key: keyof WizardState | "intro" | "preview" | "confirm";
  readonly title: string;
  readonly description: string;
  readonly required: boolean;
  readonly inputType: "text" | "textarea" | "intro" | "select" | "cards" | "cards-icon" | "cards-multi" | "folder" | "preview" | "confirm";
  readonly icon?: string;
  readonly columns?: 2 | 3 | 4;
  readonly options?: ReadonlyArray<{ value: string; label: string; description?: string; icon?: string; badge?: string }>;
}

// ── Config do projeto (o arquivo da marca; `ai-sdk.config.yaml` é o nome legado) ──

export const AssessmentChunkStrategySchema = z.object({
  strategy: z.enum(["by_module", "by_file", "by_size"]).default("by_module"),
  max_files_per_chunk: z.number().int().positive().optional(),
});

export type AssessmentChunkStrategy = z.infer<typeof AssessmentChunkStrategySchema>;

export const HelyxConfigSchema = z.object({
  version: z.string(),
  project: z.object({
    name: z.string(),
    slug: z.string(),
    mode: z.enum(["greenfield", "brownfield"]).optional(),
  }),
  stacks: z
    .object({
      backend: z.string(),
      frontend: z.string().optional(),
    })
    .optional(),
  host_adapter: z.string(),
  templates: z
    .object({
      resolved: z.record(
        z.string(),
        z.object({
          templateId: z.string(),
          version: z.string(),
          resolvedAt: z.string(),
        })
      ),
    })
    .optional(),
  assessment: z
    .object({
      chunk_strategy: AssessmentChunkStrategySchema.optional(),
      maturity_frameworks: z.array(z.string()).optional(),
    })
    .optional(),
});

export type HelyxConfig = z.infer<typeof HelyxConfigSchema>;

// Formato multi-repo escrito pelo Foundation (@assessor, fase skill-linking)
// para workspaces brownfield — sem project/host_adapter porque não passa
// pelo wizard single-project que produz HelyxConfigSchema.
export const HelyxBrownfieldConfigSchema = z.object({
  repos: z.record(
    z.string(),
    z.object({
      skills: z.array(z.string()),
    })
  ),
});

export type HelyxBrownfieldConfig = z.infer<typeof HelyxBrownfieldConfigSchema>;

// ── API types ────────────────────────────────────────────────────────────

export interface TemplateManifest {
  readonly id: string;
  readonly name: string;
  readonly stack: string;
  readonly version: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly rubricsAvailable: boolean;
  readonly generatedTree: readonly string[];
}
