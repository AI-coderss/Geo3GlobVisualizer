import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    preview: {
      allowedHosts: ["geo3globvisualizer.onrender.com"],   // ✅ FIX
    },

    plugins: [react()],

    define: {
      // Replace Gemini with OpenAI
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
      'process.env.API_KEY': JSON.stringify(env.OPENAI_API_KEY),   // backward compatibility

      // Remove Gemini but keep fallback if you still reference it somewhere
      'process.env.GEMINI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
