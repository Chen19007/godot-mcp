---
AIGC:
    ContentProducer: Minimax Agent AI
    ContentPropagator: Minimax Agent AI
    Label: AIGC
    ProduceID: "00000000000000000000000000000000"
    PropagateID: "00000000000000000000000000000000"
    ReservedCode1: 30440220272e9c26d48e4b2e68c85309a4b16e9d819d9edbbd42b1ba8702b03a8b96afc402201d6e8c78e678951411edecabb05d806ae4c235f24287a25a5ea7a93a67e348c4
    ReservedCode2: 3045022100caa3fe17901c14aa5782bbb3b1a7b98626ceac25216f17f8f7315ef1bdf0d219022024cc1d8e1dd32a5d5bb5de66506ae8303c6a823851e1e4fc3bb218dc797a702d
---

# Godot MCP Server

一个用于 Godot GDScript 自动化检查的 MCP 服务器。

## 功能

- `gdlint` - 检查 GDScript 文件
- `gdformat` - 格式化代码
- `godot_export_validate` - 导出验证依赖错误
- `godot_check_all` - 执行完整检查
- `godot_get_errors` - 读取错误日志

## 安装

```bash
cd godot-mcp
npm install
```

## 配置

设置 Godot 可执行文件路径（可选，默认使用系统 PATH 中的 `godot`）：

```bash
# Godot 可执行文件路径
export GODOT_BIN=/usr/bin/godot4
```

## 在 Claude Code 中使用

在 `claude_code_settings.json` 中添加：

```json
{
  "mcpServers": {
    "godot-check": {
      "command": "node",
      "args": ["/path/to/godot-mcp/index.js"],
      "env": {
        "GODOT_BIN": "/usr/bin/godot4"
      },
      "alwaysAllow": ["gdlint", "gdformat", "godot_export_validate", "godot_check_all", "godot_get_errors"]
    }
  }
}
```

## 使用示例

所有工具都支持通过 `project` 参数指定项目路径（可选，默认当前目录）：

```bash
# 检查单个文件（使用默认当前目录）
godot-check gdlint {"file": "res://scripts/player.gd"}

# 检查指定项目中的文件
godot-check gdlint {"file": "res://scripts/player.gd", "project": "/path/to/project"}

# 检查所有文件
godot-check gdlint {"all": true, "project": "/path/to/project"}

# 格式化文件
godot-check gdformat {"file": "res://scripts/player.gd"}

# 完整检查（lint + format + export）
godot-check godot_check_all {"project": "/path/to/project"}

# 导出验证
godot-check godot_export_validate {"project": "/path/to/project", "preset": "Web"}
```

## 路径处理

- 如果 `project` 是相对路径，会自动转换为绝对路径（基于当前工作目录）
- 如果 `project` 是绝对路径，直接使用
- 文件路径可以是相对路径（相对于项目目录）或绝对路径
- 项目路径会被验证是否存在

## 自动清理

服务器会自动清理临时导出的 pack 文件，无需手动处理。
