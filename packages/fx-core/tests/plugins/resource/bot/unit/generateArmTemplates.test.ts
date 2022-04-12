// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import "mocha";
import * as chai from "chai";
import { AzureSolutionSettings, PluginContext } from "@microsoft/teamsfx-api";

import {
  ConstantString,
  mockSolutionGenerateArmTemplates,
  mockSolutionUpdateArmTemplates,
  ResourcePlugins,
} from "../../util";
import { TeamsBot } from "../../../../../src";
import * as tools from "../../../../../src/common/tools";
import * as featureFlags from "../../../../../src/common/featureFlags";
import * as projectSettingsHelper from "../../../../../../fx-core/src/common/projectSettingsHelper";
import * as testUtils from "./utils";
import path from "path";
import fs from "fs-extra";
import {
  HostTypeOptionAzure,
  BotOptionItem,
  AzureResourceKeyVault,
} from "../../../../../src/plugins/solution/fx-solution/question";
import * as sinon from "sinon";

describe("Bot Generates Arm Templates", () => {
  let botPlugin: TeamsBot;

  beforeEach(() => {
    botPlugin = new TeamsBot();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("generate bicep arm templates: without key vault plugin", async () => {
    sinon.stub(tools, "isBotNotificationEnabled").returns(false);
    const activeResourcePlugins = [
      ResourcePlugins.Aad,
      ResourcePlugins.Bot,
      ResourcePlugins.Identity,
    ];
    const settings: AzureSolutionSettings = {
      hostType: HostTypeOptionAzure.id,
      name: "azure",
      activeResourcePlugins: activeResourcePlugins,
      capabilities: [BotOptionItem.id],
    } as AzureSolutionSettings;

    await testGenerateArmTemplates(settings, "botConfig.result.bicep", "config.result.bicep");
  });

  it("generate bicep arm templates: with key vault plugin", async () => {
    sinon.stub(tools, "isBotNotificationEnabled").returns(false);
    const activeResourcePlugins = [
      ResourcePlugins.Aad,
      ResourcePlugins.Bot,
      ResourcePlugins.Identity,
      ResourcePlugins.KeyVault,
    ];
    const settings: AzureSolutionSettings = {
      hostType: HostTypeOptionAzure.id,
      name: "azure",
      activeResourcePlugins: activeResourcePlugins,
      azureResources: [AzureResourceKeyVault.id],
      capabilities: [BotOptionItem.id],
    } as AzureSolutionSettings;

    await testGenerateArmTemplates(
      settings,
      "botConfigWithKeyVaultPlugin.result.bicep",
      "configWithKeyVaultPlugin.result.bicep",
      {
        "fx-resource-key-vault": {
          References: {
            m365ClientSecretReference:
              "provisionOutputs.keyVaultOutput.value.m365ClientSecretReference",
            botClientSecretReference:
              "provisionOutputs.keyVaultOutput.value.botClientSecretReference",
          },
        },
      }
    );
  });

  it("generate bicep arm tempalte: withoud aad plugin", async () => {
    sinon.stub(tools, "isBotNotificationEnabled").returns(false);
    const activeResourcePlugins = [ResourcePlugins.Bot, ResourcePlugins.Identity];
    const settings: AzureSolutionSettings = {
      hostType: HostTypeOptionAzure.id,
      name: "azure",
      activeResourcePlugins: activeResourcePlugins,
      capabilities: [BotOptionItem.id],
    } as AzureSolutionSettings;

    await testGenerateArmTemplates(
      settings,
      "botConfigWithoutAadPlugin.result.bicep",
      "configWithoutAadPlugin.result.bicep"
    );
  });

  async function testGenerateArmTemplates(
    settings: AzureSolutionSettings,
    configurationModuleFileName: string,
    configurationFileName: string,
    addtionalPluginOutput: any = {}
  ) {
    // Arrange
    const pluginContext: PluginContext = testUtils.newPluginContext();
    pluginContext.projectSettings!.solutionSettings = settings;

    // Act
    const result = await botPlugin.generateArmTemplates(pluginContext);

    // Assert
    const provisionModuleFileName = "botProvision.result.bicep";
    const pluginOutput = {
      "fx-resource-bot": {
        Provision: {
          bot: {
            path: `./${provisionModuleFileName}`,
          },
        },
        Configuration: {
          bot: {
            path: `./${configurationModuleFileName}`,
          },
        },
      },
      "fx-resource-identity": {
        References: {
          identityName: "provisionOutputs.identityOutput.value.identityName",
          identityClientId: "provisionOutputs.identityOutput.value.identityClientId",
          identityResourceId: "userAssignedIdentityProvision.outputs.identityResourceId",
        },
      },
    };
    const mockedSolutionDataContext = {
      Plugins: { ...pluginOutput, ...addtionalPluginOutput },
    };
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      const compiledResult = mockSolutionGenerateArmTemplates(
        mockedSolutionDataContext,
        result.value
      );

      const expectedBicepFileDirectory = path.join(__dirname, "expectedBicepFiles");
      const provisionModuleFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, provisionModuleFileName),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Provision!.Modules!.bot, provisionModuleFile);

      const configModuleFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, configurationModuleFileName),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Configuration!.Modules!.bot, configModuleFile);

      const orchestrationProvisionFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, "provision.result.bicep"),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Provision!.Orchestration, orchestrationProvisionFile);

      chai.assert.strictEqual(
        compiledResult.Configuration!.Orchestration,
        fs.readFileSync(
          path.join(expectedBicepFileDirectory, configurationFileName),
          ConstantString.UTF8Encoding
        )
      );
      chai.assert.strictEqual(
        JSON.stringify(compiledResult.Parameters, undefined, 2),
        fs.readFileSync(
          path.join(expectedBicepFileDirectory, "parameters.json"),
          ConstantString.UTF8Encoding
        )
      );
    }
  }

  it("Update bicep arm templates", async () => {
    sinon.stub(tools, "isBotNotificationEnabled").returns(false);
    // Arrange
    const activeResourcePlugins = [
      ResourcePlugins.Aad,
      ResourcePlugins.Bot,
      ResourcePlugins.Identity,
    ];
    const pluginContext: PluginContext = testUtils.newPluginContext();
    const azureSolutionSettings = pluginContext.projectSettings!
      .solutionSettings! as AzureSolutionSettings;
    azureSolutionSettings.activeResourcePlugins = activeResourcePlugins;
    pluginContext.projectSettings!.solutionSettings = azureSolutionSettings;

    // Act
    const result = await botPlugin.updateArmTemplates(pluginContext);

    // Assert
    const provisionModuleFileName = "botProvision.result.bicep";
    const configurationModuleFileName = "botConfig.result.bicep";
    const mockedSolutionDataContext = {
      Plugins: {
        "fx-resource-bot": {
          Provision: {
            bot: {
              path: `./${provisionModuleFileName}`,
            },
          },
          Configuration: {
            bot: {
              path: `./${configurationModuleFileName}`,
            },
          },
        },
        "fx-resource-identity": {
          References: {
            identityName: "provisionOutputs.identityOutput.value.identityName",
            identityClientId: "provisionOutputs.identityOutput.value.identityClientId",
            identityResourceId: "userAssignedIdentityProvision.outputs.identityResourceId",
          },
        },
      },
    };
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      const compiledResult = mockSolutionUpdateArmTemplates(
        mockedSolutionDataContext,
        result.value
      );
      const expectedBicepFileDirectory = path.join(__dirname, "expectedBicepFiles");
      const configModuleFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, configurationModuleFileName),
        ConstantString.UTF8Encoding
      );
      chai.assert.notExists(compiledResult.Provision);
      chai.assert.strictEqual(compiledResult.Configuration!.Modules!.bot, configModuleFile);
      chai.assert.notExists(compiledResult.Configuration!.Orchestration);
      chai.assert.notExists(compiledResult.Parameters);
      chai.assert.exists(compiledResult.Reference!.resourceId);
      chai.assert.strictEqual(
        compiledResult.Reference!.resourceId,
        "provisionOutputs.botOutput.value.botWebAppResourceId"
      );
      chai.assert.exists(compiledResult.Reference!.hostName);
      chai.assert.strictEqual(
        compiledResult.Reference!.hostName,
        "provisionOutputs.botOutput.value.validDomain"
      );
      chai.assert.exists(compiledResult.Reference!.webAppEndpoint);
      chai.assert.strictEqual(
        compiledResult.Reference!.webAppEndpoint,
        "provisionOutputs.botOutputs.value.botWebAppEndpoint"
      );
    }
  });

  it("Generate Arm Template in .NET scenario", async () => {
    sinon.stub(tools, "isBotNotificationEnabled").returns(false);
    sinon.stub(projectSettingsHelper, <any>"isVSProject").returns(true);
    const activeResourcePlugins = [
      ResourcePlugins.Aad,
      ResourcePlugins.FrontendHosting,
      ResourcePlugins.Bot,
      ResourcePlugins.Identity,
    ];
    const settings: AzureSolutionSettings = {
      hostType: HostTypeOptionAzure.id,
      name: "azure",
      activeResourcePlugins: activeResourcePlugins,
      capabilities: [BotOptionItem.id],
    } as AzureSolutionSettings;
    const pluginContext: PluginContext = testUtils.newPluginContext();
    pluginContext.projectSettings!.solutionSettings = settings;

    const result = await botPlugin.generateArmTemplates(pluginContext);

    const provisionModuleFilePath = "./botServiceProvision.result.bicep";
    const pluginOutput = {
      "fx-resource-bot": {
        Provision: {
          botservice: {
            path: provisionModuleFilePath,
          },
        },
      },
      "fx-resource-frontend-hosting": {
        References: {
          endpointAsParam: "webappProvision.outputs.endpoint",
          domainAsParam: "webappProvision.outputs.domain",
        },
      },
    };

    const mockedSolutionDataContext = { Plugins: pluginOutput };

    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      const compiledResult = mockSolutionGenerateArmTemplates(
        mockedSolutionDataContext,
        result.value
      );
      const expectedBicepFileDirectory = path.join(__dirname, "expectedBicepFiles");
      const provisionModuleFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, provisionModuleFilePath),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Provision!.Modules!.botservice, provisionModuleFile);
      const orchestrationProvisionFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, "provisionOnlyBotService.result.bicep"),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Provision!.Orchestration, orchestrationProvisionFile);
      chai.assert.strictEqual(
        JSON.stringify(compiledResult.Parameters, undefined, 2),
        await fs.readFile(
          path.join(expectedBicepFileDirectory, "parameters.json"),
          ConstantString.UTF8Encoding
        )
      );
    }
  });

  it("Generate Arm Template in func hosted scenario", async () => {
    sinon.stub(tools, "isBotNotificationEnabled").returns(true);
    const activeResourcePlugins = [ResourcePlugins.Bot, ResourcePlugins.Identity];
    const settings: AzureSolutionSettings = {
      hostType: HostTypeOptionAzure.id,
      name: "azure",
      activeResourcePlugins: activeResourcePlugins,
      capabilities: [BotOptionItem.id],
    } as AzureSolutionSettings;
    const pluginContext: PluginContext = testUtils.newPluginContext();
    pluginContext.projectSettings!.solutionSettings = settings;
    pluginContext.projectSettings!.pluginSettings = {
      "fx-resource-bot": { "host-type": "azure-functions" },
    };
    const result = await botPlugin.generateArmTemplates(pluginContext);

    // Assert
    const provisionModuleFileName = "botProvisionOfFuncHosted.result.bicep";
    const configurationModuleFileName = "botConfigWithoutAadPlugin.result.bicep";
    const configurationFileName = "configWithoutAadPlugin.result.bicep";
    const pluginOutput = {
      "fx-resource-bot": {
        Provision: {
          bot: {
            path: `./${provisionModuleFileName}`,
          },
        },
        Configuration: {
          bot: {
            path: `./${configurationModuleFileName}`,
          },
        },
      },
      "fx-resource-identity": {
        References: {
          identityName: "provisionOutputs.identityOutput.value.identityName",
          identityClientId: "provisionOutputs.identityOutput.value.identityClientId",
          identityResourceId: "userAssignedIdentityProvision.outputs.identityResourceId",
        },
      },
    };
    const mockedSolutionDataContext = {
      Plugins: { ...pluginOutput },
    };
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      const compiledResult = mockSolutionGenerateArmTemplates(
        mockedSolutionDataContext,
        result.value
      );

      const expectedBicepFileDirectory = path.join(__dirname, "expectedBicepFiles");
      const provisionModuleFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, provisionModuleFileName),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Provision!.Modules!.bot, provisionModuleFile);

      const configModuleFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, configurationModuleFileName),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Configuration!.Modules!.bot, configModuleFile);

      const orchestrationProvisionFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, "provisionOfFuncHosted.result.bicep"),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Provision!.Orchestration, orchestrationProvisionFile);

      chai.assert.strictEqual(
        compiledResult.Configuration!.Orchestration,
        fs.readFileSync(
          path.join(expectedBicepFileDirectory, configurationFileName),
          ConstantString.UTF8Encoding
        )
      );
      chai.assert.strictEqual(
        JSON.stringify(compiledResult.Parameters, undefined, 2),
        fs.readFileSync(
          path.join(expectedBicepFileDirectory, "parameters.json"),
          ConstantString.UTF8Encoding
        )
      );
    }
  });

  it("Generate Arm Template in enable always on scenario", async () => {
    sinon.stub(featureFlags, "isBotNotificationEnabled").returns(true);
    const activeResourcePlugins = [ResourcePlugins.Bot, ResourcePlugins.Identity];
    const settings: AzureSolutionSettings = {
      hostType: HostTypeOptionAzure.id,
      name: "azure",
      activeResourcePlugins: activeResourcePlugins,
      capabilities: [BotOptionItem.id],
    } as AzureSolutionSettings;
    const pluginContext: PluginContext = testUtils.newPluginContext();
    pluginContext.projectSettings!.solutionSettings = settings;
    pluginContext.projectSettings!.pluginSettings = {
      "fx-resource-bot": { "host-type": "app-service" },
    };
    const result = await botPlugin.generateArmTemplates(pluginContext);

    // Assert
    const provisionModuleFileName = "botProvisionEnableAlwaysOn.result.bicep";
    const configurationModuleFileName = "botConfigWithoutAadPlugin.result.bicep";
    const configurationFileName = "configWithoutAadPlugin.result.bicep";
    const pluginOutput = {
      "fx-resource-bot": {
        Provision: {
          bot: {
            path: `./${provisionModuleFileName}`,
          },
        },
        Configuration: {
          bot: {
            path: `./${configurationModuleFileName}`,
          },
        },
      },
      "fx-resource-identity": {
        References: {
          identityName: "provisionOutputs.identityOutput.value.identityName",
          identityClientId: "provisionOutputs.identityOutput.value.identityClientId",
          identityResourceId: "userAssignedIdentityProvision.outputs.identityResourceId",
        },
      },
    };
    const mockedSolutionDataContext = {
      Plugins: { ...pluginOutput },
    };
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      const compiledResult = mockSolutionGenerateArmTemplates(
        mockedSolutionDataContext,
        result.value
      );

      const expectedBicepFileDirectory = path.join(__dirname, "expectedBicepFiles");
      const provisionModuleFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, provisionModuleFileName),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Provision!.Modules!.bot, provisionModuleFile);

      const configModuleFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, configurationModuleFileName),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Configuration!.Modules!.bot, configModuleFile);

      const orchestrationProvisionFile = await fs.readFile(
        path.join(expectedBicepFileDirectory, "provisionEnableAlwaysOn.result.bicep"),
        ConstantString.UTF8Encoding
      );
      chai.assert.strictEqual(compiledResult.Provision!.Orchestration, orchestrationProvisionFile);

      chai.assert.strictEqual(
        compiledResult.Configuration!.Orchestration,
        fs.readFileSync(
          path.join(expectedBicepFileDirectory, configurationFileName),
          ConstantString.UTF8Encoding
        )
      );
      chai.assert.strictEqual(
        JSON.stringify(compiledResult.Parameters, undefined, 2),
        fs.readFileSync(
          path.join(expectedBicepFileDirectory, "parameters.json"),
          ConstantString.UTF8Encoding
        )
      );
    }
  });
});
