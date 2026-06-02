# Refinex Wiki

Refinex Wiki 是一个基于 Next.js、React、Tauri v2 和 Plate 的本地知识库桌面应用。项目的 Web 前端由 Next.js 构建，桌面端由 Tauri 打包为 macOS 应用和安装包。

## 环境要求

- macOS，用于构建 Mac `.app` / `.dmg` 产物
- Node.js 20+
- npm
- Rust stable
- Xcode Command Line Tools

首次准备 macOS 构建环境：

```bash
xcode-select --install
```

如果还没有安装 Rust：

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

安装项目依赖：

```bash
npm install
```

## 本地开发

启动 Next.js Web 开发服务：

```bash
npm run dev
```

启动 Tauri 桌面开发模式：

```bash
npm run desktop:dev
```

Tauri 开发模式会使用 `src-tauri/tauri.conf.json` 中的 `devUrl`，默认连接 `http://localhost:3000`。

## 测试和检查

运行前端测试：

```bash
npm run test:run
```

运行 ESLint：

```bash
npm run lint
```

运行 Tauri/Rust 测试：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## Web 构建

普通 Next.js 构建：

```bash
npm run build
```

桌面端 Web 静态构建：

```bash
npm run build:desktop:web
```

`build:desktop:web` 会设置 `NEXT_OUTPUT=export`，生成 Tauri 使用的静态资源目录 `out/`。Tauri 配置中的 `frontendDist` 指向 `../out`，因此桌面打包前会自动走这一套静态构建。

## 打包 Mac 安装包

生成 macOS `.dmg` 安装包：

```bash
npm run desktop:build -- --bundles dmg
```

如果本机没有 Apple Developer 签名证书，只需要本地测试安装包，可以跳过签名：

```bash
npm run desktop:build -- --bundles dmg --no-sign
```

构建完成后，`.dmg` 通常输出在：

```text
src-tauri/target/release/bundle/dmg/
```

如果只想生成 macOS `.app` 应用包：

```bash
npm run desktop:build -- --bundles app
```

`.app` 通常输出在：

```text
src-tauri/target/release/bundle/macos/
```

生成项目配置中的全部 bundle 目标：

```bash
npm run desktop:build
```

只验证 Tauri release 构建、不生成安装包：

```bash
npm run desktop:build -- --no-bundle
```

## Universal Mac 构建

如果需要同时支持 Apple Silicon 和 Intel Mac，可以构建 Universal 产物：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run desktop:build -- --target universal-apple-darwin --bundles dmg
```

本地无签名证书时：

```bash
npm run desktop:build -- --target universal-apple-darwin --bundles dmg --no-sign
```

## 图标

项目图标来源于：

```text
public/logo.png
```

Tauri 桌面图标位于：

```text
src-tauri/icons/
```

重新生成 Tauri 图标：

```bash
npx tauri icon public/logo.png
```

## 关键脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Next.js Web 开发服务 |
| `npm run desktop:dev` | 启动 Tauri 桌面开发模式 |
| `npm run build` | 普通 Next.js 构建 |
| `npm run build:desktop:web` | 生成 Tauri 使用的静态 Web 资源 |
| `npm run desktop:build -- --bundles dmg` | 构建 macOS `.dmg` 安装包 |
| `npm run desktop:build -- --bundles app` | 构建 macOS `.app` 应用包 |
| `npm run desktop:build -- --no-bundle` | 只做 Tauri release 构建，不生成安装包 |

## 常见问题

### 找不到 Rust 或 Cargo

确认 Rust 已安装并且 shell 已加载 Rust 环境：

```bash
source "$HOME/.cargo/env"
rustc --version
cargo --version
```

### macOS 构建缺少系统工具

安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

### 生成的安装包无法直接打开

未签名的 `.dmg` 或 `.app` 在其它 Mac 上可能被 Gatekeeper 拦截。正式分发需要 Apple Developer 证书签名，并按 Apple 要求完成 notarization。
