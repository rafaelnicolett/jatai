/** Data no formato do Brasil (dd/mm/aaaa), a partir de um texto ISO. */
export function formatarData(iso: string): string {
  const [dia] = iso.split("T");
  const [ano, mes, diaDoMes] = (dia ?? "").split("-");
  if (!ano || !mes || !diaDoMes) return iso;
  return `${diaDoMes}/${mes}/${ano}`;
}
