// src/config/puppeteer.config.ts
import { LaunchOptions } from 'puppeteer';

export const puppeteerConfig: LaunchOptions = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',  // Reduces memory usage
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',            // Disable GPU on Render
    '--single-process',         // Runs in single process mode
    '--no-zygote',
    '--disable-features=VizDisplayCompositor',
    '--memory-pressure-off'
  ],
  defaultViewport: { width: 1280, height: 720 },
};