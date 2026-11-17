import { Button } from "../../../design-system/primitives";
import { Modal } from "../../../design-system/patterns";
import { openArtifact, openArtifactDiff } from "../../../store/decisionActions";
import type { TaskModel } from "../view/deriveBoard";
import s from "./TaskDetails.module.css";

interface TaskDetailsProps {
  task: TaskModel | null;
  onClose: () => void;
}

/**
 * Detalhes de uma tarefa (DS v2 §4.5: o título abre um `Modal` com as
 * evidências): o commit, a data, os artefatos (abrir o arquivo e ver as
 * mudanças no git) e os pontos de atenção registrados. Só metadados: nenhum
 * conteúdo de arquivo aparece aqui.
 */
export function TaskDetails({ task, onClose }: TaskDetailsProps) {
  return (
    <Modal open={task !== null} onClose={onClose} eyebrow={task?.key} title={task?.title ?? ""}>
      {task && (
        <dl className={s.list}>
          {task.details.completedAt && (
            <div>
              <dt>Concluída em</dt>
              <dd>{task.details.completedAt}</dd>
            </div>
          )}
          {task.details.commit && (
            <div>
              <dt>Commit</dt>
              <dd className={s.mono}>{task.details.commit}</dd>
            </div>
          )}
          {task.details.artifacts.length > 0 && (
            <div>
              <dt>Artefatos</dt>
              <dd>
                <ul className={s.artifacts}>
                  {task.details.artifacts.map((path) => (
                    <li key={path}>
                      <button type="button" className={s.link} onClick={() => openArtifact(path)}>
                        {path}
                      </button>
                      <Button variant="tertiary" size="sm" aria-label={`Ver as mudanças de ${path}`} onClick={() => openArtifactDiff(path)}>
                        Ver mudanças
                      </Button>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {task.details.knownBugs.length > 0 && (
            <div>
              <dt>Pontos de atenção</dt>
              <dd>
                <ul className={s.bugs}>
                  {task.details.knownBugs.map((bug) => (
                    <li key={bug}>{bug}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </Modal>
  );
}
