// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  ok,
  err,
  Platform,
  Plugin,
  PluginContext,
  QTreeNode,
  Result,
  Stage,
  TeamsAppManifest,
  SystemError,
  UserError,
  Colors,
  AzureSolutionSettings,
  Func,
  Void,
} from "@microsoft/teamsfx-api";
import { AppStudioPluginImpl } from "./plugin";
import { Constants } from "./constants";
import { AppStudioError } from "./errors";
import { AppStudioResultFactory } from "./results";
import { manuallySubmitOption, autoPublishOption } from "./questions";
import { TelemetryUtils, TelemetryEventName, TelemetryPropertyKey } from "./utils/telemetry";
import { Service } from "typedi";
import { ResourcePlugins } from "../../solution/fx-solution/ResourcePluginContainer";
import { Links } from "../bot/constants";
import { ResourcePermission, TeamsAppAdmin } from "../../../common/permissionInterface";
import "./v2";
import "./v3";
import { IUserList } from "./interfaces/IAppDefinition";
import { getManifestTemplatePath } from "./manifestTemplate";
import { getDefaultString, getLocalizedString } from "../../../common/localizeUtils";

@Service(ResourcePlugins.AppStudioPlugin)
export class AppStudioPlugin implements Plugin {
  name = "fx-resource-appstudio";
  displayName = "App Studio";
  activate(solutionSettings: AzureSolutionSettings): boolean {
    return true;
  }
  private appStudioPluginImpl = new AppStudioPluginImpl();

  async getQuestions(
    stage: Stage,
    ctx: PluginContext
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    const appStudioQuestions = new QTreeNode({
      type: "group",
    });

    if (stage === Stage.publish) {
      if (ctx.answers?.platform === Platform.VSCode) {
        const buildOrPublish = new QTreeNode({
          name: Constants.BUILD_OR_PUBLISH_QUESTION,
          type: "singleSelect",
          staticOptions: [manuallySubmitOption, autoPublishOption],
          title: getLocalizedString("plugins.appstudio.publishTip"),
          default: autoPublishOption.id,
        });
        appStudioQuestions.addChild(buildOrPublish);
      }
    }

    return ok(appStudioQuestions);
  }

  /**
   * Create or update teams app
   * For cli: "teamsfx init" only
   * @returns {string} - Remote teams app id
   */
  public async getAppDefinitionAndUpdate(
    ctx: PluginContext,
    isLocalDebug: boolean,
    manifest: TeamsAppManifest
  ): Promise<Result<string, FxError>> {
    return await this.appStudioPluginImpl.getAppDefinitionAndUpdate(ctx, isLocalDebug, manifest);
  }

