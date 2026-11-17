/**
 * state-yaml.shared.pure.ts — o carregador YAML dos parsers de estado
 * (`initiatives.yaml`, `delivery-state.yaml`, `foundation-state.yaml`,
 * `repos.yaml`, `context-repos.yaml`, `repo-graph.yaml`, `sprint-backlog.yaml`
 * e os 4 de Operation).
 *
 * M5 / H-BUG-34 (F3.3): com o `DEFAULT_SCHEMA` do js-yaml, uma data sem
 * aspas (`completed_at: 2025-04-11`, que agentes, editores e o `yaml.stringify`
 * padrão escrevem) virava `Date`, e os parsers, que só aceitam texto,
 * descartavam o campo em silêncio — ou rejeitavam o item inteiro, quando o
 * campo era obrigatório. Este esquema é o `DEFAULT_SCHEMA` sem o tipo
 * implícito `timestamp`: a data chega como o texto que está no arquivo, sem
 * conversão de fuso nem de formato. Todo o resto (merge `<<`, `!!binary`,
 * `!!omap`, `!!pairs`, `!!set`) continua igual.
 */
import * as yaml from "js-yaml";

/** `yaml.types` existe no js-yaml 4 em runtime, mas não está nos tipos do `@types/js-yaml`. */
const YAML_TYPES = (yaml as unknown as { types: Record<"merge" | "binary" | "omap" | "pairs" | "set", yaml.Type> }).types;

export const STATE_YAML_SCHEMA = yaml.CORE_SCHEMA.extend({
  implicit: [YAML_TYPES.merge],
  explicit: [YAML_TYPES.binary, YAML_TYPES.omap, YAML_TYPES.pairs, YAML_TYPES.set],
});

/** `yaml.load` com o esquema dos arquivos de estado. Lança no YAML inválido, como antes; quem chama trata. */
export function loadStateYaml(raw: string, options?: { json?: boolean }): unknown {
  return yaml.load(raw, { schema: STATE_YAML_SCHEMA, ...(options?.json ? { json: true } : {}) });
}
