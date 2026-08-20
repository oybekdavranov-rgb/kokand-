import Image from "next/image";
import Link from "next/link";
import { SplitHeading } from "@/components/ui/SplitHeading";
import { Reveal } from "@/components/motion/Reveal";
import { imora } from "@/content/imora";

/**
 * S1 · HERO — landonorris.com uslubidagi ulkan display sarlavha,
 * so'z-so'z reveal, aksent so'z va scroll indikatori (CLAUDE.md §5).
 * Markazda logotip belgisi yumshoq nur bilan suzadi.
 */
export function Hero() {
  const { hero, brand } = imora;

  return (
    <section id="hero" className="hero shell">
      <Image
        src="/brand/logo-mark.svg"
        alt=""
        aria-hidden="true"
        width={704}
        height={704}
        priority
        className="hero__mark"
        style={{ height: "auto" }}
      />

      <div className="hero__inner">
        <p className="eyebrow">{brand.name} · President AI Tournament</p>

        <SplitHeading as="h1" className="display-xl" stagger={0.04}>
          {hero.lines[0]} <span className="accent">{hero.lines[1]}</span>{" "}
          {hero.lines[2]}
        </SplitHeading>

        <Reveal delay={0.15}>
          <p className="hero__lead">{hero.lead}</p>
        </Reveal>

        <Reveal delay={0.28}>
          <div className="hero__cta">
            <Link href="#contact" className="btn btn--solid">
              {hero.ctaPrimary}
            </Link>
            <Link href="#features" className="btn">
              {hero.ctaSecondary}
            </Link>
          </div>
        </Reveal>
      </div>

      <div className="hero__foot shell">
        <span className="label-mono">◦ 1 240+ o&apos;rganuvchi</span>
        <span className="scroll-cue label-mono">
          Pastga <span className="scroll-cue__dot" aria-hidden="true" />
        </span>
      </div>
    </section>
  );
}
