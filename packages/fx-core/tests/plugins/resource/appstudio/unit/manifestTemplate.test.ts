// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import sinon from "sinon";
import fs, { PathLike } from "fs-extra";
import path from "path";
import * as uuid from "uuid";
import { v2, Platform, IStaticTab, IConfigurableTab, IBot } from "@microsoft/teamsfx-api";
import "reflect-metadata";
import { Container } from "typedi";
import { AppStudioPluginV3 } from "./../../../../../src/plugins/resource/appstudio/v3";
import { LocalCrypto } from "../../../../../src/core/crypto";
import {
  getAzureProjectRoot,
  getAzureProjectRootWithStaticTabs,
  MockUserInteraction,
} from "../helper";
import { MockedLogProvider, MockedTelemetryReporter } from "../../../solution/util";
import { BuiltInFeaturePluginNames } from "../../../../../src/plugins/solution/fx-solution/v3/constants";
import { AppStudioError } from "../../../../../src/plugins/resource/appstudio/errors";
import {
  AzureSolutionQuestionNames,
  BotScenario,
} from "../../../../../src/plugins/solution/fx-solution/question";
import { QuestionNames } from "../../../../../src/plugins/resource/bot/constants";
import { AppServiceOptionItem } from "../../../../../src/plugins/resource/bot/question";

describe("Load and Save manifest template", () => {
  const sandbox = sinon.createSandbox();
  let plugin: AppStudioPluginV3;
  let ctx: v2.Context;
  let inputs: v2.InputsWithProjectPath;

  beforeEach(async () => {
    plugin = Container.get<AppStudioPluginV3>(BuiltInFeaturePluginNames.appStudio);
    ctx = {
      cryptoProvider: new LocalCrypto(""),
      userInteraction: new MockUserInteraction(),
      logProvider: new MockedLogProvider(),
      telemetryReporter: new MockedTelemetryReporter(),
      projectSetting: {
        appName: "test",
        projectId: "",
        solutionSettings: {
          name: "",
          activeResourcePlugins: [plugin.name],
        },
      },
    };
    inputs = {
      platform: Platform.VSCode,
      projectPath: getAzureProjectRoot(),
    };
  });

  afterEach(async () => {
    sandbox.restore();
  });

  it("Load and Save manifest template file", async () => {
    const loadedManifestTemplate = await plugin.loadManifest(ctx, inputs);
    chai.assert.isTrue(loadedManifestTemplate.isOk());
    if (loadedManifestTemplate.isOk()) {
      const saveManifestResult = await plugin.saveManifest(
        ctx,
        inputs,
        loadedManifestTemplate.value
      );
      chai.assert.isTrue(saveManifestResult.isOk());
    }
  });
});

