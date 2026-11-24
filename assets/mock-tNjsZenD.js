import{l as D,n as Y,e as S,h as T,p as w,f as A,i as I,g as Z,N as E,k as x,m as q,s as R,o as F,c as N,j as v,r as L}from"./EpicStop-CZniplu9.js";import{a as $}from"./catalogTheme-B-b9rgOt.js";import{b as M,e as B,c as U,S as V}from"./ShellRoot-BpZpkZnc.js";import"./StatusColumn-DuNaCrO1.js";import"./Badge-DuYqL_ye.js";const K=["backlog","in-progress","review","done","blocked","descoped"];function W(e){return Y(e,K,"backlog")}function y(e){return Array.isArray(e)?e.filter(a=>typeof a=="string"):[]}function g(e,a){if(!e||typeof e!="object")return null;const t=e;if(typeof t.id!="string"||typeof t.title!="string")return null;const i=typeof t.story_points=="number"?t.story_points:typeof t.estimate=="number"?t.estimate:void 0;return{id:t.id,title:t.title,status:W(t.status),component:typeof t.component=="string"?t.component:void 0,feature:typeof t.feature=="string"?t.feature:typeof t.feature_ref=="string"?t.feature_ref:void 0,size:typeof t.size=="string"?t.size:typeof t.sizing=="string"?t.sizing:void 0,storyPoints:i,dependsOn:y(t.depends_on),sprintId:a,tags:y(t.tags),blockedReason:typeof t.blocked_reason=="string"?t.blocked_reason:void 0,epicRef:typeof t.epic_ref=="string"?t.epic_ref:typeof t.milestone=="string"?t.milestone:void 0}}function G(e){if(!e||typeof e!="object")return;const a=e;return{product:typeof a.product=="string"?a.product:void 0,totalSprints:typeof a.total_sprints=="number"?a.total_sprints:void 0,sprintDurationWeeks:typeof a.sprint_duration_weeks=="number"?a.sprint_duration_weeks:void 0}}function H(e){if(!Array.isArray(e.sprints))return null;const a=e.sprints.filter(t=>!!t&&typeof t=="object"&&typeof t.id=="string").map(t=>{const i=t.id,o=Array.isArray(t.items)?t.items.map(s=>g(s,i)).filter(s=>s!==null):[];return{id:i,name:typeof t.name=="string"?t.name:i,goal:typeof t.goal=="string"?t.goal:void 0,items:o}});return a.length===0?null:{meta:G(e.meta),sprints:a,items:a.flatMap(t=>t.items)}}function J(e){if(!Array.isArray(e.items))return null;const a=e.milestones&&typeof e.milestones=="object"?e.milestones:{},t=new Map;for(const o of e.items){if(!o||typeof o!="object")continue;const s=typeof o.milestone=="string"?o.milestone:"sem-milestone";t.has(s)||t.set(s,[]),t.get(s).push(o)}if(t.size===0)return null;const i=[...t.entries()].map(([o,s])=>{const n=a[o];return{id:o,name:typeof(n==null?void 0:n.name)=="string"?n.name:o,goal:typeof(n==null?void 0:n.goal)=="string"?n.goal:void 0,items:s.map(c=>g(c,o)).filter(c=>c!==null)}});return{meta:void 0,sprints:i,items:i.flatMap(o=>o.items)}}function X(e){if(!Array.isArray(e.stories))return null;const a=typeof e.sprint=="number"||typeof e.sprint=="string"?String(e.sprint):"S1",t=e.stories.map(i=>g(i,a)).filter(i=>i!==null);return t.length===0?null:{meta:void 0,sprints:[{id:a,name:typeof e.initiative=="string"?e.initiative:a,items:t}],items:t}}function z(e){let a;try{a=D(e,{json:!0})}catch{return null}if(!a||typeof a!="object")return null;const t=a;return H(t)??J(t)??X(t)??null}const Q=`
version: 1
repos:
  - id: billing-api
    source: git
    url: git@github.com:acme/billing-api.git
    scan_profile: deep
    pinned_sha: a3f9c21
    stack: java-spring
    arch_current: layered-mvc
    arch_confidence: 82
    has_history: true
    has_frontend: false
  - id: claims-svc
    source: git
    url: git@github.com:acme/claims-svc.git
    scan_profile: deep
    pinned_sha: c88e410
    stack: python-fastapi
    has_history: true
    has_frontend: false
  - id: legacy-erp
    source: local-path
    path: /repos/legacy-erp
    scan_profile: shallow
    stack: dotnet-webforms
    arch_current: big-ball-of-mud
    arch_confidence: 55
    has_history: false
    has_frontend: true
`,ee=`
version: 2
repos:
  billing-api:
    phases:
      tech-stack: { status: done, agent: "@tech-mapper", completed_at: "2026-07-19T10:00:00Z", human_checklist: { stack-identified: true } }
      arch: { status: done, agent: "@arch-discoverer", completed_at: "2026-07-19T10:30:00Z", human_checklist: {} }
      coding-archaeology: { status: done, completed_at: "2026-07-19T11:00:00Z", human_checklist: {} }
      quality: { status: done, completed_at: "2026-07-19T11:30:00Z", human_checklist: {} }
      debt: { status: done, completed_at: "2026-07-20T12:00:00Z", human_checklist: {} }
    findings_summary: { critical: 2, high: 5, medium: 11, low: 8 }
    gate_d1: { status: approved, approved_at: "2026-07-20T12:30:00Z" }
  claims-svc:
    phases:
      tech-stack: { status: done, agent: "@tech-mapper", completed_at: "2026-07-20T09:00:00Z", human_checklist: {} }
      arch: { status: in-progress, agent: "@arch-discoverer", human_checklist: {} }
      coding-archaeology: { status: pending, human_checklist: {} }
      quality: { status: pending, human_checklist: {} }
      debt: { status: pending, human_checklist: {} }
    findings_summary: { critical: 0, high: 1, medium: 3, low: 2 }
    gate_d1: { status: pending }
  legacy-erp:
    phases:
      tech-stack: { status: done, completed_at: "2026-07-20T08:00:00Z", human_checklist: {} }
      arch: { status: done, agent: "@arch-discoverer", completed_at: "2026-07-20T09:00:00Z", human_checklist: {} }
      coding-archaeology: { status: done, completed_at: "2026-07-20T10:00:00Z", human_checklist: {} }
      design: { status: done, agent: "@design-archaeologist", completed_at: "2026-07-20T10:30:00Z", human_checklist: {} }
      quality: { status: done, completed_at: "2026-07-20T11:00:00Z", human_checklist: {} }
      debt: { status: done, completed_at: "2026-07-20T12:00:00Z", human_checklist: {} }
    findings_summary: { critical: 6, high: 14, medium: 20, low: 9 }
    gate_d1: { status: pending }
phases: {}
`,te=`
phases:
  business: { status: done, agent: "@business", completed_at: "2026-07-15T10:00:00Z", human_checklist: {} }
  product: { status: done, agent: "@product", completed_at: "2026-07-16T10:00:00Z", human_checklist: {} }
  ux-design: { status: done, agent: "@ux-designer", completed_at: "2026-07-16T14:00:00Z", human_checklist: {} }
  domain-modeler: { status: done, agent: "@domain-modeler", completed_at: "2026-07-17T09:00:00Z", human_checklist: {} }
  bdd: { status: done, agent: "@bdd", completed_at: "2026-07-17T15:00:00Z", human_checklist: {} }
  architecture: { status: done, agent: "@architecture", completed_at: "2026-07-18T11:00:00Z", human_checklist: {} }
  sprint-plan: { status: done, agent: "@sprint-planner", completed_at: "2026-07-19T09:00:00Z", human_checklist: {} }
  sprint-run: { status: in-progress, agent: "@sprint-runner", human_checklist: {} }
`,ae=`
meta:
  product: Acme Billing
  total_sprints: 2
  sprint_duration_weeks: 2
sprints:
  - id: S1
    name: "Modernização do billing"
    goal: "Migrar cobrança recorrente para o novo modelo de assinatura"
    priority: P0
    items:
      - id: S1-BKD-01
        title: "Endpoint de criação de assinatura"
        status: done
        component: backend
        story_points: 5
      - id: S1-BKD-02
        title: "Migração de dados de clientes legados"
        status: in-progress
        component: backend
        feature: "Assinaturas"
        size: M
        story_points: 8
        tags: ["migration", "risco-alto"]
      - id: S1-FE-01
        title: "Tela de gestão de assinatura"
        status: review
        component: frontend
        story_points: 3
        depends_on: ["S1-BKD-01"]
      - id: S1-BKD-03
        title: "Webhook de cobrança recusada"
        status: blocked
        component: backend
        story_points: 3
        blocked_reason: "Aguardando credenciais do gateway de pagamento"
      - id: S1-FE-02
        title: "Notificação de cobrança recusada"
        status: backlog
        component: frontend
        story_points: 2
`,oe=[{run_id:"r1",event_type:"agent-started",timestamp:"2026-07-21T01:25:00Z",phase_id:"arch",agent_id:"@arch-discoverer",repo_id:"claims-svc",message:"Lendo 42 módulos…"},{run_id:"r1",event_type:"agent-progress",timestamp:"2026-07-21T01:27:00Z",phase_id:"arch",agent_id:"@arch-discoverer",repo_id:"claims-svc",message:"Mapeando camadas e dependências…"},{run_id:"r2",event_type:"agent-done",timestamp:"2026-07-21T00:48:00Z",phase_id:"arch",agent_id:"@arch-discoverer",repo_id:"legacy-erp",message:"Arquitetura mapeada — confiança baixa, revisar"},{run_id:"r3",event_type:"blocked",timestamp:"2026-07-21T00:23:00Z",phase_id:"coding-archaeology",agent_id:"@archaeologist",repo_id:"legacy-erp",message:"Sem acesso ao histórico git — repo é snapshot sem .git"},{run_id:"r4",event_type:"artifact-written",timestamp:"2026-07-20T12:00:00Z",phase_id:"debt",repo_id:"billing-api",message:"tech-debt.md gravado"},{run_id:"r4",event_type:"gate-approved",timestamp:"2026-07-20T12:30:00Z",phase_id:"debt",agent_id:"@assessor",repo_id:"billing-api",message:"Gate D1 aprovado"},{run_id:"r5",event_type:"agent-started",timestamp:"2026-07-21T09:12:00Z",phase_id:"backend",agent_id:"@backend-python-api",message:"Gerando endpoints a partir de api/openapi.yaml…"},{run_id:"r5",event_type:"agent-progress",timestamp:"2026-07-21T09:16:00Z",phase_id:"backend",agent_id:"@backend-python-api",message:"8/11 endpoints com testes passando"},{run_id:"r6",event_type:"agent-started",timestamp:"2026-07-21T09:12:05Z",phase_id:"frontend",agent_id:"@frontend-react",message:"Consumindo o contrato gerado pelo backend…"},{run_id:"human",event_type:"item-approved",timestamp:"2026-07-28T14:00:00Z",phase_id:"wave-1",agent_id:"você",repo_id:"legacy-erp",message:"item-1.1 aprovado"}].map(e=>JSON.stringify(e)).join(`
`);function C(){const{inventory:e}=S(Q),a=T(ee),t=w(oe),i=A(t),o=M(e,a,i),s=I(te),n=z(ae),c=Z(s,n,i),p=t.filter(r=>E.has(r.event_type)).map(r=>({id:`${r.timestamp}-${r.event_type}-${r.repo_id??""}-${r.phase_id??""}`,kind:r.event_type,text:x(r),timestamp:r.timestamp})).reverse();return{config:{version:"1",project:{name:"Acme",slug:"acme",mode:"brownfield"},host_adapter:"claude"},configured:!0,operations:{devops:null,observability:null,incidents:null,sustain:null},reposInventory:e,foundationState:a,foundationPlan:o,liveActivity:i,runEvents:t,contextRepos:null,repoGraph:null,initiatives:{active:"mod-legacy-erp-modularize",initiatives:[{id:"modernize-billing",name:"Modernizar Billing",status:"in-progress",mode:"brownfield",depends_on:[]},{id:"new-loyalty-app",name:"App de Fidelidade (novo)",status:"planned",mode:"greenfield"},{id:"mod-legacy-erp-modularize",name:"legacy-erp → módulos hexagonais",status:"in-progress",mode:"brownfield",type:"modernization",scope:["legacy-erp"],arch_target:"hexagonal",driven_by:["debt-legacy-erp-01","debt-legacy-erp-02"],waves:["wave-1: fundação (characterization tests, CI verde, cobertura mínima 60% no módulo de faturamento)","wave-2: quebra de ciclo (Anti-Corruption Layer, contrato versionado com legacy-erp, testes de contrato) — bloqueia todo o resto até o ciclo ser quebrado","wave-3: extração de domínio (Branch by Abstraction, interface de faturamento, dual-run, remoção do código legado)"],wave_status:{"wave-1":{status:"in-progress",items:{"item-1.1":{status:"done",repo:"legacy-erp",completed_at:"2026-07-28T10:00:00Z",summary:"Characterization tests do módulo de faturamento — 42 casos, suite verde.",commit:"4a2cf26",human_approved_at:"2026-07-28T14:00:00Z",artifacts:["code/services/legacy-erp/tests/billing.characterization.spec.ts"]},"item-1.2":{status:"done",repo:"legacy-erp",completed_at:"2026-07-29T09:00:00Z",summary:"CI verde no pipeline principal.",commit:"9bd31aa",known_bugs_pinned:["Timeout intermitente no job de integração — não bloqueia merge, monitorar"],merge_block:"aguarda confirmação de rollback testado em staging"},"item-1.3":{status:"done",repo:"legacy-erp",completed_at:"2026-07-29T16:00:00Z",summary:"Cobertura do módulo de faturamento em 63% — acima da meta de 60%.",commit:"1e77c40"}}}}}]},deliveryState:s,deliveryPlan:c,sprintBacklog:n,kitStatus:{installed:"0.6.4",current:"0.6.5",legacyConfigName:!1,outdated:!0},warnings:[],approvalFrictionFields:["merge_block","known_bugs_pinned"],deliveryHierarchy:"legacy",notifications:p,notificationsLastSeenAt:"2026-07-25T00:00:00Z"}}function u(e={}){var f;const a=e.mode??"brownfield",t=e.configured??!0,i=e.reposYaml?S(e.reposYaml).inventory:null,o=e.foundationYaml?T(e.foundationYaml):null,s=w((e.events??[]).map(d=>JSON.stringify(d)).join(`
`)),n=A(s),c=M(i,o,n),p=e.initiativesYaml?q(e.initiativesYaml).state:null,r=e.deliveryYaml?I(e.deliveryYaml):null,h=r??(p?R((f=F(p))==null?void 0:f.current_phase):null),_=e.sprintYaml?z(e.sprintYaml):null,j=Z(h,_,n),P=s.filter(d=>E.has(d.event_type)).map(d=>({id:`${d.timestamp}-${d.event_type}-${d.repo_id??""}-${d.phase_id??""}`,kind:d.event_type,text:x(d),timestamp:d.timestamp})).reverse();return{config:t?{version:"1",project:{name:"Demo",slug:"demo",mode:a},host_adapter:"claude"}:null,configured:t,operations:{devops:null,observability:null,incidents:null,sustain:null},reposInventory:i,foundationState:o,foundationPlan:c,liveActivity:n,runEvents:s,contextRepos:null,repoGraph:null,initiatives:p,deliveryState:h,deliveryPlan:j,sprintBacklog:_,kitStatus:{installed:"0.9.10",current:e.kitOutdated?"0.9.11":"0.9.10",legacyConfigName:!1,outdated:e.kitOutdated??!1},warnings:e.warnings??[],approvalFrictionFields:["merge_block","known_bugs_pinned"],deliveryHierarchy:"epic-feature-backlog-task",notifications:P,notificationsLastSeenAt:e.notificationsLastSeenAt??null,workStatus:B(p,r)}}const se=`version: 1
repos:
  - id: api
    source: local-path
    path: repos/api
    has_frontend: false
`,ie=`version: 2
repos:
  api:
    phases:
      tech-stack: { status: done, agent: "@tech-mapper", human_checklist: {} }
      arch: { status: done, agent: "@arch-discoverer", human_checklist: {} }
      coding-archaeology: { status: done, agent: "@coding-archaeologist", human_checklist: {} }
      quality: { status: done, agent: "@quality-auditor", human_checklist: {} }
      debt: { status: done, agent: "@debt-analyst", human_checklist: {} }
    gate_d1:
      status: approved
phases: {}
`,ne=["epic-0: Isolar o módulo de pagamentos","epic-1: Contrato da API"];function re({id:e,name:a,epicStatus:t,d3:i}){const o=[`- id: ${e}`,`  name: ${JSON.stringify(a)}`,"  status: in-progress","  type: modernization","  mode: brownfield","  scope: [api]","  epics:",...ne.map(s=>`    - ${JSON.stringify(s)}`),"  roadmap_gate: { status: approved }","  risk_matrix_gate: { status: approved }",'  gate_d2: { status: approved, human_approved_at: "2026-11-10T12:00:00Z", by: "Pessoa Fictícia" }'];if(i&&o.push('  gate_d3: { status: approved, human_approved_at: "2026-11-16T12:00:00Z", by: "Pessoa Fictícia" }'),t){o.push("  epic_status:");for(const s of t.split(`
`))o.push(`    ${s}`)}return o.join(`
`)}const de=["- id: hotfix-juros",'  name: "Corrigir o cálculo de juros"',"  status: in-progress","  type: hotfix","  mode: brownfield","  waves:",'    - "wave-1: Reproduzir o erro"','    - "wave-2: Corrigir e cobrir com teste"'].join(`
`),ce=["- id: feat-extrato",'  name: "Extrato em PDF"',"  status: in-progress","  type: feature","  mode: greenfield","  epics:"].join(`
`),pe=(e,a)=>`active: ${e}
initiatives:
${a.map(t=>t.split(`
`).map(i=>`  ${i}`).join(`
`)).join(`
`)}
`,O=e=>new Date(Date.now()-e*1e3).toISOString(),b=()=>({run_id:"r1",event_type:"agent-started",timestamp:O(25),initiative_id:"mod-pagamentos",agent_id:"migration-agent",task_id:"epic-0/task-2",message:"escrevendo os testes de caracterização"}),k=()=>({run_id:"r5",event_type:"decision-requested",timestamp:O(90),initiative_id:"mod-pagamentos",task_id:"epic-0/task-9",message:"titularidade do código",metadata:{reason:"antes de licenciar como MIT"}}),m=`epic-0:
  status: in-progress
  items:
    task-1: { status: done, summary: "Isolar o módulo em um pacote", commit: "a1b2c3d", completed_at: "2026-11-12T15:30:00Z", artifacts: ["docs/pagamentos/isolamento.md"] }
    task-2: { status: in-progress, summary: "Cobrir o cálculo de juros com testes de caracterização" }
    task-3: { status: pending, summary: "Extrair a regra de arredondamento" }
    task-4: { status: blocked, summary: "Trocar o gateway pelo adaptador", reason: "bloqueada por task-3" }
    task-5: { status: failed, summary: "Validar o contrato com o cliente da API", reason: "o teste de contrato caiu" }
    task-6: { status: cancelled, summary: "Migrar o relatório legado", reason: "escopo cortado pelo dono" }
    task-7: { status: done, requires_approval: true, summary: "Remover a duplicação do cálculo de taxas" }`,le=`epic-0:
  status: done
  items:
    task-1: { status: done, summary: "Isolar o módulo em um pacote", commit: "a1b2c3d", completed_at: "2026-11-12T15:30:00Z" }
    task-2: { status: done, summary: "Cobrir o cálculo de juros com testes de caracterização" }
    task-3: { status: done, requires_approval: true, summary: "Remover a duplicação do cálculo de taxas" }`;function l(e){return u({reposYaml:se,foundationYaml:ie,initiativesYaml:pe(e.active??"mod-pagamentos",[re({id:"mod-pagamentos",name:"Modernização de pagamentos",epicStatus:e.epicStatus}),...e.extra??[]]),events:e.events??[]})}function me(){const e=l({epicStatus:m}),a=e.initiatives.initiatives[0];return a.epic_status={"epic-0":{status:"in-progress",items:{"task-1":null}}},e}const ue={execucao:{id:"execucao",title:"Execução com todas as condições",about:"Uma modernização em execução: tarefa feita, trabalhando, na fila, bloqueada, falhou, cancelada e uma que espera aprovação; um agente trabalhando e uma decisão pedida.",snapshot:()=>l({epicStatus:m,events:[b(),k()]})},decisoes:{id:"decisoes",title:"Três decisões esperando, o gate primeiro",about:"Todas as tarefas fechadas: o D3 espera, há uma tarefa para aprovar e um agente pediu uma decisão.",snapshot:()=>l({epicStatus:le,events:[k()]})},"em-dia":{id:"em-dia",title:"Nada espera você",about:"Uma modernização em andamento sem nenhuma decisão pendente.",snapshot:()=>l({epicStatus:`epic-0:
  status: in-progress
  items:
    task-1: { status: in-progress, summary: "Isolar o módulo em um pacote" }
    task-2: { status: pending, summary: "Extrair a regra de arredondamento" }`,events:[b()]})},descoberta:{id:"descoberta",title:"Descoberta do workspace",about:"A Foundation de vários repositórios: um D1 por repositório, fases em revisão e uma fase bloqueada.",snapshot:C},"outra-iniciativa":{id:"outra-iniciativa",title:"Vendo uma iniciativa que não é a ativa",about:'A ativa é a modernização; a tela mostra o hotfix. A nota diz isso e oferece "Tornar ativa".',snapshot:()=>l({epicStatus:m,extra:[de]}),persisted:{activeTab:"live-progress",collapsedSections:{},viewTarget:{kind:"initiative",id:"hotfix-juros"}}},"sem-detalhe":{id:"sem-detalhe",title:"Iniciativa sem detalhe carregado",about:"Uma feature que não é a ativa: o registro só sabe o nome e o tipo, e a nota avisa que o detalhe das fases só carrega para a ativa.",snapshot:()=>l({epicStatus:m,extra:[ce]}),persisted:{activeTab:"live-progress",collapsedSections:{},viewTarget:{kind:"initiative",id:"feat-extrato"}}},"sem-iniciativa":{id:"sem-iniciativa",title:"Sem nenhuma iniciativa",about:'Projeto novo: o Cockpit explica e oferece "Nova iniciativa".',snapshot:()=>u({mode:"greenfield"})},"sem-foundation":{id:"sem-foundation",title:"Sem Foundation",about:"Workspace brownfield sem nenhum repositório mapeado: a Descoberta ainda não começou.",snapshot:()=>u({mode:"brownfield"})},"sem-pasta":{id:"sem-pasta",title:"Sem pasta aberta",about:"O host avisa que o editor não tem pasta aberta.",snapshot:null,degraded:{source:"workspace",message:"Nenhuma pasta aberta no editor."}},conectando:{id:"conectando",title:"Conectando",about:"Antes do primeiro snapshot (o host ainda não respondeu).",snapshot:null},espera:{id:"espera",title:"Sem resposta do State Service",about:'Passado o prazo sem snapshot, a tela explica e oferece "Tentar de novo". Capturar depois de 9 segundos.',snapshot:null},erro:{id:"erro",title:"Falha ao montar a tela",about:'Um snapshot corrompido de propósito: a falha fica na tela, com o motivo e "Tentar de novo", e a barra segue viva.',snapshot:me}};function ge(e){const a=new URLSearchParams(e).get("scenario");return a?ue[a]??null:null}function he(e){const a=new URLSearchParams(e),t=a.get("theme"),o=["dark","light","hcDark","hcLight"].find(s=>s===t);!o&&a.get("motion")!=="reduce"||$(document,{theme:o??"dark",vscode:!1,reduceMotion:a.get("motion")==="reduce"})}function _e(e,a){if(e.degraded&&window.postMessage({type:"shell/degraded",payload:e.degraded},"*"),e.snapshot){const t=e.snapshot();setTimeout(()=>window.postMessage({type:"shell/snapshot",seq:a,generatedAt:new Date().toISOString(),payload:t},"*"),150)}}function fe(){he(window.location.search);const e=ge(window.location.search);let a=0,t=e==null?void 0:e.persisted;const i={postMessage:o=>{const s=o;if(console.log("[mock] webview → host:",s),e&&(s.type==="shell/ready"||s.type==="shell/requestSnapshot")){_e(e,++a);return}(s.type==="shell/ready"||s.type==="shell/requestSnapshot")&&setTimeout(()=>{window.postMessage({type:"shell/snapshot",seq:0,generatedAt:new Date().toISOString(),payload:C()},"*"),window.postMessage({type:"shell/toast",payload:{id:"mock-toast-1",kind:"agent-done",text:"@tech-mapper terminou · claims-svc — aguarda aprovação",timestamp:new Date().toISOString()}},"*")},400)},getState:()=>t,setState:o=>(t=o,o)};window.__jataiMockApi=i,window.acquireVsCodeApi=()=>i}fe();U();N(document.getElementById("root")).render(v.jsx(L.StrictMode,{children:v.jsx(V,{})}));
