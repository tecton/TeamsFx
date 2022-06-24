// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Zhijie Huang <zhijie.huang@microsoft.com>
 */

import { describe } from "mocha";
import * as chai from "chai";
import fs from "fs-extra";
import path from "path";
import MockAzureAccountProvider from "../../../src/commonlib/azureLoginUserPassword";
import { environmentManager } from "@microsoft/teamsfx-core";
import {
  getSubscriptionId,
  getTestFolder,
  getUniqueAppName,
  cleanUp,
  readContextMultiEnv,
  getActivePluginsFromProjectSetting,
} from "../commonUtils";
import { CliHelper } from "../../commonlib/cliHelper";
import { Capability, PluginId, StateConfigKey } from "../../commonlib/constants";
import mockedEnv, { RestoreFn } from "mocked-env";
import {
  getExpectedM365ClientSecret,
  getResourceGroupNameFromResourceId,
  getSiteNameFromResourceId,
  getWebappSettings,
} from "../../commonlib/utilities";
import { FrontendWebAppConfig } from "../../commonlib";
import axios from "axios";

describe("Blazor App", function () {
  const testFolder = getTestFolder();
  const appName = getUniqueAppName();
  const subscription = getSubscriptionId();
  const projectPath = path.resolve(testFolder, appName);
  const envName = environmentManager.getDefaultEnvName();
  const env = Object.assign({}, process.env);
  env["TEAMSFX_CLI_DOTNET"] = "true";

  after(async () => {
    // clean up
    await cleanUp(appName, projectPath, false, false, false);
  });
  it(`Create Blazor app`, async () => {
    await CliHelper.createDotNetProject(appName, testFolder, Capability.Tab, env);
    const programCsPath = path.join(testFolder, appName, "App.razor");
    chai.assert.isTrue(await fs.pathExists(programCsPath));
  });

  it(`Provision Resource`, async () => {
    await CliHelper.setSubscription(subscription, projectPath);
    await CliHelper.provisionProject(projectPath, "", env);

    const tokenProvider = MockAzureAccountProvider;
    const tokenCredential = await tokenProvider.getAccountCredentialAsync();
    const token = (await tokenCredential?.getToken())?.accessToken;
    chai.assert.exists(token);

    const context = await readContextMultiEnv(projectPath, envName);
    const resourceId = context[PluginId.FrontendHosting][StateConfigKey.webAppResourceId];
    const activeResourcePlugins = await getActivePluginsFromProjectSetting(projectPath);

    chai.assert.isArray(activeResourcePlugins);
    const response = await getWebappSettings(
      subscription,
      getResourceGroupNameFromResourceId(resourceId),
      getSiteNameFromResourceId(resourceId),
      token as string
    );
    chai.assert.exists(response);
    chai.assert.equal(
      response[FrontendWebAppConfig.clientId],
      context[PluginId.Aad][StateConfigKey.clientId] as string
    );
    chai.assert.equal(
      response[FrontendWebAppConfig.clientSecret],
      await getExpectedM365ClientSecret(context, projectPath, envName, activeResourcePlugins)
    );
    chai.assert.include(
      response[FrontendWebAppConfig.authEndpoint],
      context[PluginId.FrontendHosting][StateConfigKey.endpoint]
    );
    chai.assert.equal(
      response[FrontendWebAppConfig.authority],
      this.ctx[PluginId.Aad][StateConfigKey.oauthAuthority] as string
    );
  });

  it("Deploy Blazor app to Azure Web APP", async () => {
    await CliHelper.deployAll(projectPath, "", env);

    const context = await readContextMultiEnv(projectPath, envName);
    const endpoint = context[PluginId.FrontendHosting][StateConfigKey.endpoint];
    const axiosInstance = axios.create();
    try {
      const response = await axiosInstance.get(endpoint);
      chai.assert.equal(response.status, 200);
    } catch (e) {
      chai.assert.notExists(e);
    }
  });
});
