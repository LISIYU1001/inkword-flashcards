> 已增加 Agnes 支持：本地 `backend/.env` 已准备好，只需填写 `AGNES_API_KEY` 并重启后端。详见 [Agnes 配置说明](docs/agnes-setup.md)。下文 OpenAI 配置仍适用于选择 OpenAI 的情况。

# Inkword · 英语外刊学习

版本 0.3：WPS PDF 高亮 → 原文上下文 → 确认词条 → Agnes/OpenAI 结构化释义 → 自动形成闪卡 → 三档复习反馈。

公网演示采用 Cloudflare Pages 静态前端 + Koyeb 免费 FastAPI 后端，参见 [部署说明](docs/deployment.md)。

## 已实现

- PDF 上传、真实 Highlight 提取、原文上下文、页码和四边形证据；异常文件明确提示。
- 词条编辑、增删、确认、本地生词本、JSON 导出；保留原始文本、原始页码及原始上下文。
- 中文释义、英文解释、词性、语境解释、用法提示和 AI 补充例句；单词与词组分别解释。
- 确认后逐条批量生成，每条成功结果立即保存；失败可重试，只补全缺失词条。
- 闪卡正面英文，背面解释和原文；翻面后三档反馈，保存失败不会跳到下一张。
- v1 数据向后兼容。没有账户、真实词典接口或 FSRS 调度，目前是自由复习。

## 配置真实 OpenAI 调用

**交付时本机没有 API Key，未执行真实付费请求。没有密钥时只提示配置，不填入假释义。**

1. 将 `backend/.env.example` 复制为 `backend/.env`。
2. 在本机编辑 `.env`，填写密钥，不要发送到聊天、网页前端或版本库。

```dotenv
OPENAI_API_KEY=在本机填写
OPENAI_MODEL=gpt-4.1-mini
```

3. 重启后端，在词条页点击「刷新配置」。可将模型改为你账户有权限且支持 Responses Structured Outputs 的模型。
4. 确认并保存词条，再点击「生成 AI 释义」。首次建议仅保留一个词条进行真实权限及输出质量验证。

后端通过官方 Python SDK `responses.parse` + Pydantic schema 获取结构化输出，使用 `store=False`、40 秒超时、不自动重试。已有进程环境变量优先于 `.env`。状态接口只返回配置布尔值和模型名，不返回密钥。

仅发送词条、类型、上下文，不发送原 PDF、文章标题或本地路径。原文不是模型输出字段，不被生成结果覆盖。页面明确区分「原文例句 · PDF 提取 / 用户编辑」和「补充例句 · AI 生成」。AI 释义供学习参考，不冒充权威词典来源。

## 启动

环境：Python 3.11+、Node.js 22+、npm。当前目录已安装依赖并完成构建。

项目目录运行 `./Start.ps1` 可启动两个本地服务。需要 3000、8000 端口空闲，保持终端打开，Ctrl+C 停止脚本启动的服务。日志在 `.logs/`。

也可分两个终端启动（已经实际联调）：

```powershell
cd backend
./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
cd frontend
npm run start
```

打开 http://127.0.0.1:3000 。开发时用 `npm run dev`，源码变更后用 `npm run build` 再启动生产预览。本机使用 webpack，避免 Turbopack 子进程兼容问题。

### 新电脑安装

```powershell
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.lock.txt
cd ../frontend
npm ci
npm run build
```

如果 venv 的 ensurepip 失败：`python -m pip --python .venv/Scripts/python.exe install -r requirements.lock.txt`。

前端在本机地址下默认连接 `http://127.0.0.1:8000`。公网构建必须设置 `NEXT_PUBLIC_API_URL` 为 Koyeb HTTPS 地址。这个变量只放 API 地址，不要配置任何 `NEXT_PUBLIC_*` 密钥。

## 数据与架构

- PDF 不在后端持久化，刷新后查看原文件的临时链接失效。
- localStorage 键仍为 `inkword.library.v1`，新增 `ai`、`reviews` 均为可选字段。
- 输入签名关联词条、类型、上下文。修改这些内容会清除旧释义；页码编辑不影响解释，原始 `source_page` 保持不变。
- AI 写入时重新读取最新文章，只合并目标词条；被修改、退回草稿或删除的目标拒绝旧响应，保留其他词条和已保存反馈。
- 复习事件含独立 ID、三档评分、时间戳及输入签名，便于未来接入 FSRS，目前不安排到期时间。
- 坐标为 PyMuPDF 未旋转页左上角原点，单位 PDF point。重复高亮保留独立记录。
- 浏览器数据绑定访问地址。沿用 `http://127.0.0.1:3000` 可继续读取同一浏览器旧记录；换浏览器/端口或清除存储不会自动迁移。
- JSON 导出包含解释及反馈，当前没有导入 UI。

```text
backend/app/parser.py               PDF 提取与上下文
backend/app/explanations.py         OpenAI 请求、结构化结果、错误归类
backend/app/main.py                 FastAPI 上传/解释/状态接口
backend/tests/                     PDF 和 SDK 合约测试
frontend/lib/api.ts               本机/公网后端地址边界
frontend/components/workspace.tsx   上传、确认与批量解释
frontend/components/explanation.tsx 释义及来源展示
frontend/components/flashcards.tsx  复习会话及反馈
frontend/lib/types.ts               Zod 数据契约
frontend/lib/learning.ts            签名、闪卡派生和复习事件
frontend/lib/storage.ts             可替换存储适配层
frontend/e2e/                      浏览器回归测试
```

## 验证

```powershell
cd backend
$env:WPS_TEST_PDF='你的 WPS PDF 完整路径'
./.venv/Scripts/python.exe -m pytest -q
cd ../frontend
npm test
npm run typecheck
npm run build
# 启动前后端，使用本机 Chrome 的独立无头会话
npx playwright test --reporter=list
```

真实 PDF 未复制到项目，未设置路径的真实样本测试会明确跳过。AI 测试使用 SDK + HTTP MockTransport，浏览器 AI 场景使用隔离测试响应；产品内没有模拟 AI 开关。详情见 `docs/phase2-validation.md`，第一步历史结果见 `docs/validation.md`。

## 已知边界

一份真实 WPS 文件验证了 9 处高亮；跨行、双栏等使用受控合成 PDF。跨页句子、复杂排版、缩写、断词及编码异常需人工核对。不做 OCR，不能识别已扁平化的高亮注释。

停止生成是在当前请求完成后停止后续请求，当前请求可能已计费。本机无密钥，真实 API 权限、模型输出质量及费用尚未验证。

公网版是无账户的简历演示；localStorage 没有跨标签页事务，请避免同时编辑同一篇文章。后端使用单实例内存限流，实例重启后会重置；不适合正式多用户产品。PyMuPDF 发布许可需遵循其 AGPL/商业条款。

参考：[OpenAI 结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)、[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[PyMuPDF](https://pymupdf.readthedocs.io/en/latest/recipes-text.html)。
