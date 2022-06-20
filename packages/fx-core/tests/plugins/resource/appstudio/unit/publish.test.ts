// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import sinon from "sinon";
import fs from "fs-extra";
import path from "path";
import { v4 as uuid } from "uuid";
import { ConfigMap, PluginContext, ok, Platform, Plugin } from "@microsoft/teamsfx-api";
import { AppStudioPlugin } from "./../../../../../src/plugins/resource/appstudio";
import { AppStudioPluginImpl } from "./../../../../../src/plugins/resource/appstudio/plugin";
import { AppStudioClient } from "./../../../../../src/plugins/resource/appstudio/appStudio";
import { PublishingState } from "./../../../../../src/plugins/resource/appstudio/interfaces/IPublishingAppDefinition";
import { mockTokenProviderM365 } from "./../../aad/helper";
import { getAzureProjectRoot, MockUserInteraction } from "./../helper";
import { TeamsBot } from "./../../../../../src/plugins/resource/bot";
import { newEnvInfo } from "../../../../../src";
import * as core from "../../../../../src";
import { LocalCrypto } from "../../../../../src/core/crypto";
import { Constants } from "../../../../../src/plugins/resource/appstudio/constants";

describe("Publish Teams app with Azure", () => {
  let plugin: AppStudioPlugin;
  let ctx: PluginContext;
  let BotPlugin: Plugin;
  let selectedPlugins: Plugin[];
  const sandbox = sinon.createSandbox();
  const appPackagePath = path.resolve(__dirname, "./../resources/appPackage/appPackage.zip");

  beforeEach(async () => {
    plugin = new AppStudioPlugin();
    ctx = {
      root: getAzureProjectRoot(),
      envInfo: newEnvInfo(),
      config: new ConfigMap(),
      m365TokenProvider: mockTokenProviderM365(),
      answers: { platform: Platform.VSCode },
      cryptoProvider: new LocalCrypto(""),
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: "project id",
      solutionSettings: {
        name: "azure",
        version: "1.0",
        capabilities: ["Bot"],
        activeResourcePlugins: ["fx-resource-bot"],
      },
    };

    const botplugin: Plugin = new TeamsBot();
    BotPlugin = botplugin as Plugin;
    BotPlugin.name = "fx-resource-bot";
    BotPlugin.displayName = "Bot";
    selectedPlugins = [BotPlugin];
    sandbox.stub(AppStudioClient, "publishTeamsApp").resolves(uuid());
    sandbox.stub(AppStudioClient, "publishTeamsAppUpdate").resolves(uuid());
    sandbox.stub(AppStudioClient, "updateApp").resolves();
    sandbox.stub(fs, "move").resolves();
  });

  afterEach(async () => {
    sandbox.restore();
    if (await fs.pathExists(appPackagePath)) {
      await fs.remove(appPackagePath);
    }
  });

  it("Publish teams app", async () => {
    sandbox.stub(AppStudioClient, "getAppByTeamsAppId").resolves(undefined);

    sandbox.stub(AppStudioPluginImpl.prototype, "getConfigForCreatingManifest" as any).returns({
      tabEndpoint: "https://tabEndpoint",
      tabDomain: "tabDomain",
      tabIndexPath: "/index",
      aadId: uuid(),
      botDomain: "botDomain",
      botId: uuid(),
      webApplicationInfoResource: "webApplicationInfoResource",
      teamsAppId: uuid(),
    });

    const newCtx: PluginContext = Object.create(ctx);
    const links: string[] = [];
    newCtx.ui = new MockUserInteraction();
    sandbox
      .stub(MockUserInteraction.prototype, "showMessage")
      .callsFake((level, message, modal, ...items) => {
        if (items.includes("Go to admin portal")) {
          return Promise.resolve(ok("Go to admin portal"));
        }
        return Promise.resolve(ok(undefined));
      });
    sandbox.stub(MockUserInteraction.prototype, "openUrl").callsFake((link) => {
      links.push(link);
      return Promise.resolve(ok(true));
    });

    const teamsAppId = await plugin.publish(newCtx);
    chai.assert.include(links, Constants.TEAMS_ADMIN_PORTAL);
    chai.assert.isTrue(teamsAppId.isOk());
    if (teamsAppId.isOk()) {
      chai.assert.isNotEmpty(teamsAppId.value);
    }
  });

  it("Update a submitted app", async () => {
    const mockApp = {
      lastModifiedDateTime: null,
      publishingState: PublishingState.submitted,
      teamsAppId: uuid(),
      displayName: "TestApp",
    };
    sandbox.stub(AppStudioClient, "getAppByTeamsAppId").resolves(mockApp);
    ctx.ui = new MockUserInteraction();

    sandbox.stub(AppStudioPluginImpl.prototype, "getConfigForCreatingManifest" as any).returns({
      tabEndpoint: "https://tabEndpoint",
      tabDomain: "tabDomain",
      tabIndexPath: "/index",
      aadId: uuid(),
      botDomain: "botDomain",
      botId: uuid(),
      webApplicationInfoResource: "webApplicationInfoResource",
      teamsAppId: uuid(),
    });

    const teamsAppId = await plugin.publish(ctx);
    chai.assert.isTrue(teamsAppId.isOk());
    if (teamsAppId.isOk()) {
      chai.assert.isNotEmpty(teamsAppId.value);
    }
  });
});

