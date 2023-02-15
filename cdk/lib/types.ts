import {
    aws_lambda as lambda,
} from 'aws-cdk-lib';

const lambdaRuntimeList = [...lambda.Runtime.ALL.map(runtime => {
    return runtime.name;
})] as const;

export type Nullable<T> = T | null;

export type LambdaRuntimeChoice = typeof lambdaRuntimeList[number];

export interface ContainerImageConfig {
    local?: string;
    registry?: string;
}

export enum AutoScalingPolicyAdjustmentMetric {
    CPU,
    Memory,
    RequestCount
}

export interface ScalerConfig {
    targetUtilizationPercent: number;
    scaleInCooldownSeconds: number;
    scaleOutCooldownSeconds: number;
    requestCountScaler?: number;
}

export interface AutoScalingPolicyAdjustmentConfig {
    type: AutoScalingPolicyAdjustmentMetric;
    scaling?: ScalerConfig;
}

interface SpotOnDemandMixture {
    spot: number;
    ondemand: number;
}

interface ExistingResourceSelection {
    vpcIdentifier?: string;
    clusterIdentifier?: string;
}

interface APIScalingConfig {
    policies: AutoScalingPolicyAdjustmentConfig[];
    desiredCount: number;
    maxCount: number;
    minCount: number;
}

export interface CronJobCode extends Record<string, any> {
    fromLocal?: string;
    fromLocalImage?: string;
    fromBucket?: string;
    fromEcrImage?: string;
    fromInline?: string;
}

export interface CronJob {
    name: string;
    code: CronJobCode;
    entrypoint: string;
    schedule: string;
    runtime: LambdaRuntimeChoice;
}

export interface Route53ZoneImport {
    zoneName: string;
    zoneID: string;
}

export interface Route53ZoneCreation {
    zoneName: string;
}

export interface CloudfrontConfig {
    domainName: string;
    certificateArn?: string;
    externalZone?: Route53ZoneImport;
    newZone?: Route53ZoneCreation;
}

export interface ContainerConfig {
    name?: string;
    envs?: any;
    port?: number;
    essential?: boolean;
    image: ContainerImageConfig;
}

export interface APIStackConfig {
    capacityMixture?: SpotOnDemandMixture;
    attachExistingResources?: ExistingResourceSelection;
    cloudfrontConfig?: CloudfrontConfig;
    cronJobs?: CronJob[];
    scaling: APIScalingConfig;
    containerConfig: { api: ContainerConfig };
    cpuReservation: number;
    memoryReservation: number;
    serviceName: string;
    clusterName?: string;
    useLogging?: boolean;
    useAllAvailableAzs?: boolean;
}