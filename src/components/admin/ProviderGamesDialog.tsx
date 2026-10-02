"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner, inputCls } from "@/components/ui/kit";
import { api, errMsg } from "@/lib/api";

type ProviderGamesData = {
  provider: { id: number; name: string; totalGames: number; activeGames: number; inactiveGames: number; maintenanceGames: number };
  games: { id: number; name: string; thumbnail: string | null; status: string; providerGameId: string | null; aggregatorGameId: string | null; categoryIds: number[] }[];
  categories: { id: number; name: string; isActive: boolean }[];
  page: number; pageSize: number; total: number;
};

export function ProviderGamesDialog({ providerId, canEdit, onClose }: { providerId: number; canEdit: boolean; onClose: () => void }) {
  const [data, setData] = useState<ProviderGamesData | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignAll, setAssignAll] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => api<ProviderGamesData>(`/api/admin/providers/${providerId}/games?page=${page}&q=${encodeURIComponent(search)}`).then((result) => {
      if (current) setData(result);
    }).catch((e) => {
      if (current) setError(errMsg(e));
    }), 180);
    return () => { current = false; clearTimeout(timer); };
  }, [providerId, page, search]);

  const visibleGames = useMemo(() => data?.games ?? [], [data]);
  const toggle = (id: number) => setSelected((old) => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allVisibleSelected = visibleGames.length > 0 && visibleGames.every((game) => selected.has(game.id));
  const toggleVisible = () => setSelected((old) => {
    const next = new Set(old);
    if (allVisibleSelected) visibleGames.forEach((game) => next.delete(game.id));
    else visibleGames.forEach((game) => next.add(game.id));
    return next;
  });

  const assign = async (allProviderGames = false) => {
    if (!categoryId || (!allProviderGames && !selected.size)) return;
    setAssignAll(allProviderGames);
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ assigned: number; category: string }>(`/api/admin/providers/${providerId}/games/categories`, {
        body: allProviderGames ? { allProviderGames: true, categoryId: Number(categoryId) } : { gameIds: [...selected], categoryId: Number(categoryId) },
      });
      const targetIds = allProviderGames ? new Set(data?.games.map((game) => game.id) ?? []) : selected;
      setData((old) => old ? { ...old, games: old.games.map((game) => targetIds.has(game.id) && !game.categoryIds.includes(Number(categoryId)) ? { ...game, categoryIds: [...game.categoryIds, Number(categoryId)] } : game) } : old);
      setMessage(`${result.assigned} game(s) assigned to ${result.category}.`);
      setSelected(new Set());
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); setAssignAll(false); }
  };

  return <Modal open onClose={onClose} label="Provider games" maxWidth="md:max-w-[760px]">
    <div className="p-5 md:p-7">
      <h2 className="font-display text-[22px] font-semibold text-white">{data?.provider.name ?? "Provider"} games</h2>
      <p className="mt-1 text-[13px] text-white/50">{data ? `${data.provider.totalGames} total · ${data.provider.activeGames} active · ${data.provider.inactiveGames} inactive · ${data.provider.maintenanceGames} maintenance` : "Loading provider games…"}</p>
      {data && <>
        <input className={`${inputCls} mt-4`} placeholder="Search provider games…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        {canEdit && <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-white/75">
          <input type="checkbox" className="accent-[#f0b93f]" checked={allVisibleSelected} onChange={toggleVisible} />
          Select all {visibleGames.length} games on this page
        </label>}
        <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl border border-white/10">
          {visibleGames.length ? visibleGames.map((game) => <label key={game.id} className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0 hover:bg-white/[0.03]">
            <input type="checkbox" className="accent-[#f0b93f]" disabled={!canEdit} checked={selected.has(game.id)} onChange={() => toggle(game.id)} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {game.thumbnail ? <img src={game.thumbnail} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded bg-white/5" />}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{game.name}</span><span className="block text-[11px] text-white/45">{game.status}</span></span>
            <span className="max-w-[180px] text-right text-[11px] text-white/45">{game.categoryIds.map((id) => data.categories.find((cat) => cat.id === id)?.name).filter(Boolean).join(", ") || "No category"}</span>
          </label>) : <p className="p-5 text-center text-sm text-white/45">No games found for this provider.</p>}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-white/50">
          <span>Showing {data.total ? (data.page - 1) * data.pageSize + 1 : 0}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
        {canEdit && <div className="mt-4 flex flex-col gap-2">
          <select className={`${inputCls} flex-1`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select an existing category</option>
            {data.categories.map((category) => <option key={category.id} value={category.id} className="bg-ink-800">{category.name}{category.isActive ? "" : " (disabled)"}</option>)}
          </select>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button disabled={busy || !data.provider.totalGames || !categoryId} onClick={() => assign(true)}>{busy && assignAll ? "Assigning…" : `Add all ${data.provider.totalGames} provider games`}</Button>
            <Button variant="outline" disabled={busy || !selected.size || !categoryId} onClick={() => assign(false)}>{busy && !assignAll ? "Assigning…" : `Add ${selected.size || "selected"} games`}</Button>
          </div>
        </div>}
      </>}
      {!data && !error && <div className="flex justify-center py-8"><Spinner /></div>}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
      <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </div>
  </Modal>;
}
