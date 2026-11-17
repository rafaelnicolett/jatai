import { TriangleAlert } from "lucide-react";
import type { DataSourceIssue } from "@shared/cockpit-protocol";
import s from "./DegradedDataBanner.module.css";

interface DegradedDataBannerProps {
  issues: DataSourceIssue[];
}

/**
 * O mecanismo concreto por trás da diretriz "nunca mostrar estado obsoleto ou
 * inventado sem avisar" — antes desta Fase, uma falha de parse de qualquer um
 * dos 8 módulos de dados só ia pro `console.error` do Extension Host,
 * invisível pro operador. Agora aparece aqui, explicitamente.
 */
export function DegradedDataBanner({ issues }: DegradedDataBannerProps) {
  if (issues.length === 0) return null;
  return (
    <div className={s.banner} role="alert">
      <TriangleAlert size={18} strokeWidth={2} className={s.icon} />
      <div className={s.list}>
        {issues.map((issue) => (
          <div key={issue.source} className={s.item}>
            <strong>{issue.source}:</strong> {issue.message}
          </div>
        ))}
      </div>
    </div>
  );
}
