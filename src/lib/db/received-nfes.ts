import type { Queryable } from "@/lib/db/pool";
import { withQueryableConnection } from "@/lib/db/pool";
import type { ReceivedNfe } from "@/lib/fiscal/received-nfe";

export type ReceivedNfeSummary = Pick<ReceivedNfe, "accessKey" | "issuerDocument" | "issuerName" | "number" | "series" | "issuedAt" | "totalInvoice"> & {
  id: number; supplierId: number | null; purchaseId: number | null; itemCount: number; importedAt: Date;
};

export type ReceivedNfeDetail = ReceivedNfeSummary & Pick<ReceivedNfe, "protocol" | "recipientDocument" | "totalProducts" | "totalFreight" | "totalInsurance" | "totalOther" | "totalDiscount" | "totalIcms" | "totalIcmsSt" | "totalIpi" | "totalImportTax" | "totalPis" | "totalCofins"> & {
  items: (ReceivedNfe["items"][number] & { productId: number | null })[];
};

export class ReceivedNfeOperationError extends Error {}

/** Persists the exact authorized XML once. Repeating the same key returns the existing row. */
export async function importReceivedNfe(note: ReceivedNfe, who: string, conn: Queryable): Promise<{ id: number; created: boolean }> {
  if (!who.trim()) throw new Error("Falta dizer quem importou a NF-e.");
  return withQueryableConnection(conn, async (held) => {
    await held.query("BEGIN");
    try {
      const existing = await held.query<{ id: string; xml_sha256: string }>("SELECT id, xml_sha256 FROM fiscal_received_nfes WHERE access_key = $1 FOR UPDATE", [note.accessKey]);
      if (existing.rows[0]) {
        if (existing.rows[0].xml_sha256 !== note.xmlSha256) throw new Error("Já existe NF-e com esta chave e conteúdo diferente. A importação foi bloqueada para revisão.");
        await held.query("COMMIT");
        return { id: Number(existing.rows[0].id), created: false };
      }
      const inserted = await held.query<{ id: string }>(
        `INSERT INTO fiscal_received_nfes
          (access_key, xml_sha256, xml, protocol, status_code, issuer_document, issuer_name, recipient_document, number, series, issued_at,
           total_products, total_invoice, total_freight, total_insurance, total_other, total_discount, total_icms, total_icms_st, total_ipi, total_import_tax, total_pis, total_cofins, imported_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id`,
        [note.accessKey, note.xmlSha256, note.xml, note.protocol, note.statusCode, note.issuerDocument, note.issuerName, note.recipientDocument,
          note.number, note.series, note.issuedAt, note.totalProducts, note.totalInvoice, note.totalFreight, note.totalInsurance, note.totalOther, note.totalDiscount,
          note.totalIcms, note.totalIcmsSt, note.totalIpi, note.totalImportTax, note.totalPis, note.totalCofins, who],
      );
      const id = Number(inserted.rows[0].id);
      for (const item of note.items) {
        await held.query(
          `INSERT INTO fiscal_received_nfe_items
            (nfe_id, line_number, supplier_code, ean, description, ncm, cest, cfop, commercial_unit, quantity, unit_value, product_value, freight_value, insurance_value, discount_value, other_value,
             icms_value, icms_st_value, ipi_value, import_tax_value, pis_value, cofins_value)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [id, item.lineNumber, item.supplierCode, item.ean, item.description, item.ncm, item.cest, item.cfop, item.commercialUnit,
            item.quantity, item.unitValue, item.productValue, item.freightValue, item.insuranceValue, item.discountValue, item.otherValue,
            item.icmsValue, item.icmsStValue, item.ipiValue, item.importTaxValue, item.pisValue, item.cofinsValue],
        );
      }
      await held.query("COMMIT");
      return { id, created: true };
    } catch (error) {
      await held.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listReceivedNfes(conn: Queryable): Promise<ReceivedNfeSummary[]> {
  const { rows } = await conn.query(
    `SELECT n.id, n.access_key, n.issuer_document, n.issuer_name, n.number, n.series, n.issued_at, n.total_invoice,
            n.supplier_id, n.purchase_id, n.imported_at, count(i.line_number)::int AS item_count
       FROM fiscal_received_nfes n JOIN fiscal_received_nfe_items i ON i.nfe_id = n.id
      GROUP BY n.id ORDER BY n.issued_at DESC, n.id DESC`,
  );
  return rows.map((row) => ({ id: Number(row.id), accessKey: String(row.access_key), issuerDocument: String(row.issuer_document), issuerName: String(row.issuer_name),
    number: Number(row.number), series: Number(row.series), issuedAt: row.issued_at as Date, totalInvoice: Number(row.total_invoice),
    supplierId: row.supplier_id === null ? null : Number(row.supplier_id), purchaseId: row.purchase_id === null ? null : Number(row.purchase_id),
    itemCount: Number(row.item_count), importedAt: row.imported_at as Date }));
}

export async function receivedNfeXml(id: number, conn: Queryable): Promise<{ accessKey: string; xml: string } | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const { rows } = await conn.query("SELECT access_key, xml FROM fiscal_received_nfes WHERE id = $1", [id]);
  return rows[0] ? { accessKey: String(rows[0].access_key), xml: String(rows[0].xml) } : null;
}

export async function getReceivedNfe(id: number, conn: Queryable): Promise<ReceivedNfeDetail | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [header, lines] = await Promise.all([
    conn.query(`SELECT id, access_key, protocol, issuer_document, issuer_name, recipient_document, number, series, issued_at,
                       total_products, total_invoice, total_freight, total_insurance, total_other, total_discount, total_icms, total_icms_st, total_ipi, total_import_tax, total_pis, total_cofins,
                       supplier_id, purchase_id, imported_at
                  FROM fiscal_received_nfes WHERE id = $1`, [id]),
    conn.query(`SELECT line_number, supplier_code, ean, description, ncm, cest, cfop, commercial_unit, quantity, unit_value,
                       product_value, freight_value, insurance_value, discount_value, other_value, icms_value, icms_st_value, ipi_value, import_tax_value, pis_value, cofins_value, product_id
                  FROM fiscal_received_nfe_items WHERE nfe_id = $1 ORDER BY line_number`, [id]),
  ]);
  const row = header.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id), accessKey: String(row.access_key), protocol: String(row.protocol), issuerDocument: String(row.issuer_document), issuerName: String(row.issuer_name),
    recipientDocument: String(row.recipient_document), number: Number(row.number), series: Number(row.series), issuedAt: row.issued_at as Date,
    totalProducts: Number(row.total_products), totalInvoice: Number(row.total_invoice), totalFreight: Number(row.total_freight), totalInsurance: Number(row.total_insurance), totalOther: Number(row.total_other), totalDiscount: Number(row.total_discount),
    totalIcms: Number(row.total_icms), totalIcmsSt: Number(row.total_icms_st), totalIpi: Number(row.total_ipi), totalImportTax: Number(row.total_import_tax), totalPis: Number(row.total_pis), totalCofins: Number(row.total_cofins),
    supplierId: row.supplier_id === null ? null : Number(row.supplier_id), purchaseId: row.purchase_id === null ? null : Number(row.purchase_id),
    itemCount: lines.rows.length, importedAt: row.imported_at as Date,
    items: lines.rows.map((item) => ({ lineNumber: Number(item.line_number), supplierCode: item.supplier_code === null ? null : String(item.supplier_code),
      ean: item.ean === null ? null : String(item.ean), description: String(item.description), ncm: String(item.ncm), cest: item.cest === null ? null : String(item.cest),
      cfop: String(item.cfop), commercialUnit: String(item.commercial_unit), quantity: Number(item.quantity), unitValue: Number(item.unit_value),
      productValue: Number(item.product_value), freightValue: Number(item.freight_value), insuranceValue: Number(item.insurance_value), discountValue: Number(item.discount_value), otherValue: Number(item.other_value),
      icmsValue: Number(item.icms_value), icmsStValue: Number(item.icms_st_value), ipiValue: Number(item.ipi_value), importTaxValue: Number(item.import_tax_value), pisValue: Number(item.pis_value), cofinsValue: Number(item.cofins_value),
      productId: item.product_id === null ? null : Number(item.product_id) })),
  };
}

export async function linkReceivedNfeSupplier(nfeId: number, supplierId: number, who: string, conn: Queryable): Promise<void> {
  if (!Number.isSafeInteger(nfeId) || !Number.isSafeInteger(supplierId) || !who.trim()) throw new ReceivedNfeOperationError("NF-e, fornecedor ou responsável inválido.");
  const { rows } = await conn.query(
    `UPDATE fiscal_received_nfes n SET supplier_id = s.id, supplier_linked_at = now(), supplier_linked_by = $3
       FROM suppliers s WHERE n.id = $1 AND s.id = $2 AND n.purchase_id IS NULL AND s.document = n.issuer_document RETURNING n.id`,
    [nfeId, supplierId, who],
  );
  if (!rows[0]) throw new ReceivedNfeOperationError("Escolha o fornecedor com o mesmo CNPJ da NF-e; uma nota já confirmada não pode ser trocada.");
}

export async function linkReceivedNfeProduct(nfeId: number, lineNumber: number, productId: number, who: string, conn: Queryable): Promise<void> {
  if (![nfeId, lineNumber, productId].every((value) => Number.isSafeInteger(value) && value > 0) || !who.trim()) throw new ReceivedNfeOperationError("NF-e, item, produto ou responsável inválido.");
  const { rows } = await conn.query(
    `UPDATE fiscal_received_nfe_items i SET product_id = p.id, product_linked_at = now(), product_linked_by = $4
       FROM products p, fiscal_received_nfes n
      WHERE i.nfe_id = $1 AND i.line_number = $2 AND p.id = $3 AND n.id = i.nfe_id AND n.purchase_id IS NULL RETURNING i.line_number`,
    [nfeId, lineNumber, productId, who],
  );
  if (!rows[0]) throw new ReceivedNfeOperationError("Item ou produto não encontrado; uma nota já confirmada não pode ser alterada.");
}

/** Creates the purchase and cost history once. Stock remains untouched until the separate receiving action. */
export async function confirmReceivedNfePurchase(nfeId: number, who: string, conn: Queryable): Promise<{ purchaseId: number; created: boolean }> {
  if (!Number.isSafeInteger(nfeId) || nfeId < 1 || !who.trim()) throw new ReceivedNfeOperationError("NF-e ou responsável inválido.");
  return withQueryableConnection(conn, async (held) => {
    await held.query("BEGIN");
    try {
      const locked = await held.query(`SELECT id, supplier_id, purchase_id, number, access_key, issued_at FROM fiscal_received_nfes WHERE id = $1 FOR UPDATE`, [nfeId]);
      const note = locked.rows[0];
      if (!note) throw new ReceivedNfeOperationError("NF-e não encontrada.");
      if (note.purchase_id !== null) { await held.query("COMMIT"); return { purchaseId: Number(note.purchase_id), created: false }; }
      if (note.supplier_id === null) throw new ReceivedNfeOperationError("Confira e vincule o fornecedor antes de criar a compra.");
      const lines = await held.query(`SELECT line_number, product_id, quantity, product_value, freight_value, insurance_value, discount_value, other_value FROM fiscal_received_nfe_items WHERE nfe_id = $1 ORDER BY line_number FOR UPDATE`, [nfeId]);
      if (!lines.rows.length || lines.rows.some((line) => line.product_id === null)) throw new ReceivedNfeOperationError("Vincule todos os itens da nota aos produtos antes de criar a compra.");
      const purchase = await held.query<{ id: number }>(
        `INSERT INTO purchases (supplier_id, kind, reference, ordered_on, currency, exchange_rate, invoice_number, invoice_key, notes, updated_by)
         VALUES ($1, 'nacional', $2, ($3::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date, 'BRL', 1, $2, $4, 'Criada pela NF-e recebida', $5) RETURNING id`,
        [note.supplier_id, String(note.number), note.issued_at, note.access_key, who],
      );
      const purchaseId = Number(purchase.rows[0].id);
      await held.query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price)
         SELECT $2, product_id, sum(quantity), round(sum(product_value - discount_value) / sum(quantity), 4)
           FROM fiscal_received_nfe_items WHERE nfe_id = $1 GROUP BY product_id`, [nfeId, purchaseId],
      );
      const extras = await held.query(`SELECT COALESCE(sum(freight_value),0) AS freight, COALESCE(sum(insurance_value),0) AS insurance, COALESCE(sum(other_value),0) AS other FROM fiscal_received_nfe_items WHERE nfe_id = $1`, [nfeId]);
      for (const [label, value] of [["Frete da NF-e", Number(extras.rows[0].freight)], ["Seguro da NF-e", Number(extras.rows[0].insurance)], ["Outras despesas da NF-e", Number(extras.rows[0].other)]] as const) {
        if (value > 0) await held.query("INSERT INTO purchase_costs (purchase_id, label, amount, created_by) VALUES ($1,$2,$3,$4)", [purchaseId, label, value, who]);
      }
      await held.query(
        `INSERT INTO product_cost_history (product_id, nfe_id, line_number, unit_cost, components, recorded_by)
         SELECT product_id, nfe_id, line_number, round((product_value - discount_value + freight_value + insurance_value + other_value) / quantity, 4),
                jsonb_build_object('mercadoria',product_value,'desconto',discount_value,'frete',freight_value,'seguro',insurance_value,'outras_despesas',other_value,
                  'icms',icms_value,'icms_st',icms_st_value,'ipi',ipi_value,'imposto_importacao',import_tax_value,'pis',pis_value,'cofins',cofins_value), $2
           FROM fiscal_received_nfe_items WHERE nfe_id = $1`, [nfeId, who],
      );
      await held.query(
        `UPDATE products p SET advisory_cost = costs.unit_cost, updated_at = now(), updated_by = $2
           FROM (SELECT product_id, round(sum(product_value - discount_value + freight_value + insurance_value + other_value) / sum(quantity), 2) AS unit_cost
                   FROM fiscal_received_nfe_items WHERE nfe_id = $1 GROUP BY product_id) costs
          WHERE p.id = costs.product_id`, [nfeId, who],
      );
      await held.query("UPDATE fiscal_received_nfes SET purchase_id = $2 WHERE id = $1", [nfeId, purchaseId]);
      await held.query("COMMIT");
      return { purchaseId, created: true };
    } catch (error) {
      await held.query("ROLLBACK");
      throw error;
    }
  });
}

