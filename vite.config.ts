import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repository = (process.env.GITHUB_REPOSITORY ?? '').split('/')[1] ?? '';
const pagesBase = !repository || repository.endsWith('.github.io') ? '/' : `/${repository}/`;

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS === 'true'
    ? pagesBase
    : './',
  build: { target: 'es2022' },
});
