ALTER TABLE payment_methods ADD COLUMN company_pix boolean NOT NULL DEFAULT false;
-- Only the built-in direct PIX method is opted in; provider flows stay off.
UPDATE payment_methods SET company_pix=true WHERE label='PIX' AND nfe_code='17' AND NOT on_delivery;
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_company_pix
  CHECK (NOT company_pix OR (nfe_code IS NOT NULL AND nfe_code='17' AND NOT on_delivery));

-- Freeze currently effective terms for already locked orders. This cannot
-- reconstruct historical defaults that changed before this migration.
UPDATE orders o SET proposal_details =
  '{"phone":"","email":"","website":"","warranty":"","installation":"","latePayment":"","cancellation":"","delayedDownPayment":"","freightMode":"","freightAmount":"","freightTerms":"","deliveryEstimate":"","deliveryNotes":""}'::jsonb
  || c.proposal_details || o.proposal_details,
  proposal_details_revision=o.proposal_details_revision+1
FROM company_settings c
WHERE o.status='fechado'
   OR EXISTS (SELECT 1 FROM order_contracts d WHERE d.order_id=o.id AND d.status IN ('enviado','assinado'))
   OR EXISTS (SELECT 1 FROM fiscal_invoices f WHERE f.order_id=o.id AND f.status IN ('assinada','autorizada','denegada'));
