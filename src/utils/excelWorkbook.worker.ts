import { readWorkbookRowsLocally } from './excelWorkbook';

self.onmessage = async (event: MessageEvent<File>) => {
  const start = performance.now();
  try { self.postMessage({ result: await readWorkbookRowsLocally(event.data), parseMs: performance.now() - start }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'خواندن فایل ناموفق بود.' }); }
};
