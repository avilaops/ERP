// Regras de medição da revisão visual, separadas do navegador para poderem ser testadas.
// Os tamanhos e o mínimo de 44 px vêm de docs/ux.md.

export const VIEWPORTS = [
  { nome: '360x640', width: 360, height: 640 },
  { nome: '390x844', width: 390, height: 844 },
  { nome: '430x932', width: 430, height: 932 },
  { nome: '1366x768', width: 1366, height: 768 },
  { nome: '1440x900', width: 1440, height: 900 },
];

export const MIN_CONTROLE = 44;

/** Controle visível com altura abaixo do mínimo da casa. */
export function controleBaixo(altura, min = MIN_CONTROLE) {
  return altura > 0 && altura < min;
}

export class NavegacaoFalhou extends Error {}

/**
 * Abre a rota e devolve a resposta. Qualquer falha (erro de rede, sem resposta ou status
 * 4xx/5xx) vira NavegacaoFalhou: nunca seguimos medindo a página anterior.
 */
export async function visitar(page, url) {
  let resposta;
  try {
    resposta = await page.goto(url, { waitUntil: 'networkidle' });
  } catch (e) {
    throw new NavegacaoFalhou(`${url}: ${e.message.split('\n')[0]}`);
  }
  if (!resposta) throw new NavegacaoFalhou(`${url}: sem resposta`);
  if (resposta.status() >= 400) throw new NavegacaoFalhou(`${url}: status ${resposta.status()}`);
  return resposta;
}

/** Rotas que faltam ou se repetem em algum tamanho. Lista vazia quando a cobertura está completa. */
export function faltasDeCobertura(registros, rotas, viewports = VIEWPORTS) {
  const faltas = [];
  for (const vp of viewports) {
    for (const rota of rotas) {
      const n = registros.filter(r => r.vp === vp.nome && r.path === rota).length;
      if (n !== 1) faltas.push(`${vp.nome} ${rota}: ${n} registro(s)`);
    }
  }
  return faltas;
}
