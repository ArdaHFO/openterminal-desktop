import {defineConfig} from '@playwright/test';import {resolve} from 'node:path';
export default defineConfig({testDir:'.',testMatch:'replay-indicators-ui.spec.ts',workers:2,fullyParallel:true,timeout:180000,retries:0,
 expect:{timeout:20000},reporter:[['list'],['html',{open:'never',outputFolder:resolve('outputs/replay-indicators/ui-report')}]],outputDir:resolve('outputs/replay-indicators/ui-results'),
 use:{baseURL:'http://127.0.0.1:3204',channel:'msedge',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1600,height:1000}}},{name:'compact',use:{viewport:{width:1024,height:768}}}]});
