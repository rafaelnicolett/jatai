#!/bin/sh
# ci-local.sh: roda aqui os mesmos passos do CI (.github/workflows/ci.yml), na
# mesma ordem, e termina com uma tabela de resumo. F0.3, mod-missao-open-source.
#
# Uso: npm run ci:local [-- --skip-install]
#   --skip-install  não roda os dois `npm ci` e usa o node_modules que já existe.
#                   O `npm ci` apaga e recria node_modules/; use isto quando
#                   outro processo estiver usando a pasta.
#   CI_LOCAL_TMPDIR=<pasta> muda onde ficam os logs e o .vsix (padrão: $TMPDIR).
#
# Diferenças em relação ao CI, todas avisadas na saída:
#   - sem matriz: roda no sistema e no Node desta máquina. O CI roda em ubuntu,
#     macos e windows, com Node 20;
#   - gitleaks: roda só se o binário estiver no PATH. Sem ele, o passo sai
#     PULADO e a varredura fica para o job `security` do CI;
#   - árvore limpa: compara o cksum do kit (kit/, inclusive os bundles do CLI e do
#     MCP em kit/scripts/) antes e depois. Com git próprio, compara também o
#     `git status`. O CI exige `git status` vazio;
#   - DCO: só com git próprio e uma branch `main`. No GitHub roda em todo PR
#     (dco.yml).
# Um passo que falha não interrompe os seguintes, para o resumo sair completo.
#
# Mantenha em sincronia com .github/workflows/ci.yml.

set -u

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P) || exit 2
cd "$ROOT" || exit 2

SKIP_INSTALL=0
for arg in "$@"; do
  case $arg in
    --skip-install) SKIP_INSTALL=1 ;;
    -h | --help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    *)
      printf 'ci-local: opção desconhecida: %s (veja --help)\n' "$arg" >&2
      exit 2
      ;;
  esac
done

# Mesmo ambiente de npm do CI (vale também para o `npm ci` interno do build:webview).
npm_config_audit=false
npm_config_fund=false
npm_config_update_notifier=false
export npm_config_audit npm_config_fund npm_config_update_notifier

TMP=$(mktemp -d "${CI_LOCAL_TMPDIR:-${TMPDIR:-/tmp}}/jatai-ci-local.XXXXXX") || exit 2
SUMMARY="$TMP/resumo.tsv"
: > "$SUMMARY"
ESC=$(printf '\033')
if [ -t 1 ]; then BOLD="${ESC}[1m" RESET="${ESC}[0m"; else BOLD='' RESET=''; fi
STEP=0
FAILED=0
LAST_STATUS=0

# ── Infra ────────────────────────────────────────────────────────────────────

record() { # status, nome, segundos, detalhe
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$SUMMARY"
}

detail_for() { # extrator, log
  sed "s/${ESC}\[[0-9;]*[A-Za-z]//g" "$2" > "$TMP/limpo.log"
  clean="$TMP/limpo.log"
  case $1 in
    npm) grep -E '^(added|removed|changed|up to date)' "$clean" | tail -n 1 ;;
    tsc) printf '%s erro(s) de tipo' "$(grep -c 'error TS' "$clean")" ;;
    eslint)
      line=$(grep -E '[0-9]+ problems? \(' "$clean" | tail -n 1)
      printf '%s' "${line:-0 problemas}"
      ;;
    vitest)
      grep -E '^ *(Test Files|Tests) ' "$clean" |
        sed -E 's/^ +//; s/ +/ /g; s/^Test Files/arquivos:/; s/^Tests/testes:/' |
        paste -sd ';' - | sed 's/;/ · /g'
      ;;
    kit)
      kit=$(grep -E '^ +(templates|brownfield-templates)/' "$clean" | sed -E 's/^ +//; s/ +/ /g' | paste -sd ';' - | sed 's/;/ · /g')
      if [ -n "$kit" ]; then printf 'kit válido: %s' "$kit"; else grep -v '^[[:space:]]*$' "$clean" | tail -n 1; fi
      ;;
    build) printf 'dist/ com %s arquivo(s)' "$(find dist -type f 2>/dev/null | wc -l | tr -d ' ')" ;;
    resumo) grep '^resumo:' "$clean" | tail -n 1 | sed 's/^resumo: //' ;;
    arch)
      # Uma linha por rodada (src/, depois webview-ui/src/): "x N dependency violations (E errors, W warnings)…" ou "no dependency violations found".
      counts=$(grep -E 'dependency violations' "$clean" |
        sed -E 's/^.*\(([0-9]+) errors?, ([0-9]+) warnings?\).*$/\1 erro(s), \2 aviso(s)/; s/^.*no dependency violations.*$/0 erro(s), 0 aviso(s)/' |
        paste -sd ';' - | sed 's/;/ · webview-ui\/src: /')
      printf 'src: %s' "$counts"
      ;;
    gitleaks) grep -iE 'leaks? found|no leaks' "$clean" | tail -n 1 ;;
  esac
}

