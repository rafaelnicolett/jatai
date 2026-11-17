/**
 * egress-hosts.ts — a allowlist de hosts dos bundles e os domínios proibidos
 * do teste de zero egress (F2.1, ADR-0015), num lugar só para quem mais
 * confere bundle (o servidor MCP que o kit instala, ADR-0025).
 */

/**
 * Hosts aceitos nos bundles. Vêm de dependências (identificadores de JSON
 * Schema, links de documentação em mensagens de erro) e do conteúdo dos
 * scaffolds. Nenhum é chamado pela extensão.
 */
export const BUNDLE_HOST_ALLOWLIST: Record<string, string> = {
  "127.0.0.1": "State Service local",
  localhost: "texto do scaffold (URL de dev do projeto gerado)",
  "www.w3.org": "namespaces XML/SVG",
  "maven.apache.org": "pom.xml gerado",
  "schemas.android.com": "AndroidManifest.xml gerado",
  "12factor.net": "texto de checklist",
  "github.com": "dependência do Package.swift gerado; links de documentação de dependências (jszip, MCP SDK); URLs do repositório em brand.json › urls",
  // Marca como dado (ADR-0013, F1.2): o brand.json vai inteiro para o bundle,
  // com as URLs que só o package.json usa. Nenhum código as acessa.
  "jatai.io": "homepage da marca (brand.json › urls.homepage), embutida no bundle com o resto da marca; nunca é chamada",
  "gist.github.com": "link de documentação numa dependência do MCP SDK",
  "raw.githubusercontent.com": "`$id` de JSON Schema do ajv (identificador, não é baixado)",
  "json-schema.org": "`$schema`/`$id` de JSON Schema (identificador, não é baixado)",
  "spec.openapis.org": "`$id` de schema OpenAPI numa dependência do MCP SDK",
  "tools.ietf.org": "links de RFC em comentários/mensagens de dependências",
  "stuk.github.io": "link de documentação do jszip numa mensagem de erro",
  "example.com": "exemplo em documentação de dependência",
  "mathiasbynens.be": "link em comentário de dependência",
  "stackoverflow.com": "link em comentário de dependência",
  "opencode.ai": "`$schema` do opencode.json gerado pelo kit; identificador, não é baixado",
  "www.safaribooksonline.com": "link em comentário de dependência",
};

/** Domínios privados e de terceiros cortados na F2.1: não podem voltar em lugar nenhum. */
export const FORBIDDEN_HOSTS = /(^|\.)(helyx\.app|helyx\.build|helyx\.dev|simpleicons\.org)$/;

/** Hosts citados em URLs `http(s)://` do texto, em minúsculas. */
export function hostsIn(text: string): Set<string> {
  return new Set([...text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)].map((m) => m[1]!.toLowerCase()));
}
