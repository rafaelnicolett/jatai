import { Component, type ReactNode } from "react";
import { Button } from "../../../../design-system/primitives";
import { StatusGlyph } from "../../../../design-system/primitives/StatusGlyph/StatusGlyph";
import s from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Muda quando a pessoa navega (outra iniciativa, outra vista): o erro de uma tela não segue para a próxima. */
  resetKey?: string;
  /** Qual tela falhou ("Quadro do épico"), para dizer onde. */
  label?: string;
  /** O que refazer antes de desenhar de novo (ex.: derivar o modelo outra vez); "Tentar de novo" chama isto. */
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * ErrorBoundary das telas do Cockpit (G9, DS v2 §4.0 "error"): uma exceção de
 * render deixou de apagar o painel inteiro. A tela que falhou é trocada por um
 * aviso com o motivo em texto e a ação "Tentar de novo"; a barra superior, o
 * resto da página e o teclado continuam vivos. `role="alert"` porque a tela
 * que a pessoa pediu não apareceu.
 *
 * Só a mensagem do erro vai para a tela: nunca a pilha, nunca conteúdo de
 * arquivo.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private readonly retry = (): void => {
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={s.box} role="alert">
        <h2 className={s.title}>
          <StatusGlyph status="blocked" size={16} /> {this.props.label ? `${this.props.label} falhou ao desenhar` : "Esta tela falhou ao desenhar"}
        </h2>
        <p className={s.message}>
          Nada foi gravado. Motivo: {error.message || "erro sem mensagem"}
        </p>
        <Button variant="secondary" size="md" onClick={this.retry}>
          Tentar de novo
        </Button>
      </div>
    );
  }
}
