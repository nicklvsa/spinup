#!/usr/bin/env node

// import 'source-map-support/register';
// import StackBuilder from '../lib/builder';
// import * as cdk from 'aws-cdk-lib';
// import { AutoScalingPolicyAdjustmentMetric } from '../lib/types';

// const app = new cdk.App();

// const builder = new StackBuilder('us-east-1', 'api-test', 'test-api-stack')
// builder.toggleFeatures(true, true)
//     .capacity(1, 0)
//     .cluster('dev-test')
//     .taskScale(1, 10, 1)
//     .reservations(1024, 2048)
//     .container()
//     .api('api-container', 80, { registry: 'nginx' })
//     .addScalingPolicy(AutoScalingPolicyAdjustmentMetric.CPU, 75, 240, 120)
//     .addCloudfront('somedomain.test.com')
//     .newZone('somedomain.test.com')
//     .build(app);