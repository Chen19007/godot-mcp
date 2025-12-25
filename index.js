import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

// 获取跨平台临时目录
function getTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'godot-mcp-'));
}

// 获取项目路径（必须是绝对路径）
function getProjectPath(requestedPath) {
  if (!requestedPath) {
    throw new Error('project 参数必须提供');
  }
  if (!path.isAbsolute(requestedPath)) {
    throw new Error(`项目路径必须是绝对路径，当前为相对路径: ${requestedPath}`);
  }
  return requestedPath;
}

// 验证路径是否存在且是目录
function validateProjectPath(projectPath) {
  if (!path.isAbsolute(projectPath)) {
    throw new Error(`项目路径必须是绝对路径: ${projectPath}`);
  }
  if (!fs.existsSync(projectPath)) {
    throw new Error(`项目路径不存在: ${projectPath}`);
  }
  if (!fs.statSync(projectPath).isDirectory()) {
    throw new Error(`项目路径不是目录: ${projectPath}`);
  }
  return projectPath;
}

// 验证文件路径必须是绝对路径
function validateFilePath(filePath, projectPath) {
  if (!filePath) {
    throw new Error('file 参数必须提供');
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error(`文件路径必须是绝对路径，当前为: ${filePath}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return filePath;
}

// 获取项目内所有 .gd 文件（跨平台）
function getGdFiles(projectPath) {
  const gdFiles = [];
  const ignoreDirs = ['node_modules', '.git', '.svn', '.hg', '.cache', '.gradle', 'build', 'export'];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // 跳过忽略的目录
      if (entry.isDirectory()) {
        if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.gd')) {
        gdFiles.push(fullPath);
      }
    }
  }
  scanDir(projectPath);
  return gdFiles;
}

const server = new Server({
  name: 'godot-check',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

// 工具列表
const tools = [
  {
    name: 'gdlint',
    description: '运行 gdlint 检查 GDScript 文件',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: '要检查的 GDScript 文件路径（必须是绝对路径）'
        },
        project: {
          type: 'string',
          description: 'Godot 项目根目录路径（必须是绝对路径）'
        },
        all: {
          type: 'boolean',
          description: '检查项目中所有 .gd 文件',
          default: false
        }
      },
      required: ['project', 'file']
    }
  },
  {
    name: 'gdformat',
    description: '运行 gdformat 格式化 GDScript 文件',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: '要格式化的 GDScript 文件路径（必须是绝对路径）'
        },
        project: {
          type: 'string',
          description: 'Godot 项目根目录路径（必须是绝对路径）'
        },
        check: {
          type: 'boolean',
          description: '只检查格式，不实际修改',
          default: false
        }
      },
      required: ['project', 'file']
    }
  },
  {
    name: 'godot_export_validate',
    description: '使用 Godot 导出验证检查依赖错误',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Godot 项目根目录路径（必须是绝对路径）'
        },
        preset: {
          type: 'string',
          description: '导出预设名称',
          default: 'Web'
        }
      },
      required: ['project']
    }
  },
  {
    name: 'godot_check_all',
    description: '执行完整的 Godot 项目检查（lint + format + export）',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: '可选：要检查的特定 GDScript 文件路径（必须是绝对路径）'
        },
        project: {
          type: 'string',
          description: 'Godot 项目根目录路径（必须是绝对路径）'
        }
      },
      required: ['project']
    }
  },
  {
    name: 'godot_get_errors',
    description: '解析并返回最近的错误信息',
    inputSchema: {
      type: 'object',
      properties: {
        log_file: {
          type: 'string',
          description: '日志文件路径（必须是绝对路径）'
        },
        project: {
          type: 'string',
          description: 'Godot 项目根目录路径（必须是绝对路径）'
        }
      },
      required: ['project']
    }
  }
];

// 实现工具处理
async function handleTool(toolName, args) {
  const projectPath = validateProjectPath(getProjectPath(args.project));

  switch (toolName) {
    case 'gdlint': {
      const { file, all } = args;

      if (all) {
        // 使用跨平台的 getGdFiles 替代 find 命令
        const gdFiles = getGdFiles(projectPath);
        let allErrors = '';
        let hasError = false;

        for (const gdFile of gdFiles) {
          try {
            const { stderr } = await execAsync(`gdlint "${gdFile}"`);
            if (stderr && stderr.toLowerCase().includes('error')) {
              hasError = true;
              allErrors += `[${gdFile}]\n${stderr}\n`;
            }
          } catch (e) {
            hasError = true;
            allErrors += `[${gdFile}]\n${e.stderr || e.message}\n`;
          }
        }

        return {
          success: !hasError,
          output: hasError ? '发现错误' : '所有文件检查通过',
          errors: allErrors,
          checkedFiles: gdFiles.length,
          project: projectPath
        };
      }

      const targetFile = validateFilePath(file, projectPath);
      try {
        const { stdout, stderr } = await execAsync(`gdlint "${targetFile}"`);
        if (stderr && stderr.toLowerCase().includes('error')) {
          return { success: false, output: stdout, errors: stderr, project: projectPath };
        }
        return { success: true, output: stdout || '检查通过', errors: '', project: projectPath };
      } catch (error) {
        return { success: false, output: error.stdout || '', errors: error.stderr || error.message, project: projectPath };
      }
    }

    case 'gdformat': {
      const { file, check } = args;
      const targetFile = validateFilePath(file, projectPath);
      const cmd = check ? `gdformat --check "${targetFile}"` : `gdformat "${targetFile}"`;

      try {
        const { stdout, stderr } = await execAsync(cmd, {
          cwd: projectPath,
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large files
        });
        return {
          success: true,
          output: check ? '格式正确' : '格式化完成',
          formatted: !check,
          project: projectPath
        };
      } catch (error) {
        return {
          success: false,
          output: error.stdout || '',
          errors: error.stderr || '格式错误',
          project: projectPath
        };
      }
    }

    case 'godot_export_validate': {
      const { preset } = args;
      const targetPreset = preset || 'Web';
      // 使用跨平台临时目录
      const tempDir = getTempDir();
      const targetOutput = path.join(tempDir, 'validate.pck');

      try {
        const { stdout, stderr } = await execAsync(
          `"${GODOT_BIN}" --headless --path "${projectPath}" --export-pack "${targetPreset}" "${targetOutput}"`,
          { cwd: projectPath, timeout: 120000 }
        );

        // 清理临时文件
        fs.rmSync(tempDir, { recursive: true, force: true });

        const errorOutput = stdout + stderr;
        const hasErrors = errorOutput.match(/ERROR|Error|error/i);

        if (hasErrors) {
          const errors = errorOutput.split('\n')
            .filter(line => /ERROR|Error|error|Identifier/i.test(line))
            .slice(0, 20);

          return {
            success: false,
            output: '发现依赖错误',
            errors: errors.join('\n'),
            cleaned: true,
            project: projectPath
          };
        }

        return {
          success: true,
          output: '项目验证通过',
          cleaned: true,
          project: projectPath
        };
      } catch (error) {
        // 清理临时目录（即使失败）
        fs.rmSync(tempDir, { recursive: true, force: true });

        return {
          success: false,
          output: '验证失败',
          errors: error.stdout || error.message,
          cleaned: true,
          project: projectPath
        };
      }
    }

    case 'godot_check_all': {
      const { file } = args;
      const results = {
        lint: null,
        format: null,
        export: null,
        summary: []
      };

      // Step 1: Lint 检查
      try {
        if (file) {
          const targetFile = validateFilePath(file, projectPath);
          await execAsync(`gdlint "${targetFile}"`);
          results.lint = { success: true, output: 'Lint 通过' };
        } else {
          // 使用跨平台方式获取所有 .gd 文件
          const gdFiles = getGdFiles(projectPath);
          let allErrors = '';
          let hasError = false;

          for (const gdFile of gdFiles) {
            try {
              await execAsync(`gdlint "${gdFile}"`);
            } catch (e) {
              hasError = true;
              allErrors += `[${gdFile}]\n${e.stderr || e.message}\n`;
            }
          }

          results.lint = hasError
            ? { success: false, errors: allErrors, checkedFiles: gdFiles.length }
            : { success: true, output: '所有文件 lint 通过', checkedFiles: gdFiles.length };
        }
      } catch (error) {
        results.lint = { success: false, errors: error.stdout || error.message };
      }

      results.summary.push(`Lint: ${results.lint?.success ? 'OK' : 'FAIL'}`);

      // Step 2: Format
      try {
        if (file) {
          const targetFile = validateFilePath(file, projectPath);
          await execAsync(`gdformat "${targetFile}"`, { cwd: projectPath });
        } else {
          // 使用跨平台方式获取所有 .gd 文件并格式化
          const gdFiles = getGdFiles(projectPath);
          for (const gdFile of gdFiles) {
            await execAsync(`gdformat "${gdFile}"`, { cwd: projectPath });
          }
        }
        results.format = { success: true, output: '格式化完成' };
      } catch (error) {
        results.format = { success: false, errors: error.message };
      }

      results.summary.push(`Format: ${results.format?.success ? 'OK' : 'FAIL'}`);

      // Step 3: Export 验证
      const exportResult = await handleTool('godot_export_validate', {
        project: projectPath,
        preset: 'Web'
      });
      results.export = exportResult;
      results.summary.push(`Export: ${exportResult.success ? 'OK' : 'FAIL'}`);

      return {
        success: results.lint?.success && exportResult.success,
        results,
        summary: results.summary.join(' | '),
        project: projectPath
      };
    }

    case 'godot_get_errors': {
      const { log_file } = args;

      // 必须是绝对路径
      let logPath;
      if (log_file) {
        if (!path.isAbsolute(log_file)) {
          throw new Error(`日志文件路径必须是绝对路径，当前为: ${log_file}`);
        }
        logPath = log_file;
      } else {
        // 默认查找项目目录下的 logs 子目录
        logPath = path.join(projectPath, 'logs', 'godot.log');
      }

      if (!fs.existsSync(logPath)) {
        return { success: false, output: '日志文件不存在', project: projectPath };
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n');
      const errorLines = lines
        .filter(line => /ERROR|Error|error|Identifier/i.test(line))
        .slice(-50);

      return {
        success: true,
        errors: errorLines.join('\n'),
        count: errorLines.length,
        project: projectPath
      };
    }

    default:
      return { success: false, error: '未知工具' };
  }
}

// 处理请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const result = await handleTool(name, args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2)
        }
      ]
    };
  }
});

// 启动服务器
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  // 错误输出到 stderr，不会干扰 stdout 的 MCP 协议通信
  process.stderr.write(`[Error] MCP Server error: ${error.message}\n`);
  process.exit(1);
});

// 注意：不要在此处使用 console.log 或 console.error 打印启动信息
// 因为 stdout 和 stderr 会被 MCP 客户端（如 Claude Desktop）捕获
// 启动成功时 MCP 客户端会通过协议握手感知，无需额外输出
