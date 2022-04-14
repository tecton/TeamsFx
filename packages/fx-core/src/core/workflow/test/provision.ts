// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, v2, v3 } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import "reflect-metadata";
import { createV2Context } from "../../../common";
import { setTools } from "../../globalVars";
import "../fx";
import { ProjectSettingsV3 } from "../interface";
import { MockTools } from "../utils";
import { executeAction, getAction, planAction, resolveAction } from "../workflow";
import * as os from "os";
import * as path from "path";
import { cloneDeep } from "lodash";

async function provision() {
  const tools = new MockTools();
  setTools(tools);
  const projectSetting: ProjectSettingsV3 = {
    projectId: "123",
    appName: "test",
    solutionSettings: { name: "fx", activeResourcePlugins: [] },
    programmingLanguage: "typescript",
    components: [
      {
        name: "teams-tab",
        hostingResource: "azure-storage",
        framework: "react",
        folder: "myApp",
      },
      {
        name: "tab-scaffold",
        build: true,
        deployType: "zip",
        folder: "myApp",
        language: "typescript",
        framework: "react",
        hostingResource: "azure-storage",
      },
      { name: "azure-storage", provision: true },
      {
        name: "teams-bot",
        scenarios: ["default"],
        folder: "bot",
        hostingResource: "azure-web-app",
      },
      {
        name: "bot-scaffold",
        build: true,
        deployType: "zip",
        folder: "bot",
        language: "typescript",
        scenarios: ["default"],
        hostingResource: "azure-web-app",
      },
      { name: "azure-web-app", provision: true },
      { name: "aad", provision: true },
    ],
  };
  const envInfo: v3.EnvInfoV3 = {
    envName: "dev",
    config: {},
    state: { solution: {} },
  };
  const context = {
    ctx: createV2Context(projectSetting),
    envInfo: envInfo,
    tokenProvider: tools.tokenProvider,
  };

  const inputs: v2.InputsWithProjectPath = {
    projectPath: path.join(os.tmpdir(), "myapp"),
    platform: Platform.VSCode,
  };
  const action = await getAction("fx.provision", context, inputs);
  if (action) {
    const resolved = await resolveAction(action, context, cloneDeep(inputs));
    fs.writeFileSync("provision.json", JSON.stringify(resolved, undefined, 4));
    await planAction(action, context, cloneDeep(inputs));
    await executeAction(action, context, inputs);
  }
  console.log("inputs:");
  console.log(inputs);
  console.log("projectSetting:");
  console.log(projectSetting);
}

provision();