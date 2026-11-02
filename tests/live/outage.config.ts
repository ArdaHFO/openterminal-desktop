import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
const out=resolve('outputs/indicator-outage');
export default defineConfig({testDir:'.',testMatch:'outage-ui.spec.ts',workers:2,fullyParallel:true,timeout:60000,retries:0,
 expect:{timeout:15000},reporter:[['list'],['html',{open:'never',outputFolder:resolve(out,'ui-report')}]],outputDir:resolve(out,'ui-results'),
 use:{baseURL:'http://127.0.0.1:3000',channel:'msedge',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1600,height:1000}}},{name:'compact',use:{viewport:{width:1024,height:768}}}]});
