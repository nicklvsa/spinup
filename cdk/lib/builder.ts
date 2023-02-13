import { APIStack } from "./api-stack";
import * as cdk from 'aws-cdk-lib';
import { 
    ContainerImageConfig, 
    ContainerConfig, 
    AutoScalingPolicyAdjustmentMetric, 
    AutoScalingPolicyAdjustmentConfig, 
    CloudfrontConfig
} from "./types";

class APIBuilder {
    private region: string;
    private stackID: string;
    private serviceName: string;
    private clusterName: string;
    private useLogging: boolean;
    private useAllAzs: boolean;
    private spotCapacity: number;
    private onDemandCapacity: number;
    private cpuReservation: number;
    private memReservation: number;
    private desiredCount: number;
    private maxCount: number;
    private minCount: number;

    private containers: { api: ContainerConfig };
    private scalingPolicies: AutoScalingPolicyAdjustmentConfig[] = [];

    private cloudfrontConfig: CloudfrontConfig;

    constructor(region: string, serviceName: string, stackID: string) {
        this.region = region;
        this.stackID = stackID;
        this.serviceName = serviceName;
    }

    public toggleFeatures(useLogging: boolean, useAllAzs: boolean): APIBuilder {
        this.useLogging = useLogging;
        this.useAllAzs = useAllAzs;
        return this;
    }

    public cluster(name: string): APIBuilder {
        this.clusterName = name;
        return this;
    }

    public capacity(spot: number, ondemand: number): APIBuilder {
        this.spotCapacity = spot;
        this.onDemandCapacity = ondemand;
        return this;
    }

    public reservations(cpu: number, memory: number): APIBuilder {
        this.cpuReservation = cpu;
        this.memReservation = memory;
        return this;
    }

    public container() {
        return {
            api: (name: string, port: number, image: ContainerImageConfig): APIBuilder => {
                this.containers = {
                    api: {
                        name,
                        port,
                        image
                    }
                };
                return this;
            }
        }
    }

    public taskScale(desiredCount: number, maxCount: number, minCount: number): APIBuilder {
        this.desiredCount = desiredCount;
        this.maxCount = maxCount;
        this.minCount = minCount;
        return this;
    }

    public addScalingPolicy(type: AutoScalingPolicyAdjustmentMetric, utilizationPercent: number, scaleInCooldown: number, scaleOutCooldown: number, requestCount?: number): APIBuilder {
        this.scalingPolicies.push({
            type,
            scaling: {
                targetUtilizationPercent: utilizationPercent,
                scaleInCooldownSeconds: scaleInCooldown,
                scaleOutCooldownSeconds: scaleOutCooldown,
                requestCountScaler: requestCount,
            }
        });
        return this;
    }

    public addCloudfront(domain: string, certArn?: string) {
        this.cloudfrontConfig = {
            domainName: domain,
            certificateArn: certArn,
        }

        return {
            useExternalZone: (zoneName: string, zoneID: string): APIBuilder => {
                this.cloudfrontConfig.externalZone = {
                    zoneName,
                    zoneID,
                };
                return this;
            },
            newZone: (zoneName: string): APIBuilder => {
                this.cloudfrontConfig.newZone = {
                    zoneName,
                };
                return this;
            }
        }
    }

    public build(app: cdk.App): APIStack {
        return new APIStack(app, this.stackID, {
            env: {
                region: this.region,
                account: process.env.CDK_DEFAULT_ACCOUNT,
            },
            config: {
                capacityMixture: {
                    spot: this.spotCapacity,
                    ondemand: this.onDemandCapacity,
                },
                cpuReservation: this.cpuReservation,
                memoryReservation: this.memReservation,
                serviceName: this.serviceName,
                clusterName: this.clusterName,
                useLogging: this.useLogging,
                useAllAvailableAzs: this.useAllAzs,
                containerConfig: this.containers,
                cloudfrontConfig: this.cloudfrontConfig,
                scaling: {
                    desiredCount: this.desiredCount,
                    maxCount: this.maxCount,
                    minCount: this.minCount,
                    policies: this.scalingPolicies,
                },
            },
        });
    }
}

export default APIBuilder