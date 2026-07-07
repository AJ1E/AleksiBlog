export const siteMeta = {
  title: "Aleksi's Blog",
  description: "个人博客、工作台、看板、知识库，All in one",
  author: "Aleksi",
  email: "aleksi_z@163.com",
  github: "https://github.com/AJ1E"
};

export const navItems = [
  { href: "/blog/", label: "文章" },
  { href: "/notes/", label: "笔记" },
  { href: "/projects/", label: "项目" },
  { href: "/finance/", label: "金融" },
  { href: "/favorites/", label: "收藏" },
  { href: "/navigation/", label: "导航" },
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
