#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { MarketsageInfraStack } from '../lib/marketsage-infra-stack';

const app = new cdk.App();

new MarketsageInfraStack(app, 'MarketsageInfraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  },
  description: 'MarketSage - Adversarial LLM Stock Analyst Infrastructure',
});

app.synth();
