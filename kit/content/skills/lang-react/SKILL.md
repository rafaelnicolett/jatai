---
id: lang-react
name: lang-react
type: skill
description: Boas práticas de React + Vite + TypeScript — idiomas, componentes, estado, forms, testes e performance. Independente do padrão arquitetural de pastas.
applicable_to:
  - "@frontend-react"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: lang-react

> Boas práticas da **linguagem TypeScript e framework React**, não do padrão de pastas.
> Para estrutura de diretórios (feature-based, clean, etc.), use `arch-feature-based` ou `arch-clean-frontend`.

---

## 1. Runtime e tooling

| Item | Padrão | Observação |
|---|---|---|
| Node | 20 LTS+ | `engines.node` no `package.json` |
| TypeScript | 5.x `strict: true` + `noUncheckedIndexedAccess: true` | `tsconfig.json` sem exceções |
| Bundler | Vite 5+ | `vite.config.ts` com path aliases |
| Linter | ESLint + `@typescript-eslint` | Sem `any` como regra de erro |
| Formatter | Prettier | `.prettierrc` no repo |
| CSS | Tailwind CSS **ou** CSS Modules — **1 por projeto** | Nunca os dois misturados |
| Server state | TanStack Query (React Query) v5 | Cache + invalidação declarativa |
| Client state | Zustand **ou** Jotai — **1 por projeto** | Redux apenas se já existente |
| Forms | React Hook Form + Zod | Schema Zod como fonte de verdade |
| HTTP | SDK gerado de `api/openapi.yaml` | Nunca `fetch`/`axios` direto |
| Routing | React Router v6 (loader/action) | TanStack Router alternativa aceitável |
| Test unit | Vitest + React Testing Library | `describe/it/expect` compatível com Jest |
| Test E2E | Playwright | `@playwright/test` |
| Storybook | Storybook 8 (opcional) | Para design system / component library |

## 2. TypeScript — regras inegociáveis

### 2.1 Sem `any` — nunca
```typescript
// ✅ Tipo explícito ou inferido
const aplicarCupom = async (carrinhoId: string, codigo: string): Promise<CarrinhoResponse> => { ... }

// ✅ unknown com narrowing
function processarWebhook(payload: unknown): PedidoCriadoEvent {
  if (!isPedidoCriadoEvent(payload)) throw new Error("Payload inválido");
  return payload;
}

// ❌ any — proibido
const resultado: any = await api.aplicarCupom(id, codigo);
```

### 2.2 Sem `enum` — use union types
```typescript
// ✅ Union type — tree-shakeable, type-safe, sem emissão JS
type StatusPedido = "pendente" | "pago" | "cancelado" | "entregue";
type NivelRisco = "baixo" | "medio" | "alto";

// ❌ enum — emite JS, import obrigatório, const enum tem problemas com isolatedModules
enum StatusPedido { Pendente, Pago, Cancelado }
```

### 2.3 Tipos de domínio — branded types para IDs
```typescript
// ✅ Branded type evita confundir CarrinhoId com PedidoId
type CarrinhoId = string & { readonly _brand: "CarrinhoId" };
type PedidoId = string & { readonly _brand: "PedidoId" };

const criarCarrinhoId = (id: string): CarrinhoId => id as CarrinhoId;

// ❌ string puro — qualquer string passa onde esperamos CarrinhoId
function buscarCarrinho(id: string) { ... }  // aceita PedidoId por engano
```

### 2.4 Zod como fonte de verdade de schemas
```typescript
// ✅ Zod schema → TypeScript type (DRY)
const CupomSchema = z.object({
  codigo: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/),
  desconto: z.number().min(1).max(100),
});
type Cupom = z.infer<typeof CupomSchema>;

// Em form: React Hook Form + zodResolver
const { register, handleSubmit, formState: { errors } } = useForm<Cupom>({
  resolver: zodResolver(CupomSchema),
});
```

## 3. Componentes React — boas práticas

### 3.1 Componentes funcionais + hooks — sem class components
```typescript
// ✅ Componente funcional com tipos explícitos
interface CarrinhoCardProps {
  carrinhoId: CarrinhoId;
  onCupomAplicado: (desconto: number) => void;
}

export function CarrinhoCard({ carrinhoId, onCupomAplicado }: CarrinhoCardProps) {
  const { data: carrinho, isLoading } = useCarrinho(carrinhoId);

  if (isLoading) return <CarrinhoSkeleton />;
  if (!carrinho) return <CarrinhoVazio />;

  return <div>...</div>;
}
```

### 3.2 Custom hooks para lógica reutilizável
```typescript
// ✅ Hook extrai lógica do componente
function useAplicarCupom(carrinhoId: CarrinhoId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (codigo: string) => api.carrinhos.aplicarCupom(carrinhoId, { codigo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["carrinho", carrinhoId] }),
  });
}

// No componente: simples e limpo
const { mutate: aplicarCupom, isPending } = useAplicarCupom(carrinhoId);
```

### 3.3 Estado — regra das 3 perguntas
Antes de usar estado:
1. É derivado de props? → Compute, não armazene.
2. É estado do servidor? → TanStack Query, não `useState`.
3. É global da UI? → Zustand/Jotai. Local? → `useState`.

