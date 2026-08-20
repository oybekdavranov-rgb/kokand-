import { SplitHeading } from "@/components/ui/SplitHeading";
import { Reveal } from "@/components/motion/Reveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { imora } from "@/content/imora";
import type { Item } from "@/content/imora";

function CardGrid({ items, min = "15rem" }: { items: readonly Item[]; min?: string }) {
  return (
    <div
      className="grid-auto"
      style={{
        marginTop: "clamp(1.75rem, 4vh, 3rem)",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))`,
      }}
    >
      {items.map((item, i) => (
        <Reveal key={item.title} delay={i * 0.06}>
          <GlassCard variant={i % 2 === 0 ? "frosted" : "clear"}>
            <div style={{ padding: "1.4rem", minHeight: "9rem" }}>
              <h3 className="display-md" style={{ fontSize: "var(--step-1)" }}>
                {item.title}
              </h3>
              <p className="prose-body" style={{ marginTop: "0.55rem" }}>
                {item.body}
              </p>
            </div>
          </GlassCard>
          </Reveal>
        ))}
      </div>
  );
}

/** S6 · TEXNOLOGIYALAR + ASOSIY AFZALLIKLAR (bento aralashmasi). */
export function TechBenefits() {
  const { tech, benefits } = imora;
  return (
    <>
      <section id="tech" className="section shell">
        <p className="eyebrow">{tech.eyebrow}</p>
        <SplitHeading as="h2" className="display-lg" stagger={0.045}>
          {tech.title[0]} <span className="accent">{tech.title[1]}</span> {tech.title[2]}
        </SplitHeading>
        <CardGrid items={tech.items} />
      </section>

      <section id="benefits" className="section shell">
        <p className="eyebrow">{benefits.eyebrow}</p>
        <SplitHeading as="h2" className="display-lg" stagger={0.045}>
          {benefits.title[0]} <span className="accent">{benefits.title[1]}</span>{" "}
          {benefits.title[2]}
        </SplitHeading>
        <CardGrid items={benefits.items} />
      </section>
    </>
  );
}
