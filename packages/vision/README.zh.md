# vision/ — 识图能力

中文 | [English](README.md)

模型可见的识图能力。它只有一个 **product** 包：工具每次调用都会启动随包的 Python 脚本，因此不存在可替换的 provider 契约。

| 包 | 职责 | ctx key |
|---|---|---|
| [`tool-vision/`](tool-vision/README.md) | 通过 opencode go 的 `mimo-v2.5` 识别本地图片，失败时自动切换配置。 | （注册到 `ctx.tools`） |

子 README 拥有工具、脚本的密钥解析与回退，以及渲染契约。
