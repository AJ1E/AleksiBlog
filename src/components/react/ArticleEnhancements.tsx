import { useEffect } from "react";

type Heading = {
  slug: string;
  text: string;
  depth: number;
};

export default function ArticleEnhancements({ headings }: { headings: Heading[] }) {
  useEffect(() => {
    const progress = document.createElement("div");
    progress.className = "progress-bar";
    document.body.appendChild(progress);

    const links = headings.map((heading) =>
      document.querySelector<HTMLAnchorElement>(`[data-toc-link="${heading.slug}"]`)
    );

    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 0 ? (el.scrollTop / max) * 100 : 0;
      progress.style.width = `${pct}%`;

      let active = "";
      for (const heading of headings) {
        const target = document.getElementById(heading.slug);
        if (target && target.getBoundingClientRect().top < 120) active = heading.slug;
      }

      links.forEach((link) => {
        if (!link) return;
        link.classList.toggle("active", link.dataset.tocLink === active);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      progress.remove();
    };
  }, [headings]);

  return null;
}
