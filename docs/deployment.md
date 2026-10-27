# Inkword 零成本公开演示部署

当前架构：Cloudflare Pages 托管静态前端，Koyeb Free Web Service 运行 FastAPI。PDF 只在请求内存中解析，文章、词条、释义和复习记录仍保存在访客自己的浏览器。

## Koyeb 后端

- 部署目录：`backend`
- Builder：Dockerfile
- Service type：Web
- Instance：`free`
- Region：`fra` 或 `was`
- Port：`8000` / HTTP
- Health check：`GET /health`

环境变量：

| 名称 | 示例 | 说明 |
| --- | --- | --- |
| `AI_PROVIDER` | `agnes` | AI 提供方 |
| `AGNES_API_KEY` | 仅在 Koyeb 填写 | 密钥，不写入代码或前端 |
| `AGNES_MODEL` | `agnes-2.5-flash` | 当前演示模型 |
| `ALLOWED_ORIGINS` | `https://<project>.pages.dev` | Cloudflare Pages 的精确 origin，不使用 `*` |
| `DEMO_REQUESTS_PER_MINUTE` | `8` | 每个访客每分钟的上传和释义请求上限 |
| `DEMO_EXPLANATIONS_PER_DAY` | `30` | 每个访客每 UTC 日的 AI 解释上限 |

Koyeb 免费实例空闲后会缩容到 0；第一次请求可能需要等待。页面会保留失败的 PDF 并显示「重试上传」。限流为单实例内存计数，实例重启后重置，适合简历演示，不是计费系统。

CLI 直接上传本地目录，无需 GitHub：

```powershell
koyeb login
# 先在 Koyeb Secrets 页面建立 agnes-api-key，不把密钥写入命令历史。
koyeb deploy ./backend inkword/inkword-api `
  --archive-builder docker --instance-type free --regions fra `
  --ports 8000:http --routes /:8000 --checks 8000:http:/health `
  --env 'AI_PROVIDER=agnes' `
  --env 'AGNES_API_KEY={{ secret.agnes-api-key }}' `
  --env 'AGNES_MODEL=agnes-2.5-flash' `
  --env 'ALLOWED_ORIGINS=https://<project>.pages.dev' `
  --env 'DEMO_REQUESTS_PER_MINUTE=8' `
  --env 'DEMO_EXPLANATIONS_PER_DAY=30'
```

## Cloudflare Pages 前端

在构建时填入 Koyeb 的 HTTPS 地址：

```powershell
$env:NEXT_PUBLIC_API_URL='https://<service>.koyeb.app'
cd frontend
npm ci
npm run build
npx wrangler login
npx wrangler pages project create
npx wrangler pages deploy out --project-name inkword-flashcards --branch main
```

- Build command：`npm run build`
- Build output：`frontend/out`
- 唯一的前端环境变量：`NEXT_PUBLIC_API_URL`（Koyeb HTTPS origin）
- 前端绝对不得出现 `AGNES_API_KEY`、`OPENAI_API_KEY` 或其它提供方密钥。

Direct Upload 项目不能之后原地改成 Git 集成；如需自动部署，新建一个 Pages 项目并连接 GitHub。

## 生产验收

1. 打开 Pages 链接，确认首页可访问。
2. 上传 WPS 高亮 PDF，确认识别数量、页码、高亮文字和上下文。
3. 确认一个词条，生成一条 Agnes 释义，确认「在这篇文章里」和「词组与搭配」为中文。
4. 打开闪卡、翻面并记录一次反馈；刷新页面后数据仍在。
5. 从非白名单 origin 发起的浏览器请求不应获得 CORS 许可。

## 回滚

- Pages：在 Cloudflare 的 Deployments 页面把上一个成功部署设为生产版。
- Koyeb：从 Deployments 选择上一个成功镜像重新部署，或重新执行上一版本地目录的 `koyeb deploy`。
- 密钥泄露：先在 Agnes 撤销密钥，再在 Koyeb 替换 Secret 并重新部署。
