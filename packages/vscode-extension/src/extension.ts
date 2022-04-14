// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import * as vscode from "vscode";
import { initializeExtensionVariables } from "./extensionVariables";
import * as handlers from "./handlers";
import { ExtTelemetry } from "./telemetry/extTelemetry";
import { registerTeamsfxTaskAndDebugEvents } from "./debug/teamsfxTaskHandler";
import { TeamsfxTaskProvider } from "./debug/teamsfxTaskProvider";
import { TeamsfxDebugProvider } from "./debug/teamsfxDebugProvider";
import { ExtensionSurvey } from "./utils/survey";
import VsCodeLogInstance from "./commonlib/log";
import { openWelcomePageAfterExtensionInstallation } from "./controls/openWelcomePage";
import { VsCodeUI } from "./qm/vsc_ui";
import * as exp from "./exp";
import { disableRunIcon, registerRunIcon } from "./debug/runIconHandler";
import {
  AadAppTemplateCodeLensProvider,
  AdaptiveCardCodeLensProvider,
  CryptoCodeLensProvider,
  ManifestTemplateCodeLensProvider,
} from "./codeLensProvider";
import { ManifestTemplateHoverProvider } from "./hoverProvider";
import {
  Correlator,
  isConfigUnifyEnabled,
  isExistingTabAppEnabled,
  isAadManifestEnabled,
  isApiConnectEnabled,
} from "@microsoft/teamsfx-core";
import { TreatmentVariableValue, TreatmentVariables } from "./exp/treatmentVariables";
import {
  canUpgradeToArmAndMultiEnv,
  isSPFxProject,
  syncFeatureFlags,
  isValidNode,
  delay,
  isSupportAutoOpenAPI,
  isM365Project,
} from "./utils/commonUtils";
import {
  ConfigFolderName,
  InputConfigsFolderName,
  AdaptiveCardsFolderName,
  AppPackageFolderName,
  BuildFolderName,
  TemplateFolderName,
  Result,
  FxError,
} from "@microsoft/teamsfx-api";
import { ExtensionUpgrade } from "./utils/upgrade";
import { getWorkspacePath } from "./handlers";
import { localSettingsJsonName } from "./debug/constants";
import { getLocalDebugSessionId, startLocalDebugSession } from "./debug/commonUtils";
import { showDebugChangesNotification } from "./debug/debugChangesNotification";
import { loadLocalizedStrings, localize } from "./utils/localizeUtils";
import treeViewManager from "./treeview/treeViewManager";
import commandController from "./commandController";

export let VS_CODE_UI: VsCodeUI;

