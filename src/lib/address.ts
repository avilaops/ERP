import { findCity } from "@/lib/fiscal/cities";

const title = (value: string) => value.toLocaleLowerCase("pt-BR").replace(/(^|[\s-])\p{L}/gu, (part) => part.toLocaleUpperCase("pt-BR")).replace(/\b(Da|Das|De|Do|Dos|E)\b/g, (part) => part.toLowerCase());

/** Removes only an exact trailing duplicate number; street names containing numbers stay intact. */
export function normalizedAddress<T extends { street: string | null; streetNumber: string | null; complement?: string | null; district: string | null; city: string | null; uf: string | null }>(place: T): T {
  let street = place.street?.trim() ?? null;
  const number = place.streetNumber?.trim() ?? null;
  if (street && number) {
    const parts = street.split(/,\s*/);
    if (parts.length > 1 && parts[parts.length - 1].toLowerCase() === number.toLowerCase()) street = parts.slice(0, -1).join(", ");
  }
  return { ...place, street, streetNumber: number,
    complement: place.complement?.trim().toLowerCase() === number?.toLowerCase() ? null : place.complement,
    district: place.district ? title(place.district) : null,
    city: findCity(place.city, place.uf)?.name ?? place.city };
}
