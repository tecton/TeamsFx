import {
  Inputs,
  FxError,
  UserError,
  TokenProvider,
  v2,
  v3,
  Result,
  Void,
  err,
  ok,
  SystemError,
  Platform,
  Colors,
} from "@microsoft/teamsfx-api";
import { getResourceGroupInPortal } from "../../../../common/tools";
import { executeConcurrently } from "./executor";
import {
  ensurePermissionRequest,
  extractSolutionInputs,
  getAzureSolutionSettings,
  getSelectedPlugins,
  isAzureProject,
} from "./utils";
import {
  ARM_TEMPLATE_OUTPUT,
  GLOBAL_CONFIG,
  PluginNames,
  SolutionError,
  SOLUTION_PROVISION_SUCCEEDED,
  SolutionSource,
} from "../constants";
import _, { isUndefined } from "lodash";
import { PluginDisplayName } from "../../../../common/constants";
import { ProvisionContextAdapter } from "./adaptor";
import { deployArmTemplates } from "../arm";
import { Container } from "typedi";
import { ResourcePluginsV2 } from "../ResourcePluginContainer";
import { PermissionRequestFileProvider } from "../../../../core/permissionRequest";
import { Constants } from "../../../resource/appstudio/constants";
import { BuiltInFeaturePluginNames } from "../v3/constants";
import { askForProvisionConsent, fillInAzureConfigs, getM365TenantId } from "../v3/provision";
import { resourceGroupHelper } from "../utils/ResourceGroupHelper";
import { solutionGlobalVars } from "../v3/solutionGlobalVars";
import {
  hasAAD,
  hasAzureResource,
  isPureExistingApp,
} from "../../../../common/projectSettingsHelper";
import { getLocalizedString } from "../../../../common/localizeUtils";

