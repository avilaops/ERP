import Link from "next/link";
import { PageHeader, PRIMARY, SECONDARY } from "@/components/ui";

export default function AppNotFound() {
  return (
    <section>
      <PageHeader
        title="Página não encontrada"
        hint="O endereço pode estar desatualizado ou o registro não está mais disponível."
      />
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className={PRIMARY}>Voltar ao início</Link>
        <Link href="/pedidos" className={SECONDARY}>Ver pedidos</Link>
      </div>
    </section>
  );
}
