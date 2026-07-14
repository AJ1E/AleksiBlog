# Navigation Assets

## Current Decisions

- Qwen 使用本地资源 `public/assets/navigation/qwen-logo.jpg`，来源为 [QwenLM/Qwen 官方仓库](https://github.com/QwenLM/Qwen/tree/main/assets)。本地保存是为了避免页面运行时依赖第三方图标服务；它是 Qwen 的品牌标识，公开部署前仍应遵守其商标和许可要求。
- KuKuTool 暂未找到可靠、稳定的官方图标，因此使用本地 `Ku` 文字标识，不依赖第三方图片服务。
- 其他导航网站暂时继续使用现有的 Google favicon 服务，并保留加载失败后的文字缩写回退。

## Removal Path

如果以后需要统一改成本地资源，只需把导航项的 `iconUrl` 指向 `public/assets/navigation/` 中的文件，并在不需要时删除对应资源和字段，不涉及页面结构重构。
