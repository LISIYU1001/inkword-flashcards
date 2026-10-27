# Agnes 接入与配置

1. 打开项目 `backend/.env`，在 `AGNES_API_KEY=` 后填写自己创建的密钥并保存。
2. 保持 `AI_PROVIDER=agnes`，默认模型为 `agnes-2.5-flash`；也可填写账户中支持的其他 Agnes 文本模型。
3. 重启后端，然后在页面点击“刷新配置”。“服务端已配置”仅代表已填写，不代表账户认证或余额验证成功。
4. 打开已确认的文章，生成解释。第一次先用少量词条验证；生成成功后可进入闪卡复习。

密钥只保存在服务端 `.env`，该文件已被 `.gitignore` 排除。不要把密钥发到聊天或放进前端。系统环境变量优先于 `.env`。

## 接口与验证

- 官方文档：https://agnes-ai.com/zh-Hans/docs/agnes-25-flash
- 固定官方地址 `https://apihub.agnes-ai.com/v1/chat/completions`。
- 只发送词条、词条类型、句子上下文；不发送整份 PDF、文章标题或复习历史。
- 使用 Chat Completions，提示词要求 JSON，服务端 Pydantic 校验七个解释字段。文档未承诺 strict JSON Schema 模式，不假定服务端支持该参数。
- 拒绝空响应、截断结果、缺字段、额外字段和空白解释。失败不会伪造词典结果。
- 本地 HTTP 模拟测试不代表真实账户连通性或解释质量已通过验证。真实验证需填入密钥后完成。
- OpenAI 原有入口保留，切换 `AI_PROVIDER=openai` 并配置 `OPENAI_API_KEY` 即可；历史记录无需迁移。
