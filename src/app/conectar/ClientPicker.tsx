"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import type { ConnectClient } from "@/lib/mcp/clients";

const BOX = "min-w-0 flex-1 break-all rounded border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm";
const COPY = "inline-flex min-h-[var(--control)] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50";
const GO = "inline-flex min-h-[var(--control)] items-center justify-center rounded-lg bg-brand px-5 text-base font-semibold text-white hover:opacity-90";

/** The choice of the assistant and the steps for it. Everything shown was prepared by the server; here only the choice changes. */
export function ClientPicker({ clients, serverUrl }: { clients: ConnectClient[]; serverUrl: string }) {
  const [chosen, setChosen] = useState(clients[0].id);
  const client = clients.find((item) => item.id === chosen) ?? clients[0];
  const groups = [...new Set(clients.map((item) => item.group))];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="assistente" className="block text-sm font-medium text-slate-700">
          Qual assistente você usa
        </label>
        <select id="assistente" value={chosen} onChange={(event) => setChosen(event.target.value)} className="mt-1 block min-h-[var(--control)] w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand">
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {clients.filter((item) => item.group === group).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-800">
        {client.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {client.installLink && (
        <a href={client.installLink} className={GO}>
          Adicionar ao {client.name}
        </a>
      )}
      {client.command && (
        <div className="flex flex-wrap items-center gap-2">
          <code className={BOX}>{client.command}</code>
          <CopyButton text={client.command} label="Copiar" className={COPY} />
        </div>
      )}
      {client.loginCommand && (
        <div className="flex flex-wrap items-center gap-2">
          <code className={BOX}>{client.loginCommand}</code>
          <CopyButton text={client.loginCommand} label="Copiar" className={COPY} />
        </div>
      )}
      {!client.command && (
        <div>
          <p className="text-sm font-medium text-slate-700">Endereço do ERP para o assistente</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className={BOX}>{serverUrl}</code>
            <CopyButton text={serverUrl} label="Copiar" className={COPY} />
          </div>
        </div>
      )}
      {client.openUrl && (
        <a href={client.openUrl} target="_blank" rel="noreferrer" className={GO}>
          Abrir os conectores do {client.name}
        </a>
      )}
    </div>
  );
}
