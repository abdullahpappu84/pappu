"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Headset, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Button } from "@/components/ui/Button";
import { api, errMsg } from "@/lib/api";

type Msg = { id: string; senderType: string; senderName: string | null; body: string; createdAt: string };

/** Real-time-ish live chat (polling) backed by support tickets on the "chat" channel. */
export function LiveChat() {
  const { chatOpen, setChatOpen, user, openAuth, settings, notify } = useApp();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api<{ messages: Msg[] }>("/api/me/chat");
      setMessages(r.messages);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    if (!chatOpen || !user) return;
    load();
    const iv = window.setInterval(load, 4000);
    return () => window.clearInterval(iv);
  }, [chatOpen, user, load]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api("/api/me/chat", { body: { body: text } });
      setText("");
      await load();
    } catch (err) {
      notify({ title: "Message not sent", description: errMsg(err), tone: "info" });
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {chatOpen && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          role="dialog"
          aria-label="Live chat"
          className="fixed inset-x-3 bottom-[84px] z-[65] flex h-[70vh] max-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-850 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] sm:inset-x-auto sm:right-6 sm:w-[380px] lg:bottom-6"
        >
          <div className="flex items-center gap-3 border-b border-white/[0.06] bg-gradient-to-r from-gold-400/10 to-transparent px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gold-gradient text-ink-950">
              <Headset className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="text-[13.5px] font-semibold text-white">{settings.site.name} Support</p>
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" /> {settings.support.liveChatEnabled ? `Online · ${settings.support.hours}` : "Offline"}
              </p>
            </div>
            <button onClick={() => setChatOpen(false)} aria-label="Close chat" className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!user ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-[14px] text-white/80">Sign in to chat with our support team.</p>
              <Button size="sm" pill onClick={() => openAuth("login")}>
                Login
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
                {messages.length === 0 && <p className="py-8 text-center text-[12.5px] text-white/45">Hi {user.name.split(" ")[0]}! How can we help you today?</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.senderType === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${
                        m.senderType === "user" ? "rounded-br-md bg-gold-gradient text-ink-950" : m.senderType === "system" ? "bg-white/[0.04] text-white/60 italic" : "rounded-bl-md border border-white/10 bg-ink-700 text-white"
                      }`}
                    >
                      {m.senderType === "admin" && <p className="mb-0.5 text-[10.5px] font-semibold text-gold-300">{m.senderName}</p>}
                      {m.body}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-white/[0.06] p-3">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type your message…"
                  maxLength={2000}
                  className="h-11 flex-1 rounded-xl border border-white/10 bg-ink-950/60 px-3.5 text-[13.5px] text-white outline-none placeholder:text-white/35 focus:border-gold-300/60"
                />
                <button disabled={sending || !text.trim()} aria-label="Send" className="grid h-11 w-11 place-items-center rounded-xl bg-gold-gradient text-ink-950 disabled:opacity-50">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