run_step() { # nome, extrator, comando...
  name=$1
  extract=$2
  shift 2
  STEP=$((STEP + 1))
  log="$TMP/passo-$STEP.log"
  printf '\n%s==> [%s] %s%s\n    $ %s\n' "$BOLD" "$STEP" "$name" "$RESET" "$*"
  start=$(date +%s)
  { "$@"; echo $? > "$TMP/status"; } 2>&1 | tee "$log"
  LAST_STATUS=$(cat "$TMP/status")
  elapsed=$(($(date +%s) - start))
  detail=$(detail_for "$extract" "$log")
  if [ "$LAST_STATUS" -eq 0 ]; then
    record OK "$name" "${elapsed}s" "$detail"
  else
    record FALHOU "$name" "${elapsed}s" "exit $LAST_STATUS${detail:+ · $detail}"
    FAILED=$((FAILED + 1))
  fi
}

skip_step() { # nome, motivo
  STEP=$((STEP + 1))
  printf '\n%s==> [%s] %s%s\n    PULADO: %s\n' "$BOLD" "$STEP" "$1" "$RESET" "$2"
  record PULADO "$1" "-" "$2"
}

in_webview() { (cd "$ROOT/webview-ui" && "$@"); }

own_git() { [ "$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null)" = "$ROOT" ]; }

kit_snapshot() { # arquivo de saída
  find kit -type f ! -name .DS_Store -exec cksum {} + | LC_ALL=C sort > "$1"
}

tree_clean() {
  kit_snapshot "$TMP/kit-depois.txt"
  kit_files=$(wc -l < "$TMP/kit-depois.txt" | tr -d ' ')
  if ! cmp -s "$TMP/kit-antes.txt" "$TMP/kit-depois.txt"; then
    echo "o kit mudou durante o CI local (antes < > depois):"
    diff "$TMP/kit-antes.txt" "$TMP/kit-depois.txt" | sed 's/^/  /'
    echo "resumo: o kit (kit/) mudou"
    return 1
  fi
  if own_git; then
    git status --porcelain > "$TMP/git-depois.txt"
    if ! cmp -s "$TMP/git-antes.txt" "$TMP/git-depois.txt"; then
      echo "o git status mudou durante o CI local (antes < > depois):"
      diff "$TMP/git-antes.txt" "$TMP/git-depois.txt" | sed 's/^/  /'
      echo "resumo: o build ou os testes alteraram ou criaram arquivo fora do .gitignore"
      return 1
    fi
    echo "resumo: kit ($kit_files arquivos) e git status iguais aos de antes"
  else
    echo "resumo: kit igual ao de antes ($kit_files arquivos, cksum); sem git próprio, o git status completo só roda no CI"
  fi
}

gitleaks_dirs() {
  # Sem git próprio não há histórico para varrer: varre as pastas de fonte
  # (a raiz inteira levaria junto o node_modules).
  rc=0
  for dir in src tests webview-ui/src webview-ui/tests kit scripts media .github; do
    [ -d "$dir" ] || continue
    echo "gitleaks: $dir"
    gitleaks detect --no-git --source "$dir" --redact --no-banner || rc=1
  done
  return $rc
}

# ── Passos (mesma ordem do ci.yml) ───────────────────────────────────────────

printf '%sCI local da Jataí%s: %s %s · Node %s · npm %s\n' "$BOLD" "$RESET" "$(uname -s)" "$(uname -m)" "$(node -v)" "$(npm -v)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" != 20 ]; then
  echo "aviso: o CI usa Node 20 e aqui é Node $NODE_MAJOR; um resultado diferente no CI pode vir do runtime."
fi
echo "logs: $TMP"

kit_snapshot "$TMP/kit-antes.txt"
if own_git; then git status --porcelain > "$TMP/git-antes.txt"; fi

