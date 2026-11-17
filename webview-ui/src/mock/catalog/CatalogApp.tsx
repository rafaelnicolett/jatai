import { useEffect, useState, type ReactNode } from "react";
import { Bell, Hexagon, Search, X, Rocket, Compass } from "lucide-react";
import { Button, Card, ChoiceCard, StatusGlyph } from "../../design-system/primitives";
import { EpicStop, GateBadge, StatusBadge, StatusColumn, TaskCard } from "../../design-system/patterns";
import { JataiMark } from "../../design-system/brand/JataiMark";
import { WORK_STATUSES, WORK_STATUS_INFO } from "../../design-system/status/workStatus";
import { CATALOG_THEMES, applyCatalogTheme, type CatalogThemeState } from "./catalogTheme";
import s from "./Catalog.module.css";

/**
 * Catálogo vivo do DS v2 (F4.2, parte 1): tokens e componentes num
 * navegador comum, sem abrir o VS Code. Troca tema (escuro, claro, alto
 * contraste), simula o webview dentro do VS Code (neutros pelo tema do
 * editor) e liga o movimento reduzido. Não é publicado: roda com o
 * `vite.config.mock.ts` (catalog.html).
 */

const BRAND_TOKENS = ["--jt-mel", "--jt-mel-ink", "--jt-mel-line", "--jt-cerume", "--jt-selected", "--jt-focus"];
const NEUTRAL_TOKENS = ["--jt-bg", "--jt-surface", "--jt-surface-2", "--jt-line", "--jt-line-strong", "--jt-fg", "--jt-fg-2", "--jt-fg-3"];
const STATUS_TONES = ["done", "working", "you", "queue", "blocked", "future"] as const;
const TYPE_STYLES = ["display-xl", "display-lg", "display-md", "display-sm", "body-strong", "body", "body-sm", "meta", "caption", "eyebrow", "data-sm", "data-xs"];
const SPACES = ["0-5", "1", "2", "3", "4", "5", "6", "8", "10", "12", "16"];
const RADII = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "full"];

function Section({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section className={s.section} aria-labelledby={id}>
      <h2 id={id} className={s.sectionTitle}>
        {title}
      </h2>
      {note && <p className={s.note}>{note}</p>}
      {children}
    </section>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div className={s.swatch}>
      <span className={s.chip} style={{ background: `var(${token})` }} />
      <code className={s.code}>{token}</code>
    </div>
  );
}

