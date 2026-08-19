import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { GlassCard } from "@/components/ui/GlassCard";

export const metadata: Metadata = {
  title: "Playground",
  description: "Imora AI dizayn tizimi — token'lar, tipografika, shisha kartalar.",
};

/* --------------------------- Ma'lumot ro'yxatlari --------------------------- */

const COLOR_TOKENS: { name: string; css: string; dark?: boolean }[] = [
  { name: "--bg", css: "var(--bg)" },
  { name: "--bg-deep", css: "var(--bg-deep)" },
  { name: "--ink", css: "var(--ink)" },
  { name: "--ink-muted", css: "var(--ink-muted)" },
  { name: "--ink-faint", css: "var(--ink-faint)" },
  { name: "--accent", css: "var(--accent)" },
  { name: "--glow", css: "rgb(var(--glow))" },
];

const TYPE_STEPS: { cls: string; token: string; sample: string }[] = [
  { cls: "t-5", token: "--step-5", sample: "IMORA" },
  { cls: "t-4", token: "--step-4", sample: "Chuqurlik" },
  { cls: "t-3", token: "--step-3", sample: "Neural mesh" },
  { cls: "t-2", token: "--step-2", sample: "Distributed intelligence" },
  { cls: "t-1", token: "--step-1", sample: "Kelajak bugundan boshlanadi" },
  { cls: "t-0", token: "--step-0", sample: "Asosiy matn o'lchami (body)." },
  { cls: "t--1", token: "--step--1", sample: "Kichik label / caption o'lchami." },
];

const FONTS: { label: string; cls: string; note: string; sample: string }[] = [
  { label: "Oswald · display", cls: "f-oswald", note: "var(--font-display)", sample: "KELAJAK BUGUNDAN" },
  { label: "Archivo · expanded", cls: "f-archivo-expanded", note: "font-stretch 125%", sample: "urg'u so'zlar" },
  { label: "Inter Tight · body", cls: "f-body", note: "var(--font-body)", sample: "Imora AI — chuqurlikdan aql." },
  { label: "JetBrains Mono", cls: "f-mono", note: "var(--font-mono)", sample: "01 / 02 / 03 · 1 247" },
];

const MOTION_TOKENS: { name: string; value: string }[] = [
  { name: "--dur-fast", value: "240ms" },
  { name: "--dur-base", value: "600ms" },
  { name: "--dur-slow", value: "1200ms" },
  { name: "--ease-out-expo", value: "cubic-bezier(.16,1,.30,1)" },
  { name: "--ease-in-out-q", value: "cubic-bezier(.76,0,.24,1)" },
];

/* ------------------------------ Yordamchilar ------------------------------ */