if [ "$SKIP_INSTALL" -eq 1 ]; then
  skip_step "npm ci (raiz)" "--skip-install: usa o node_modules que já existe"
  skip_step "npm ci (webview-ui)" "--skip-install: usa o node_modules que já existe"
else
  run_step "npm ci (raiz)" npm npm ci --ignore-scripts
  run_step "npm ci (webview-ui)" npm in_webview npm ci --ignore-scripts
fi

run_step "Typecheck (host)" tsc npx tsc --noEmit --incremental false
run_step "Typecheck (webview)" tsc npm run typecheck:webview
run_step "Lint (host)" eslint npm run lint
run_step "Lint (webview)" eslint npm run lint:webview
run_step "Lint de marca (F1.2)" resumo node scripts/brand-lint.mjs
run_step "Arquitetura (dependency-cruiser, ADR-0016)" arch npm run arch
run_step "Testes (host)" vitest npx vitest run --no-cache
run_step "Testes (webview)" vitest in_webview npx vitest run --no-cache
run_step "Build completo" build npm run build
BUILD_STATUS=$LAST_STATUS
run_step "Kit (validação)" kit node scripts/copy-templates.js
run_step "CLI (pacote npm)" resumo node scripts/package-cli.mjs
run_step "CLI (smoke)" resumo node scripts/cli-kit-check.mjs
run_step "Catálogo de agentes (F7.2)" resumo node scripts/gen-agent-catalog.mjs --check
if [ "$BUILD_STATUS" -ne 0 ]; then
  skip_step "Árvore limpa depois do build" "o build falhou"
  skip_step "Pacote (vsce package) e conteúdo do .vsix" "o build falhou"
else
  run_step "Árvore limpa depois do build" resumo tree_clean
  run_step "Pacote (vsce package) e conteúdo do .vsix" resumo node scripts/vsix-check.mjs --out "$TMP/vsix"
fi

# Job `security` do CI.
if ! command -v gitleaks > /dev/null 2>&1; then
  skip_step "Segredos (gitleaks)" "gitleaks não está no PATH (offline?); a varredura roda no job security do CI"
elif own_git; then
  run_step "Segredos (gitleaks, histórico git)" gitleaks gitleaks detect --source . --redact --no-banner
else
  run_step "Segredos (gitleaks, pastas de fonte, sem git)" gitleaks gitleaks_dirs
fi
run_step "Conteúdo proibido (F2.3)" resumo node scripts/content-scan.mjs
run_step "Licenças de terceiros (ADR-0014)" resumo node scripts/license-check.mjs
run_step "THIRD_PARTY_NOTICES em dia (F2.4)" resumo node scripts/third-party-notices.mjs --check

# dco.yml.
if ! own_git; then
  skip_step "DCO (Signed-off-by)" "sem git próprio (o repo ainda vive dentro do workspace); no GitHub roda em todo PR"
elif ! git rev-parse --verify --quiet main > /dev/null; then
  skip_step "DCO (Signed-off-by)" "não há branch main para servir de base"
elif [ "$(git rev-parse HEAD)" = "$(git rev-parse main)" ]; then
  skip_step "DCO (Signed-off-by)" "HEAD é a própria main: não há commit de PR para conferir"
else
  run_step "DCO (Signed-off-by, main..HEAD)" resumo node scripts/dco-check.mjs main HEAD
fi

# ── Resumo ───────────────────────────────────────────────────────────────────

ok=$(grep -c '^OK' "$SUMMARY")
skipped=$(grep -c '^PULADO' "$SUMMARY")
printf '\n%sResumo do CI local%s (%s %s · Node %s; o CI roda em ubuntu, macos e windows com Node 20)\n' "$BOLD" "$RESET" "$(uname -s)" "$(uname -m)" "$(node -v)"
printf '  %2s  %-9s %6s  %s\n' '#' 'resultado' 'tempo' 'passo: detalhe'
n=0
while IFS="$(printf '\t')" read -r status name secs detail; do
  n=$((n + 1))
  printf '  %2s  %-9s %6s  %s: %s\n' "$n" "$status" "$secs" "$name" "$detail"
done < "$SUMMARY"
printf '\n%s OK · %s FALHOU · %s PULADO · logs em %s\n' "$ok" "$FAILED" "$skipped" "$TMP"

[ "$FAILED" -eq 0 ]
