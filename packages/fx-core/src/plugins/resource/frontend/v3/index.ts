// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import {
  AzureAccountProvider,
  AzureSolutionSettings,
  err,
  FxError,
  ok,
  Result,
  TokenProvider,
  v2,
  v3,
  Void,
} from "@microsoft/teamsfx-api";
import * as path from "path";
import { Service } from "typedi";
import { ArmTemplateResult } from "../../../../common/armInterface";
import { Bicep } from "../../../../common/constants";
import {
  genTemplateRenderReplaceFn,
  removeTemplateExtReplaceFn,
  ScaffoldAction,
  ScaffoldActionName,
  ScaffoldContext,
  scaffoldFromTemplates,
} from "../../../../common/template-utils/templatesActions";
import {
  generateBicepFromFile,
  getResourceGroupNameFromResourceId,
  getStorageAccountNameFromResourceId,
  getSubscriptionIdFromResourceId,
} from "../../../../common/tools";
import { CommonErrorHandlerMW } from "../../../../core/middleware/CommonErrorHandlerMW";
import { getTemplatesFolder } from "../../../../folder";
import { TabOptionItem } from "../../../solution/fx-solution/question";
import { ensureSolutionSettings } from "../../../solution/fx-solution/utils/solutionSettingsHelper";
import { BuiltInFeaturePluginNames } from "../../../solution/fx-solution/v3/constants";
import { FRONTEND_INDEX_PATH } from "../../appstudio/constants";
import { AzureStorageClient } from "../clients";
import { FrontendConfig } from "../configs";
import {
  Constants,
  DependentPluginInfo,
  FrontendOutputBicepSnippet,
  FrontendPathInfo,
} from "../constants";
import { envFilePath, EnvKeys, saveEnvFile } from "../env";
import { FrontendDeployment } from "../ops/deploy";
import {
  TemplateZipFallbackError,
  UnknownScaffoldError,
  UnzipTemplateError,
} from "../resources/errors";
import { Messages } from "../resources/messages";
import { DeployProgress, PostProvisionProgress, ScaffoldProgress } from "../resources/steps";
import { Scenario, TemplateInfo } from "../resources/templateInfo";
import { ProgressHelper } from "../utils/progress-helper";
import { EnableStaticWebsiteError, UnauthenticatedError } from "./error";