  /**
   * Create teams app
   * @returns {string} - Remote teams app id
   */
  public async provision(ctx: PluginContext): Promise<Result<string, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.provision);
    const remoteTeamsAppId = await this.appStudioPluginImpl.provision(ctx);
    if (remoteTeamsAppId.isErr()) {
      TelemetryUtils.sendErrorEvent(
        TelemetryEventName.provision,
        remoteTeamsAppId.error,
        this.appStudioPluginImpl.commonProperties
      );
      return remoteTeamsAppId;
    } else {
      TelemetryUtils.sendSuccessEvent(
        TelemetryEventName.provision,
        this.appStudioPluginImpl.commonProperties
      );
      return ok(remoteTeamsAppId.value);
    }
  }

  /**
   * Update teams app
   * @returns {string} - Remote teams app id
   */
  public async postProvision(ctx: PluginContext): Promise<Result<string, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.postProvision);
    const remoteTeamsAppId = await this.appStudioPluginImpl.postProvision(ctx);
    if (remoteTeamsAppId.isErr()) {
      TelemetryUtils.sendErrorEvent(
        TelemetryEventName.postProvision,
        remoteTeamsAppId.error,
        this.appStudioPluginImpl.commonProperties
      );
      return err(remoteTeamsAppId.error);
    }
    const result = await this.buildTeamsPackage(ctx, false);
    if (result.isErr()) {
      TelemetryUtils.sendErrorEvent(
        TelemetryEventName.postProvision,
        result.error,
        this.appStudioPluginImpl.commonProperties
      );
      return err(result.error);
    }
    TelemetryUtils.sendSuccessEvent(
      TelemetryEventName.postProvision,
      this.appStudioPluginImpl.commonProperties
    );
    return remoteTeamsAppId;
  }

  /**
   * Validate manifest string against schema
   * @param {string} manifestString - the string of manifest.json file
   * @returns {string[]} an array of errors
   */
  public async validateManifest(
    ctx: PluginContext,
    isLocalDebug = false
  ): Promise<Result<string[], FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.validateManifest);
    const validationpluginResult = await this.appStudioPluginImpl.validateManifest(
      ctx,
      isLocalDebug
    );
    if (validationpluginResult.isErr()) {
      return err(validationpluginResult.error);
    }
    const validationResult = validationpluginResult.value;
    if (validationResult.length > 0) {
      const errMessage = AppStudioError.ValidationFailedError.message(validationResult);
      ctx.logProvider?.error(getLocalizedString("plugins.appstudio.validationFailedNotice"));
      const properties: { [key: string]: string } = this.appStudioPluginImpl.commonProperties;
      properties[TelemetryPropertyKey.validationResult] = validationResult.join("\n");
      const validationFailed = AppStudioResultFactory.UserError(
        AppStudioError.ValidationFailedError.name,
        errMessage
      );
      TelemetryUtils.sendErrorEvent(
        TelemetryEventName.validateManifest,
        validationFailed,
        properties
      );
      return err(validationFailed);
    }
    const validationSuccess = getLocalizedString("plugins.appstudio.validationSucceedNotice");
    ctx.ui?.showMessage("info", validationSuccess, false);
    TelemetryUtils.sendSuccessEvent(
      TelemetryEventName.validateManifest,
      this.appStudioPluginImpl.commonProperties
    );
    return validationpluginResult;
  }

  public async scaffold(ctx: PluginContext): Promise<Result<any, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.scaffold);
    try {
      const scaffoldResult = await this.appStudioPluginImpl.scaffold(ctx);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.scaffold);
      return ok(scaffoldResult);
    } catch (error) {
      TelemetryUtils.sendErrorEvent(TelemetryEventName.scaffold, error);
      return err(
        AppStudioResultFactory.SystemError(
          AppStudioError.ScaffoldFailedError.name,
          AppStudioError.ScaffoldFailedError.message(error)
        )
      );
    }
  }

  /**
   * Build Teams Package
   * @param {string} appDirectory - The directory contains manifest.source.json and two images
   * @returns {string} - Path of built appPackage.zip
   */
  public async buildTeamsPackage(
    ctx: PluginContext,
    isLocalDebug: boolean
  ): Promise<Result<string, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.buildTeamsPackage);
    try {
      const appPackagePath = await this.appStudioPluginImpl.buildTeamsAppPackage(ctx, isLocalDebug);
      const builtSuccess = [
        { content: "(√)Done: ", color: Colors.BRIGHT_GREEN },
        { content: "Teams Package ", color: Colors.BRIGHT_WHITE },
        { content: appPackagePath, color: Colors.BRIGHT_MAGENTA },
        { content: " built successfully!", color: Colors.BRIGHT_WHITE },
      ];
      ctx.ui?.showMessage("info", builtSuccess, false);
      TelemetryUtils.sendSuccessEvent(
        TelemetryEventName.buildTeamsPackage,
        this.appStudioPluginImpl.commonProperties
      );
      return ok(appPackagePath);
    } catch (error) {
      TelemetryUtils.sendErrorEvent(
        TelemetryEventName.buildTeamsPackage,
        error,
        this.appStudioPluginImpl.commonProperties
      );
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.TeamsPackageBuildError.name,
          AppStudioError.TeamsPackageBuildError.message(error),
          error.helpLink
        )
      );
    }
  }

  /**
   * Update manifest file
   */
  public async updateManifest(
    ctx: PluginContext,
    isLocalDebug: boolean
  ): Promise<Result<Void, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.updateManifest);

    const res = await this.appStudioPluginImpl.updateManifest(ctx, isLocalDebug);
    if (res.isErr()) {
      TelemetryUtils.sendErrorEvent(
        TelemetryEventName.updateManifest,
        res.error,
        this.appStudioPluginImpl.commonProperties
      );
      if (res.error.name === AppStudioError.UpdateManifestCancelError.name) {
        return ok(Void);
      } else {
        return err(res.error);
      }
    } else {
      TelemetryUtils.sendSuccessEvent(
        TelemetryEventName.updateManifest,
        this.appStudioPluginImpl.commonProperties
      );
      return ok(Void);
    }
  }

  /**
   * Publish the app to Teams App Catalog
   * @param {PluginContext} ctx
   * @returns {string[]} - Teams App ID in Teams app catalog
   */
  public async publish(ctx: PluginContext): Promise<Result<string | undefined, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.publish);
    if (ctx.answers?.platform === Platform.VSCode) {
      const answer = ctx.answers![Constants.BUILD_OR_PUBLISH_QUESTION] as string;
      if (answer === manuallySubmitOption.id) {
        //const appDirectory = `${ctx.root}/.${ConfigFolderName}`;
        try {
          const appPackagePath = await this.appStudioPluginImpl.buildTeamsAppPackage(ctx, false);
          const msg = getLocalizedString(
            "plugins.appstudio.adminApprovalTip",
            ctx.projectSettings!.appName,
            appPackagePath
          );
          ctx.ui?.showMessage("info", msg, false, "OK", Constants.READ_MORE).then((value) => {
            if (value.isOk() && value.value === Constants.READ_MORE) {
              ctx.ui?.openUrl(Constants.PUBLISH_GUIDE);
            }
          });
          TelemetryUtils.sendSuccessEvent(TelemetryEventName.publish);
          return ok(appPackagePath);
        } catch (error) {
          TelemetryUtils.sendErrorEvent(TelemetryEventName.publish, error);
          return err(
            AppStudioResultFactory.UserError(
              AppStudioError.TeamsPackageBuildError.name,
              AppStudioError.TeamsPackageBuildError.message(error),
              error.helpLink
            )
          );
        }
      }
    }

    try {
      const result = await this.appStudioPluginImpl.publish(ctx);
      ctx.logProvider?.info(`Publish success!`);
      const msg = getLocalizedString(
        "plugins.appstudio.publishSucceedNotice",
        result.name,
        Constants.TEAMS_ADMIN_PORTAL
      );
      if (ctx.answers?.platform === Platform.CLI) {
        ctx.ui?.showMessage(
          "info",
          msg.replace("[", "").replace("]", "") +
            ` Learn more from ${Constants.TEAMS_MANAGE_APP_DOC}.`,
          false
        );
      } else {
        ctx.ui
          ?.showMessage("info", msg, false, Constants.LEARN_MORE, Constants.ADMIN_PORTAL)
          .then((value) => {
            if (value.isOk() && value.value === Constants.LEARN_MORE) {
              ctx.ui?.openUrl(Constants.TEAMS_MANAGE_APP_DOC);
            } else if (value.isOk() && value.value === Constants.ADMIN_PORTAL) {
              ctx.ui?.openUrl(Constants.TEAMS_ADMIN_PORTAL);
            }
          });
      }
      const properties: { [key: string]: string } = this.appStudioPluginImpl.commonProperties;
      properties[TelemetryPropertyKey.updateExistingApp] = String(result.update);
      properties[TelemetryPropertyKey.publishedAppId] = String(result.id);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.publish, properties);
      return ok(result.id);
    } catch (error) {
      if (error instanceof SystemError || error instanceof UserError) {
        if (error.name === AppStudioError.TeamsAppPublishCancelError.name) {
          TelemetryUtils.sendSuccessEvent(TelemetryEventName.publish);
          return ok(undefined);
        }
        const innerError = error.innerError ? `innerError: ${error.innerError}` : "";
        error.message = `${error.message} ${innerError}`;
        TelemetryUtils.sendErrorEvent(
          TelemetryEventName.publish,
          error,
          this.appStudioPluginImpl.commonProperties
        );
        return err(error);
      } else {
        const publishFailed = new SystemError({
          name: AppStudioError.TeamsAppPublishFailedError.name,
          message: error.message,
          source: Constants.PLUGIN_NAME,
          error: error,
        });
        TelemetryUtils.sendErrorEvent(
          TelemetryEventName.publish,
          publishFailed,
          this.appStudioPluginImpl.commonProperties
        );
        return err(publishFailed);
      }
    }
  }

  public async postLocalDebug(ctx: PluginContext): Promise<Result<string, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.localDebug);
    const localTeamsAppId = await this.appStudioPluginImpl.postLocalDebug(ctx);
    if (localTeamsAppId.isOk()) {
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.localDebug);
      await this.appStudioPluginImpl.buildTeamsAppPackage(ctx, true);
      return localTeamsAppId;
    } else {
      const error = localTeamsAppId.error;
      if (error instanceof SystemError || error instanceof UserError) {
        TelemetryUtils.sendErrorEvent(TelemetryEventName.localDebug, error);
        return err(error);
      } else {
        const updateFailedError = AppStudioResultFactory.UserError(
          AppStudioError.LocalAppIdUpdateFailedError.name,
          AppStudioError.LocalAppIdUpdateFailedError.message(error)
        );
        TelemetryUtils.sendErrorEvent(TelemetryEventName.localDebug, updateFailedError);
        return err(updateFailedError);
      }
    }
  }

  public async checkPermission(
    ctx: PluginContext,
    userInfo: Record<string, any>
  ): Promise<Result<ResourcePermission[], FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.checkPermission);

    try {
      const checkPermissionResult = await this.appStudioPluginImpl.checkPermission(
        ctx,
        userInfo as IUserList
      );
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.checkPermission);
      return ok(checkPermissionResult);
    } catch (error) {
      const fxError =
        error.name && error.name >= 400 && error.name < 500
          ? AppStudioResultFactory.UserError(
              AppStudioError.CheckPermissionFailedError.name,
              AppStudioError.CheckPermissionFailedError.message(error)
            )
          : AppStudioResultFactory.SystemError(
              AppStudioError.CheckPermissionFailedError.name,
              AppStudioError.CheckPermissionFailedError.message(error)
            );
      TelemetryUtils.sendErrorEvent(TelemetryEventName.checkPermission, fxError);
      return err(fxError);
    }
  }

  public async grantPermission(
    ctx: PluginContext,
    userInfo: Record<string, any>
  ): Promise<Result<ResourcePermission[], FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.grantPermission);

    try {
      const grantPermissionResult = await this.appStudioPluginImpl.grantPermission(
        ctx,
        userInfo as IUserList
      );
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.grantPermission);
      return ok(grantPermissionResult);
    } catch (error) {
      const fxError =
        error.name && error.name >= 400 && error.name < 500
          ? AppStudioResultFactory.UserError(
              AppStudioError.GrantPermissionFailedError.name,
              AppStudioError.GrantPermissionFailedError.message(error.message)
            )
          : AppStudioResultFactory.SystemError(
              AppStudioError.GrantPermissionFailedError.name,
              AppStudioError.GrantPermissionFailedError.message(error.message)
            );
      TelemetryUtils.sendErrorEvent(TelemetryEventName.grantPermission, fxError);
      return err(fxError);
    }
  }

  public async listCollaborator(ctx: PluginContext): Promise<Result<TeamsAppAdmin[], FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.listCollaborator);

    try {
      const listCollaborator = await this.appStudioPluginImpl.listCollaborator(ctx);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.listCollaborator);
      return ok(listCollaborator);
    } catch (error) {
      const fxError =
        error.name && error.name >= 400 && error.name < 500
          ? AppStudioResultFactory.UserError(
              AppStudioError.ListCollaboratorFailedError.name,
              AppStudioError.ListCollaboratorFailedError.message(error)
            )
          : AppStudioResultFactory.SystemError(
              AppStudioError.ListCollaboratorFailedError.name,
              AppStudioError.ListCollaboratorFailedError.message(error)
            );
      TelemetryUtils.sendErrorEvent(TelemetryEventName.listCollaborator, fxError);
      return err(fxError);
    }
  }

  async executeUserTask(func: Func, ctx: PluginContext): Promise<Result<any, FxError>> {
    if (func.method === "validateManifest") {
      const isLocalDebug = (func?.params?.type as string) === "localDebug";
      return await this.validateManifest(ctx, isLocalDebug);
    } else if (func.method === "buildPackage") {
      if (func.params && func.params.type) {
        const isLocalDebug = (func.params.type as string) === "localDebug";
        return await this.buildTeamsPackage(ctx, isLocalDebug);
      }
      return await this.buildTeamsPackage(ctx, false);
    } else if (func.method === "getAppDefinitionAndUpdate") {
      if (func.params && func.params.type && func.params.manifest) {
        const isLocalDebug = (func.params.type as string) === "localDebug";
        return await this.getAppDefinitionAndUpdate(
          ctx,
          isLocalDebug,
          func.params.manifest as TeamsAppManifest
        );
      }
      return err(
        new SystemError({
          name: "InvalidParam",
          message: `Invalid param:${JSON.stringify(func)}`,
          source: Constants.PLUGIN_NAME,
          issueLink: Links.ISSUE_LINK,
        })
      );
    } else if (func.method === "getManifestTemplatePath") {
      const isLocalDebug = (func.params.type as string) === "localDebug";
      const filePath = await getManifestTemplatePath(ctx.root, isLocalDebug);
      return ok(filePath);
    } else if (func.method === "updateManifest") {
      return await this.updateManifest(ctx, func.params && func.params.envName === "local");
    }
    return err(
      new SystemError({
        name: "FunctionRouterError",
        message: getDefaultString(
          "error.appstudio.executeUserTaskRouteFailed",
          JSON.stringify(func)
        ),
        displayMessage: getLocalizedString(
          "error.appstudio.executeUserTaskRouteFailed",
          JSON.stringify(func)
        ),
        source: Constants.PLUGIN_NAME,
        issueLink: Links.ISSUE_LINK,
      })
    );
  }
}

export default new AppStudioPlugin();