export async function activate(context: vscode.ExtensionContext) {
  VsCodeLogInstance.info("Teams Toolkit extension is now active!");

  // load the feature flags.
  syncFeatureFlags();

  // Init VSC context key
  initializeContextKey();

  VS_CODE_UI = new VsCodeUI(context);
  // Init context
  initializeExtensionVariables(context);

  context.subscriptions.push(new ExtTelemetry.Reporter(context));

  // activate upgrade
  const upgrade = new ExtensionUpgrade(context);
  upgrade.showChangeLog();

  await exp.initialize(context);
  TreatmentVariableValue.isEmbeddedSurvey = (await exp
    .getExpService()
    .getTreatmentVariableAsync(
      TreatmentVariables.VSCodeConfig,
      TreatmentVariables.EmbeddedSurvey,
      true
    )) as boolean | undefined;

  registerTreeViewCommandsInDevelopment(context);
  registerTreeViewCommandsInDeployment(context);
  registerTreeViewCommandsInHelper(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("fx-extension.getNewProjectPath", async (...args) => {
      if (!isSupportAutoOpenAPI()) {
        Correlator.run(handlers.createNewProjectHandler, args);
      } else {
        const targetUri = await Correlator.run(handlers.getNewProjectPathHandler, args);
        if (targetUri.isOk()) {
          await handlers.updateAutoOpenGlobalKey(true, false, args);
          await ExtTelemetry.dispose();
          await delay(2000);
          return { openFolder: targetUri.value };
        }
      }
    })
  );

  const openReadMeCmd = vscode.commands.registerCommand("fx-extension.openReadMe", (...args) =>
    Correlator.run(handlers.openReadMeHandler, args)
  );
  context.subscriptions.push(openReadMeCmd);

  const openDeploymentTreeview = vscode.commands.registerCommand(
    "fx-extension.openDeploymentTreeview",
    (...args) => Correlator.run(handlers.openDeploymentTreeview, args)
  );
  context.subscriptions.push(openDeploymentTreeview);

  const validateManifestCmd = vscode.commands.registerCommand(
    "fx-extension.validateManifest",
    (...args) => Correlator.run(handlers.validateManifestHandler, args)
  );
  context.subscriptions.push(validateManifestCmd);

  const connectExistingApiCmd = vscode.commands.registerCommand(
    "fx-extension.connectExistingApi",
    (...args) => Correlator.run(handlers.connectExistingApiHandler, args)
  );
  context.subscriptions.push(connectExistingApiCmd);

  // 1.7 validate dependencies command (hide from UI)
  // localdebug session starts from environment checker
  const validateDependenciesCmd = vscode.commands.registerCommand(
    "fx-extension.validate-dependencies",
    () => Correlator.runWithId(startLocalDebugSession(), handlers.validateAzureDependenciesHandler)
  );
  context.subscriptions.push(validateDependenciesCmd);

  // localdebug session starts from environment checker
  const validateSpfxDependenciesCmd = vscode.commands.registerCommand(
    "fx-extension.validate-spfx-dependencies",
    () => Correlator.runWithId(startLocalDebugSession(), handlers.validateSpfxDependenciesHandler)
  );
  context.subscriptions.push(validateSpfxDependenciesCmd);

  // localdebug session starts from prerequisites checker
  const validatePrerequisitesCmd = vscode.commands.registerCommand(
    "fx-extension.validate-local-prerequisites",
    () => Correlator.runWithId(startLocalDebugSession(), handlers.validateLocalPrerequisitesHandler)
  );
  context.subscriptions.push(validatePrerequisitesCmd);

  const installAppInTeamsCmd = vscode.commands.registerCommand(
    "fx-extension.install-app-in-teams",
    () => Correlator.runWithId(getLocalDebugSessionId(), handlers.installAppInTeams)
  );
  context.subscriptions.push(installAppInTeamsCmd);

  const validateGetStartedPrerequisitesCmd = vscode.commands.registerCommand(
    "fx-extension.validate-getStarted-prerequisites",
    (...args) => Correlator.run(handlers.validateGetStartedPrerequisitesHandler, args)
  );
  context.subscriptions.push(validateGetStartedPrerequisitesCmd);

  // Referenced by tasks.json
  const getFuncPathCmd = vscode.commands.registerCommand("fx-extension.get-func-path", () =>
    Correlator.run(handlers.getFuncPathHandler)
  );
  context.subscriptions.push(getFuncPathCmd);

  // 1.8 pre debug check command (hide from UI)
  const preDebugCheckCmd = vscode.commands.registerCommand("fx-extension.pre-debug-check", () =>
    Correlator.runWithId(getLocalDebugSessionId(), handlers.preDebugCheckHandler)
  );
  context.subscriptions.push(preDebugCheckCmd);

  // 1.9 Register backend extensions install command (hide from UI)
  const backendExtensionsInstallCmd = vscode.commands.registerCommand(
    "fx-extension.backend-extensions-install",
    () => Correlator.runWithId(getLocalDebugSessionId(), handlers.backendExtensionsInstallHandler)
  );
  context.subscriptions.push(backendExtensionsInstallCmd);

  // 1.10 Register teamsfx task provider
  const taskProvider: TeamsfxTaskProvider = new TeamsfxTaskProvider();
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(TeamsfxTaskProvider.type, taskProvider)
  );

  const checkUpgradeCmd = vscode.commands.registerCommand(
    "fx-extension.checkProjectUpgrade",
    (...args) => Correlator.run(handlers.checkUpgrade, args)
  );
  context.subscriptions.push(checkUpgradeCmd);

  const deployAadAppManifest = vscode.commands.registerCommand(
    "fx-extension.deployAadAppManifest",
    (...args) => Correlator.run(handlers.deployAadAppManifest, args)
  );
  context.subscriptions.push(deployAadAppManifest);

  const openSurveyCmd = vscode.commands.registerCommand("fx-extension.openSurvey", (...args) =>
    Correlator.run(handlers.openSurveyHandler, args)
  );
  context.subscriptions.push(openSurveyCmd);

  const openAccountLinkCmd = vscode.commands.registerCommand(
    "fx-extension.openAccountLink",
    (...args) => Correlator.run(handlers.openAccountLinkHandler, args)
  );
  context.subscriptions.push(openAccountLinkCmd);

  const createAccountCmd = vscode.commands.registerCommand(
    "fx-extension.createAccount",
    (...args) => Correlator.run(handlers.createAccountHandler, args)
  );
  context.subscriptions.push(createAccountCmd);

  const openEnvLinkCmd = vscode.commands.registerCommand("fx-extension.openEnvLink", (...args) =>
    Correlator.run(handlers.openEnvLinkHandler, args)
  );
  context.subscriptions.push(openEnvLinkCmd);

  const openDevelopmentLinkCmd = vscode.commands.registerCommand(
    "fx-extension.openDevelopmentLink",
    (...args) => Correlator.run(handlers.openDevelopmentLinkHandler, args)
  );
  context.subscriptions.push(openDevelopmentLinkCmd);

  const openDeploymentLinkCmd = vscode.commands.registerCommand(
    "fx-extension.openDeploymentLink",
    (...args) => Correlator.run(handlers.openDeploymentLinkHandler, args)
  );
  context.subscriptions.push(openDeploymentLinkCmd);

  const openHelpFeedbackLinkCmd = vscode.commands.registerCommand(
    "fx-extension.openHelpFeedbackLink",
    (...args) => Correlator.run(handlers.openHelpFeedbackLinkHandler, args)
  );
  context.subscriptions.push(openHelpFeedbackLinkCmd);

  const openManifestSchemaCmd = vscode.commands.registerCommand(
    "fx-extension.openSchema",
    (...args) => {
      Correlator.run(handlers.openExternalHandler, args);
    }
  );
  context.subscriptions.push(openManifestSchemaCmd);

  const openBotManagementCmd = vscode.commands.registerCommand(
    "fx-extension.openBotManagement",
    (...args) => Correlator.run(handlers.openBotManagement, args)
  );
  context.subscriptions.push(openBotManagementCmd);

  const m365AccountSettingsCmd = vscode.commands.registerCommand(
    "fx-extension.m365AccountSettings",
    () => Correlator.run(handlers.openM365AccountHandler)
  );
  context.subscriptions.push(m365AccountSettingsCmd);

  const azureAccountSettingsCmd = vscode.commands.registerCommand(
    "fx-extension.azureAccountSettings",
    () => Correlator.run(handlers.openAzureAccountHandler)
  );
  context.subscriptions.push(azureAccountSettingsCmd);

  const cmpAccountsCmd = vscode.commands.registerCommand("fx-extension.cmpAccounts", () =>
    Correlator.run(handlers.cmpAccountsHandler)
  );
  context.subscriptions.push(cmpAccountsCmd);

  const decryptCmd = vscode.commands.registerCommand(
    "fx-extension.decryptSecret",
    (cipher, selection) => Correlator.run(handlers.decryptSecret, cipher, selection)
  );
  context.subscriptions.push(decryptCmd);

  const manifestTemplateCodeLensCmd = vscode.commands.registerCommand(
    "fx-extension.openPreviewFile",
    (...args) => Correlator.run(handlers.openPreviewManifest, args)
  );
  context.subscriptions.push(manifestTemplateCodeLensCmd);

  const aadManifestTemplateCodeLensCmd = vscode.commands.registerCommand(
    "fx-extension.openPreviewAadFile",
    (...args) => Correlator.run(handlers.openPreviewAadFile, args)
  );
  context.subscriptions.push(manifestTemplateCodeLensCmd);

  const openConfigStateCmd = vscode.commands.registerCommand(
    "fx-extension.openConfigState",
    (...args) => Correlator.run(handlers.openConfigStateFile, args)
  );
  context.subscriptions.push(openConfigStateCmd);

  const updateManifestCmd = vscode.commands.registerCommand(
    "fx-extension.updatePreviewFile",
    (...args) => Correlator.run(handlers.updatePreviewManifest, args)
  );
  context.subscriptions.push(updateManifestCmd);

  const editManifestTemplateCmd = vscode.commands.registerCommand(
    "fx-extension.editManifestTemplate",
    (...args) => Correlator.run(handlers.editManifestTemplate, args)
  );
  context.subscriptions.push(editManifestTemplateCmd);

  const editAadManifestTemplateCmd = vscode.commands.registerCommand(
    "fx-extension.editAadManifestTemplate",
    (...args) => Correlator.run(handlers.editAadManifestTemplate, args)
  );
  context.subscriptions.push(editAadManifestTemplateCmd);

  const createNewEnvironment = vscode.commands.registerCommand(
    "fx-extension.addEnvironment",
    (...args) => Correlator.run(handlers.createNewEnvironment, args)
  );
  context.subscriptions.push(createNewEnvironment);

  const refreshEnvironment = vscode.commands.registerCommand(
    "fx-extension.refreshEnvironment",
    (...args) => Correlator.run(handlers.refreshEnvironment, args)
  );
  context.subscriptions.push(refreshEnvironment);

  const localDebug = vscode.commands.registerCommand("fx-extension.localdebug", (node) => {
    Correlator.run(handlers.treeViewLocalDebugHandler);
  });
  context.subscriptions.push(localDebug);

  const localDebugWithIcon = vscode.commands.registerCommand(
    "fx-extension.localdebugWithIcon",
    (node) => {
      Correlator.run(handlers.treeViewLocalDebugHandler);
    }
  );
  context.subscriptions.push(localDebugWithIcon);

  const preview = vscode.commands.registerCommand("fx-extension.preview", (node) => {
    Correlator.run(handlers.treeViewPreviewHandler, node.command.title);
  });
  context.subscriptions.push(preview);

  const previewWithIcon = vscode.commands.registerCommand(
    "fx-extension.previewWithIcon",
    (node) => {
      Correlator.run(handlers.treeViewPreviewHandler, node.identifier);
    }
  );
  context.subscriptions.push(previewWithIcon);

  const openSubscriptionInPortal = vscode.commands.registerCommand(
    "fx-extension.openSubscriptionInPortal",
    (node) => {
      const envName = node.identifier;
      Correlator.run(handlers.openSubscriptionInPortal, envName);
    }
  );
  context.subscriptions.push(openSubscriptionInPortal);

  const openResourceGroupInPortal = vscode.commands.registerCommand(
    "fx-extension.openResourceGroupInPortal",
    (node) => {
      const envName = node.identifier;
      Correlator.run(handlers.openResourceGroupInPortal, envName);
    }
  );
  context.subscriptions.push(openResourceGroupInPortal);

  const grantPermission = vscode.commands.registerCommand(
    "fx-extension.grantPermission",
    (node) => {
      const envName = node.identifier;
      Correlator.run(handlers.grantPermission, envName);
    }
  );
  context.subscriptions.push(grantPermission);

  const listCollaborator = vscode.commands.registerCommand(
    "fx-extension.listCollaborator",
    (node) => {
      const envName = node.identifier;
      Correlator.run(handlers.listCollaborator, envName);
    }
  );
  context.subscriptions.push(listCollaborator);

  const showOutputChannel = vscode.commands.registerCommand(
    "fx-extension.showOutputChannel",
    (...args) => Correlator.run(handlers.showOutputChannel, args)
  );
  context.subscriptions.push(showOutputChannel);

  const addSso = vscode.commands.registerCommand("fx-extension.addSso", () =>
    Correlator.run(handlers.addSsoHanlder)
  );
  context.subscriptions.push(addSso);

  const workspacePath = getWorkspacePath();
  vscode.commands.executeCommand(
    "setContext",
    "fx-extension.isSPFx",
    workspacePath && isSPFxProject(workspacePath)
  );

  vscode.commands.executeCommand(
    "setContext",
    "fx-extension.isM365",
    workspacePath && (await isM365Project(workspacePath))
  );

  vscode.commands.executeCommand(
    "setContext",
    "fx-extension.canUpgradeToArmAndMultiEnv",
    await canUpgradeToArmAndMultiEnv(workspacePath)
  );

  vscode.commands.executeCommand(
    "setContext",
    "fx-extension.isAadManifestEnabled",
    isAadManifestEnabled()
  );

  vscode.commands.executeCommand(
    "setContext",
    "fx-extension.isApiConnectEnabled",
    isApiConnectEnabled()
  );

  // Setup CodeLens provider for userdata file
  const codelensProvider = new CryptoCodeLensProvider();
  const userDataSelector = {
    language: "plaintext",
    scheme: "file",
    pattern: "**/*.userdata",
  };
  const localDebugDataSelector = {
    language: "json",
    scheme: "file",
    pattern: `**/.${ConfigFolderName}/${InputConfigsFolderName}/${localSettingsJsonName}`,
  };

  const adaptiveCardCodeLensProvider = new AdaptiveCardCodeLensProvider();
  const adaptiveCardFilePattern = `**/${AdaptiveCardsFolderName}/*.json`;
  const adaptiveCardFileSelector = {
    language: "json",
    scheme: "file",
    pattern: adaptiveCardFilePattern,
  };

  const manifestTemplateCodeLensProvider = new ManifestTemplateCodeLensProvider();
  const manifestTemplateSelector = {
    language: "json",
    scheme: "file",
    pattern: isConfigUnifyEnabled()
      ? `**/${TemplateFolderName}/${AppPackageFolderName}/manifest.template.json`
      : `**/manifest.*.template.json`,
  };
  const manifestPreviewSelector = {
    language: "json",
    scheme: "file",
    pattern: `**/${BuildFolderName}/${AppPackageFolderName}/manifest.*.json`,
  };

  const aadAppTemplateCodeLensProvider = new AadAppTemplateCodeLensProvider();
  const aadAppTemplateSelector = {
    language: "json",
    scheme: "file",
    pattern: `**/${TemplateFolderName}/${AppPackageFolderName}/aad.template.json`,
  };

  const aadManifestPreviewSelector = {
    language: "json",
    scheme: "file",
    pattern: `**/${BuildFolderName}/${AppPackageFolderName}/aad.*.json`,
  };

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(userDataSelector, codelensProvider)
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(localDebugDataSelector, codelensProvider)
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      adaptiveCardFileSelector,
      adaptiveCardCodeLensProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      manifestTemplateSelector,
      manifestTemplateCodeLensProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      manifestPreviewSelector,
      manifestTemplateCodeLensProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      aadAppTemplateSelector,
      aadAppTemplateCodeLensProvider
    )
  );

  // Register hover provider
  const manifestTemplateHoverProvider = new ManifestTemplateHoverProvider();
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(manifestTemplateSelector, manifestTemplateHoverProvider)
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(aadAppTemplateSelector, manifestTemplateHoverProvider)
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      aadManifestPreviewSelector,
      aadAppTemplateCodeLensProvider
    )
  );

  // Register debug configuration provider
  const debugProvider: TeamsfxDebugProvider = new TeamsfxDebugProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("pwa-chrome", debugProvider)
  );
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("chrome", debugProvider)
  );
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("pwa-msedge", debugProvider)
  );
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("msedge", debugProvider)
  );

  // Register task and debug event handlers, as well as sending telemetries
  registerTeamsfxTaskAndDebugEvents();

  await handlers.cmdHdlLoadTreeView(context);

  // Register local debug run icon
  const runIconCmd = vscode.commands.registerCommand("fx-extension.selectAndDebug", (...args) =>
    Correlator.run(handlers.selectAndDebugHandler, args)
  );
  context.subscriptions.push(runIconCmd);
  registerRunIcon();

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(handlers.saveTextDocumentHandler)
  );

  const migrateTeamsTabAppCmd = vscode.commands.registerCommand(
    "fx-extension.migrateTeamsTabApp",
    () => Correlator.run(handlers.migrateTeamsTabAppHandler)
  );
  context.subscriptions.push(migrateTeamsTabAppCmd);

  const migrateTeamsManifestCmd = vscode.commands.registerCommand(
    "fx-extension.migrateTeamsManifest",
    () => Correlator.run(handlers.migrateTeamsManifestHandler)
  );
  context.subscriptions.push(migrateTeamsManifestCmd);

  // 2. Call activate function of toolkit core.
  await handlers.activate();

  if (!TreatmentVariableValue.isEmbeddedSurvey) {
    const survey = ExtensionSurvey.getInstance();
    survey.activate();
  }

  openWelcomePageAfterExtensionInstallation();

  showDebugChangesNotification();

  loadLocalizedStrings();
}

