"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MAX_ROWS, MIN_ROWS, ROWS_COOKIE } from "@/lib/rows";

/**
 * Measures how many rows of the list `listId` fit the screen together with
 * everything else the page shows (title, search, pager, the bars of a phone)
 * and, when that is not the number the server used, leaves it in a cookie and asks for the page again. It knows nothing of
 * what the rows show.
 */
export function FitRows({ listId, shown, minimum = MIN_ROWS, cookieName = ROWS_COOKIE }: { listId: string; shown: number; minimum?: number; cookieName?: string }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const list = document.getElementById(listId);
      const rows = list ? [...list.querySelectorAll<HTMLElement>("[data-row]")] : [];
      if (!list || rows.length === 0) return;
      // The usual height of a closed row: a name on two lines here and there evens out over the list.
      const closed = rows.filter((row) => !row.querySelector("details[open]")).map((row) => row.getBoundingClientRect().height).filter((height) => height > 0);
      const height = closed.length === 0 ? 0 : Math.max(...closed);
      if (height < 8) return;
      // Everything of the screen that is not the rows: what is above them, what comes after and the room kept for the bars.
      const main = list.closest("main");
      if (!main) return;
      // The end of what the page shows, not of the frame around it: on a wide screen the frame is as tall as the window whatever is inside.
      const last = main.lastElementChild;
      if (!last) return;
      const end = last.getBoundingClientRect().bottom + window.scrollY + parseFloat(getComputedStyle(main).paddingBottom);
      const around = end - list.getBoundingClientRect().height;
      const room = window.innerHeight - around;
      const fit = Math.min(MAX_ROWS, Math.max(minimum, Math.floor(room / height)));
      if (fit === shown) return;
      document.cookie = `${cookieName}=${fit}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    };
    measure();
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 250);
    };
    const main = document.getElementById(listId)?.closest("main");
    const observer = new ResizeObserver(later);
    if (main) observer.observe(main);
    if (main?.lastElementChild) observer.observe(main.lastElementChild);
    window.addEventListener("resize", later);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", later);
    };
  }, [listId, shown, minimum, cookieName, router]);
  return null;
}
