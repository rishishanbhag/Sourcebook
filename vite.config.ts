import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Private v1: bind to localhost only.
export default defineConfig({ plugins: [react(), tailwindcss()], server: { host: '127.0.0.1' } });
