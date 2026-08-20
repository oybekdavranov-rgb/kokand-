import { SiteHeader } from "@/components/ui/SiteHeader";
import { Hero } from "@/components/sections/Hero";
import { Problem } from "@/components/sections/Problem";
import { Solution } from "@/components/sections/Solution";
import { Features } from "@/components/sections/Features";
import { Audience } from "@/components/sections/Audience";
import { TechBenefits } from "@/components/sections/TechBenefits";
import { Future } from "@/components/sections/Future";
import { Contact } from "@/components/sections/Contact";

/**
 * Bosh sahifa — Imora AI scrollytelling (landonorris.com uslubidagi
 * tipografika va scroll reveal effektlari). Kontent: taqdimotdan (ishora
 * tili platformasi). 3D sahna va video fon keyingi bosqichlarda qo'shiladi.
 */
export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Problem />
        <Solution />
        <Features />
        <Audience />
        <TechBenefits />
        <Future />
        <Contact />
      </main>
    </>
  );
}
