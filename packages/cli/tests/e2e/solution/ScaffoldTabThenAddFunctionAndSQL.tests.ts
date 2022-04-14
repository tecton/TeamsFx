// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Yefu Wang <yefuwang@microsoft.com>
 */

import path from "path";
import fs from "fs-extra";
import * as chai from "chai";
import { getTestFolder, getUniqueAppName, cleanUpLocalProject } from "../commonUtils";
import "mocha";
import { CliHelper } from "../../commonlib/cliHelper";
import { Capability, Resource } from "../../commonlib/constants";
import { isConfigUnifyEnabled } from "@microsoft/teamsfx-core";

// test case for bug https://msazure.visualstudio.com/Microsoft%20Teams%20Extensibility/_workitems/edit/12836125
describe("Scaffold Tab then Add Function and SQL", function () {
  const testFolder = getTestFolder();
  const appName = getUniqueAppName();
  const projectPath = path.resolve(testFolder, appName);

  after(async () => {
    // No provision was done. Only project files need to be cleaned up.
    await cleanUpLocalProject(projectPath);
  });

  it("should generate correct local config file", async () => {
    if (!isConfigUnifyEnabled()) {
      return;
    }
    await CliHelper.createProjectWithCapability(appName, testFolder, Capability.Tab);

    await CliHelper.addResourceToProject(projectPath, Resource.AzureFunction);
    await CliHelper.addResourceToProject(projectPath, Resource.AzureSql);

    const localConfigPath = path.resolve(projectPath, ".fx", "configs", "config.local.json");
    const localConfig = await fs.readJSON(localConfigPath);
    chai.assert.isTrue(localConfig != undefined);
  });

  it("should generate correct localSettings file", async () => {
    if (isConfigUnifyEnabled()) {
      return;
    }
    await CliHelper.createProjectWithCapability(appName, testFolder, Capability.Tab);

    await CliHelper.addResourceToProject(projectPath, Resource.AzureFunction);
    await CliHelper.addResourceToProject(projectPath, Resource.AzureSql);

    const localSettingsPath = path.resolve(projectPath, ".fx", "configs", "localSettings.json");
    const localSettings = await fs.readJSON(localSettingsPath);
    chai.assert.isTrue(localSettings["backend"] != undefined);
    chai.assert.hasAllKeys(localSettings["backend"], ["functionEndpoint", "functionName"]);
  });
});
