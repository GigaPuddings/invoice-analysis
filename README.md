- # Invoice Analysis

  一个基于 Tauri、React 和 Rust 构建的发票解析工具，用于处理和分析发票数据。

  ## 项目简介

  Invoice Analysis 是一款桌面应用程序，可以帮助用户解析发票内容，提取关键信息，并将结果导出为 Excel 文件。该工具支持多种发票类型，包括普通发票和增值税发票。

  ## 功能特点
  - 解析增值税发票和普通发票  
  - PDF 发票预览和解析
  - 自动提取发票关键信息（购买方、销售方、金额、税额等）
  - 发票数据导出为 Excel 格式
  - 自动检测和标记重复发票
  - 支持自动更新

  ## 技术栈

  - **前端**: React, TypeScript, Ant Design, Tailwind CSS
  - **后端**: Rust, Tauri
  - **构建工具**: Vite, pnpm
  - **自动化**: GitHub Actions

  ## 安装

  从 [Releases](https://github.com/GigaPuddings/invoice-analysis/releases) 页面下载最新版本的安装包，运行安装程序即可完成安装。

  ## 开发指南

  ### 环境要求

  - Node.js (LTS 版本)
  - Rust (稳定版)
  - pnpm
  - Tauri CLI

  ### 开发环境设置

  1. 克隆仓库

  ```
  git clone https://github.com/GigaPuddings/invoice-analysis.git  
  cd invoice-analysis
  ```

  1. 安装依赖

  ```
  pnpm install
  ```

  1. 启动开发服务器

  ```
  pnpm dev
  ```

  ### 构建应用

  ```
  pnpm build
  ```

  构建后的文件将位于 `src-tauri/target/release` 目录下。

  ## 自动更新

  应用程序包含自动更新功能，当有新版本发布时，用户将收到更新通知。

  ## 发布流程

  项目使用 GitHub Actions 自动化发布流程。当推送带有 'v' 前缀的标签时，将触发构建和发布流程。

  创建新版本标签:

  ```
  pnpm tag
  ```

  ## 项目结构

  ```
  invoice-analysis/  
  ├── .github/workflows/    # GitHub Actions 工作流配置  
  ├── scripts/              # 脚本文件  
  ├── src/                  # 前端源代码  
  ├── src-tauri/            # Tauri/Rust 后端代码  
  └── public/               # 静态资源  
  ```

  ## 贡献指南

  1. Fork 本仓库
  2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
  3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
  4. 推送到分支 (`git push origin feature/amazing-feature`)
  5. 打开一个 Pull Request

  ## 许可证

  [MIT License](https://deepwiki.com/search/LICENSE)

  ## 联系方式

  如有问题或建议，请提交 [Issue](https://github.com/GigaPuddings/invoice-analysis/issues)。
