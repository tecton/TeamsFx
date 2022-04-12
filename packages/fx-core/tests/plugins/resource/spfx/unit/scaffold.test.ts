// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import "mocha";
import fs from "fs-extra";
import * as path from "path";
import { expect } from "chai";
import { SpfxPlugin } from "../../../../../src/plugins/resource/spfx";
import * as sinon from "sinon";
import { Utils } from "../../../../../src/plugins/resource/spfx/utils/utils";
import { TestHelper } from "../helper";
import { YoChecker } from "../../../../../src/plugins/resource/spfx/depsChecker/yoChecker";
import { GeneratorChecker } from "../../../../../src/plugins/resource/spfx/depsChecker/generatorChecker";
import { cpUtils } from "../../../../../src/plugins/solution/fx-solution/utils/depsChecker/cpUtils";
import * as uuid from "uuid";
import { DefaultManifestProvider } from "../../../../../src/plugins/solution/fx-solution/v3/addFeature";
import { ok, Void } from "@microsoft/teamsfx-api";

describe("SPFxScaffold", function () {
  const testFolder = path.resolve("./tmp");
  const subFolderName = "SPFx";
  const appName = "spfxApp";
  let plugin: SpfxPlugin;

  beforeEach(async () => {
    plugin = new SpfxPlugin();
    await fs.ensureDir(testFolder);
    sinon.stub(Utils, "configure");
    sinon.stub(fs, "stat").resolves();
    sinon.stub(YoChecker.prototype, "isInstalled").resolves(true);
    sinon.stub(GeneratorChecker.prototype, "isInstalled").resolves(true);
    sinon.stub(cpUtils, "executeCommand").resolves("succeed");
    const manifestId = uuid.v4();
    sinon.stub(fs, "readFile").resolves(new Buffer(`{"id": "${manifestId}"}`));
    sinon.stub(fs, "writeFile").resolves();
    sinon.stub(fs, "rename").resolves();
    sinon.stub(fs, "copyFile").resolves();
    sinon.stub(fs, "remove").resolves();
    sinon.stub(DefaultManifestProvider.prototype, "updateCapability").resolves(ok(Void));
  });

  it("scaffold SPFx project without framework", async function () {
    const pluginContext = TestHelper.getFakePluginContext(appName, testFolder, "none");
    const result = await plugin.postScaffold(pluginContext);
    expect(result.isOk()).to.eq(true);
  });

  it("scaffold SPFx project with react framework", async function () {
    const pluginContext = TestHelper.getFakePluginContext(appName, testFolder, "react");
    const result = await plugin.postScaffold(pluginContext);

    expect(result.isOk()).to.eq(true);
  });

  it("scaffold SPFx project with extremely long webpart name", async function () {
    const pluginContext = TestHelper.getFakePluginContext(
      appName,
      testFolder,
      "react",
      "extremelylongextremelylongextremelylongextremelylongspfxwebpartname"
    );

    const result = await plugin.postScaffold(pluginContext);
    expect(result.isOk()).to.eq(true);
  });

  afterEach(async () => {
    sinon.restore();
    await fs.remove(testFolder);
  });
});
