# API de extensão

> F2.5 · ADR-0023 · a Jataí continua 100% local; uma extensão companheira só recebe dados depois de um consentimento explícito, por workspace, revogável.

A API é o que `activate()` devolve em `vscode.extensions.getExtension("jatai.jatai").exports`. Ela existe para que um serviço próprio (painel da empresa, repositório interno de templates, sincronização de artefatos) se conecte **sem fork**: a extensão companheira traz a implementação e a responsabilidade; o núcleo aberto nunca faz rede sozinho.

## Como consumir

No `package.json` da extensão companheira, declare a dependência — é ela que garante que a Jataí já está ativa quando a sua extensão ativar:

```json
{
  "extensionDependencies": ["jatai.jatai"]
}
```

```ts
import * as vscode from "vscode";
import type { JataiApi, RunEvent } from "jatai/api";

export function activate(context: vscode.ExtensionContext): void {
  const jatai = vscode.extensions.getExtension<JataiApi>("jatai.jatai");
  if (!jatai?.isActive) return;
  const api = jatai.exports;
  if (api.apiVersion !== 1) return;

  const registration = api.registerTelemetrySink(
    {
      push(event: RunEvent): void {
        // Fire-and-forget: envie para o SEU serviço, com a SUA licença e política.
        void fetch("https://api.minhaempresa.example/event", {
          method: "POST",
          body: JSON.stringify(event),
        }).catch(() => undefined);
      },
    },
    {
      id: context.extension.id,
      displayName: "Painel da Minha Empresa",
      purpose: "Levar a atividade dos agentes ao painel interno.",
      destinations: ["api.minhaempresa.example"],
    }
  );
  context.subscriptions.push(registration);
}
```

Os tipos publicáveis estão em [`api/index.d.ts`](../api/index.d.ts). `apiVersion` muda só em major (ADR-0023 §7).

## O que acontece no registro

1. **Workspace Trust.** Em workspace não confiável, ou sem pasta aberta, o registro é ignorado: não pergunta, não lista, não entrega.
2. **Validação.** `id`, `displayName`, `purpose`, `destinations` e os métodos da porta são conferidos; um erro cita o campo (ex.: `push`, `destinations`, o destino inválido).
3. **Identidade.** O id declarado precisa ser o de quem chamou, e o nome mostrado vem do manifesto instalado — nunca do que a extensão escreveu. O VS Code não expõe "quem chamou"; a evidência é a pasta nos quadros da pilha de chamada. Sem evidência, o registro é recusado.
4. **Consentimento.** Instalar não liga nada. O pedido mostra nome, id, finalidade, destinos, o que sai, o que nunca sai e que a decisão vale só para aquele workspace. Permitir liga; recusar não pergunta de novo; fechar deixa pendente e pergunta na próxima abertura.
5. **Um provedor por porta.** Se duas extensões querem a mesma porta, a pessoa escolhe: a segunda pode ficar autorizada e desligada. "Extensões conectadas" troca quem está ligada.
6. **Declaração que muda.** Se a extensão passa a declarar um destino novo, o pedido volta e nada é entregue até a nova decisão.
7. **Descartar o registro** (o `Disposable`) desliga a conexão; a autorização guardada continua valendo se ela voltar a registrar.

## As três portas

| Porta | Recebe | Nunca recebe |
|---|---|---|
| `registerTelemetrySink` | eventos de atividade (`RunEvent`) da lista fechada do contrato agent-activity | conteúdo de arquivos, prompt, campos fora do contrato; e-mail em `by` é descartado |
| `registerRemoteSyncProvider` | só os arquivos de `.github/artifacts/**` que a pessoa marcar no comando "Enviar artefatos" | o token do State Service (`.state-service/`), os eventos (`runs/`), temporários |
| `registerTemplateSource` | o identificador do template e a versão pedida | qualquer dado do workspace |

O comando **"Jataí: Extensões Conectadas"** lista cada conexão com a porta e o estado (ligada, autorizada e desligada, recusada, aguardando) e deixa ligar, desligar ou revogar.

## Privacidade e rede

- O núcleo **nunca** faz rede: sem extensão, zero conexões; com uma extensão consentida, a saída acontece **só por ela** (o teste de zero egress vale com e sem uma extensão falsa).
- A telemetria chega ao provedor pelo bus de eventos do State Service (`RunsWatcher`) e passa pelo mesmo validador da escrita: só os campos do contrato, `metadata` restrita a `reason`/`task`/`path`/`count`, `message` cortada em 140 caracteres.
- O envio de artefatos só acontece por um comando explícito, com a lista marcada por quem usa.
- A decisão fica no `workspaceState` do VS Code: outra pasta, outra decisão.

## Limites conhecidos

- O VS Code não informa a identidade de quem chama. A conferência é pela pasta da extensão nos quadros da pilha; uma extensão instalada que se disfarce continua sendo código que a pessoa instalou, e o pedido mostra o nome do manifesto — mas não há como provar criptograficamente a origem.
- O envio de artefatos sincroniza o conteúdo no momento da escolha; mudanças posteriores exigem um novo envio.
- A extensão companheira é proprietária se quiser; a licença MIT do núcleo não impõe nada a ela e o núcleo nunca depende dela.
