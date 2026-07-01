# AGENTS.md

## 产品目标

Fero 是一个开源的 RaiDrive 类云盘挂载工具，底层基于 rclone。

Fero 不是一个通用的 rclone 同步 GUI。它的核心体验应该是：把云存储挂载成本地磁盘或本地目录，并且可靠地管理这些挂载，让普通桌面用户能够清楚理解挂载状态、缓存状态、日志和错误。

## 当前产品范围

第一阶段优先支持这些形态：

- Windows 桌面程序
- macOS 桌面程序
- Docker 部署，并提供 Web 控制界面

Linux 桌面端暂时不是第一优先级。Linux 用户优先通过 Docker/server 模式使用：把宿主机目录映射进容器，然后通过 Web UI 控制 rclone 挂载。原生 Linux 桌面端可以在产品流程验证之后再做。

## UI 方向

桌面端和 Web 端必须尽量共用同一套 UI 代码。

UI 应该简洁、优雅、实用：

- 挂载列表是主界面
- 添加、编辑、停止挂载的流程要直观
- 清楚展示挂载健康状态、缓存状态、日志和可操作错误
- 在真正需要之前，不要过早绑定复杂 UI 组件库
- 同步和传输功能是次要能力，挂载管理才是主产品

## 架构方向

rclone 应作为外部二进制或 sidecar 使用，不要把 rclone 源码嵌入项目。

推荐架构：

```text
共享 React UI
  -> 桌面端：Tauri commands
  -> Docker/Web 端：HTTP API
  -> rclone 进程管理
  -> rclone mount / rclone RC
```

桌面端负责在本机打包和控制 rclone。Docker 版本在容器内运行 rclone，并暴露浏览器 UI/API 供用户控制。

产品能力应围绕“可靠挂载管理”展开：

- 每个挂载都应该可以独立管理
- 进程生命周期必须清晰可控
- 退出、卸载和清理逻辑很重要
- 自动重连和开机恢复挂载是后续重要能力
- 缓存行为必须可见、可配置

## 平台注意事项

挂载能力依赖各平台的底层组件：

- Windows：WinFsp
- macOS：macFUSE
- Linux/Docker：FUSE 支持、容器权限/capabilities、宿主机目录映射

不要承诺云盘挂载可以完全等同于本地磁盘。它会受到网络质量、云服务 API 限制、OAuth/token 状态、缓存模式和 FUSE 行为影响。

## 后续 Agent 工作约束

- 除非用户明确改变方向，不要把 Fero 当成同步优先的工具来设计。
- 不要因为 rclone 是 Go 写的，就重新引入 Wails/Go。当前方向是 Tauri/Rust + 外部 rclone binary。
- Web 端和桌面端 UI 要尽量复用，不要做成两套割裂的界面。
- 优先围绕挂载生命周期、缓存可视化、provider 配置、Docker/Web 控制做小步可验证迭代。
- 如果要引入 UI 组件库，必须先评估它是否适合桌面端/Web 端共用，以及是否符合简洁、优雅、实用的操作型界面目标。
