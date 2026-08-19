import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { GlassCard } from "@/components/ui/GlassCard";

/**
 * Bosh sahifa — hozircha POYDEVOR holati (1-bosqich).
 * To'liq scrollytelling (Hero, 3D, video, bo'limlar) keyingi bosqichlarda.
 * Bu sahifa faqat token/tipografika/shisha karta poydevorini ko'rsatadi.
 */
export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="shell" style={{ paddingBlock: "clamp(3rem, 10vh, 7rem)" }}>
          <p className="label-mono">President AI Tournament · Poydevor tayyor</p>

          <h1 className="display t-5" style={{ marginTop: "1rem", maxWidth: "18ch" }}>
            <span className="f-oswald">KELAJAK</span>{" "}
            <em className="f-archivo-expanded">bugundan</em>{" "}
            <span className="f-oswald">BOSHLANADI</span>
          </h1>

          <p className="prose-body t-1" style={{ marginTop: "1.5rem" }}>
            Imora AI landing tajribasining birinchi bosqichi — dizayn tizimi,
            token&apos;lar, tipografika, kun/tun rejimi va shisha kartalar
            o&apos;rnatildi. Keyingi bosqichlarda motion, preloader, 3D sahna va
            video fon qo&apos;shiladi.
          </p>

          <div
            style={{
              marginTop: "2.25rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.85rem",
            }}
          >
            <Link href="/playground" className="btn btn--solid">
              Dizayn tizimini ko&apos;rish →
            </Link>
            <a
              href="#poydevor"
              className="btn"
            >
              Nima tayyor?
            </a>
          </div>
        </section>

        <section
          id="poydevor"
          className="shell"
          style={{ paddingBottom: "clamp(3rem, 10vh, 7rem)" }}
        >
          <div
            style={{
              display: "grid",
              gap: "1.25rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
            }}
          >
            <GlassCard variant="frosted">
              <div style={{ padding: "1.75rem" }}>
                <p className="label-mono">01 · Frosted</p>
                <h2 className="display t-2" style={{ marginTop: "0.75rem" }}>
                  Dizayn <em className="f-archivo-expanded">tizimi</em>
                </h2>
                <p className="prose-body" style={{ marginTop: "0.75rem" }}>
                  Token-driven ranglar, 1.333 type scale, to&apos;rt shrift
                  oilasi va motion o&apos;zgaruvchilari.
                </p>
              </div>
            </GlassCard>

            <GlassCard variant="clear">
              <div style={{ padding: "1.75rem" }}>
                <p className="label-mono">02 · Clear</p>
                <h2 className="display t-2" style={{ marginTop: "0.75rem" }}>
                  Shaffof <em className="f-archivo-expanded">karta</em>
                </h2>
                <p className="prose-body" style={{ marginTop: "0.75rem" }}>
                  100% shaffof — keyin video fon orqada ko&apos;rinadi. Glow-line
                  va kursor spotlight ikkala variantda ham ishlaydi.
                </p>
              </div>
            </GlassCard>
          </div>
        </section>
      </main>
    </>
  );
}
