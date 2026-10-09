// Vitest 配置：单元测试 + 覆盖率门槛（一期 CI 质量门）
// 说明：本文件仅供 vitest 使用，不影响 Vite 构建配置（vite.config.js 仍是唯一事实源）
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // 只统计纯函数物理层（lib/），UI 组件覆盖率由三期 E2E 接管
      include: ['src/lib/**'],
      exclude: ['src/lib/__tests__/**'],
      reporter: ['text'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