describe("Add capability", () => {
  const sandbox = sinon.createSandbox();
  let plugin: AppStudioPluginV3;
  let ctx: v2.Context;
  let inputs: v2.InputsWithProjectPath;
  let inputsWithStaticTabs: v2.InputsWithProjectPath;

  beforeEach(async () => {
    plugin = new AppStudioPluginV3();
    ctx = {
      cryptoProvider: new LocalCrypto(""),
      userInteraction: new MockUserInteraction(),
      logProvider: new MockedLogProvider(),
      telemetryReporter: new MockedTelemetryReporter(),
      projectSetting: {
        appName: "test",
        projectId: "",
        solutionSettings: {
          name: "",
          activeResourcePlugins: [plugin.name],
        },
      },
    };
    inputs = {
      platform: Platform.VSCode,
      projectPath: getAzureProjectRoot(),
    };
    inputsWithStaticTabs = {
      platform: Platform.VSCode,
      projectPath: getAzureProjectRootWithStaticTabs(),
    };
  });

  afterEach(async () => {
    sandbox.restore();
  });

  it("Check capability exceed limit: should return false", async () => {
    const result = await plugin.capabilityExceedLimit(ctx, inputs, "staticTab");
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.isFalse(result.value);
    }
  });

  it("Check capability exceed limit: should return true", async () => {
    const result = await plugin.capabilityExceedLimit(ctx, inputs, "configurableTab");
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.isTrue(result.value);
    }
  });

  it("Add static tab capability", async () => {
    const fileContent: Map<string, any> = new Map();
    sandbox.stub(fs, "writeFile").callsFake(async (filePath: number | PathLike, data: any) => {
      fileContent.set(path.normalize(filePath.toString()), data);
    });

    sandbox.stub(fs, "readJson").callsFake(async (filePath: string) => {
      const content = fileContent.get(path.normalize(filePath));
      if (content) {
        return JSON.parse(content);
      } else {
        return await fs.readJSON(path.normalize(filePath));
      }
    });

    const capabilities = [{ name: "staticTab" as const }];
    const addCapabilityResult = await plugin.addCapabilities(
      ctx,
      inputsWithStaticTabs,
      capabilities
    );
    chai.assert.isTrue(addCapabilityResult.isOk());

    const loadedManifestTemplate = await plugin.loadManifest(ctx, inputsWithStaticTabs);
    chai.assert.isTrue(loadedManifestTemplate.isOk());

    if (loadedManifestTemplate.isOk()) {
      chai.assert.equal(loadedManifestTemplate.value.remote.staticTabs!.length, 2);

      chai.assert.equal(loadedManifestTemplate.value.remote.staticTabs![1].entityId, "index1");
    }
  });

  it("Add notification bot capability", async () => {
    sandbox.stub(process, "env").value({
      BOT_NOTIFICATION_ENABLED: "true",
    });
    const fileContent: Map<string, any> = new Map();
    sandbox.stub(fs, "writeFile").callsFake(async (filePath: number | PathLike, data: any) => {
      fileContent.set(path.normalize(filePath.toString()), data);
    });

    sandbox.stub(fs, "readJson").callsFake(async (filePath: string) => {
      const content = fileContent.get(path.normalize(filePath));
      if (content) {
        return JSON.parse(content);
      } else {
        return await fs.readJSON(path.normalize(filePath));
      }
    });

    const capabilities = [{ name: "Bot" as const }];
    inputs[AzureSolutionQuestionNames.Scenarios] = [BotScenario.NotificationBot];
    inputs[QuestionNames.BOT_HOST_TYPE_TRIGGER] = [AppServiceOptionItem.id];
    const addCapabilityResult = await plugin.addCapabilities(ctx, inputs, capabilities);
    chai.assert.isTrue(addCapabilityResult.isOk());

    const loadedManifestTemplate = await plugin.loadManifest(ctx, inputs);
    chai.assert.isTrue(loadedManifestTemplate.isOk());

    if (loadedManifestTemplate.isOk()) {
      chai.assert.equal(loadedManifestTemplate.value.remote.bots?.length, 2);
      chai.assert.isUndefined(loadedManifestTemplate.value.remote.bots?.[1].commandLists);
    }
  });

  it("Add command and response bot capability", async () => {
    sandbox.stub(process, "env").value({
      BOT_NOTIFICATION_ENABLED: "true",
    });
    const fileContent: Map<string, any> = new Map();
    sandbox.stub(fs, "writeFile").callsFake(async (filePath: number | PathLike, data: any) => {
      fileContent.set(path.normalize(filePath.toString()), data);
    });

    sandbox.stub(fs, "readJson").callsFake(async (filePath: string) => {
      const content = fileContent.get(path.normalize(filePath));
      if (content) {
        return JSON.parse(content);
      } else {
        return await fs.readJSON(path.normalize(filePath));
      }
    });

    const capabilities = [{ name: "Bot" as const }];
    inputs[AzureSolutionQuestionNames.Scenarios] = [BotScenario.CommandAndResponseBot];
    const addCapabilityResult = await plugin.addCapabilities(ctx, inputs, capabilities);
    chai.assert.isTrue(addCapabilityResult.isOk());

    const loadedManifestTemplate = await plugin.loadManifest(ctx, inputs);
    chai.assert.isTrue(loadedManifestTemplate.isOk());

    if (loadedManifestTemplate.isOk()) {
      chai.assert.equal(loadedManifestTemplate.value.remote.bots?.length, 2);
      chai.assert.equal(
        loadedManifestTemplate.value.remote.bots?.[1].commandLists?.[0].commands?.[0].title,
        "helloWorld"
      );
    }
  });
});

