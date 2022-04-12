// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import axios from "axios";
import { AppStudioPlugin } from "./../../../../../src/plugins/resource/appstudio";
import { AppStudioPluginImpl } from "./../../../../../src/plugins/resource/appstudio/plugin";
import { AppStudioClient } from "./../../../../../src/plugins/resource/appstudio/appStudio";
import { IAppDefinition } from "./../../../../../src/plugins/resource/appstudio/interfaces/IAppDefinition";
import {
  FRONTEND_ENDPOINT,
  FRONTEND_DOMAIN,
  LOCAL_BOT_ID,
  BOT_ID,
  FRONTEND_INDEX_PATH,
} from "./../../../../../src/plugins/resource/appstudio/constants";
import {
  LOCAL_DEBUG_TAB_ENDPOINT,
  LOCAL_DEBUG_TAB_DOMAIN,
  LOCAL_DEBUG_AAD_ID,
  REMOTE_AAD_ID,
  LOCAL_DEBUG_BOT_DOMAIN,
  BOT_DOMAIN,
  LOCAL_WEB_APPLICATION_INFO_SOURCE,
  WEB_APPLICATION_INFO_SOURCE,
  PluginNames,
  TEAMS_APP_ID,
} from "./../../../../../src/plugins/solution/fx-solution/constants";
import { AppStudioError } from "./../../../../../src/plugins/resource/appstudio/errors";
import {
  AppStudioTokenProvider,
  ConfigMap,
  PluginContext,
  TeamsAppManifest,
  err,
  LocalSettings,
  ManifestUtil,
} from "@microsoft/teamsfx-api";
import * as uuid from "uuid";
import sinon from "sinon";
import fs from "fs-extra";
import { AppStudioResultFactory } from "../../../../../src/plugins/resource/appstudio/results";
import { newEnvInfo } from "../../../../../src";
import { LocalCrypto } from "../../../../../src/core/crypto";
import {
  LocalSettingsAuthKeys,
  LocalSettingsBotKeys,
  LocalSettingsFrontendKeys,
  LocalSettingsTeamsAppKeys,
} from "../../../../../src/common/localSettingsConstants";
import { getAzureProjectRoot } from "../helper";
import { ResourcePlugins } from "../../../../../src/common/constants";

