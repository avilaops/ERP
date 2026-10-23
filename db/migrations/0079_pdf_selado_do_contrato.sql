-- PDF com o selo ICP-Brasil, gravado na mesma transação que conclui a assinatura.
-- Nulo enquanto o contrato não foi assinado, e também nos que já estavam assinados
-- antes desta coluna: esses não ganham um selo retroativo.
ALTER TABLE order_contracts
  ADD COLUMN sealed_pdf bytea
  CHECK (sealed_pdf IS NULL OR octet_length(sealed_pdf) BETWEEN 100 AND 12000000);