describe("Update capability", () => {
  const sandbox = sinon.createSandbox();
  let plugin: AppStudioPluginV3;
  let ctx: v2.Context;
  let inputs: v2.InputsWithProjectPath;
  let inputsWithStaticTabs: v2.InputsWithProjectPath;

  beforeEach(async () => {
    plugin = new AppStudioPluginV3();
    ctx = {
      cryptoProvider: new LocalCrypto(""),
      userInteraction: new MockUserInteraction(),
      logProvider: new MockedLogProvider(),
      telemetryReporter: new MockedTelemetryReporter(),
      projectSetting: {
        appName: "test",
        projectId: "",
        solutionSettings: {
          name: "",
          activeResourcePlugins: [plugin.name],
        },
      },
    };
    inputs = {
      platform: Platform.VSCode,
      projectPath: getAzureProjectRoot(),
    };
    inputsWithStaticTabs = {
      platform: Platform.VSCode,
      projectPath: getAzureProjectRootWithStaticTabs(),
    };

    sandbox.stub(fs, "writeFile").callsFake(async (filePath: number | PathLike, data: any) => {});
  });

  afterEach(async () => {
    sandbox.restore();
  });

  it("Update static tab should succeed", async () => {
    const tab: IStaticTab = {
      entityId: "index",
      scopes: ["personal", "team"],
    };
    const result = await plugin.updateCapability(ctx, inputsWithStaticTabs, {
      name: "staticTab",
      snippet: tab,
    });
    chai.assert.isTrue(result.isOk());
  });

  it("Update static tab should failed with StaticTabNotExistError", async () => {
    const tab: IStaticTab = {
      entityId: "index2",
      scopes: ["personal", "team"],
    };
    const result = await plugin.updateCapability(ctx, inputs, {
      name: "staticTab",
      snippet: tab,
    });
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, AppStudioError.StaticTabNotExistError.name);
    }
  });

  it("Update configurable tab should succeed", async () => {
    const tab: IConfigurableTab = {
      configurationUrl: "endpoint",
      scopes: ["team", "groupchat"],
    };
    const result = await plugin.updateCapability(ctx, inputs, {
      name: "configurableTab",
      snippet: tab,
    });
    chai.assert.isTrue(result.isOk());
  });

  it("Update bot should failed", async () => {
    const bot: IBot = {
      botId: uuid.v4(),
      scopes: ["team", "groupchat"],
    };
    const result = await plugin.updateCapability(ctx, inputsWithStaticTabs, {
      name: "Bot",
      snippet: bot,
    });
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, AppStudioError.CapabilityNotExistError.name);
    }
  });
});

describe("Delete capability", () => {
  const sandbox = sinon.createSandbox();
  let plugin: AppStudioPluginV3;
  let ctx: v2.Context;
  let inputs: v2.InputsWithProjectPath;
  let inputsWithStaticTabs: v2.InputsWithProjectPath;

  beforeEach(async () => {
    plugin = new AppStudioPluginV3();
    ctx = {
      cryptoProvider: new LocalCrypto(""),
      userInteraction: new MockUserInteraction(),
      logProvider: new MockedLogProvider(),
      telemetryReporter: new MockedTelemetryReporter(),
      projectSetting: {
        appName: "test",
        projectId: "",
        solutionSettings: {
          name: "",
          activeResourcePlugins: [plugin.name],
        },
      },
    };
    inputs = {
      platform: Platform.VSCode,
      projectPath: getAzureProjectRoot(),
    };
    inputsWithStaticTabs = {
      platform: Platform.VSCode,
      projectPath: getAzureProjectRootWithStaticTabs(),
    };

    sandbox.stub(fs, "writeFile").callsFake(async (filePath: number | PathLike, data: any) => {});
  });

  afterEach(async () => {
    sandbox.restore();
  });

  it("Delete static tab should succeed", async () => {
    const tab: IStaticTab = {
      entityId: "index",
      scopes: ["personal", "team"],
    };
    const result = await plugin.deleteCapability(ctx, inputsWithStaticTabs, {
      name: "staticTab",
      snippet: tab,
    });
    chai.assert.isTrue(result.isOk());
  });

  it("Delete static tab should failed with StaticTabNotExistError", async () => {
    const tab: IStaticTab = {
      entityId: "index2",
      scopes: ["personal", "team"],
    };
    const result = await plugin.deleteCapability(ctx, inputsWithStaticTabs, {
      name: "staticTab",
      snippet: tab,
    });
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, AppStudioError.StaticTabNotExistError.name);
    }
  });

  it("Delete configurable tab should succeed", async () => {
    const result = await plugin.deleteCapability(ctx, inputs, {
      name: "configurableTab",
    });
    chai.assert.isTrue(result.isOk());
  });

  it("Delete bot should failed", async () => {
    const result = await plugin.deleteCapability(ctx, inputsWithStaticTabs, {
      name: "Bot",
    });
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, AppStudioError.CapabilityNotExistError.name);
    }
  });
});
