import s from "./ProgressBar.module.css";

interface ProgressBarProps {
  done: number;
  total: number;
  label?: string;
}

/** Fração done/total — usado no Board de Progresso, no Analítico e na Home. */
export function ProgressBar({ done, total, label }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={s.wrap}>
      <div className={s.track}>
        <div className={s.fill} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.text}>{label ?? `${done}/${total}`}</span>
    </div>
  );
}
