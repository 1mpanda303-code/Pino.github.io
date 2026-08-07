# Luma Learning Lab

> 面向英语视频学习的个人工作台：先理解，再回忆，再通过 GPT Live 或 AI 助手进行巩固。

[在线体验](https://1mpanda303-code.github.io/Pino.github.io/)

## 你可以做什么

- 建立自己的视频片库，围绕字幕、关键词和重点片段完成三遍学习。
- 导出学习材料给 GPT Live 进行追问、复述和迁移练习，再将结构化报告导回工作台。
- 使用 AI 助手补充学习记录，并在进步区查看、编辑或删除 AI 与 Live 报告。
- 汇总词汇、问题、表达和学习记录，持续追踪个人进步。
- 在“设置与数据管理”中备份、恢复和同步自己的工作区。

## 隐私与数据

本仓库不包含任何个人视频、字幕、学习报告、对话记录、API Key、同步密码或账号信息。公开访问者会从空片库开始；个人资料仅保存在自己的浏览器、备份文件或自行配置的云同步空间中。

请勿将 `.env`、`.dev.vars`、私有资料或任何凭据提交到 GitHub。

## 本地运行

需要 Node.js 22 和 pnpm 11。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

随后打开 `http://127.0.0.1:5175`。

## 验证

```bash
pnpm test
pnpm build
```

## 目录说明

- `src/`：React 工作台与学习数据逻辑。
- `public/schemas/`：AI、GPT Live 与学习回填包的 JSON Schema。
- `functions/`：Cloudflare Pages Functions，包括 AI 转发和工作区同步接口。
- `migrations/`：Cloudflare D1 的数据库迁移。

## 部署说明

GitHub Pages 提供公开的静态工作台。若要使用服务端 AI 转发或跨设备同步，请在自己的 Cloudflare Pages 项目中部署本仓库，并将 D1 数据库和密钥仅配置在 Cloudflare 环境变量中。
