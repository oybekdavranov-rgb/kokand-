import Image from "next/image";
import Link from "next/link";
import { SplitHeading } from "@/components/ui/SplitHeading";
import { Reveal } from "@/components/motion/Reveal";
import { imora } from "@/content/imora";

/**
 * S10 · KONTAKT — landonorris.com footer uslubida: markazda figura
 * (hozircha logotip belgisi; keyingi bosqichda 3D robot bilan almashtiriladi),
 * chapda SAHIFALAR, o'ngda IJTIMOIY, pastda "hamkorlik / taklif" tugmasi.
 */
export function Contact() {
  const { eyebrow, lines, note, pages, social, enquiries } = imora.contact;

  return (
    <section id="contact" className="contact shell">
      <div className="contact__head">
        <p className="eyebrow" style={{ justifyContent: "center" }}>
          {eyebrow}
        </p>
        <SplitHeading as="h2" className="display-xl" stagger={0.04}>
          {lines[0]} <span className="accent">{lines[1]}</span> {lines[2]}
        </SplitHeading>
      </div>

      <div className="contact__stage">
        <nav className="contact__col" aria-label="Sahifalar">
          <h4 className="eyebrow">Sahifalar</h4>
          <div className="contact__links">
            {pages.map((p) => (
              <Link key={p.label} href={p.href} className="contact__link">
                {p.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Markaziy figura — 3D robot uchun placeholder (keyingi bosqich) */}
        <div className="contact__center">
          <Image
            src="/brand/logo-mark.svg"
            alt="Imora AI"
            width={480}
            height={480}
            className="contact__robot"
          />
        </div>

        <nav className="contact__col contact__col--right" aria-label="Ijtimoiy tarmoqlar">
          <h4 className="eyebrow" style={{ justifyContent: "flex-end" }}>
            Ijtimoiy
          </h4>
          <div className="contact__links">
            {social.map((s) => (
              <a key={s.label} href={s.href} className="contact__link">
                {s.label}
              </a>
            ))}
          </div>
        </nav>
      </div>

      <Reveal>
        <div className="contact__enquiry">
          <a href={enquiries.href} className="btn btn--solid">
            {enquiries.label} ↗
          </a>
        </div>
      </Reveal>

      <Reveal>
        <p className="prose-body" style={{ margin: "1.5rem auto 0", textAlign: "center", maxWidth: "40ch" }}>
          {note}
        </p>
      </Reveal>

      <div className="contact__footer">
        <span className="label-mono">© 2026 Imora AI</span>
        <span className="label-mono">{imora.brand.statement}</span>
      </div>
    </section>
  );
}
