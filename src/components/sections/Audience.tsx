import { SplitHeading } from "@/components/ui/SplitHeading";
import { Reveal } from "@/components/motion/Reveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { imora } from "@/content/imora";

/** S5 · KIMLAR UCHUN — auditoriya, 3 ta karta. */
export function Audience() {
  const { eyebrow, title, items } = imora.audience;
  return (
    <section id="audience" className="section shell">
      <p className="eyebrow">{eyebrow}</p>
      <SplitHeading as="h2" className="display-lg" stagger={0.045}>
        {title[0]} <span className="accent">{title[1]}</span> {title[2]}
      </SplitHeading>

      <div
        className="grid-auto"
        style={{
          marginTop: "clamp(2rem, 5vh, 3.5rem)",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))",
        }}
      >
        {items.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.08}>
            <GlassCard variant={i === 1 ? "clear" : "frosted"}>
              <div style={{ padding: "1.75rem", minHeight: "12rem" }}>
                <h3 className="display-md" style={{ fontSize: "var(--step-2)" }}>
                  {item.title}
                </h3>
                <p className="prose-body" style={{ marginTop: "0.75rem" }}>
                  {item.body}
                </p>
              </div>
            </GlassCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
