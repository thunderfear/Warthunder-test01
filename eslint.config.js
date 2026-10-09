import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.d.ts',
      'frontend/vite.config.js',
      '.qoder/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // 宽松起步：只警告，不阻断；随团队适应逐步收紧
      '@typescript-eslint/no-unused-vars': 'warn',
      // warn/error 属于有意的日志输出（后端错误日志、前端错误边界），只拦截 log 级噪音
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
