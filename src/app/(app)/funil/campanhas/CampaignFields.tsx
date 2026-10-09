import { INPUT, LABEL } from "@/components/ui";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_WORDS } from "@/lib/db/campaigns";
import type { Campaign } from "@/lib/db/campaigns";
import { UFS } from "@/lib/pricing/states";

/** The fields of a campaign, the same to create and to change a draft. */
export function CampaignFields({ saved }: { saved: Campaign | null }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {saved && <input type="hidden" name="id" value={saved.id} />}
      <div className="md:col-span-2">
        <label htmlFor="name" className={LABEL}>
          Nome da campanha (só a equipe vê)
        </label>
        <input id="name" name="name" type="text" defaultValue={saved?.name ?? ""} placeholder="Ex.: Lançamento da linha nova" autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor="audience" className={LABEL}>
          Para quem
        </label>
        <select id="audience" name="audience" defaultValue={saved?.audience ?? "clientes"} className={INPUT}>
          {Object.entries(CAMPAIGN_AUDIENCES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="uf" className={LABEL}>
          Estado (só para clientes)
        </label>
        <select id="uf" name="uf" defaultValue={saved?.uf ?? ""} className={INPUT}>
          <option value="">Todos</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label htmlFor="subject" className={LABEL}>
          Assunto do e-mail
        </label>
        <input id="subject" name="subject" type="text" defaultValue={saved?.subject ?? ""} autoComplete="off" className={INPUT} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="body" className={LABEL}>
          Texto ({CAMPAIGN_WORDS.map(([word]) => `{${word}}`).join(", ")} são preenchidos no envio)
        </label>
        <textarea id="body" name="body" rows={8} defaultValue={saved?.body ?? ""} className={`${INPUT} py-2`} />
        <p className="mt-1 text-xs text-slate-600">O link para a pessoa não receber mais entra sozinho no fim de cada e-mail.</p>
      </div>
    </div>
  );
}
