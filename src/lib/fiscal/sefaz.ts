import { request } from "node:https";

/**
 * The conversation with SEFAZ for authorising an NF-e (web service
 * NFeAutorizacao4, synchronous, one invoice per batch): the envelope that goes,
 * the reading of what comes back and the file that is kept. The pure parts
 * (envelope, parsing, nfeProc) know nothing of network; `transmit` is the only
 * thing here that talks to anyone.
 */

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const WSDL = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";

/** A refusal the company can read: the message goes to the screen as it is. */
export class SefazError extends Error {}

/**
 * Where each state authorises. Only what was checked against the published
 * list is here: a state that is missing is an error, never a guess.
 */
const AUTHORIZATION_URLS: Record<string, { homologacao: string; producao: string }> = {
  SP: {
    homologacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
    producao: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
  },
};

export function authorizationUrl(uf: string, environment: "homologacao" | "producao"): string {
  const urls = AUTHORIZATION_URLS[uf];
  if (!urls) throw new SefazError(`A emissão ainda não está configurada para empresas de ${uf || "estado não informado"}: só São Paulo.`);
  return urls[environment];
}

export const AUTHORIZATION_ACTION = `${WSDL}/nfeAutorizacaoLote`;

/** The SOAP 1.2 envelope with one signed invoice, asking for the answer in the same call. */
export function authorizationEnvelope(signedXml: string, batch: string): string {
  if (!/^\d{1,15}$/.test(batch)) throw new Error("O número do lote tem de 1 a 15 dígitos.");
  const invoice = signedXml.replace(/^<\?xml[^>]*\?>/, "");
  if (!invoice.startsWith(`<NFe xmlns="${NFE_NS}">`) || !invoice.includes("<Signature ")) throw new Error("Só uma nota assinada vai para a SEFAZ.");
  return (
    `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>` +
    `<nfeDadosMsg xmlns="${WSDL}"><enviNFe xmlns="${NFE_NS}" versao="4.00"><idLote>${batch}</idLote><indSinc>1</indSinc>${invoice}</enviNFe></nfeDadosMsg>` +
    `</soap12:Body></soap12:Envelope>`
  );
}

export type AuthorizationResult =
  | { status: "autorizada"; code: string; reason: string; protocol: string; protocolXml: string }
  | { status: "rejeitada"; code: string; reason: string }
  /** Denied for a fiscal irregularity of who issues or receives: the number is spent. */
  | { status: "denegada"; code: string; reason: string; protocol: string; protocolXml: string }
  /** SEFAZ answered, but not with a verdict on the invoice (service stopped, batch still being processed…). */
  | { status: "sem-resposta"; code: string; reason: string };

const pick = (xml: string, name: string) => new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`).exec(xml)?.[1] ?? null;
const unescape = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

/** Authorised: 100, and 150 (outside the deadline). Denied: 110, 301, 302, 303. */
const AUTHORIZED = new Set(["100", "150"]);
const DENIED = new Set(["110", "301", "302", "303"]);

/**
 * Reads the answer of the authorisation for the invoice of `accessKey`. The
 * verdict is the one inside the protocol of that key; an answer without it is
 * a rejection of the batch, or no answer at all. Anything that is not an
 * answer of SEFAZ throws.
 */
export function parseAuthorization(response: string, accessKey: string): AuthorizationResult {
  const batch = /<retEnviNFe[\s\S]*<\/retEnviNFe>/.exec(response)?.[0];
  if (!batch) {
    const fault = pick(response, "Text") ?? pick(response, "faultstring");
    throw new SefazError(fault ? `A SEFAZ recusou a chamada: ${unescape(fault)}` : "A resposta da SEFAZ não é a esperada. Tente de novo em instantes.");
  }
  const protocolXml = /<protNFe[\s\S]*?<\/protNFe>/.exec(batch)?.[0] ?? null;
  if (protocolXml) {
    if (pick(protocolXml, "chNFe") !== accessKey) throw new SefazError("A SEFAZ respondeu sobre outra nota. Nada foi gravado como autorizado.");
    const code = pick(protocolXml, "cStat") ?? "";
    const reason = unescape(pick(protocolXml, "xMotivo") ?? "");
    const protocol = pick(protocolXml, "nProt");
    if (AUTHORIZED.has(code) && protocol) return { status: "autorizada", code, reason, protocol, protocolXml };
    if (DENIED.has(code) && protocol) return { status: "denegada", code, reason, protocol, protocolXml };
    return { status: "rejeitada", code, reason };
  }
  const code = pick(batch, "cStat") ?? "";
  const reason = unescape(pick(batch, "xMotivo") ?? "");
  // 2xx and above at the level of the batch are rejections; 1xx without a protocol is not a verdict yet.
  return Number(code) >= 200 ? { status: "rejeitada", code, reason } : { status: "sem-resposta", code, reason };
}

/** What the company keeps and sends to its customer: the signed invoice with the protocol of SEFAZ. */
export function nfeProcXml(signedXml: string, protocolXml: string): string {
  const invoice = signedXml.replace(/^<\?xml[^>]*\?>/, "");
  // Inside nfeProc the protocol inherits the namespace: a declaration of its own is dropped.
  const protocol = protocolXml.replace(/^<protNFe\s+xmlns="[^"]*"/, "<protNFe");
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NFE_NS}" versao="4.00">${invoice}${protocol}</nfeProc>`;
}

export type Channel = {
  /** The A1 of the company: SEFAZ only talks to who presents it. */
  pfx: Buffer;
  passphrase: string;
  /** Roots to trust besides the system's (ICP-Brasil), PEM. The server's certificate is always checked. */
  ca?: string | Buffer;
  timeoutMs?: number;
};

/**
 * Posts an envelope and answers with the body. The connection presents the
 * company's certificate and checks SEFAZ's: verification is never turned off.
 * The certificate and its password are never part of an error message.
 */
export function transmit(url: string, action: string, envelope: string, channel: Channel): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(envelope, "utf8");
    const call = request(
      url,
      {
        method: "POST",
        pfx: channel.pfx,
        passphrase: channel.passphrase,
        ca: channel.ca,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        timeout: channel.timeoutMs ?? 30_000,
        headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"`, "Content-Length": body.length },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          // SOAP faults come with 500 and a body worth reading; anything else without a body is a failure of the channel.
          if (text.trim() === "") reject(new SefazError(`A SEFAZ respondeu sem conteúdo (HTTP ${response.statusCode}). Tente de novo em instantes.`));
          else resolve(text);
        });
      },
    );
    call.on("timeout", () => call.destroy(new SefazError("A SEFAZ não respondeu a tempo. Antes de tentar de novo, confira se a nota não foi autorizada.")));
    call.on("error", (error: NodeJS.ErrnoException) => {
      if (error instanceof SefazError) return reject(error);
      const tls = /certificate|self.signed|unable to verify|issuer/i.test(error.message);
      reject(new SefazError(tls ? "Não foi possível confirmar a identidade do servidor da SEFAZ (cadeia de certificados). Nada foi enviado." : `Não foi possível falar com a SEFAZ (${error.code ?? "falha de rede"}). Nada foi autorizado.`));
    });
    call.end(body);
  });
}
