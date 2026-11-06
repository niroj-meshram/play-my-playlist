import { applyTestEnv } from './test-env.js';
// @nestjs/throttler is CommonJS and require()s the ESM-only @nestjs/common and @nestjs/core. Jest's ESM
// runtime rejects that while those modules are still mid-evaluation, so evaluate them first.
import '@nestjs/common';
import '@nestjs/core';

applyTestEnv();
