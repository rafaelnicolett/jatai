import { Wrench, Radio, ShieldAlert, History, CircleCheckBig, CircleAlert, CircleX } from "lucide-react";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import { BRAND, OPERATIONS_N1_ACTIONS } from "@data";
import { EmptyState, KPITile } from "../../design-system/patterns";
import { Card, Badge } from "../../design-system/primitives";
import { ICON_BY_SLUG } from "../../design-system/shortcutIcons";
import { dispatchShortcutAction } from "../../store/shortcutDispatch";
import s from "./OperationsView.module.css";

interface OperationsViewProps {
  snapshot: CockpitSnapshot | null;
}

const HEALTH_ICON = { healthy: CircleCheckBig, degraded: CircleAlert, down: CircleX } as const;
const HEALTH_TONE = { healthy: "success", degraded: "warning", down: "danger" } as const;
const SEVERITY_TONE = { warning: "warning", critical: "danger" } as const;
const INCIDENT_SEVERITY_TONE = { minor: "neutral", major: "warning", critical: "danger" } as const;

/**
 * Painel de Operações (ADR-0002, `docs/adr/0002-operacoes-como-painel-continuo.md`)
 * — workspace inteiro, contínuo, fora do ciclo de vida de qualquer
 * iniciativa. 3 blocos, na ordem aprovada com o usuário: ações N1
 * (deploy/rollback/patch), status de observabilidade/incidentes, histórico
 * de patches do `@sustain`. Cada bloco lê de `snapshot.operations` — `null`
 * é "o agente ainda não escreveu nada", nunca dado fabricado na UI.
 */
export function OperationsView({ snapshot }: OperationsViewProps) {
  if (!snapshot?.configured) {
    return (
      <EmptyState
        icon={Wrench}
        title="Configure o projeto primeiro"
        body={`O painel de Operações precisa de um projeto ${BRAND.displayName} configurado.`}
      />
    );
  }

  const ops = snapshot.operations;
  const observabilityRepos = Object.entries(ops.observability?.repos ?? {});
  const activeAlerts = observabilityRepos.flatMap(([repoId, r]) => r.active_alerts.map((a) => ({ ...a, repoId })));
  const activeIncidents = (ops.incidents?.incidents ?? []).filter((i) => i.status === "active");
  const resolvedIncidents = (ops.incidents?.incidents ?? []).filter((i) => i.status === "resolved");
  const patches = ops.sustain?.patches ?? [];

  return (
    <div className={s.wrap}>
      <section className={s.hero}>
        <div className={s.heroText}>
          <span className={s.eyebrow}>Operação · Workspace inteiro</span>
          <h1 className={s.title}>Operações</h1>
          <p className={s.subtitle}>
            Ações N1, observabilidade e manutenção contínua — fora do ciclo de vida de qualquer iniciativa específica.
          </p>
        </div>
      </section>

      <Card className={s.sectionCard}>
        <div className={s.sectionHeader}>
          <h2 className={s.sectionTitle}>Ações N1</h2>
          <span className={s.sectionSubtitle}>Deploy, rollback e patch — abre o chat com o agente certo</span>
        </div>
        <div className={s.kpiStrip}>
          {OPERATIONS_N1_ACTIONS.map((a) => {
            const Icon = ICON_BY_SLUG[a.icon];
            return <KPITile key={a.id} icon={Icon} tone="accent" label={a.label} value={a.hint} onClick={() => dispatchShortcutAction(a)} />;
          })}
        </div>
      </Card>

      <Card className={s.sectionCard}>
        <div className={s.sectionHeader}>
          <h2 className={s.sectionTitle}>Observabilidade e incidentes</h2>
          <span className={s.sectionSubtitle}>{activeIncidents.length} incidente(s) ativo(s) · {activeAlerts.length} alerta(s)</span>
        </div>
        {observabilityRepos.length === 0 && activeIncidents.length === 0 && resolvedIncidents.length === 0 ? (
          <EmptyState icon={Radio} title="Nenhum dado ainda" body="O @observability e o @incident ainda não registraram nada neste workspace." />
        ) : (
          <div className={s.columns}>
            <div className={s.focusColumn}>
              {activeIncidents.length === 0 ? (
                <p className={s.progress}>Nenhum incidente ativo.</p>
              ) : (
                activeIncidents.map((i) => (
                  <div key={i.id} className={s.focusCard}>
                    <div className={s.focusIconBadge}><ShieldAlert size={22} strokeWidth={1.75} /></div>
                    <div className={s.focusBody}>
                      <span className={s.focusEyebrow}>Incidente ativo</span>
                      <div className={s.focusLabel}>{i.title}</div>
                      <div className={s.focusWhy}>desde {i.started_at}</div>
                    </div>
                    <Badge tone={INCIDENT_SEVERITY_TONE[i.severity]}>{i.severity}</Badge>
                  </div>
                ))
              )}
            </div>
            <div className={s.activityColumn}>
              <div className={s.activityHeader}><span>Alertas ativos</span></div>
              {activeAlerts.length === 0 ? (
                <p className={s.progress}>Nenhum alerta ativo.</p>
              ) : (
                activeAlerts.map((a) => (
                  <div key={a.id} className={s.focusCard}>
                    <div className={s.focusBody}>
                      <span className={s.focusEyebrow}>{a.repoId}</span>
                      <div className={s.focusLabel}>{a.message}</div>
                    </div>
                    <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {observabilityRepos.length > 0 && (
          <div className={s.kpiStrip}>
            {observabilityRepos.flatMap(([repoId, r]) =>
              r.health_checks.map((h) => {
                const Icon = HEALTH_ICON[h.status];
                return <KPITile key={`${repoId}-${h.service}`} icon={Icon} tone={HEALTH_TONE[h.status]} label={`${repoId} · ${h.service}`} value={h.status} />;
              })
            )}
          </div>
        )}
      </Card>

      <Card className={s.sectionCard}>
        <div className={s.sectionHeader}>
          <h2 className={s.sectionTitle}>Histórico de patches</h2>
          <span className={s.sectionSubtitle}>Manutenção contínua do @sustain — patches de segurança e upgrades</span>
        </div>
        {patches.length === 0 ? (
          <EmptyState icon={History} title="Nenhum patch registrado ainda" body="O @sustain ainda não aplicou nenhum patch neste workspace." />
        ) : (
          <div className={s.activityColumn}>
            {patches.map((p, i) => (
              <div key={`${p.repo}-${i}`} className={s.focusCard}>
                <div className={s.focusBody}>
                  <span className={s.focusEyebrow}>{p.repo} · {p.kind}</span>
                  <div className={s.focusLabel}>{p.description}</div>
                  <div className={s.focusWhy}>{p.applied_at}{p.pr ? ` · ${p.pr}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
