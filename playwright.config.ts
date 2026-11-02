import {defineConfig} from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir:'./tests/e2e', fullyParallel:false, workers:1, timeout:60000,
  expect:{timeout:15000}, retries:0,
  reporter:[['list'],['html',{open:'never',outputFolder:'test-artifacts/report'}]],
  outputDir:'test-artifacts/results',
  use:{baseURL:'http://127.0.0.1:3200',channel:process.env.CI?undefined:'msedge',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'desktop',use:{viewport:{width:1600,height:1000}}},{name:'compact',use:{viewport:{width:1024,height:768}}}],
  webServer:{command:'node tests/start-test-web.cjs',cwd:process.cwd(),env:{NEXT_DIST_DIR:'.next-e2e'},url:'http://127.0.0.1:3200',reuseExistingServer:!process.env.CI,timeout:180000},
});