describe("Publish Teams app with SPFx", () => {
  let plugin: AppStudioPlugin;
  let ctx: PluginContext;
  let BotPlugin: Plugin;
  let selectedPlugins: Plugin[];
  const sandbox = sinon.createSandbox();
  const appPackagePath = path.resolve(__dirname, "./../spfx-resources/appPackage/appPackage.zip");

  beforeEach(async () => {
    plugin = new AppStudioPlugin();
    ctx = {
      root: path.resolve(__dirname, "./../spfx-resources"),
      envInfo: newEnvInfo(),
      config: new ConfigMap(),
      m365TokenProvider: mockTokenProviderM365(),
      answers: { platform: Platform.VSCode },
      cryptoProvider: new LocalCrypto(""),
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: "project id",
      solutionSettings: {
        name: "spfx",
        version: "1.0",
        capabilities: ["Tab"],
        activeResourcePlugins: ["fx-resource-spfx"],
      },
    };
    sandbox.stub(AppStudioClient, "publishTeamsApp").resolves(uuid());
    sandbox.stub(AppStudioClient, "publishTeamsAppUpdate").resolves(uuid());
    sandbox.stub(AppStudioClient, "updateApp").resolves();
    sandbox.stub(fs, "move").resolves();
    sandbox.stub(AppStudioPluginImpl.prototype, <any>"beforePublish").returns(uuid());
  });

  afterEach(async () => {
    sandbox.restore();
    if (await fs.pathExists(appPackagePath)) {
      await fs.remove(appPackagePath);
    }
  });

  it("Publish teams app", async () => {
    sandbox.stub(AppStudioClient, "getAppByTeamsAppId").resolves(undefined);

    sandbox.stub(AppStudioPluginImpl.prototype, "getConfigForCreatingManifest" as any).returns(
      ok({
        tabEndpoint: "tabEndpoint",
        tabDomain: "tabDomain",
        aadId: "aadId",
        webApplicationInfoResource: "webApplicationInfoResource",
        teamsAppId: uuid(),
      })
    );

    const teamsAppId = await plugin.publish(ctx);
    chai.assert.isTrue(teamsAppId.isOk());
    if (teamsAppId.isOk()) {
      chai.assert.isNotEmpty(teamsAppId.value);
    }
  });

  it("Update a submitted app", async () => {
    const mockApp = {
      lastModifiedDateTime: null,
      publishingState: PublishingState.submitted,
      teamsAppId: uuid(),
      displayName: "TestApp",
    };
    sandbox.stub(AppStudioClient, "getAppByTeamsAppId").resolves(mockApp);
    ctx.ui = new MockUserInteraction();

    sandbox.stub(AppStudioPluginImpl.prototype, "getConfigForCreatingManifest" as any).returns(
      ok({
        tabEndpoint: "tabEndpoint",
        tabDomain: "tabDomain",
        aadId: "aadId",
        webApplicationInfoResource: "webApplicationInfoResource",
        teamsAppId: uuid(),
      })
    );

    const teamsAppId = await plugin.publish(ctx);
    chai.assert.isTrue(teamsAppId.isOk());
    if (teamsAppId.isOk()) {
      chai.assert.isNotEmpty(teamsAppId.value);
    }
  });
});