export async function provisionResource(
  ctx: v2.Context,
  inputs: Inputs,
  envInfo: v2.EnvInfoV2,
  tokenProvider: TokenProvider
): Promise<Result<Void, FxError>> {
  const azureSolutionSettings = getAzureSolutionSettings(ctx);

  // check projectPath
  if (inputs.projectPath === undefined) {
    return err(
      new SystemError(SolutionSource, SolutionError.InternelError, "projectPath is undefined")
    );
  }
  // Just to trigger M365 login before the concurrent execution of localDebug.
  // Because concurrent execution of localDebug may getAccessToken() concurrently, which
  // causes 2 M365 logins before the token caching in common lib takes effect.
  await tokenProvider.appStudioToken.getAccessToken();

  const inputsNew: v2.InputsWithProjectPath = inputs as v2.InputsWithProjectPath;
  const projectPath: string = inputs.projectPath;

  // check M365 tenant
  if (!envInfo.state[BuiltInFeaturePluginNames.appStudio])
    envInfo.state[BuiltInFeaturePluginNames.appStudio] = {};
  const teamsAppResource = envInfo.state[BuiltInFeaturePluginNames.appStudio];
  if (!envInfo.state.solution) envInfo.state.solution = {};
  const solutionConfig = envInfo.state.solution;
  const tenantIdInConfig = teamsAppResource.tenantId;
  const tenantIdInTokenRes = await getM365TenantId(tokenProvider.appStudioToken);
  if (tenantIdInTokenRes.isErr()) {
    return err(tenantIdInTokenRes.error);
  }
  const tenantIdInToken = tenantIdInTokenRes.value;
  if (tenantIdInConfig && tenantIdInToken && tenantIdInToken !== tenantIdInConfig) {
    return err(
      new UserError(
        "Solution",
        SolutionError.TeamsAppTenantIdNotRight,
        `The signed in M365 account does not match the M365 tenant in config file for '${envInfo.envName}' environment. Please sign out and sign in with the correct M365 account.`
      )
    );
  }
  if (!tenantIdInConfig) {
    teamsAppResource.tenantId = tenantIdInToken;
    solutionConfig.teamsAppTenantId = tenantIdInToken;
  }
  if (isAzureProject(azureSolutionSettings) && hasAzureResource(ctx.projectSetting, true)) {
    if (hasAAD(ctx.projectSetting)) {
      if (ctx.permissionRequestProvider === undefined) {
        ctx.permissionRequestProvider = new PermissionRequestFileProvider(inputs.projectPath);
      }
      const result = await ensurePermissionRequest(
        azureSolutionSettings!,
        ctx.permissionRequestProvider
      );
      if (result.isErr()) {
        return err(result.error);
      }
    }
    // ask common question and fill in solution config
    const solutionConfigRes = await fillInAzureConfigs(
      ctx,
      inputsNew,
      envInfo as v3.EnvInfoV3,
      tokenProvider
    );
    if (solutionConfigRes.isErr()) {
      return err(solutionConfigRes.error);
    }

    // ask for provision consent
    const consentResult = await askForProvisionConsent(
      ctx,
      tokenProvider.azureAccountProvider,
      envInfo as v3.EnvInfoV3
    );
    if (consentResult.isErr()) {
      return err(consentResult.error);
    }

    // create resource group if needed
    if (solutionConfig.needCreateResourceGroup) {
      const createRgRes = await resourceGroupHelper.createNewResourceGroup(
        solutionConfig.resourceGroupName,
        tokenProvider.azureAccountProvider,
        solutionConfig.subscriptionId,
        solutionConfig.location
      );
      if (createRgRes.isErr()) {
        return err(createRgRes.error);
      }
    }
  }

  const pureExistingApp = isPureExistingApp(ctx.projectSetting);

  envInfo.state[GLOBAL_CONFIG][SOLUTION_PROVISION_SUCCEEDED] = false;
  const solutionInputs = extractSolutionInputs(envInfo.state[GLOBAL_CONFIG]);
  // for minimized teamsfx project, there is only one plugin (app studio)
  const plugins = pureExistingApp
    ? [Container.get<v2.ResourcePlugin>(ResourcePluginsV2.AppStudioPlugin)]
    : getSelectedPlugins(ctx.projectSetting);
  const provisionThunks = plugins
    .filter((plugin) => !isUndefined(plugin.provisionResource))
    .map((plugin) => {
      return {
        pluginName: `${plugin.name}`,
        taskName: "provisionResource",
        thunk: () => {
          if (!envInfo.state[plugin.name]) {
            envInfo.state[plugin.name] = {};
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return plugin.provisionResource!(
            ctx,
            { ...inputs, ...solutionInputs, projectPath: projectPath },
            envInfo,
            tokenProvider
          );
        },
      };
    });
  // call provisionResources
  ctx.logProvider?.info(
    getLocalizedString("core.provision.StartNotice", PluginDisplayName.Solution)
  );
  const provisionResult = await executeConcurrently(provisionThunks, ctx.logProvider);
  if (provisionResult.kind === "failure" || provisionResult.kind === "partialSuccess") {
    return err(provisionResult.error);
  }

  ctx.logProvider?.info(
    getLocalizedString("core.provision.ProvisionFinishNotice", PluginDisplayName.Solution)
  );

  const teamsAppId = envInfo.state[PluginNames.APPST][Constants.TEAMS_APP_ID] as string;
  solutionGlobalVars.TeamsAppId = teamsAppId;
  solutionInputs.remoteTeamsAppId = teamsAppId;

  // call deployArmTemplates
  if (
    isAzureProject(azureSolutionSettings) &&
    !inputs.isForUT &&
    hasAzureResource(ctx.projectSetting, true)
  ) {
    const contextAdaptor = new ProvisionContextAdapter([ctx, inputs, envInfo, tokenProvider]);
    const armDeploymentResult = await deployArmTemplates(contextAdaptor);
    if (armDeploymentResult.isErr()) {
      return err(armDeploymentResult.error);
    }
    // contextAdaptor deep-copies original JSON into a map. We need to convert it back.
    const update = contextAdaptor.getEnvStateJson();
    _.assign(envInfo.state, update);
  }

  // there is no aad for minimized teamsfx project
  if (!pureExistingApp) {
    // call aad.setApplicationInContext
    const aadPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.AadPlugin);
    if (plugins.some((plugin) => plugin.name === aadPlugin.name) && aadPlugin.executeUserTask) {
      const result = await aadPlugin.executeUserTask(
        ctx,
        inputs,
        {
          namespace: `${PluginNames.SOLUTION}/${PluginNames.AAD}`,
          method: "setApplicationInContext",
          params: { isLocal: false },
        },
        {},
        envInfo,
        tokenProvider
      );
      if (result.isErr()) {
        return err(result.error);
      }
    }
  }

  const configureResourceThunks = plugins
    .filter((plugin) => !isUndefined(plugin.configureResource))
    .map((plugin) => {
      if (!envInfo.state[plugin.name]) {
        envInfo.state[plugin.name] = {};
      }
      return {
        pluginName: `${plugin.name}`,
        taskName: "configureResource",
        thunk: () =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          plugin.configureResource!(
            ctx,
            { ...inputs, ...solutionInputs, projectPath: projectPath },
            envInfo,
            tokenProvider
          ),
      };
    });
  //call configResource
  const configureResourceResult = await executeConcurrently(
    configureResourceThunks,
    ctx.logProvider
  );
  ctx.logProvider?.info(
    getLocalizedString("core.provision.configurationFinishNotice", PluginDisplayName.Solution)
  );
  if (
    configureResourceResult.kind === "failure" ||
    configureResourceResult.kind === "partialSuccess"
  ) {
    const msg = getLocalizedString("core.provision.failNotice", ctx.projectSetting.appName);
    ctx.logProvider.error(msg);
    solutionInputs[SOLUTION_PROVISION_SUCCEEDED] = false;
    return err(configureResourceResult.error);
  } else {
    if (envInfo.state[GLOBAL_CONFIG] && envInfo.state[GLOBAL_CONFIG][ARM_TEMPLATE_OUTPUT]) {
      delete envInfo.state[GLOBAL_CONFIG][ARM_TEMPLATE_OUTPUT];
    }

    const msg = getLocalizedString("core.provision.successNotice", ctx.projectSetting.appName);
    ctx.logProvider?.info(msg);
    if (!pureExistingApp) {
      const url = getResourceGroupInPortal(
        solutionInputs.subscriptionId,
        solutionInputs.tenantId,
        solutionInputs.resourceGroupName
      );
      if (url) {
        const title = "View Provisioned Resources";
        if (inputs.platform === Platform.CLI) {
          ctx.userInteraction.showMessage(
            "info",
            [
              {
                color: Colors.BRIGHT_WHITE,
                content: msg + " View provisioned resources in Azure Portal: ",
              },
              { color: Colors.BRIGHT_MAGENTA, content: url },
            ],
            false
          );
        } else {
          ctx.userInteraction.showMessage("info", msg, false, title).then((result) => {
            const userSelected = result.isOk() ? result.value : undefined;
            if (userSelected === title) {
              ctx.userInteraction.openUrl(url);
            }
          });
        }
      } else {
        ctx.userInteraction.showMessage("info", msg, false);
      }
    } else {
      ctx.userInteraction.showMessage("info", msg, false);
    }
    envInfo.state[GLOBAL_CONFIG][SOLUTION_PROVISION_SUCCEEDED] = true;
    return ok(Void);
  }
}
