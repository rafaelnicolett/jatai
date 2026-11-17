import { Component, createRef, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../../design-system/primitives";
import { StatusGlyph } from "../../../design-system/primitives/StatusGlyph/StatusGlyph";
import s from "./MapErrorBoundary.module.css";

interface Props {
  children: ReactNode;
  /** Voltar ao Cockpit: o botão e Esc. */
  onBack: () => void;
}

interface State {
  error: Error | null;
}

/**
 * O ErrorBoundary do mapa da colmeia (F5.3, G9): uma exceção ao desenhar o mapa
 * não apaga o painel inteiro. O mapa é trocado por um aviso com o motivo em
 * texto, e "Voltar ao Cockpit" (ou Esc) leva de volta à tela que a pessoa
 * tinha, intacta. É uma seção `data-scene` para continuar à frente do Cockpit
 * (o CSS esconde o resto da raiz enquanto a vista é o mapa).
 *
 * Só a mensagem do erro vai para a tela: nunca a pilha, nunca conteúdo de arquivo.
 *
 * Distinto do `ErrorBoundary` das telas: aqui o mapa ocupa a cena inteira e o
 * Cockpit está escondido (`html[data-view="map"]`), então o aviso precisa do
 * mesmo lugar do mapa e de "Voltar ao Cockpit" — um aviso dentro da página não
 * teria para onde voltar.
 */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  private readonly box = createRef<HTMLDivElement>();

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(): void {
    // O mapa some inteiro e o foco ficaria num botão que o CSS escondeu. Levar
    // o foco ao aviso mantém o teclado (Tab) e o Esc funcionando.
    this.box.current?.focus();
  }

  private readonly retry = (): void => this.setState({ error: null });

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    this.props.onBack();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className={s.root} data-scene="" aria-label="Mapa da colmeia" onKeyDown={this.onKeyDown}>
        <div className={s.box} role="alert" tabIndex={-1} ref={this.box}>
          <h2 className={s.title}>
            <StatusGlyph status="failed" size={16} /> O mapa da colmeia falhou ao desenhar
          </h2>
          <p className={s.message}>Nada foi gravado. Motivo: {error.message || "erro sem mensagem"}</p>
          <div className={s.actions}>
            <Button variant="accent" icon={<ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />} onClick={this.props.onBack}>
              Voltar ao Cockpit
            </Button>
            <Button variant="secondary" onClick={this.retry}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </section>
    );
  }
}