// this method is called when your extension is deactivated
export async function deactivate() {
  await ExtTelemetry.dispose();
  handlers.cmdHdlDisposeTreeView();
  disableRunIcon();
}

function initializeContextKey() {
  if (isValidNode()) {
    vscode.commands.executeCommand("setContext", "fx-extension.isNotValidNode", false);
  } else {
    vscode.commands.executeCommand("setContext", "fx-extension.isNotValidNode", true);
  }
}

function registerTreeViewCommandsInDevelopment(context: vscode.ExtensionContext) {
  // Create a new Teams app
  registerInCommandController(
    context,
    "fx-extension.create",
    handlers.createNewProjectHandler,
    "createProject"
  );

  // Initialize an existing application
  registerInCommandController(
    context,
    "fx-extension.init",
    handlers.initProjectHandler,
    "initProject"
  );

  // View samples
  registerInCommandController(context, "fx-extension.openSamples", handlers.openSamplesHandler);

  // Add capabilities
  registerInCommandController(
    context,
    "fx-extension.addCapability",
    handlers.addCapabilityHandler,
    "addCapabilities"
  );

  // Add cloud resources
  registerInCommandController(
    context,
    "fx-extension.update",
    handlers.addResourceHandler,
    "addResources"
  );

  // Edit manifest file
  registerInCommandController(
    context,
    "fx-extension.openManifest",
    handlers.openManifestHandler,
    "manifestEditor"
  );

  // Open adaptive card
  registerInCommandController(
    context,
    "fx-extension.OpenAdaptiveCardExt",
    handlers.openAdaptiveCardExt
  );
}

