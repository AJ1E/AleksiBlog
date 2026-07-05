export const siteMeta = {
  title: "Kai Space",
  description: "An Astro-powered personal blog and private dashboard template.",
  author: "Demo Author",
  email: "hello@example.com",
  github: "https://github.com/example/kai-space"
};

export const navItems = [
  { href: "/blog/", label: "文章" },
  { href: "/projects/", label: "项目" },
  { href: "/about/", label: "关于" }
];

export const accentMap = {
  orange: "var(--accent)",
  teal: "var(--accent-teal)",
  purple: "var(--accent-purple)",
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)"
} as const;