@Service(BuiltInFeaturePluginNames.frontend)
export class NodeJSTabFrontendPlugin implements v3.PluginV3 {
  name = BuiltInFeaturePluginNames.frontend;
  displayName = "NodeJS Tab frontend";
  description = "Tab frontend with React Framework using Javascript/Typescript";
  @hooks([CommonErrorHandlerMW({ telemetry: { component: BuiltInFeaturePluginNames.frontend } })])
  async generateCode(
    ctx: v3.ContextWithManifestProvider,
    inputs: v2.InputsWithProjectPath
  ): Promise<Result<Void, FxError>> {
    const solutionSettings = ctx.projectSetting.solutionSettings as AzureSolutionSettings;
    if (solutionSettings.activeResourcePlugins.includes(this.name)) return ok(Void);
    ctx.logProvider.info(Messages.StartScaffold(this.name));
    const progress = await ProgressHelper.startProgress(ctx.userInteraction, ScaffoldProgress);
    await progress?.next(ScaffoldProgress.steps.Scaffold);
    const language = ctx.projectSetting.programmingLanguage === "typescript" ? "ts" : "js";
    const componentPath = path.join(inputs.projectPath, FrontendPathInfo.WorkingDir);
    const hasFunction = solutionSettings
      ? solutionSettings.activeResourcePlugins.includes(BuiltInFeaturePluginNames.function)
      : false;
    const variables = {
      showFunction: hasFunction.toString(),
    };
    await scaffoldFromTemplates({
      group: TemplateInfo.TemplateGroupName,
      lang: language,
      scenario: Scenario.Default,
      dst: componentPath,
      fileNameReplaceFn: removeTemplateExtReplaceFn,
      fileDataReplaceFn: genTemplateRenderReplaceFn(variables),
      onActionEnd: async (action: ScaffoldAction, context: ScaffoldContext) => {
        if (action.name === ScaffoldActionName.FetchTemplatesUrlWithTag) {
          ctx.logProvider.info(Messages.getTemplateFrom(context.zipUrl ?? Constants.EmptyString));
        }
      },
      onActionError: async (action: ScaffoldAction, context: ScaffoldContext, error: Error) => {
        ctx.logProvider.info(error.toString());
        switch (action.name) {
          case ScaffoldActionName.FetchTemplatesUrlWithTag:
          case ScaffoldActionName.FetchTemplatesZipFromUrl:
            ctx.logProvider.info(Messages.FailedFetchTemplate);
            break;
          case ScaffoldActionName.FetchTemplateZipFromLocal:
            throw new TemplateZipFallbackError();
          case ScaffoldActionName.Unzip:
            throw new UnzipTemplateError();
          default:
            throw new UnknownScaffoldError();
        }
      },
    });
    await ProgressHelper.endProgress(true);
    ctx.logProvider.info(Messages.EndScaffold(this.name));
    return ok(Void);
  }
  @hooks([
    CommonErrorHandlerMW({
      telemetry: {
        component: BuiltInFeaturePluginNames.frontend,
        eventName: "generate-arm-templates",
      },
    }),
  ])
  async generateBicep(
    ctx: v3.ContextWithManifestProvider,
    inputs: v3.AddFeatureInputs
  ): Promise<Result<v3.BicepTemplate[], FxError>> {
    const solutionSettings = ctx.projectSetting.solutionSettings as AzureSolutionSettings;
    if (solutionSettings.activeResourcePlugins.includes(this.name)) return ok([]);
    const pluginCtx = { plugins: inputs.allPluginsAfterAdd };
    const bicepTemplateDir = path.join(
      getTemplatesFolder(),
      FrontendPathInfo.BicepTemplateRelativeDir
    );
    const provisionFilePath = path.join(bicepTemplateDir, Bicep.ProvisionFileName);
    const moduleProvisionFilePath = path.join(
      bicepTemplateDir,
      FrontendPathInfo.ModuleProvisionFileName
    );
    const provisionOrchestration = await generateBicepFromFile(provisionFilePath, pluginCtx);
    const provisionModules = await generateBicepFromFile(moduleProvisionFilePath, pluginCtx);

    const result: ArmTemplateResult = {
      Provision: {
        Orchestration: provisionOrchestration,
        Modules: { frontendHosting: provisionModules },
      },
      Reference: {
        endpoint: FrontendOutputBicepSnippet.Endpoint,
        domain: FrontendOutputBicepSnippet.Domain,
      },
    };
    return ok([result]);
  }
  @hooks([CommonErrorHandlerMW({ telemetry: { component: BuiltInFeaturePluginNames.frontend } })])
  async addInstance(
    ctx: v3.ContextWithManifestProvider,
    inputs: v2.InputsWithProjectPath
  ): Promise<Result<string[], FxError>> {
    ensureSolutionSettings(ctx.projectSetting);
    const res = await ctx.appManifestProvider.addCapabilities(ctx, inputs, [{ name: "staticTab" }]);
    if (res.isErr()) return err(res.error);
    const solutionSettings = ctx.projectSetting.solutionSettings as AzureSolutionSettings;
    const capabilities = solutionSettings.capabilities;
    if (!capabilities.includes(TabOptionItem.id)) {
      capabilities.push(TabOptionItem.id);
    }
    const activeResourcePlugins = solutionSettings.activeResourcePlugins;
    if (!activeResourcePlugins.includes(this.name)) activeResourcePlugins.push(this.name);
    return ok([]);
  }
  @hooks([CommonErrorHandlerMW({ telemetry: { component: BuiltInFeaturePluginNames.frontend } })])
  async updateBicep(
    ctx: v3.ContextWithManifestProvider,
    inputs: v3.UpdateInputs
  ): Promise<Result<v3.BicepTemplate[], FxError>> {
    const result: v3.BicepTemplate = {
      Reference: {
        endpoint: FrontendOutputBicepSnippet.Endpoint,
        domain: FrontendOutputBicepSnippet.Domain,
      },
    };
    return ok([result]);
  }
  private async buildFrontendConfig(
    envInfo: v2.DeepReadonly<v3.EnvInfoV3>,
    tokenProvider: AzureAccountProvider
  ): Promise<Result<FrontendConfig, FxError>> {
    const credentials = await tokenProvider.getAccountCredentialAsync();
    if (!credentials) {
      return err(new UnauthenticatedError());
    }
    const storage = envInfo.state[this.name] as v3.FrontendHostingResource;
    const frontendConfig = new FrontendConfig(
      getSubscriptionIdFromResourceId(storage.storageResourceId),
      getResourceGroupNameFromResourceId(storage.storageResourceId),
      (envInfo.state.solution as v3.AzureSolutionConfig).location,
      getStorageAccountNameFromResourceId(storage.storageResourceId),
      credentials
    );
    return ok(frontendConfig);
  }
  private async updateDotEnv(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath,
    envInfo: v3.EnvInfoV3
  ): Promise<Result<Void, FxError>> {
    const envs = this.collectEnvs(ctx, inputs, envInfo);
    await saveEnvFile(
      envFilePath(envInfo.envName, path.join(inputs.projectPath, FrontendPathInfo.WorkingDir)),
      {
        teamsfxRemoteEnvs: envs,
        customizedRemoteEnvs: {},
      }
    );
    return ok(Void);
  }
  private collectEnvs(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath,
    envInfo: v3.EnvInfoV3
  ): { [key: string]: string } {
    const envs: { [key: string]: string } = {};
    const addToEnvs = (key: string, value: string | undefined) => {
      // Check for both null and undefined, add to envs when value is "", 0 or false.
      if (value != null) {
        envs[key] = value;
      }
    };
    const solutionSettings = ctx.projectSetting.solutionSettings as
      | AzureSolutionSettings
      | undefined;
    if (solutionSettings) {
      if (solutionSettings.activeResourcePlugins.includes(BuiltInFeaturePluginNames.function)) {
        const functionState = envInfo.state[BuiltInFeaturePluginNames.function] as v3.AzureFunction;
        addToEnvs(EnvKeys.FuncName, ctx.projectSetting.defaultFunctionName);
        addToEnvs(EnvKeys.FuncEndpoint, functionState.functionEndpoint);
      }

      if (solutionSettings.activeResourcePlugins.includes(BuiltInFeaturePluginNames.simpleAuth)) {
        const simpleAuthState = envInfo.state[
          BuiltInFeaturePluginNames.simpleAuth
        ] as v3.SimpleAuth;
        addToEnvs(EnvKeys.RuntimeEndpoint, simpleAuthState.endpoint);
        addToEnvs(EnvKeys.StartLoginPage, DependentPluginInfo.StartLoginPageURL);
      }

      if (solutionSettings.activeResourcePlugins.includes(BuiltInFeaturePluginNames.aad)) {
        const aadState = envInfo.state[BuiltInFeaturePluginNames.aad] as v3.AADApp;
        addToEnvs(EnvKeys.ClientID, aadState.clientId);
      }
    }
    return envs;
  }
  @hooks([CommonErrorHandlerMW({ telemetry: { component: BuiltInFeaturePluginNames.frontend } })])
  async configureResource(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath,
    envInfo: v3.EnvInfoV3,
    tokenProvider: TokenProvider
  ): Promise<Result<Void, FxError>> {
    if (envInfo.envName === "local") {
      envInfo.state[this.name][FRONTEND_INDEX_PATH] = Constants.FrontendIndexPath;
      return ok(Void);
    }
    ctx.logProvider.info(Messages.StartPostProvision(this.name));
    const progress = await ProgressHelper.startProgress(ctx.userInteraction, PostProvisionProgress);
    await progress?.next(PostProvisionProgress.steps.EnableStaticWebsite);
    const frontendConfigRes = await this.buildFrontendConfig(
      envInfo,
      tokenProvider.azureAccountProvider
    );
    if (frontendConfigRes.isErr()) {
      return err(frontendConfigRes.error);
    }
    const client = new AzureStorageClient(frontendConfigRes.value);
    try {
      await client.enableStaticWebsite();
    } catch (e) {
      return err(new EnableStaticWebsiteError());
    }
    await this.updateDotEnv(ctx, inputs, envInfo);
    await ProgressHelper.endProgress(true);
    ctx.logProvider.info(Messages.EndPostProvision(this.name));
    return ok(Void);
  }
  @hooks([CommonErrorHandlerMW({ telemetry: { component: BuiltInFeaturePluginNames.frontend } })])
  async deploy(
    ctx: v2.Context,
    inputs: v2.InputsWithProjectPath,
    envInfo: v2.DeepReadonly<v3.EnvInfoV3>,
    tokenProvider: TokenProvider
  ): Promise<Result<Void, FxError>> {
    ctx.logProvider.info(Messages.StartDeploy(this.name));
    await ProgressHelper.startProgress(ctx.userInteraction, DeployProgress);
    const frontendConfigRes = await this.buildFrontendConfig(
      envInfo,
      tokenProvider.azureAccountProvider
    );
    if (frontendConfigRes.isErr()) {
      return err(frontendConfigRes.error);
    }
    const client = new AzureStorageClient(frontendConfigRes.value);
    const componentPath: string = inputs.dir
      ? inputs.dir
      : path.join(inputs.projectPath, FrontendPathInfo.WorkingDir);
    const envName = envInfo.envName;

    await FrontendDeployment.doFrontendBuildV3(componentPath, envName);
    await FrontendDeployment.doFrontendDeploymentV3(client, componentPath, envName);

    await ProgressHelper.endProgress(true);
    ctx.logProvider.info(Messages.EndDeploy(this.name));
    return ok(Void);
  }
}
