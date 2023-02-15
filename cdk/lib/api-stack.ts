import {
    Stack,
    StackProps,
    aws_s3 as s3,
    aws_ec2 as ec2,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_ecs as ecs,
    aws_lambda as lambda,
    aws_events as events,
    aws_route53 as route53,
    aws_cloudfront as cloudfront,
    aws_certificatemanager as acm,
    aws_route53_targets as targets,
    aws_ecs_patterns as ecsPatterns,
    aws_cloudfront_origins as origins,
    aws_events_targets as eventTargets
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { APIStackConfig, LambdaRuntimeChoice, Nullable } from './types';
import { applyAutoScalingPolicy, applyDefaultConfig, localOrRegistryImage, parseS3Path } from './utils';

interface APIStackProps extends StackProps {
    config: APIStackConfig
}

export class APIStack extends Stack {
    constructor(scope: Construct, id: string, props: APIStackProps) {
        super(scope, id, props);

        const { config } = props;
        applyDefaultConfig(config);

        const { api: apiConfig } = config.containerConfig;

        const vpc = config?.attachExistingResources?.vpcIdentifier
            ? ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: config?.attachExistingResources.vpcIdentifier })
            : new ec2.Vpc(this, 'Vpc', {
                maxAzs: config.useAllAvailableAzs ? 99 : 3,
                natGateways: 1,
            });

        const ecsTaskRole = new iam.Role(this, 'TaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            description: 'API Stack ecs task role',
        });

        const cluster = config?.attachExistingResources?.clusterIdentifier
            ? ecs.Cluster.fromClusterAttributes(this, 'Cluster', { 
                vpc,
                clusterName: config?.attachExistingResources.clusterIdentifier, 
                securityGroups: [] 
            })
            : new ecs.Cluster(this, 'Cluster', {
                vpc,
                clusterName: config.clusterName,
                containerInsights: true,
                enableFargateCapacityProviders: true,
            });

        let apiContainerImage: ecs.ContainerImage;
        try {
            apiContainerImage = localOrRegistryImage(apiConfig.image);
        } catch (e) {
            throw e;
        }

        const apiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
            desiredCount: config.scaling.desiredCount,
            assignPublicIp: false,
            cpu: config.cpuReservation,
            memoryLimitMiB: config.memoryReservation,
            platformVersion: ecs.FargatePlatformVersion.LATEST,
            taskImageOptions: {
                image: apiContainerImage,
                environment: apiConfig.envs,
                enableLogging: config.useLogging,
                containerPort: apiConfig.port,
                containerName: apiConfig.name,
                taskRole: ecsTaskRole,
            },
            cluster,
        });

        applyAutoScalingPolicy(
            config.scaling.policies, 
            apiService.service.autoScaleTaskCount({
                maxCapacity: config.scaling.maxCount,
                minCapacity: config.scaling.minCount,
            }), 
            apiService.targetGroup
        );

        if (config.cloudfrontConfig) {
            const distCfg = config.cloudfrontConfig;

            const dist = new cloudfront.Distribution(this, 'distribution', {
                defaultBehavior: {
                    origin: new origins.LoadBalancerV2Origin(apiService.loadBalancer)
                },
                domainNames: [distCfg.domainName],
                certificate: distCfg.certificateArn
                    ? acm.Certificate.fromCertificateArn(this, 'Cert', distCfg.certificateArn)
                    : undefined,
            });

            if (distCfg.externalZone && distCfg.newZone) {
                throw new Error('as of now, only 1 zone defintion can be applied');
            }

            if (!distCfg.externalZone && !distCfg.newZone) {
                throw new Error('you must supply a hosted zone');
            }

            const applyRecords = (hostedZone: route53.IHostedZone | route53.HostedZone) => {
                const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(dist));

                new route53.ARecord(this, 'CDNARecord', {
                    zone: hostedZone,
                    target,
                });

                new route53.AaaaRecord(this, 'AliasRecord', {
                    zone: hostedZone,
                    target,
                });
            }

            if (distCfg.externalZone) {
                const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, distCfg.externalZone.zoneName, {
                    zoneName: distCfg.domainName,
                    hostedZoneId: distCfg.externalZone.zoneID
                });

                applyRecords(hostedZone);
            }

            if (distCfg.newZone) {
                const hostedZone = new route53.HostedZone(this, distCfg.newZone.zoneName, {
                    zoneName: distCfg.newZone.zoneName,
                });

                applyRecords(hostedZone);
            }
        }

        if (config.cronJobs) {
            for (const job of config.cronJobs) {
                let setKeys = 0;
                let sourceAsset: 
                    Nullable<
                        lambda.AssetCode | 
                        lambda.AssetImageCode | 
                        lambda.EcrImageCode | 
                        lambda.InlineCode |
                        lambda.S3Code
                    > = null;

                Object.keys(job.code).forEach(key => {
                    if (job.code[key]) {
                        const source = job.code[key];

                        switch (key) {
                            case 'fromLocal':
                                sourceAsset = lambda.Code.fromAsset(source);
                                break;
                            case 'fromLocalImage':
                                sourceAsset = lambda.Code.fromAssetImage(source);
                                break;
                            case 'fromBucket':
                                const [bucketStr, keyStr] = parseS3Path(source);
                                const bucket = s3.Bucket.fromBucketName(this, `bucket_${job.name}`, bucketStr);
                                sourceAsset = lambda.Code.fromBucket(bucket, keyStr);
                                break;
                            case 'fromEcrImage':
                                const repo = ecr.Repository.fromRepositoryName(this, `repo_${job.name}`, source);
                                sourceAsset = lambda.Code.fromEcrImage(repo);
                                break;
                            case 'fromInline':
                                sourceAsset = lambda.Code.fromInline(source);
                                break;
                        }

                        setKeys++;
                    }
                });

                if (setKeys !== 1 || !sourceAsset) {
                    throw new Error('a cron job must contain a single code source');
                }

                const runner = new lambda.Function(this, `lambda_${job.name}`, {
                    code: sourceAsset,
                    handler: job.entrypoint,
                    runtime: new lambda.Runtime(job.runtime),                  
                });

                const rule = new events.Rule(this, `schedule_${job.name}`, {
                    schedule: events.Schedule.expression(job.schedule),
                });

                rule.addTarget(new eventTargets.LambdaFunction(runner));
            }
        }
    }
}