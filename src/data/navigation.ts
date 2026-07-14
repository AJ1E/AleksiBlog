export type NavigationCategoryId =
  | "AI"
  | "Code"
  | "Forum"
  | "Mail"
  | "Cloud"
  | "Finance"
  | "Media"
  | "Tools";

export type NavigationLink = {
  category: NavigationCategoryId;
  name: string;
  href: string;
  domain: string;
  abbr: string;
  iconUrl?: string | null;
  iconMode?: "contain" | "crop-left";
  note?: string;
};

export const navigationCategories: Array<{
  id: NavigationCategoryId;
  label: string;
  summary: string;
  accent: "orange" | "teal" | "purple" | "green" | "yellow" | "red" | "blue";
}> = [
  { id: "AI", label: "AI", summary: "模型、助手与评测", accent: "purple" },
  { id: "Code", label: "Code", summary: "代码、刷题与开发社区", accent: "teal" },
  { id: "Forum", label: "Forum", summary: "技术社区与交流", accent: "orange" },
  { id: "Mail", label: "Mail", summary: "邮箱与日常通信", accent: "blue" },
  { id: "Cloud", label: "Cloud", summary: "云服务与算力平台", accent: "green" },
  { id: "Finance", label: "Finance", summary: "市场观察与图表", accent: "red" },
  { id: "Media", label: "Media", summary: "视频、直播与内容", accent: "yellow" },
  { id: "Tools", label: "Tools", summary: "文档、查询与网络工具", accent: "teal" },
];

export const navigationLinks: NavigationLink[] = [
  { category: "AI", name: "ChatGPT", href: "https://chatgpt.com/", domain: "chatgpt.com", abbr: "CG" },
  { category: "AI", name: "Gemini", href: "https://gemini.google.com/", domain: "gemini.google.com", abbr: "G" },
  { category: "AI", name: "DeepSeek", href: "https://www.deepseek.com/", domain: "deepseek.com", abbr: "DS" },
  { category: "AI", name: "Claude", href: "https://claude.com/", domain: "claude.com", abbr: "C" },
  { category: "AI", name: "Grok", href: "https://grok.com/", domain: "grok.com", abbr: "GX", note: "xAI" },
  { category: "AI", name: "Qwen", href: "https://www.qianwen.com/", domain: "qianwen.com", abbr: "Q", iconUrl: "/assets/navigation/qwen-logo.jpg", iconMode: "crop-left" },
  { category: "AI", name: "豆包", href: "https://www.doubao.com/", domain: "doubao.com", abbr: "豆" },
  { category: "AI", name: "GLM", href: "https://chatglm.cn/", domain: "chatglm.cn", abbr: "GL" },
  { category: "AI", name: "Arena AI", href: "https://arena.ai/", domain: "arena.ai", abbr: "AR" },
  { category: "AI", name: "BenchLM", href: "https://benchlm.ai/", domain: "benchlm.ai", abbr: "BL" },

  { category: "Code", name: "GitHub", href: "https://github.com/", domain: "github.com", abbr: "GH" },
  { category: "Code", name: "LeetCode", href: "https://leetcode.cn/", domain: "leetcode.cn", abbr: "LC" },
  { category: "Code", name: "牛客网", href: "https://www.nowcoder.com/", domain: "nowcoder.com", abbr: "牛" },

  { category: "Forum", name: "LINUX DO", href: "https://linux.do/", domain: "linux.do", abbr: "LD" },
  { category: "Forum", name: "NodeLoc", href: "https://www.nodeloc.com/", domain: "nodeloc.com", abbr: "NL" },

  { category: "Mail", name: "Gmail", href: "https://mail.google.com/", domain: "mail.google.com", abbr: "GM" },
  { category: "Mail", name: "Outlook", href: "https://www.outlook.com/", domain: "outlook.com", abbr: "O" },
  { category: "Mail", name: "QQ邮箱", href: "https://mail.qq.com/", domain: "mail.qq.com", abbr: "QQ" },
  { category: "Mail", name: "网易邮箱", href: "https://mail.163.com/", domain: "mail.163.com", abbr: "163" },
  { category: "Mail", name: "SICAU 校园邮箱", href: "http://mail.stu.sicau.edu.cn/", domain: "mail.stu.sicau.edu.cn", abbr: "SC" },

  { category: "Cloud", name: "Azure", href: "https://portal.azure.com/", domain: "portal.azure.com", abbr: "AZ" },
  { category: "Cloud", name: "阿里云", href: "https://www.aliyun.com/", domain: "aliyun.com", abbr: "云" },
  { category: "Cloud", name: "AutoDL", href: "https://www.autodl.com/", domain: "autodl.com", abbr: "AD" },

  { category: "Finance", name: "TradingView", href: "https://cn.tradingview.com/", domain: "tradingview.com", abbr: "TV" },
  { category: "Finance", name: "History of Market", href: "https://historyofmarket.com/", domain: "historyofmarket.com", abbr: "HM" },

  { category: "Media", name: "YouTube", href: "https://www.youtube.com/", domain: "youtube.com", abbr: "YT" },
  { category: "Media", name: "哔哩哔哩", href: "https://www.bilibili.com/", domain: "bilibili.com", abbr: "B" },
  { category: "Media", name: "斗鱼", href: "https://www.douyu.com/", domain: "douyu.com", abbr: "斗" },
  { category: "Media", name: "虎牙直播", href: "https://www.huya.com/", domain: "huya.com", abbr: "虎" },

  { category: "Tools", name: "维基百科", href: "https://zh.wikipedia.org/", domain: "wikipedia.org", abbr: "W" },
  { category: "Tools", name: "有道", href: "https://www.youdao.com/", domain: "youdao.com", abbr: "有" },
  { category: "Tools", name: "Speedtest", href: "https://www.speedtest.net/", domain: "speedtest.net", abbr: "ST" },
  { category: "Tools", name: "石墨文档", href: "https://shimo.im/", domain: "shimo.im", abbr: "石" },
  { category: "Tools", name: "IP.SKK.MOE", href: "https://ip.skk.moe/", domain: "ip.skk.moe", abbr: "IP" },
  { category: "Tools", name: "Ping0", href: "https://www.ping0.cc/", domain: "ping0.cc", abbr: "P0" },
  { category: "Tools", name: "测速网站", href: "https://test.ustc.edu.cn/", domain: "test.ustc.edu.cn", abbr: "测" },
  { category: "Tools", name: "KuKuTool", href: "https://dy.kukutool.com/", domain: "kukutool.com", abbr: "Ku", iconUrl: null },
  { category: "Tools", name: "Visa Index", href: "https://visaindex.com/", domain: "visaindex.com", abbr: "VI" },
  { category: "Tools", name: "Find Cheap Subs", href: "https://www.findcheapsubs.com/", domain: "findcheapsubs.com", abbr: "FS" },
];

export function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}
