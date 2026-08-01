# Explore

Explore 是一款 Windows 桌面知识探索工具。输入问题、添加图片或导入 PDF，应用会把内容整理成可继续展开的知识卡片；你可以在无限画布中连接、缩放和整理卡片，并把真正掌握的内容沉淀到思维宇宙。

它不把学习过程压缩成一段聊天记录，而是保留问题、推导、追问和理解之间的关系。

## 下载与安装

从 [Releases](https://github.com/zhuge-Tom/explore/releases/latest) 下载 `Explore Setup x.y.z.exe`，双击安装后可从桌面或开始菜单打开。

当前版本为 [v0.2.0](https://github.com/zhuge-Tom/explore/releases/tag/v0.2.0)。应用数据保存在 `%APPDATA%\Explore`；卸载或升级不会自动删除已有知识树、PDF 和设置。

## 从一个问题开始

输入想理解的问题即可开始。也可以添加图片、拖入图片、粘贴截图，或导入带文字层的 PDF 文献。图片和 PDF 都会在本地保存，只有在发起相应提问时才会发送给你配置的模型服务。

![Explore 首页：问题、图片和 PDF 输入](explore/docs/images/home.png)

## 在无限画布中组织知识

每个问题会生成一组知识卡片。卡片可以整体拖动，并从四边或四角调整大小；支持展开术语、对比、追问、折叠、隐藏、重写和删除。画布提供缩放、全图适配和缩略图，方便在复杂主题中保持全局视野。

![知识卡片画布](explore/docs/images/canvas.png)

## 将理解沉淀为恒星

用自己的话总结一张卡片。通过 AI 评审后，对应知识会成为思维宇宙中的一颗恒星；恒星带有知识点标注，点击即可回看原来的卡片和评审结果。

![思维宇宙](explore/docs/images/universe.png)

## 模型设置

首次启动时，或点击右上角设置按钮，可以分别配置文字对话模型和识图模型。文字对话支持 DeepSeek、Anthropic 以及自定义 OpenAI Chat Completions 兼容服务；识图模型可使用 GLM、Qwen-VL、Ollama、OpenAI、Anthropic 或兼容接口。

点击“加载模型”读取当前服务可用模型；点击“保存并测试”确认连接成功后再写入配置。API Key 保存于 Windows 凭据管理器，设置接口不会返回 Key 内容。

## 功能概览

- 流式生成 Markdown 知识卡片，卡片内文字可选中复制
- 支持图片提问：选择、拖拽或粘贴 PNG、JPEG、WebP、GIF
- PDF 本地逐页提取文字，回答使用 `[[page:N]]` 标注引用页码
- 无限知识画布：拖动、缩放、隐藏、删除、重新生成
- 思维宇宙：通过评审的理解以可点击恒星展示
- 星云式深色背景与随机闪烁星点

## 本地开发

需要 Node.js 22 与 npm。

```powershell
git clone https://github.com/zhuge-Tom/explore.git
cd explore\explore
npm install
npm run db:push
npm run dev
```

开发页面默认位于 <http://localhost:3000>。

## 构建 Windows 安装包

```powershell
cd explore\explore
npm ci
npm run desktop:build
```

安装包输出到 `explore\dist\Explore Setup x.y.z.exe`。桌面版由 Electron 启动本地服务，不需要另开浏览器。

## 隐私与边界

- 仓库和安装包不包含 API Key、个人数据库或上传文件
- 扫描型 PDF 暂不提供 OCR；没有文本层时应用会提示更换文件
- 当前版本不提供云同步、账号系统、多设备共享或自动更新

## License

[MIT](LICENSE) © 2026 zhuge-Tom
