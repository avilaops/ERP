import forge from "node-forge";

/**
 * A self-signed certificate with its key, packed as a `.pfx` with a password:
 * what an A1 file looks like. Only for tests. The CNPJ goes in the name, as
 * ICP-Brasil writes it (`RAZAO SOCIAL:CNPJ`).
 */
export function testPfx({
  name = "ACADEMIA TESTE LTDA:48240052000161",
  password = "senha-de-teste",
  from = new Date("2026-01-01T00:00:00Z"),
  until = new Date("2027-01-01T00:00:00Z"),
  withKey = true,
}: { name?: string; password?: string; from?: Date; until?: Date; withKey?: boolean } = {}): Uint8Array {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = from;
  certificate.validity.notAfter = until;
  const subject = [{ name: "commonName", value: name }];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(withKey ? keys.privateKey : null, [certificate], password, { algorithm: "3des" });
  return new Uint8Array(Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary"));
}