```typescript
// ✅ TanStack Query para dados do servidor
const { data: pedidos } = useQuery({
  queryKey: ["pedidos", { status: "pendente" }],
  queryFn: () => api.pedidos.listar({ status: "pendente" }),
  staleTime: 30_000,
});

// ❌ useEffect + useState para dados do servidor — anti-padrão
const [pedidos, setPedidos] = useState<Pedido[]>([]);
useEffect(() => {
  fetch("/api/pedidos").then(r => r.json()).then(setPedidos);
}, []);
```

### 3.4 Performance — sem otimizações prematuras
```typescript
// ✅ Memo apenas quando profiling mostrar problema
const CarrinhoItem = memo(function CarrinhoItem({ item }: { item: ItemCarrinho }) {
  return <div>{item.nome}</div>;
});

// ✅ useMemo para computação cara medida
const totalComDesconto = useMemo(
  () => calcularTotalComDesconto(itens, desconto),
  [itens, desconto]
);

// ❌ memo/useMemo/useCallback em tudo — premature optimization
```

## 4. Formulários com React Hook Form + Zod

```typescript
const AplicarCupomSchema = z.object({
  codigo: z.string()
    .min(1, "Código obrigatório")
    .max(50, "Máximo 50 caracteres")
    .regex(/^[A-Z0-9_-]+$/, "Apenas letras maiúsculas, números e -_"),
});

type AplicarCupomForm = z.infer<typeof AplicarCupomSchema>;

export function FormAplicarCupom({ carrinhoId }: { carrinhoId: CarrinhoId }) {
  const { mutate, isPending, error } = useAplicarCupom(carrinhoId);
  const { register, handleSubmit, formState: { errors } } = useForm<AplicarCupomForm>({
    resolver: zodResolver(AplicarCupomSchema),
  });

  return (
    <form onSubmit={handleSubmit(data => mutate(data.codigo))}>
      <input {...register("codigo")} placeholder="PROMO10" />
      {errors.codigo && <p role="alert">{errors.codigo.message}</p>}
      <button type="submit" disabled={isPending}>Aplicar</button>
    </form>
  );
}
```

## 5. Acessibilidade (A11y) — obrigatório

```typescript
// ✅ Roles semânticos e aria-labels
<button aria-label="Remover item Tênis Nike do carrinho" onClick={() => remover(item.id)}>
  <TrashIcon aria-hidden="true" />
</button>

// ✅ Loading states acessíveis
<div aria-live="polite" aria-busy={isLoading}>
  {isLoading ? <Spinner /> : <ListaPedidos pedidos={pedidos} />}
</div>

// ✅ Erros de form ligados ao input
<label htmlFor="cupom-codigo">Código do cupom</label>
<input id="cupom-codigo" aria-describedby="cupom-error" {...register("codigo")} />
<p id="cupom-error" role="alert">{errors.codigo?.message}</p>
```

## 6. Pirâmide de testes (React)

```
     ▲ E2E (≤10%)        Playwright — jornadas críticas
    ╱─╲ Integração (≈20%) Vitest + RTL — componentes compostos + MSW
   ╱───╲ Unitário (≥70%)  Vitest — hooks, utils, lógica pura
```

```typescript
// ✅ Teste de componente com RTL — comportamento, não implementação
describe("FormAplicarCupom", () => {
  it("exibe erro quando cupom tem caracteres inválidos", async () => {
    render(<FormAplicarCupom carrinhoId={criarCarrinhoId("test-id")} />);

    await userEvent.type(screen.getByPlaceholderText("PROMO10"), "promo!@#");
    await userEvent.click(screen.getByRole("button", { name: /aplicar/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Apenas letras maiúsculas");
  });
});

// ✅ MSW para mockar chamadas HTTP
const server = setupServer(
  http.post("/v1/carrinhos/:id/cupom", () => HttpResponse.json({ desconto: 10 })),
);
```

## 7. Naming conventions

| Elemento | Convenção | Exemplo |
|---|---|---|
| Componentes | `PascalCase` | `CarrinhoCard`, `FormAplicarCupom` |
| Hooks | `useCamelCase` | `useCarrinho`, `useAplicarCupom` |
| Funções/variáveis | `camelCase` | `aplicarCupom`, `totalLiquido` |
| Constantes | `UPPER_SNAKE` | `MAX_ITENS_CARRINHO` |
| Types/Interfaces | `PascalCase` | `CarrinhoResponse`, `Cupom` |
| Arquivos componente | `PascalCase.tsx` | `CarrinhoCard.tsx` |
| Arquivos hook/util | `camelCase.ts` | `useCarrinho.ts`, `formatarMoeda.ts` |

## 8. Anti-padrões específicos de React/TypeScript

- ❌ `any` em qualquer lugar
- ❌ `enum` — use union types
- ❌ `useEffect` para buscar dados do servidor (use TanStack Query)
- ❌ Chamadas HTTP diretas com `fetch`/`axios` (use SDK gerado)
- ❌ Lógica de negócio dentro de componentes (extraia para hooks/utils)
- ❌ Prop drilling além de 2 níveis (use context ou store)
- ❌ `key={index}` em listas com reordenação
- ❌ CSS inline (`.style={{ color: 'red' }}`) — use classes
- ❌ Componente > 150 linhas sem split
- ❌ Mutação direta de estado (`state.items.push(...)`) — use imutabilidade