function Section({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vh, 4.5rem)" }}>
      <p className="label-mono">{index}</p>
      <h2 className="display t-2" style={{ marginTop: "0.5rem", marginBottom: "1.75rem" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const gridAuto = (min: string): CSSProperties => ({
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}), 1fr))`,
});

/* --------------------------------- Sahifa --------------------------------- */

export default function PlaygroundPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="shell" style={{ paddingBlock: "clamp(3rem, 9vh, 6rem) 0" }}>
          <p className="label-mono">Bosqich 1 · Dizayn tizimi</p>
          <h1 className="display t-4" style={{ marginTop: "0.75rem" }}>
            <span className="f-oswald">DIZAYN</span>{" "}
            <em className="f-archivo-expanded">tizimi</em>{" "}
            <span className="f-oswald">PLAYGROUND</span>
          </h1>
          <p className="prose-body" style={{ marginTop: "1rem" }}>
            Bu sahifa CLAUDE.md &sect;3 bo&apos;yicha barcha token, tipografika
            shkalasi, shrift oilalari va ikkala shisha karta variantini
            ko&apos;rsatadi. Yuqoridagi tumbler bilan kun/tun rejimini almashtiring
            — hamma narsa jonli o&apos;zgaradi.
          </p>
        </section>

        {/* 1 — RANGLAR */}
        <Section id="colors" index="01 · Ranglar" title={<>Rang <em className="f-archivo-expanded">token&apos;lari</em></>}>
          <div style={gridAuto("11rem")}>
            {COLOR_TOKENS.map((t) => (
              <GlassCard key={t.name} variant="frosted">
                <div style={{ padding: "0.9rem" }}>
                  <div
                    style={{
                      height: "4.5rem",
                      borderRadius: "12px",
                      background: t.css,
                      border: "1px solid rgb(var(--glass-border) / 0.2)",
                    }}
                  />
                  <p className="f-mono t--1" style={{ marginTop: "0.7rem", color: "var(--ink)" }}>
                    {t.name}
                  </p>
                  <p className="f-mono t--1" style={{ color: "var(--ink-faint)" }}>
                    {t.css}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </Section>

        {/* 2 — TIPOGRAFIKA */}
        <Section id="type" index="02 · Tipografika" title={<>Type <em className="f-archivo-expanded">scale</em> — 1.333</>}>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {TYPE_STEPS.map((s) => (
              <div
                key={s.token}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "1.25rem",
                  borderBottom: "1px solid rgb(var(--glass-border) / 0.12)",
                  paddingBottom: "0.6rem",
                  overflow: "hidden",
                }}
              >
                <span className="label-mono" style={{ flex: "none", minWidth: "6.5rem" }}>
                  {s.token}
                </span>
                <span className={`${s.cls} f-oswald`} style={{ color: "var(--ink)", lineHeight: 1 }}>
                  {s.sample}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "2rem", display: "grid", gap: "1.25rem" }}>
            <h3 className="display t-3">
              <span className="f-oswald">IKKI SHRIFT</span>{" "}
              <em className="f-archivo-expanded">bitta</em>{" "}
              <span className="f-oswald">JUMLADA</span>
            </h3>
            <p className="prose-body">
              Har katta sarlavhada kamida ikki shrift/width aralashadi — Oswald
              UPPERCASE asos, Archivo expanded italic urg&apos;u so&apos;zlar uchun.
              Body matn esa Inter Tight, maksimum 68ch kenglikda, o&apos;qishga
              qulay 1.55 line-height bilan.
            </p>
          </div>
        </Section>

        {/* 3 — SHRIFTLAR */}
        <Section id="fonts" index="03 · Shriftlar" title={<>Shrift <em className="f-archivo-expanded">oilalari</em></>}>
          <div style={gridAuto("16rem")}>
            {FONTS.map((f) => (
              <GlassCard key={f.label} variant="frosted">
                <div style={{ padding: "1.25rem" }}>
                  <p className="label-mono">{f.label}</p>
                  <p className={f.cls} style={{ color: "var(--ink)", fontSize: "var(--step-1)", marginTop: "0.6rem" }}>
                    {f.sample}
                  </p>
                  <p className="f-mono t--1" style={{ color: "var(--ink-faint)", marginTop: "0.6rem" }}>
                    {f.note}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </Section>

        {/* 4 — SHISHA KARTALAR */}
        <Section id="glass" index="04 · Shisha kartalar" title={<>Clear <em className="f-archivo-expanded">va</em> Frosted</>}>
          <p className="prose-body" style={{ marginBottom: "1.25rem" }}>
            Kartalar ustiga kursorni olib boring — glow kuchayadi va spotlight
            kursorni kuzatadi. <span className="f-mono t--1">clear</span> variant
            100% shaffof, <span className="f-mono t--1">frosted</span> esa
            backdrop-blur bilan.
          </p>
          <div style={gridAuto("18rem")}>
            <GlassCard variant="clear">
              <div style={{ padding: "1.6rem", minHeight: "12rem" }}>
                <p className="label-mono">variant = clear</p>
                <h3 className="display t-2" style={{ marginTop: "0.6rem" }}>
                  <em className="f-archivo-expanded">Shaffof</em> shisha
                </h3>
                <p className="prose-body" style={{ marginTop: "0.6rem" }}>
                  background: transparent — orqa fon to&apos;liq ko&apos;rinadi.
                </p>
              </div>
            </GlassCard>

            <GlassCard variant="frosted">
              <div style={{ padding: "1.6rem", minHeight: "12rem" }}>
                <p className="label-mono">variant = frosted</p>
                <h3 className="display t-2" style={{ marginTop: "0.6rem" }}>
                  <em className="f-archivo-expanded">Muzli</em> shisha
                </h3>
                <p className="prose-body" style={{ marginTop: "0.6rem" }}>
                  backdrop-filter: blur(24px) saturate(1.6).
                </p>
              </div>
            </GlassCard>

            <GlassCard variant="frosted" spotlight={false}>
              <div style={{ padding: "1.6rem", minHeight: "12rem" }}>
                <p className="label-mono">spotlight = false</p>
                <h3 className="display t-2" style={{ marginTop: "0.6rem" }}>
                  <em className="f-archivo-expanded">Sokin</em> variant
                </h3>
                <p className="prose-body" style={{ marginTop: "0.6rem" }}>
                  Glow-line va orqa nur bor, kursor spotlight o&apos;chirilgan.
                </p>
              </div>
            </GlassCard>
          </div>
        </Section>

        {/* 5 — TUGMALAR + MOTION */}
        <Section id="motion" index="05 · Tugma & Motion" title={<>Tugma <em className="f-archivo-expanded">va</em> motion token</>}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.85rem", marginBottom: "2rem" }}>
            <button type="button" className="btn btn--solid">Solid tugma</button>
            <button type="button" className="btn">Glass tugma</button>
          </div>
          <div style={gridAuto("15rem")}>
            {MOTION_TOKENS.map((m) => (
              <div
                key={m.name}
                style={{
                  padding: "0.9rem 1rem",
                  borderRadius: "12px",
                  border: "1px solid rgb(var(--glass-border) / 0.16)",
                }}
              >
                <p className="f-mono t--1" style={{ color: "var(--ink)" }}>{m.name}</p>
                <p className="f-mono t--1" style={{ color: "var(--ink-faint)", marginTop: "0.3rem" }}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <footer className="shell" style={{ paddingBlock: "3rem", borderTop: "1px solid rgb(var(--glass-border) / 0.12)" }}>
          <p className="label-mono">Imora AI · Bosqich 1 · Poydevor</p>
        </footer>
      </main>
    </>
  );
}
