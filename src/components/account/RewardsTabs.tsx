"use client";

import { Copy, Crown, Gift, Heart, History, Users } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { GameCard } from "@/components/games/GameCard";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Progress, Spinner, Stat, StatusBadge, Table, useApi, inputCls } from "@/components/ui/kit";
import { api, errMsg, fmtDate, money } from "@/lib/api";
import type { GameDTO } from "@/lib/types";

type UB = { id: string; name: string; type: string; amount: string; freeSpins: number; wageringRequired: string; wageringCompleted: string; remaining: string; progress: number; status: string; expiresAt: string | null; createdAt: string };

export function BonusesTab() {
  const { settings, notify, refreshUser } = useApp();
  const { data, reload } = useApi<{ items: UB[] }>("/api/me/bonuses");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const sym = settings.locale.currencySymbol;

  const redeem = async () => {
    try {
      await api("/api/me/promo/redeem", { body: { code } });
      notify({ title: "Promo code redeemed!", tone: "gold" });
      setCode("");
      setInfo(null);
      reload();
      refreshUser();
    } catch (e) {
      setInfo(errMsg(e));
    }
  };
  const validate = async () => {
    try {
      const r = await api<{ description: string; requiresDeposit: boolean }>("/api/me/promo/validate", { body: { code } });
      setInfo(`✔ ${r.description ?? "Valid"}${r.requiresDeposit ? " — enter this code on the deposit form." : ""}`);
    } catch (e) {
      setInfo(`✖ ${errMsg(e)}`);
    }
  };
  const forfeit = async (id: string) => {
    if (!confirm("Forfeit this bonus? Remaining bonus funds will be removed.")) return;
    try {
      await api(`/api/me/bonuses/${id}/forfeit`, { method: "POST" });
      reload();
      refreshUser();
    } catch (e) {
      notify({ title: "Failed", description: errMsg(e), tone: "info" });
    }
  };

  const active = data?.items.filter((b) => b.status === "active") ?? [];
  const history = data?.items.filter((b) => b.status !== "active") ?? [];

  return (
    <div className="space-y-4">
      <Card title="Redeem a promo code" icon={<Gift className="h-5 w-5" />}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={`${inputCls} uppercase`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter promo code" />
          <Button variant="outline" onClick={validate} disabled={!code}>
            Validate
          </Button>
          <Button onClick={redeem} disabled={!code}>
            Claim
          </Button>
        </div>
        {info && <p className="mt-2 text-[12.5px] text-white/65">{info}</p>}
      </Card>
      <Card title="Active bonuses & wagering" icon={<Crown className="h-5 w-5" />}>
        {!data ? (
          <Spinner />
        ) : !active.length ? (
          <Empty text="No active bonuses. Claim one with your next deposit!" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((b) => (
              <div key={b.id} className="rounded-2xl border border-gold-300/25 bg-gradient-to-br from-gold-400/[0.08] to-transparent p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold text-white">{b.name}</p>
                    <p className="text-[11.5px] capitalize text-white/45">{b.type.replace(/_/g, " ")} · expires {fmtDate(b.expiresAt, false)}</p>
                  </div>
                  <p className="font-display text-[24px] font-semibold text-gold-gradient">{money(b.amount, sym)}</p>
                </div>
                {b.freeSpins > 0 && <p className="mt-1 text-[12px] text-gold-200">+ {b.freeSpins} free spins</p>}
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
                  <div><p className="text-white/45">Required</p><p className="font-semibold text-white">{money(b.wageringRequired, sym)}</p></div>
                  <div><p className="text-white/45">Completed</p><p className="font-semibold text-white">{money(b.wageringCompleted, sym)}</p></div>
                  <div><p className="text-white/45">Remaining</p><p className="font-semibold text-white">{money(b.remaining, sym)}</p></div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={b.progress} className="flex-1" />
                  <span className="text-[12px] font-semibold text-gold-200">{b.progress}%</span>
                </div>
                <button onClick={() => forfeit(b.id)} className="mt-3 text-[11.5px] text-white/40 hover:text-rose-300">
                  Forfeit bonus
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Bonus history" icon={<History className="h-5 w-5" />}>
        <Table head={["Date", "Bonus", "Type", "Amount", "Wagering", "Status"]} empty={!history.length}>
          {history.map((b) => (
            <tr key={b.id} className="text-white/80">
              <td className="text-white/55">{fmtDate(b.createdAt)}</td>
              <td>{b.name}</td>
              <td className="capitalize">{b.type.replace(/_/g, " ")}</td>
              <td className="tabular-nums">{money(b.amount, sym)}</td>
              <td className="tabular-nums">{b.progress}%</td>
              <td><StatusBadge status={b.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

type Level = { id: number; name: string; level: number; minPoints: number; cashbackPercent: string; rewards: string | null; benefits: string[] | null; color: string };

export function VipTab() {
  const { data } = useApi<{ levels: Level[]; current: Level; next: Level | null; points: number; lifetimePoints: number; progress: number; pointsToNext: number }>("/api/me/vip");
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border-gold-gradient p-5 md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold-gradient text-ink-950 shadow-gold"><Crown className="h-7 w-7" /></span>
            <div>
              <p className="text-[11.5px] uppercase tracking-[0.2em] text-white/50">Current level</p>
              <p className="font-display text-[34px] font-bold uppercase leading-none" style={{ color: data.current?.color }}>{data.current?.name}</p>
              <p className="text-[12.5px] text-white/55">{data.points.toLocaleString()} points · {data.current?.cashbackPercent}% cashback</p>
            </div>
          </div>
          <div className="md:w-80">
            <div className="flex justify-between text-[12px] text-white/55">
              <span>{data.next ? `Next: ${data.next.name}` : "Top level reached"}</span>
              <span>{data.progress}%</span>
            </div>
            <Progress value={data.progress} className="mt-1.5" />
            {data.next && <p className="mt-1.5 text-[11.5px] text-white/45">{data.pointsToNext.toLocaleString()} points to go</p>}
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {data.levels.map((l) => (
          <div key={l.id} className={`panel rounded-2xl p-4 ${l.id === data.current?.id ? "ring-1 ring-gold-300/60" : ""}`}>
            <p className="font-display text-[20px] font-semibold uppercase" style={{ color: l.color }}>{l.name}</p>
            <p className="text-[11.5px] text-white/45">{l.minPoints.toLocaleString()}+ points</p>
            <ul className="mt-3 space-y-1 text-[12px] text-white/70">
              {(l.benefits ?? []).map((b) => <li key={b}>• {b}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-white/40">Earn points with every deposit and wager. Levels update automatically.</p>
    </div>
  );
}

type RefData = { enabled: boolean; code: string; link: string; commissionPercent: number; totalReferrals: number; activeReferrals: number; commissionPaid: string; commissionPending: string; referred: { id: string; name: string; createdAt: string; active: boolean }[]; commissions: { id: string; createdAt: string; baseAmount: string; percent: string; amount: string; status: string }[] };

export function ReferralsTab() {
  const { settings, notify } = useApp();
  const { data } = useApi<RefData>("/api/me/referrals");
  const sym = settings.locale.currencySymbol;
  if (!data) return <Spinner />;
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => notify({ title: "Copied to clipboard", tone: "success" }));
  return (
    <div className="space-y-4">
      <Card title="Invite friends" icon={<Users className="h-5 w-5" />}>
        {!data.enabled ? (
          <p className="text-[13px] text-white/60">The referral programme is currently unavailable for your account.</p>
        ) : (
          <>
            <p className="text-[13px] text-white/65">Earn <b className="text-gold-200">{data.commissionPercent}%</b> commission on your friends&apos; approved deposits.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input readOnly value={data.link} className={inputCls} />
              <Button variant="outline" iconLeft={<Copy className="h-4 w-4" />} onClick={() => copy(data.link)}>Copy link</Button>
              <Button onClick={() => copy(data.code)}>Code: {data.code}</Button>
            </div>
          </>
        )}
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total referrals" value={data.totalReferrals} />
        <Stat label="Active referrals" value={data.activeReferrals} sub="Made a deposit" />
        <Stat label="Commission paid" value={money(data.commissionPaid, sym)} accent="text-emerald-300" />
        <Stat label="Pending" value={money(data.commissionPending, sym)} accent="text-gold-200" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Referred players">
          <Table head={["Player", "Joined", "Status"]} empty={!data.referred.length}>
            {data.referred.map((r) => (
              <tr key={r.id} className="text-white/80">
                <td>{r.name}</td>
                <td className="text-white/55">{fmtDate(r.createdAt, false)}</td>
                <td><StatusBadge status={r.active ? "active" : "pending"} /></td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Commission history">
          <Table head={["Date", "Base", "%", "Commission", "Status"]} empty={!data.commissions.length}>
            {data.commissions.map((c) => (
              <tr key={c.id} className="text-white/80">
                <td className="text-white/55">{fmtDate(c.createdAt, false)}</td>
                <td className="tabular-nums">{money(c.baseAmount, sym)}</td>
                <td>{c.percent}%</td>
                <td className="font-semibold tabular-nums text-gold-200">{money(c.amount, sym)}</td>
                <td><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}

export function GamesTab() {
  const favs = useApi<{ items: GameDTO[] }>("/api/me/favorites");
  const recent = useApi<{ items: { game: GameDTO; lastPlayedAt: string; playCount: number }[] }>("/api/me/recent");
  const { favorites } = useApp();
  const favItems = (favs.data?.items ?? []).filter((g) => favorites.has(g.id));
  return (
    <div className="space-y-4">
      <Card title="Favourite games" icon={<Heart className="h-5 w-5" />}>
        {!favs.data ? <Spinner /> : !favItems.length ? <Empty text="Tap the heart on any game to save it here." /> : (
          <div className="grid grid-cols-2 gap-2.5 xs:grid-cols-3 lg:grid-cols-5">{favItems.map((g) => <GameCard key={g.id} game={g} />)}</div>
        )}
      </Card>
      <Card title="Recently played" icon={<History className="h-5 w-5" />}>
        {!recent.data ? <Spinner /> : !recent.data.items.length ? <Empty text="Games you launch will appear here." /> : (
          <div className="grid grid-cols-2 gap-2.5 xs:grid-cols-3 lg:grid-cols-5">
            {recent.data.items.map((r) => (
              <div key={r.game.id}>
                <GameCard game={r.game} />
                <p className="mt-1 text-center text-[10.5px] text-white/40">{fmtDate(r.lastPlayedAt)} · {r.playCount}×</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