function registerTreeViewCommandsInDeployment(context: vscode.ExtensionContext) {
  // Provision in the cloud
  registerInCommandController(
    context,
    "fx-extension.provision",
    handlers.provisionHandler,
    "provision"
  );

  // Zip Teams metadata package
  registerInCommandController(
    context,
    "fx-extension.build",
    handlers.buildPackageHandler,
    "buildPackage"
  );

  // Deploy to the cloud
  registerInCommandController(context, "fx-extension.deploy", handlers.deployHandler, "deploy");

  // Publish to Teams
  registerInCommandController(context, "fx-extension.publish", handlers.publishHandler, "publish");

  // Add CI/CD Workflows
  registerInCommandController(
    context,
    "fx-extension.addCICDWorkflows",
    handlers.addCICDWorkflowsHandler,
    "addCICDWorkflows"
  );

  // Developer Portal for Teams
  registerInCommandController(
    context,
    "fx-extension.openAppManagement",
    handlers.openAppManagement
  );
}

function registerTreeViewCommandsInHelper(context: vscode.ExtensionContext) {
  // Quick start
  registerInCommandController(context, "fx-extension.openWelcome", handlers.openWelcomeHandler);

  // Tutorials
  registerInCommandController(
    context,
    "fx-extension.selectTutorials",
    handlers.selectTutorialsHandler
  );

  // Documentation
  registerInCommandController(context, "fx-extension.openDocument", handlers.openDocumentHandler);

  // Report issues on GitHub
  registerInCommandController(context, "fx-extension.openReportIssues", handlers.openReportIssues);
}

function registerInCommandController(
  context: vscode.ExtensionContext,
  name: string,
  callback: (args?: unknown[]) => Promise<Result<unknown, FxError>>,
  runningLabelKey?: string
) {
  commandController.registerCommand(name, callback, runningLabelKey);
  const command = vscode.commands.registerCommand(name, (...args) =>
    Correlator.run(runCommand, name, args)
  );
  context.subscriptions.push(command);
}

function runCommand(commandName: string, args: unknown[]) {
  commandController.runCommand(commandName, args);
}
