# Markdown Viewer

一个优雅的Chrome扩展，用于在浏览器中查看Markdown文件。

## 功能特性

- 🎨 **美观的渲染** - 使用GitHub风格的样式渲染Markdown
- 📝 **原文切换** - 一键切换查看原始Markdown文本
- 📋 **快速复制** - 一键复制Markdown内容
- 🌐 **支持多种来源** - 支持本地文件和网络URL
- 📱 **响应式设计** - 适配各种屏幕尺寸

## 安装方法

1. 打开Chrome浏览器，进入 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `markdown-viewer` 文件夹
5. 如果需要访问本地文件，请在扩展详情页面启用"允许访问文件网址"选项

## 使用方法

1. 安装扩展后，在浏览器中打开任何 `.md` 或 `.markdown` 文件
2. 扩展会自动检测并渲染Markdown内容
3. 使用工具栏按钮切换原文视图或复制内容

## 支持的Markdown语法

- 标题 (H1-H6)
- 粗体、斜体、删除线
- 列表（有序、无序）
- 代码块和行内代码
- 引用
- 表格
- 链接和图片
- 水平线
- 任务列表

## 技术栈

- Manifest V3
- Marked.js (Markdown解析)
- 纯JavaScript (无框架依赖)
- GitHub风格CSS

## 许可证

MIT License
