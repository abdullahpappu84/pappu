"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Crown, Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { HERO_STATS } from "@/data/casino";
import type { HeroSlide } from "@/data/types";
import { useApp } from "@/components/providers/AppProvider";
import { Button } from "@/components/ui/Button";

const AUTOPLAY_MS = 6500;

function Dots({
  slides,
  index,
  onSelect,
  className = "",
}: {
  slides: HeroSlide[];
  index: number;
  onSelect: (i: number) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="tablist" aria-label="Hero slides">
      {slides.map((s, i) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={i === index}
          aria-label={`Slide ${i + 1}: ${s.titleTop} ${s.titleBottom}`}
          onClick={() => onSelect(i)}
          className="group grid h-5 place-items-center"
        >
          <span
            className={`block h-[5px] rounded-full transition-all duration-500 ${
              i === index ? "w-6 bg-gold-gradient shadow-[0_0_10px_rgba(240,185,63,0.7)]" : "w-[6px] bg-white/35 group-hover:bg-white/60"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function HeroBanner() {
  const { scrollTo, setCategory, openAuth, user, banners, go: navigate } = useApp();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const count = Math.max(1, banners.length);
  const slide = banners[index] ?? banners[0];

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => setIsMobile(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  const go = useCallback((dir: number) => setIndex((i) => (i + dir + count) % count), [count]);

  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => go(1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, go]);

  if (!slide) return null;

  /** Admin-managed links: #section · category:slug · auth:register|login · /path · https://… */
  const runLink = (link: string) => {
    if (!link) return scrollTo("games");
    if (link.startsWith("#")) return scrollTo(link.slice(1));
    if (link.startsWith("category:")) {
      setCategory(link.slice(9));
      return scrollTo("games");
    }
    if (link.startsWith("auth:")) return user ? navigate("/account?tab=deposit") : openAuth(link.slice(5) === "login" ? "login" : "register");
    if (/^https?:\/\//.test(link)) return window.open(link, "_blank", "noopener");
    return navigate(link);
  };
  const primaryAction = () => runLink(slide.link);
  const secondaryAction = () => runLink(slide.secondaryLink);

  return (
    <section id="top" aria-roledescription="carousel" className="px-4 pt-2 xs:px-5 md:px-6 lg:px-0 lg:pt-0">
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative h-[196px] overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] xs:h-[236px] sm:h-[290px] md:h-[350px] lg:h-[440px] lg:rounded-none lg:border-0 lg:shadow-none xl:h-[480px] 2xl:h-[540px]"
      >
        <motion.div
          className="absolute inset-0 touch-pan-y"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={(_, info) => {
            if (info.offset.x < -45) go(1);
            else if (info.offset.x > 45) go(-1);
          }}
        >
          {/* ---- Background imagery ---- */}
          <AnimatePresence initial={false}>
            <motion.div
              key={slide.id}
              className="absolute inset-0"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            >
              {slide.fit === "contain" ? (
                <div className="absolute inset-0 bg-[radial-gradient(60%_90%_at_72%_50%,rgba(240,185,63,0.22),transparent_70%),radial-gradient(40%_60%_at_60%_40%,rgba(219,39,119,0.18),transparent_70%)]">
                  <div className="absolute right-[-6%] top-1/2 aspect-square h-[108%] -translate-y-1/2 sm:right-[2%] lg:right-[20%] xl:right-[22%]">
                    <Image
                      src={isMobile && slide.mobileImage ? slide.mobileImage : slide.image}
                      alt=""
                      fill
                      sizes="(min-width:1024px) 540px, 60vw"
                      className="object-contain mix-blend-lighten"
                    />
                  </div>
                </div>
              ) : (
                <Image
                  src={isMobile && slide.mobileImage ? slide.mobileImage : slide.image}
                  alt=""
                  fill
                  priority={index === 0}
                  sizes="100vw"
                  className="object-cover"
                  style={{ objectPosition: slide.imagePosition ?? "center" }}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* ---- Overlays ---- */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/75 to-transparent sm:via-ink-950/60 lg:w-[70%]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_0%_50%,rgba(5,6,10,0.85),transparent_60%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink-950/80 to-transparent lg:h-[42%] lg:from-ink-950" />
          <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-20 bg-gradient-to-b from-ink-950/60 to-transparent lg:block" />

          {/* ---- Content ---- */}
          <div className="absolute inset-0 flex items-center lg:container-x">
            <div className="w-[68%] px-4 pb-4 xs:w-[64%] xs:px-5 sm:w-[58%] md:px-8 lg:w-auto lg:max-w-[620px] lg:px-0 lg:pb-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={slide.id}
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.2em] text-gold-200 xs:text-[10px] md:gap-2.5 md:text-[12px] lg:text-[13px]">
                    <Crown className="h-3 w-3 text-gold-300 md:h-5 md:w-5" />
                    {slide.eyebrow}
                  </p>
                  <h1 className="mt-1.5 font-display text-[23px] font-bold uppercase leading-[0.95] tracking-[0.005em] text-white xs:text-[29px] sm:text-[36px] md:mt-3 md:text-[46px] lg:text-[58px] xl:text-[66px] 2xl:text-[76px]">
                    <span className="block drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]">{slide.titleTop}</span>
                    <span className="block text-gold-gradient drop-shadow-[0_4px_24px_rgba(240,185,63,0.25)]">
                      {slide.titleBottom}
                    </span>
                  </h1>
                  <p className="mt-4 hidden max-w-[440px] text-[14px] leading-relaxed text-white/80 md:block lg:text-[15.5px] xl:max-w-[480px]">
                    {slide.description}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 xs:mt-4 md:mt-6 md:gap-3 lg:mt-7">
                    <Button
                      variant="gold"
                      pill
                      onClick={primaryAction}
                      iconRight={<ArrowRight className="relative h-4 w-4" />}
                      className="h-9 shrink-0 px-4 text-[12px] xs:h-10 xs:px-5 xs:text-[13px] md:h-12 md:px-8 md:text-[15px]"
                    >
                      {slide.primaryCta}
                    </Button>
                    <Button
                      variant="outline"
                      pill
                      onClick={secondaryAction}
                      className="hidden h-12 shrink-0 px-7 text-[13px] uppercase tracking-wide backdrop-blur-sm md:inline-flex"
                    >
                      {slide.secondaryCta}
                    </Button>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="mt-7 hidden items-center gap-5 text-[12px] text-white/60 lg:flex">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-gold-300" /> 256-bit SSL
                </span>
                <span className="h-3 w-px bg-white/15" />
                <span className="flex items-center gap-1.5">
                  <BadgeCheck className="h-3.5 w-3.5 text-gold-300" /> Licensed &amp; Regulated
                </span>
                <span className="h-3 w-px bg-white/15" />
                <span className="flex items-center gap-1.5">
                  <span className="grid h-4 w-4 place-items-center rounded-full border border-gold-300/70 text-[7px] font-bold text-gold-300">
                    18+
                  </span>
                  Play Responsibly
                </span>
              </div>
              <Dots slides={banners} index={index} onSelect={setIndex} className="mt-5 hidden lg:flex" />
            </div>
          </div>
        </motion.div>

        {/* ---- Desktop stats column ---- */}
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-end pb-10 lg:flex lg:container-x">
          <ul className="pointer-events-auto flex flex-col gap-2.5 xl:gap-3">
            {HERO_STATS.map(({ icon: Icon, title, subtitle }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="glass flex w-[196px] items-center gap-3 rounded-xl bg-ink-950/40 px-3.5 py-2.5 transition hover:border-gold-300/40 xl:w-[214px] xl:py-3"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold-300/40 bg-gradient-to-b from-gold-300/25 to-gold-600/10 text-gold-200">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="leading-tight">
                  <span className="block text-[13.5px] font-semibold text-white">{title}</span>
                  <span className="block text-[12px] text-white/60">{subtitle}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* ---- Mobile pagination ---- */}
        <Dots slides={banners} index={index} onSelect={setIndex} className="absolute bottom-1.5 left-1/2 -translate-x-1/2 lg:hidden" />
      </div>
    </section>
  );
}