export function CatalogApp() {
  const [theme, setTheme] = useState<CatalogThemeState>({ theme: "dark", vscode: false, reduceMotion: false });
  const [pressed, setPressed] = useState(false);
  const [intro, setIntro] = useState<"greenfield" | "brownfield" | null>("greenfield");
  const [stacks, setStacks] = useState<string[]>(["python"]);
  const [harness, setHarness] = useState("claude");
  const [epic, setEpic] = useState(0);
  const [activity, setActivity] = useState(0);

  useEffect(() => applyCatalogTheme(document, theme), [theme]);

  const toggleStack = (id: string) => setStacks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className={s.page}>
      <header className={s.bar}>
        <JataiMark wordmark size={26} />
        <span className={s.barTitle}>Design system v2 · catálogo</span>
        <div className={s.controls} role="group" aria-label="Tema do catálogo">
          {CATALOG_THEMES.map((t) => (
            <Button key={t.id} variant="secondary" size="sm" pressed={theme.theme === t.id} onClick={() => setTheme((cur) => ({ ...cur, theme: t.id }))}>
              {t.label}
            </Button>
          ))}
          <Button variant="tertiary" size="sm" pressed={theme.vscode} onClick={() => setTheme((cur) => ({ ...cur, vscode: !cur.vscode }))}>
            Como no VS Code
          </Button>
          <Button variant="tertiary" size="sm" pressed={theme.reduceMotion} onClick={() => setTheme((cur) => ({ ...cur, reduceMotion: !cur.reduceMotion }))}>
            Movimento reduzido
          </Button>
        </div>
      </header>

      <main className={s.main}>
        <Section
          id="tokens-cor"
          title="Cor"
          note="Mel é o sistema; azul é você; verde-oliva é feito; neutros são fila e futuro; ferrugem é bloqueado. Em 'Como no VS Code', os neutros seguem o tema do editor."
        >
          <div className={s.swatches}>
            {[...BRAND_TOKENS, ...NEUTRAL_TOKENS].map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
          <div className={s.statusGrid}>
            {STATUS_TONES.map((tone) => (
              <div key={tone} className={s.statusRow}>
                <Swatch token={`--jt-status-${tone}-fg`} />
                <Swatch token={`--jt-status-${tone}-line`} />
                <Swatch token={`--jt-status-${tone}-bg`} />
              </div>
            ))}
          </div>
        </Section>

        <Section id="tokens-tipo" title="Tipografia" note="Fonte de interface e de código do VS Code (nenhuma fonte embutida). Piso de 11px.">
          <div className={s.stack}>
            {TYPE_STYLES.map((t) => (
              <div key={t} className={s.typeRow}>
                <code className={s.code}>--jt-type-{t}</code>
                <span style={{ font: `var(${`--jt-type-${t}`})` }}>Onde a missão está agora</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="tokens-espaco" title="Espaço e raio" note="Base 4px. O índice mudou: --jt-space-2 é 8px.">
          <div className={s.row}>
            {SPACES.map((sp) => (
              <div key={sp} className={s.spaceItem}>
                <span className={s.spaceBar} style={{ width: `var(${`--jt-space-${sp}`})` }} />
                <code className={s.code}>{sp}</code>
              </div>
            ))}
          </div>
          <div className={s.row}>
            {RADII.map((r) => (
              <div key={r} className={s.radiusItem} style={{ borderRadius: `var(${`--jt-radius-${r}`})` }}>
                <code className={s.code}>{r}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section id="marca" title="Marca (símbolo Guarda)" note="Glifo Guarda em mel; o wordmark é contorno, sem fonte embutida. O nome vem do BRAND.">
          <div className={s.row}>
            <JataiMark size={22} />
            <JataiMark size={26} />
            <JataiMark size={56} />
            <JataiMark size={26} wordmark />
          </div>
        </Section>

        <Section id="status" title="StatusGlyph e StatusBadge" note="Glifo + texto, nunca só cor. Inclui falhou e cancelado (ADR-0022).">
          <div className={s.row}>
            {WORK_STATUSES.map((st) => (
              <span key={st} className={s.glyphItem}>
                <StatusGlyph status={st} />
                <span>{WORK_STATUS_INFO[st].label}</span>
              </span>
            ))}
          </div>
          <div className={s.row}>
            <StatusBadge status="done" label="Concluído" />
            <StatusBadge status="working" pulse key={`b${activity}`} />
            <StatusBadge status="you" />
            <StatusBadge status="queue" label="na fila" />
            <StatusBadge status="future" />
            <StatusBadge status="blocked" reason="bloqueada por T0.2" />
            <StatusBadge status="failed" reason="timeout no CI" />
            <StatusBadge status="cancelled" reason="escopo cortado" />
            <StatusBadge status="review" compact />
          </div>
        </Section>

        <Section id="botoes" title="Button" note="8 variantes, 4 tamanhos (36/40/44/48). Passe o Tab para ver o foco.">
          <div className={s.row}>
            <Button variant="primary">Decidir</Button>
            <Button variant="secondary">Preciso de liberação</Button>
            <Button variant="tertiary">Conversar no chat</Button>
            <Button variant="accent" icon={<Hexagon size={18} aria-hidden="true" />}>
              Mapa
            </Button>
            <Button variant="you" size="sm">
              Ver o que está em jogo
            </Button>
            <Button variant="icon" aria-label="Notificações">
              <Bell size={18} aria-hidden="true" />
            </Button>
            <Button variant="command" kbd="⌘K" aria-label="Buscar e comandos" icon={<Search size={18} aria-hidden="true" />} />
            <Button variant="danger">Descartar</Button>
          </div>
          <div className={s.row}>
            <Button size="sm">sm 36</Button>
            <Button size="md">md 40</Button>
            <Button size="lg">lg 44</Button>
            <Button size="xl">Decidir agora (xl 48)</Button>
          </div>
          <div className={s.row}>
            <Button variant="secondary" pressed={pressed} onClick={() => setPressed((p) => !p)}>
              {pressed ? "Retomar" : "Pausar"}
            </Button>
            <Button disabledReason="Configure o projeto primeiro">Indisponível (focável)</Button>
            <Button disabled>disabled nativo</Button>
            <Button loading loadingLabel="Registrando…">
              Sou o titular
            </Button>
            <Button variant="icon" size="sm" aria-label="Fechar">
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        </Section>

        <Section id="card" title="Card (Panel)">
          <div className={s.cols}>
            <Card as="section" aria-label="Cartão simples">
              <strong>Panel</strong>
              <p className={s.note}>surface, borda line, raio 16, padding 16, sem sombra.</p>
            </Card>
            <Card raised>
              <strong>Panel raised</strong>
              <p className={s.note}>Popover e diálogo: elevation-2 (no alto contraste, só a borda).</p>
            </Card>
          </div>
        </Section>

        <Section id="choice" title="ChoiceCard" note="Alternância (aria-pressed) para os cards do Wizard; rádio dentro de um radiogroup.">
          <div className={s.cols}>
            <ChoiceCard
              selected={intro === "greenfield"}
              onClick={() => setIntro("greenfield")}
              icon={<Rocket size={22} />}
              title="Novo Projeto"
              description="Greenfield: do zero ao deploy com agentes de IA."
            />
            <ChoiceCard
              selected={intro === "brownfield"}
              onClick={() => setIntro("brownfield")}
              icon={<Compass size={22} />}
              title="Projeto Existente"
              description="Brownfield: aponte os repositórios; eles não são modificados."
            />
          </div>
          <div className={s.cols3}>
            {["python", "react", "flutter"].map((id) => (
              <ChoiceCard key={id} selected={stacks.includes(id)} onClick={() => toggleStack(id)} title={id} description="escolha múltipla" />
            ))}
          </div>
          <div className={s.cols3} role="radiogroup" aria-label="Harness">
            {["claude", "copilot"].map((id) => (
              <ChoiceCard key={id} mode="radio" selected={harness === id} tabIndex={harness === id ? 0 : -1} onClick={() => setHarness(id)} title={id} />
            ))}
            <ChoiceCard mode="radio" selected={false} tabIndex={-1} title="outro" disabledReason="Fora da v1" />
          </div>
        </Section>

        <Section id="gates" title="GateBadge">
          <div className={s.row}>
            <GateBadge gate="D1" status="approved" />
            <GateBadge gate="D2" status="approved" />
            <GateBadge gate="D3" status="waiting" />
            <GateBadge gate="F1" status="blocked" />
            <GateBadge gate="D3" status="future" />
          </div>
        </Section>

        <Section id="paradas" title="EpicStop" note="Abas do tablist da trilha; clique para selecionar o épico.">
          <div className={s.stops} role="tablist" aria-label="Épicos da Execução">
            {[
              { n: 0, label: "Fundação", status: "working" as const, here: true, progress: 18 },
              { n: 1, label: "Marca", status: "done" as const, progress: 100 },
              { n: 2, label: "Saneamento", status: "you" as const, progress: 40 },
              { n: 3, label: "Arquitetura", status: "blocked" as const, progress: 10 },
              { n: 4, label: "Redesign", status: "queue" as const, progress: 0 },
              { n: 5, label: "Mapa", status: "future" as const, progress: 0 },
            ].map((e) => (
              <EpicStop key={e.n} {...e} selected={epic === e.n} tabIndex={epic === e.n ? 0 : -1} controls="catalog-board" onClick={() => setEpic(e.n)} />
            ))}
          </div>
        </Section>

        <Section id="quadro" title="StatusColumn e TaskCard" note="Bloqueado e falhou são condição do card; cancelado vai riscado. 'Simular evento' mostra a rajada do ●.">
          <div className={s.row}>
            <Button variant="secondary" size="sm" onClick={() => setActivity((a) => a + 1)}>
              Simular evento de agente
            </Button>
          </div>
          <div className={s.board} id="catalog-board">
            <StatusColumn status="queue" blockedCount={1}>
              <TaskCard id="T0.3" title="Golden master" variant="queue" meta="depende de T0.2" condition={{ kind: "blocked", reason: "bloqueada por T0.2" }} />
              <TaskCard id="T0.5" title="Contratos HTTP" variant="queue" meta="@test-backfill-agent" onOpen={() => {}} />
            </StatusColumn>
            <StatusColumn status="working" activityKey={activity}>
              <TaskCard id="T0.2" title="Semear o repositório" variant="working" meta="@migration-agent" elapsed="há 12 min" />
              <TaskCard id="T0.4" title="Build hermético" variant="working" meta="@devops" condition={{ kind: "failed", reason: "timeout no CI" }} />
            </StatusColumn>
            <StatusColumn status="you">
              <TaskCard id="F0.1" title="Titularidade do código" variant="you" action={{ label: "Ver o que está em jogo", onClick: () => {} }} />
            </StatusColumn>
            <StatusColumn status="done">
              <TaskCard id="T0.1" title="Snapshot do código" variant="done" meta="@migration-agent" />
              <TaskCard id="T0.9" title="Portal" variant="done" condition={{ kind: "cancelled", reason: "escopo cortado (ADR-0015)" }} />
            </StatusColumn>
          </div>
        </Section>
      </main>
    </div>
  );
}
