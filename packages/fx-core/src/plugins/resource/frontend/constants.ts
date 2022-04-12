// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import path from "path";

export class Constants {
  static AzureStorageDefaultTier = "Standard";
  static AzureStorageDefaultSku = "Standard_LRS";
  static AzureStorageDefaultKind = "StorageV2";
  static AzureStorageAccountNameLenMax = 24;
  static AzureStorageWebContainer = "$web";
  static SuffixLenMax = 12;

  static FrontendIndexDocument = "index.html";
  static FrontendErrorDocument = "index.html";
  static FrontendSuffix = "fe";
  static FrontendIndexPath = `/${Constants.FrontendIndexDocument}#`;

  static EmptyString = "";

  static DayInMS = 1000 * 60 * 60 * 24;
  static SasTokenLifetimePadding = Constants.DayInMS;
  static SasTokenLifetime = Constants.DayInMS * 3;

  static RequestTryCounts = 3;
  static RequestTimeoutInMS = 20 * 1000;
  static ScaffoldTryCounts = 1;
}

export class FrontendPluginInfo {
  static PluginName = "fx-resource-frontend-hosting";
  static DisplayName = "Tab Frontend";
  static ShortName = "FE";
  static IssueLink = "https://github.com/OfficeDev/TeamsFx/issues/new";
  static HelpLink = "https://aka.ms/teamsfx-fe-help";
}

export class Commands {
  static DefaultInstallNodePackages = "npm install";
  static InstallNodePackages = "npm run install:teamsfx";
  static DefaultBuildFrontend = "npm run build";
  static BuildFrontend = "npm run build:teamsfx";
}

export class FrontendPathInfo {
  static WorkingDir = "tabs";
  static TemplateRelativeDir = path.join("plugins", "resource", "frontend");
  static BicepTemplateRelativeDir = path.join(FrontendPathInfo.TemplateRelativeDir, "bicep");
  static TemplateFileExt = ".tpl";
  static TemplatePackageExt = ".zip";

  static ModuleProvisionFileName = "frontendHostingProvision.bicep";

  static BuildFolderName = "build";
  static BuildPath = `${FrontendPathInfo.BuildFolderName}${path.sep}`;
  static TabEnvironmentFilePath = ".env";
  static NodePackageFolderName = "node_modules";
  static NodePackageFile = "package.json";
  static TabDeploymentFolderName = ".deployment";
  static TabDeploymentInfoFileName = "deployment.json";
  static TabDeployIgnoreFolder = [
    FrontendPathInfo.BuildFolderName,
    FrontendPathInfo.NodePackageFolderName,
    FrontendPathInfo.TabDeploymentFolderName,
  ];
}

export class DependentPluginInfo {
  static readonly SolutionPluginName = "solution";
  static readonly SubscriptionId = "subscriptionId";
  static readonly ResourceGroupName = "resourceGroupName";
  static readonly ResourceNameSuffix = "resourceNameSuffix";
  static readonly Location = "location";
  static readonly ProgrammingLanguage = "programmingLanguage";
  static readonly RemoteTeamsAppId = "remoteTeamsAppId";

  static readonly FunctionPluginName = "fx-resource-function";
  static readonly FunctionEndpoint = "functionEndpoint";

  static readonly RuntimePluginName = "fx-resource-simple-auth";
  static readonly RuntimeEndpoint = "endpoint";
  static readonly StartLoginPageURL = "auth-start.html";

  static readonly AADPluginName = "fx-resource-aad-app-for-teams";
  static readonly ClientID = "clientId";

  static readonly LocalDebugPluginName = "fx-resource-local-debug";
  static readonly LocalTabEndpoint = "localTabEndpoint";
}

export class FrontendConfigInfo {
  static readonly StorageName = "storageName"; // TODO: Remove this storageName config when arm-disabled scenario removed
  static readonly StorageResourceId = "storageResourceId";
  static readonly Endpoint = "endpoint";
  static readonly Domain = "domain";
}

export class FrontendOutputBicepSnippet {
  static readonly Domain = "provisionOutputs.frontendHostingOutput.value.domain";
  static readonly Endpoint = "provisionOutputs.frontendHostingOutput.value.endpoint";
}

export class TelemetryEvent {
  static readonly StartSuffix = "-start";

  static readonly Scaffold = "scaffold";
  static readonly ScaffoldFallback = "scaffold-fallback";

  static readonly PreProvision = "pre-provision";
  static readonly Provision = "provision";
  static readonly PostProvision = "post-provision";

  static readonly PreDeploy = "pre-deploy";
  static readonly Deploy = "deploy";
  static readonly SkipDeploy = "skip-deploy";
  static readonly DeploymentInfoNotFound = "deployment-info-not-found";
  static readonly InstallScriptNotFound = "install-script-not-found";

  static readonly GenerateArmTemplates = "generate-arm-templates";
  static readonly UpdateArmTemplates = "update-arm-templates";
  static readonly ExecuteUserTask = "execute-user-task";

  static readonly LocalDebug = "local-debug";
  static readonly PostLocalDebug = "post-local-debug";

  static readonly SaveEnvFile = "frontend-save-env-file";
  static readonly LoadEnvFile = "frontend-load-env-file";
}

export class TelemetryKey {
  static readonly Component = "component";
  static readonly Success = "success";
  static readonly ErrorType = "error-type";
  static readonly ErrorMessage = "error-message";
  static readonly ErrorCode = "error-code";
  static readonly AppId = "appid";
}

export class TelemetryValue {
  static readonly Success = "yes";
  static readonly Fail = "no";
  static readonly UserError = "user";
  static readonly SystemError = "system";
}

export class RegularExpr {
  static readonly AllCharToBeSkippedInName = /[^a-zA-Z0-9]/g;
  static readonly FrontendStorageNamePattern = /^[a-z0-9]{3,24}$/;
  static readonly ReplaceTemplateExt = /\.tpl$/;
}