class MockedAppStudioTokenProvider implements AppStudioTokenProvider {
  async getAccessToken(showDialog?: boolean): Promise<string> {
    return "someFakeToken";
  }
  async getJsonObject(showDialog?: boolean): Promise<Record<string, unknown>> {
    return {
      tid: "222",
    };
  }
  signout(): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  setStatusChangeCallback(
    statusChange: (
      status: string,
      token?: string,
      accountInfo?: Record<string, unknown>
    ) => Promise<void>
  ): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  setStatusChangeMap(
    name: string,
    statusChange: (
      status: string,
      token?: string,
      accountInfo?: Record<string, unknown>
    ) => Promise<void>,
    immediateCall?: boolean
  ): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  removeStatusChangeMap(name: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
}

describe("Post Local Debug", () => {
  let plugin: AppStudioPlugin;
  let ctx: PluginContext;
  let manifest: TeamsAppManifest;
  let localSettings: LocalSettings;

  const localDebugApplicationIdUris = "local web application info source";
  const localDebugClientId = uuid.v4();
  const localDebugTabEndpoint = "local debug tab endpoint";
  const localDebugTabDomain = "local debug tab domain";
  const localDebugBotId = uuid.v4();
  const localDebugBotDomain = "local debug bot domain";

  let AAD_ConfigMap: ConfigMap;
  let APPSTUDIO_ConfigMap: ConfigMap;
  let BOT_ConfigMap: ConfigMap;
  let LDEBUG_ConfigMap: ConfigMap;
  let FE_ConfigMap: ConfigMap;
  let configOfOtherPlugins: Map<string, ConfigMap>;
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    plugin = new AppStudioPlugin();
    manifest = new TeamsAppManifest();
    configOfOtherPlugins = new Map();

    localSettings = {
      auth: new ConfigMap([
        [LocalSettingsAuthKeys.ApplicationIdUris, localDebugApplicationIdUris],
        [LocalSettingsAuthKeys.ClientId, localDebugClientId],
      ]),
      bot: new ConfigMap([
        [LocalSettingsBotKeys.BotId, localDebugBotId],
        [LocalSettingsBotKeys.BotDomain, localDebugBotDomain],
      ]),
      frontend: new ConfigMap([
        [LocalSettingsFrontendKeys.TabEndpoint, localDebugTabEndpoint],
        [LocalSettingsFrontendKeys.TabDomain, localDebugTabDomain],
      ]),
      teamsApp: new ConfigMap([[LocalSettingsTeamsAppKeys.TeamsAppId, uuid.v4()]]),
    };

    AAD_ConfigMap = new ConfigMap();
    AAD_ConfigMap.set(REMOTE_AAD_ID, uuid.v4());
    AAD_ConfigMap.set(WEB_APPLICATION_INFO_SOURCE, "web application info source");

    BOT_ConfigMap = new ConfigMap();
    BOT_ConfigMap.set(BOT_ID, uuid.v4());
    BOT_ConfigMap.set(BOT_DOMAIN, "bot domain");

    APPSTUDIO_ConfigMap = new ConfigMap();
    APPSTUDIO_ConfigMap.set(TEAMS_APP_ID, uuid.v4());

    FE_ConfigMap = new ConfigMap();
    FE_ConfigMap.set(FRONTEND_ENDPOINT, "frontend endpoint");
    FE_ConfigMap.set(FRONTEND_DOMAIN, "frontend domain");
    FE_ConfigMap.set(FRONTEND_INDEX_PATH, "fronend indexPath");

    configOfOtherPlugins.set(PluginNames.AAD, AAD_ConfigMap);
    configOfOtherPlugins.set(PluginNames.LDEBUG, LDEBUG_ConfigMap);
    configOfOtherPlugins.set(PluginNames.BOT, BOT_ConfigMap);
    configOfOtherPlugins.set(PluginNames.APPST, APPSTUDIO_ConfigMap);
    configOfOtherPlugins.set(PluginNames.FE, FE_ConfigMap);

    sandbox.stub(AppStudioClient, "validateManifest").resolves([]);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("read an invalid manifest and should return error", async () => {
    ctx = {
      root: getAzureProjectRoot(),
      envInfo: newEnvInfo(undefined, undefined, configOfOtherPlugins),
      config: new ConfigMap(),
      appStudioToken: new MockedAppStudioTokenProvider(),
      cryptoProvider: new LocalCrypto(""),
      localSettings,
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
        capabilities: ["Bot"],
      },
    };
    const invalidManifestPath =
      "tests/plugins/resource/appstudio/resources-multi-env/invalid.manifest.json";
    const invalidManifest = fs.readJson(invalidManifestPath);

    sandbox.stub<any, any>(fs, "readJson").resolves(invalidManifest);

    let postLocalDebugResult;
    try {
      postLocalDebugResult = await plugin.postLocalDebug(ctx);
      chai.assert.isTrue(postLocalDebugResult.isErr());
    } catch (error) {
      chai.expect(error._unsafeUnwrapErr().message).include("Name is missing");
    }
  });

  it("should return Ok for postLocalDebug happy path", async () => {
    ctx = {
      root: getAzureProjectRoot(),
      envInfo: newEnvInfo(undefined, undefined, configOfOtherPlugins),
      config: new ConfigMap(),
      appStudioToken: new MockedAppStudioTokenProvider(),
      cryptoProvider: new LocalCrypto(""),
      localSettings,
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
        capabilities: ["Bot"],
      },
    };

    const appDef: IAppDefinition = {
      appName: "my app",
      teamsAppId: "appId",
      userList: [
        {
          tenantId: uuid.v4(),
          aadId: uuid.v4(),
          displayName: "displayName",
          userPrincipalName: "principalName",
          isAdministrator: true,
        },
      ],
      outlineIcon: "resources/outline.png",
      colorIcon: "resources/color.png",
    };

    const fakeAxiosInstance = axios.create();
    sandbox.stub(fakeAxiosInstance, "get").resolves({
      status: 200,
      data: appDef,
    });

    sandbox.stub<any, any>(fakeAxiosInstance, "post").callsFake(async (url: string) => {
      if (url == "/api/appdefinitions/appId/image") return {};
      if (url == "/api/appdefinitions/appId/override") return { status: 200, data: appDef };
      return {};
    });

    sandbox.stub(axios, "create").returns(fakeAxiosInstance);
    sandbox.stub(AppStudioClient, "createApp").resolves(appDef);
    sandbox.stub(ManifestUtil, "validateManifest").resolves([]);

    const postLocalDebugResult = await plugin.postLocalDebug(ctx);

    chai.assert.isTrue(postLocalDebugResult.isOk());
  });

  it("should return Ok for SPFx postLocalDebug happy path", async () => {
    ctx = {
      root: "./tests/plugins/resource/appstudio/spfx-resources/",
      envInfo: newEnvInfo(),
      config: new ConfigMap(),
      appStudioToken: new MockedAppStudioTokenProvider(),
      cryptoProvider: new LocalCrypto(""),
      localSettings,
    };
    ctx.envInfo.state.set(ResourcePlugins.AppStudio, new Map());
    ctx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "spfx",
        version: "1.0",
        capabilities: ["Tab"],
        activeResourcePlugins: ["fx-resource-spfx"],
      },
    };

    const appDef: IAppDefinition = {
      appName: "my app",
      teamsAppId: "appId",
      userList: [
        {
          tenantId: uuid.v4(),
          aadId: uuid.v4(),
          displayName: "displayName",
          userPrincipalName: "principalName",
          isAdministrator: true,
        },
      ],
      outlineIcon: "resources/outline.png",
      colorIcon: "resources/color.png",
    };

    const fakeAxiosInstance = axios.create();
    sandbox.stub(fakeAxiosInstance, "get").resolves({
      status: 200,
      data: appDef,
    });

    sandbox.stub<any, any>(fakeAxiosInstance, "post").callsFake(async (url: string) => {
      if (url == "/api/appdefinitions/appId/image") return {};
      if (url == "/api/appdefinitions/appId/override") return { status: 200, data: appDef };
      return {};
    });

    sandbox.stub(axios, "create").returns(fakeAxiosInstance);
    sandbox.stub(AppStudioClient, "createApp").resolves(appDef);

    const postLocalDebugResult = await plugin.postLocalDebug(ctx);

    chai.assert.isTrue(postLocalDebugResult.isOk());
  });
});
