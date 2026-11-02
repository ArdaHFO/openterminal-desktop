import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({testDir:'.',testMatch:'outage-live.spec.ts',workers:1,fullyParallel:false,timeout:60000,retries:0,
 expect:{timeout:20000},reporter:[['list']],outputDir:resolve('outputs/indicator-outage/live-results'),
 use:{baseURL:'http://127.0.0.1:3202',channel:'msedge',headless:true,viewport:{width:1600,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'}});
