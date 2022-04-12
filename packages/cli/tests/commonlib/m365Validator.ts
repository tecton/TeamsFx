// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import path from "path";
import {
  AppPackageFolderName,
  ConfigFolderName,
  InputConfigsFolderName,
  ProjectSettingsFileName,
  TemplateFolderName,
} from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as chai from "chai";
import { isConfigUnifyEnabled } from "@microsoft/teamsfx-core";

const m365ManifestSchema =
  "https://raw.githubusercontent.com/OfficeDev/microsoft-teams-app-schema/preview/DevPreview/MicrosoftTeams.schema.json";
const m365ManifestVersion = "m365DevPreview";

export class M365Validator {
  public static async validateProjectSettings(projectPath: string) {
    const projectSettingsPath = path.join(
      projectPath,
      `.${ConfigFolderName}`,
      InputConfigsFolderName,
      ProjectSettingsFileName
    );
    const exists = await fs.pathExists(projectSettingsPath);
    chai.assert.isTrue(exists);
    const result = await fs.readJson(projectSettingsPath);
    chai.assert.isTrue(result.isM365);
  }

  public static async validateManifest(projectPath: string) {
    if (isConfigUnifyEnabled()) {
      await M365Validator.validateManifestFile(
        path.join(projectPath, TemplateFolderName, AppPackageFolderName, "manifest.template.json")
      );
    } else {
      await M365Validator.validateManifestFile(
        path.join(
          projectPath,
          TemplateFolderName,
          AppPackageFolderName,
          "manifest.local.template.json"
        )
      );
      await M365Validator.validateManifestFile(
        path.join(
          projectPath,
          TemplateFolderName,
          AppPackageFolderName,
          "manifest.remote.template.json"
        )
      );
    }
  }

  private static async validateManifestFile(manifestPath: string) {
    const exists = await fs.pathExists(manifestPath);
    chai.assert.isTrue(exists);
    const result = await fs.readJson(manifestPath);
    chai.assert.equal(result.$schema, m365ManifestSchema);
    chai.assert.equal(result.manifestVersion, m365ManifestVersion);
  }
}
