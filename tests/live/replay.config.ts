import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({testDir:'.',testMatch:'replay-vwap-ui.spec.ts',workers:2,fullyParallel:true,timeout:120000,retries:0,
 expect:{timeout:20000},reporter:[['list'],['html',{open:'never',outputFolder:resolve('outputs/replay-vwap/ui-report')}]],outputDir:resolve('outputs/replay-vwap/ui-results'),
 use:{baseURL:process.env.REPLAY_WEB_URL??'http://127.0.0.1:3203',channel:'msedge',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1600,height:1000}}},{name:'compact',use:{viewport:{width:1024,height:768}}}]});
