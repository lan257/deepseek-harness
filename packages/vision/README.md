# vision/ — image recognition capability

English | [中文](README.zh.md)

The model-facing image recognition capability. It is a single **product** package: the tool spawns a bundled Python script per call, so there is no replaceable provider contract.

| Package | Role | ctx key |
|---|---|---|
| [`tool-vision/`](tool-vision/README.md) | Recognizes local images through opencode go's `mimo-v2.5` with automatic config failover. | (registers on `ctx.tools`) |

The child README owns the tool, the script's key resolution and failover, and the rendering contract.
