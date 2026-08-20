import { SplitHeading } from "@/components/ui/SplitHeading";
import { Reveal } from "@/components/motion/Reveal";
import { imora } from "@/content/imora";

/** S7 · KELAJAKDAGI RIVOJLANISH — raqamlangan yo'l xaritasi. */
export function Future() {
  const { eyebrow, title, items } = imora.future;
  return (
    <section id="future" className="section shell">
      <p className="eyebrow">{eyebrow}</p>
      <SplitHeading as="h2" className="display-lg" stagger={0.045}>
        {title[0]} <span className="accent">{title[1]}</span>
      </SplitHeading>

      <div style={{ marginTop: "clamp(1.75rem, 4vh, 3rem)" }}>
        {items.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.06}>
            <div className="num-row">
              <span className="num-row__n">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="display-md" style={{ fontSize: "var(--step-1)" }}>
                  {item.title}
                </h3>
                <p className="prose-body" style={{ marginTop: "0.35rem" }}>
                  {item.body}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
