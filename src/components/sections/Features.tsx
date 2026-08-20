import { Fragment } from "react";
import { SplitHeading } from "@/components/ui/SplitHeading";
import { Reveal } from "@/components/motion/Reveal";
import { imora } from "@/content/imora";

/**
 * S4 · IMKONIYATLAR — 3 ta asosiy xususiyat (AI Chat, 3D Avatar, Video),
 * har birida ish oqimi step-chip'lar bilan (CLAUDE.md §5).
 */
export function Features() {
  return (
    <section id="features" className="section shell">
      <p className="eyebrow">Imkoniyatlar</p>
      <SplitHeading as="h2" className="display-lg">
        UCHTA <span className="accent">kuchli</span> USTUN
      </SplitHeading>

      <div style={{ marginTop: "clamp(1.5rem, 4vh, 3rem)" }}>
        {imora.features.map((f) => (
          <article
            key={f.id}
            id={f.id}
            className="section--tight"
            style={{ borderTop: "1px solid rgb(var(--glass-border) / 0.14)" }}
          >
            <p className="eyebrow">{f.tag}</p>
            <SplitHeading as="h3" className="display-md" stagger={0.05}>
              {f.title} <span className="accent">{f.accent}</span>
            </SplitHeading>

            <div
              style={{
                display: "grid",
                gap: "clamp(1rem, 3vw, 2.5rem)",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
                marginTop: "1.25rem",
                alignItems: "center",
              }}
            >
              <Reveal>
                <p className="prose-body t-1">{f.body}</p>
              </Reveal>

              <Reveal delay={0.12}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  {f.steps.map((step, i) => (
                    <Fragment key={step}>
                      <span className="step-chip">
                        <span className="step-chip__num">{i + 1}</span>
                        {step}
                      </span>
                      {i < f.steps.length - 1 ? (
                        <span aria-hidden="true" style={{ color: "var(--accent)" }}>
                          →
                        </span>
                      ) : null}
                    </Fragment>
                  ))}
                </div>
              </Reveal>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
