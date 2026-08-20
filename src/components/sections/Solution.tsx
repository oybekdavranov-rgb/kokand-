import { SplitHeading } from "@/components/ui/SplitHeading";
import { Reveal } from "@/components/motion/Reveal";
import { imora } from "@/content/imora";

/** S3 · YECHIM — yagona platforma; sarlavha + tekshiruv nuqtalari. */
export function Solution() {
  const { eyebrow, title, lead, points } = imora.solution;
  return (
    <section id="solution" className="section shell">
      <div
        style={{
          display: "grid",
          gap: "clamp(1.5rem, 4vw, 3rem)",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
          alignItems: "center",
        }}
      >
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <SplitHeading as="h2" className="display-lg" stagger={0.045}>
            {title[0]} <span className="accent">{title[1]}</span> {title[2]}
          </SplitHeading>
          <Reveal delay={0.15}>
            <p className="prose-body t-1" style={{ marginTop: "1.25rem" }}>
              {lead}
            </p>
          </Reveal>
        </div>

        <div role="list" style={{ display: "grid", gap: "0.9rem" }}>
          {points.map((p, i) => (
            <Reveal key={p} delay={i * 0.08}>
              <div
                role="listitem"
                style={{
                  display: "flex",
                  gap: "0.9rem",
                  alignItems: "flex-start",
                  padding: "1rem 1.15rem",
                  borderRadius: "14px",
                  border: "1px solid rgb(var(--glass-border) / 0.16)",
                  background: "rgb(var(--glass-bg) / var(--glass-alpha-soft))",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    width: "0.7rem",
                    height: "0.7rem",
                    marginTop: "0.5rem",
                    borderRadius: "999px",
                    background: "rgb(var(--glow))",
                    boxShadow: "0 0 12px rgb(var(--glow) / 0.8)",
                  }}
                />
                <span className="t-1" style={{ color: "var(--ink)", lineHeight: 1.4 }}>
                  {p}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
