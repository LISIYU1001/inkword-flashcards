# Inkword 零成本公开演示部署

架构：Cloudflare Pages 静态前端 + Render Free Web Service FastAPI。PDF 只在请求内存中解析；文章、词条、释义和复习记录保存在访客自己的浏览器。

> 原计划使用 Koyeb Free；2026-10-27 新账户控制台只显示加入 Mistral 后的改版通知，没有 Apps、Services、Secrets 或 API token 入口，因此改用 Render。

## Render 后端

根目录的 `render.yaml` 定义 Docker Web Service `inkword-api`、`backend` 根目录、Free 计划和 `/health` 健康检查。在 Render 从 GitHub 仓库创建 Blueprint 时，只手动输入 `AGNES_API_KEY`；它使用 `sync: false`，不写入 Git 或前端。

| 名称 | 值 | 说明 |
| --- | --- | --- |
| `AI_PROVIDER` | `agnes` | AI 提供方 |
| `AGNES_API_KEY` | 仅在 Render 填写 | 服务端 Secret |
| `AGNES_MODEL` | `agnes-2.5-flash` | 演示模型 |
| `ALLOWED_ORIGINS` | `https://inkword-flashcards.pages.dev` | Pages 精确 origin，不使用 `*` |
| `DEMO_REQUESTS_PER_MINUTE` | `8` | 每访客每分钟的上传和释义请求上限 |
| `DEMO_EXPLANATIONS_PER_DAY` | `30` | 每访客每 UTC 日 AI 解释上限 |

Render 免费服务闲置 15 分钟后休眠，唤醒可能需约一分钟。页面会保留失败的 PDF 并显示「重试上传」。限流为单实例内存计数，实例重启后重置，适合简历演示而非正式计费系统。

## Cloudflare Pages 前端

```powershell
$env:NEXT_PUBLIC_API_URL='https://inkword-api.onrender.com'
cd frontend
npm ci
npm run build
```

将 `frontend/out` 作为 Direct Upload 发布。前端只公开 `NEXT_PUBLIC_API_URL`，绝不包含 `AGNES_API_KEY`。预期公网地址为 `https://inkword-flashcards.pages.dev`。

## 生产验收

1. 打开 Pages 链接，上传 WPS 高亮 PDF，核对数量、页码、文字和上下文。
2. 生成一条 Agnes 释义，确认「在这篇文章里」和「词组与搭配」为中文。
3. 翻转闪卡并记录反馈；刷新后数据仍在。
4. 非白名单 origin 的浏览器请求不获得 CORS 许可。

## 回滚

- Pages：在 Cloudflare Deployments 把上一个成功部署设为生产版。
- Render：在 Deploys 页面重新部署上一个成功 commit。
- 密钥泄露：先在 Agnes 撤销，再在 Render 替换 Secret 并重新部署。
