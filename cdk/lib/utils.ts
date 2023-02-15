import * as path from 'path';
import * as execa from 'execa';

import { 
    DEFAULT_API_CONTAINER_NAME, 
    DEFAULT_API_CONTAINER_PORT, 
    DEFAULT_CLUSTER_NAME 
} from "./consts";

import { 
    aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2, 
    Duration 
} from 'aws-cdk-lib';

import { 
    APIStackConfig, 
    AutoScalingPolicyAdjustmentConfig, 
    AutoScalingPolicyAdjustmentMetric,
    ContainerImageConfig, 
    ScalerConfig 
} from "./types";

export const hasDocker = (): boolean => {
    try {
        execa.sync('docker', ['version']);
        return true;
    } catch (e) {
        console.log(e);
        return false;
    }
};

export const parseS3Path = (path: string): [string, string] => {
    const parts = path.replace("s3://", "").split("/");
    return [parts.pop()!, parts.join("/")];
};

export const applyAutoScalingPolicy = (scaleBy: AutoScalingPolicyAdjustmentConfig[], applyTo: ecs.ScalableTaskCount, targetGroup: elbv2.ApplicationTargetGroup) => {
    const toAWSScalingPolicy = (cfg: ScalerConfig) => {
        return {
            targetUtilizationPercent: cfg.targetUtilizationPercent,
            scaleInCooldown: Duration.seconds(cfg.scaleInCooldownSeconds),
            scaleOutCooldown: Duration.seconds(cfg.scaleOutCooldownSeconds),
        };
    };
    
    const defaultScalingPolicy = toAWSScalingPolicy({
        targetUtilizationPercent: 65,
        scaleInCooldownSeconds: 240,
        scaleOutCooldownSeconds: 120,
    });
    
    for (const policy of scaleBy) {
        const scalePolicy = policy.scaling ? toAWSScalingPolicy(policy.scaling) : defaultScalingPolicy;
        switch (policy.type) {
            case AutoScalingPolicyAdjustmentMetric.CPU:
                applyTo.scaleOnCpuUtilization('cpu_autoscaler', scalePolicy);
                break;
            case AutoScalingPolicyAdjustmentMetric.Memory:
                applyTo.scaleOnMemoryUtilization('memory_autoscaler', scalePolicy);
                break;
            case AutoScalingPolicyAdjustmentMetric.RequestCount:
                if (!targetGroup || !policy.scaling?.requestCountScaler) {
                    throw new Error('targetGroup and requestCountScaler must exist when using request count scaling');
                }
            
                applyTo.scaleOnRequestCount('requestcount_autoscaler', {
                    targetGroup: targetGroup,
                    requestsPerTarget: policy.scaling.requestCountScaler,
                    scaleInCooldown: scalePolicy.scaleInCooldown,
                    scaleOutCooldown: scalePolicy.scaleOutCooldown,
                });
                break;
            default:
                throw new Error(`unsupported scaling metric: ${policy.type}`);
        }
    }
};

export const localOrRegistryImage = (cfg: ContainerImageConfig): ecs.ContainerImage => {
    if (cfg.local && hasDocker()) {
        if (!cfg.local.startsWith('/')) {
            cfg.local = `/${cfg.local}`;
        }

        if (!cfg.local.endsWith('/')) {
            cfg.local = `${cfg.local}/`;
        }

        return ecs.ContainerImage.fromAsset(
            path.resolve(__dirname, `../..${cfg.local}`)
        );
    }

    if (cfg.registry) {
        return ecs.ContainerImage.fromRegistry(cfg.registry);
    }

    throw new Error('unable to utilize any image strategy - check your config');
}

export const applyDefaultConfig = (config: APIStackConfig) => {
    // global configuration
    if (!config.useLogging) {
        config.useLogging = false;
    }

    if (!config.useAllAvailableAzs) {
        config.useAllAvailableAzs = false;
    }

    if (!config.capacityMixture) {
        config.capacityMixture = {
            spot: 1,
            ondemand: 0,
        };
    }

    if (!config.clusterName) {
        config.clusterName = DEFAULT_CLUSTER_NAME;
    }

    // api container configuration
    if (!config.containerConfig.api.essential) {
        config.containerConfig.api.essential = true;
    }

    if (!config.containerConfig.api.name) {
        config.containerConfig.api.name = DEFAULT_API_CONTAINER_NAME;
    }

    if (!config.containerConfig.api.port) {
        config.containerConfig.api.port = DEFAULT_API_CONTAINER_PORT;
    }

    if (config.containerConfig.api.envs) {
        config.containerConfig.api.envs = JSON.parse(config.containerConfig.api.envs);
    }
}