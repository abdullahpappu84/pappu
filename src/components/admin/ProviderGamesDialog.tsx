"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner, inputCls } from "@/components/ui/kit";
import { api, errMsg } from "@/lib/api";

type ProviderGamesData = {
  provider: { id: number; name: string };
  games: { id: number; name: string; thumbnail: string | null; status: string; providerGameId: string | null; aggregatorGameId: string | null; categoryIds: number[] }[];
  categories: { id: number; name: string; isActive: boolean }[];
};

export function ProviderGamesDialog({ providerId, canEdit, onClose }: { providerId: number; canEdit: boolean; onClose: () => void }) {
  const [data, setData] = useState<ProviderGamesData | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let current = true;
    api<ProviderGamesData>(`/api/admin/providers/${providerId}/games`).then((result) => {
      if (current) setData(result);
    }).catch((e) => {
      if (current) setError(errMsg(e));
    });
    return () => { current = false; };
  }, [providerId]);

  const visibleGames = useMemo(() => (data?.games ?? []).filter((game) => game.name.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const toggle = (id: number) => setSelected((old) => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const assign = async () => {
    if (!categoryId || !selected.size) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ assigned: number; category: string }>(`/api/admin/providers/${providerId}/games/categories`, {
        body: { gameIds: [...selected], categoryId: Number(categoryId) },
      });
      setData((old) => old ? { ...old, games: old.games.map((game) => selected.has(game.id) && !game.categoryIds.includes(Number(categoryId)) ? { ...game, categoryIds: [...game.categoryIds, Number(categoryId)] } : game) } : old);
      setMessage(`${result.assigned} game(s) assigned to ${result.category}.`);
      setSelected(new Set());
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  return <Modal open onClose={onClose} label="Provider games" maxWidth="md:max-w-[760px]">
    <div className="p-5 md:p-7">
      <h2 className="font-display text-[22px] font-semibold text-white">{data?.provider.name ?? "Provider"} games</h2>
      <p className="mt-1 text-[13px] text-white/50">{data ? `${data.games.length} games` : "Loading provider games…"}</p>
      {data && <>
        <input className={`${inputCls} mt-4`} placeholder="Search provider games…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl border border-white/10">
          {visibleGames.length ? visibleGames.map((game) => <label key={game.id} className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0 hover:bg-white/[0.03]">
            <input type="checkbox" className="accent-[#f0b93f]" disabled={!canEdit} checked={selected.has(game.id)} onChange={() => toggle(game.id)} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {game.thumbnail ? <img src={game.thumbnail} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded bg-white/5" />}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{game.name}</span><span className="block text-[11px] text-white/45">{game.status}</span></span>
            <span className="max-w-[180px] text-right text-[11px] text-white/45">{game.categoryIds.map((id) => data.categories.find((cat) => cat.id === id)?.name).filter(Boolean).join(", ") || "No category"}</span>
          </label>) : <p className="p-5 text-center text-sm text-white/45">No games found for this provider.</p>}
        </div>
        {canEdit && <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select className={`${inputCls} flex-1`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select an existing category</option>
            {data.categories.map((category) => <option key={category.id} value={category.id} className="bg-ink-800">{category.name}{category.isActive ? "" : " (disabled)"}</option>)}
          </select>
          <Button disabled={busy || !selected.size || !categoryId} onClick={assign}>{busy ? "Assigning…" : `Add ${selected.size || "selected"} to Category`}</Button>
        </div>}
      </>}
      {!data && !error && <div className="flex justify-center py-8"><Spinner /></div>}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
      <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </div>
  </Modal>;
}
