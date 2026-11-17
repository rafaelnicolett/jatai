export async function pegar<T>(caminho: string): Promise<T> {
  const resposta = await fetch(`/api${caminho}`);
  if (!resposta.ok) throw new Error(`Falha ao consultar ${caminho}: ${resposta.status}`);
  return (await resposta.json()) as T;
}

export async function enviar<T>(caminho: string, corpo: unknown): Promise<T> {
  const resposta = await fetch(`/api${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) throw new Error(`Falha ao enviar para ${caminho}: ${resposta.status}`);
  return (await resposta.json()) as T;
}
