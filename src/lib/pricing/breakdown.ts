import { roundCents } from "@/lib/pricing/money";
import type { DirectorQuote, SaleQuote } from "@/lib/pricing/order";
import type { PricingParams } from "@/lib/pricing/params";
import { saleTaxes } from "@/lib/pricing/taxes";
import type { Destination } from "@/lib/pricing/taxes";

export type BreakdownLine = {
  label: string;
  /** In reais; what leaves the sale is negative. */
  amount: number;
  /** Over the value of the sale without IPI. */
  share: number;
  kind: "sale" | "cost" | "subtotal" | "profit";
};

/**
 * Where each real of a sale goes, line by line, for the directors: the same
 * figures of the board (`quoteOrder`), opened by what they are. The lines of
 * taxes and fees add up to `quote.taxes`; a line that is zero is left out.
 */
export function saleBreakdown(quote: SaleQuote & DirectorQuote, params: PricingParams, destination: Destination): BreakdownLine[] {
  const { netSale } = quote;
  const { icms } = saleTaxes(params, destination);
  const channel = params.commission + params.ads + params.gateway + params.otherSalesRate;
  const provisions = params.lossProvision + params.warrantyProvision + params.defaultProvision;
  const taken = (label: string, amount: number): BreakdownLine => ({ label, amount: -roundCents(amount), share: netSale > 0 ? -amount / netSale : 0, kind: "cost" });
  const percent = (rate: number) => `${(Math.round(rate * 10000) / 100).toLocaleString("pt-BR")}%`;
  const costs = [
    taken(`ICMS (${percent(icms)})`, netSale * icms),
    taken(`DIFAL e fundo do destino (${percent(quote.difalRate)})`, quote.difal),
    taken(`PIS + COFINS (${percent(params.pisCofins)})`, netSale * params.pisCofins),
    taken(`Comissão, anúncios e taxas do canal (${percent(channel)})`, netSale * channel),
    taken(`Perdas, garantia e inadimplência (${percent(provisions)})`, netSale * provisions),
    taken("Frete por nossa conta", quote.freight),
    taken("Taxa fixa do pedido", quote.fixedFee),
    taken("Custo dos equipamentos", quote.equipmentCost),
  ].filter((line) => line.amount !== 0);
  return [
    { label: "Valor da venda", amount: roundCents(netSale), share: 1, kind: "sale" },
    ...costs,
    { label: "Sobra antes do IR", amount: quote.profitBeforeIncomeTax, share: netSale > 0 ? quote.profitBeforeIncomeTax / netSale : 0, kind: "subtotal" },
    ...[taken(`IRPJ + CSLL (${percent(params.incomeTax)} da sobra)`, quote.incomeTax)].filter((line) => line.amount !== 0),
    { label: "Lucro líquido", amount: quote.netProfit, share: quote.netProfitRate, kind: "profit" },
  ];
}
