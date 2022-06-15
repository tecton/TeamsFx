// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import { FxResult } from "../result";
import * as fs from "fs-extra";
import { FileSystemError, InternalError, NoProjectOpenedError } from "../errors";
import { TemplateKind } from "./enums";
import path from "path";
import Mustache from "mustache";
import { getTemplatesFolder } from "../../../../folder";
import { Context } from "@microsoft/teamsfx-api/build/v2";
import { generateBuildScript } from "../utils/buildScripts";
import { convertToAlphanumericOnly } from "../../../../common/utils";

export class CICDProvider {
  public scaffoldTo = "";
  public providerName = "";
  public sourceTemplateName?: (templateName: string) => string;
  public targetTemplateName?: (templateName: string, envName: string) => string;
  public async scaffold(
    projectPath: string,
    templateName: string,
    envName: string,
    context: Context
  ): Promise<FxResult> {
    // 0. Preconditions check.
    if (!(await fs.pathExists(projectPath))) {
      throw new NoProjectOpenedError();
    }
    if (!Object.values<string>(TemplateKind).includes(templateName)) {
      throw new InternalError([
        `${templateName} as template kind was not recognized.`,
        `${templateName} as template kind was not recognized.`,
      ]);
    }
    if (!this.sourceTemplateName || !this.targetTemplateName) {
      throw new InternalError([
        "sourceTemplateName or targetTemplateName shoudn't be undefined.",
        "sourceTemplateName or targetTemplateName shoudn't be undefined.",
      ]);
    }

    // 1. Ensure the target path is existing.
    const targetPath = path.join(projectPath, this.scaffoldTo);
    try {
      await fs.ensureDir(targetPath);
    } catch (e) {
      throw new FileSystemError(
        [`Fail to create path: ${targetPath}`, `Fail to create path: ${targetPath}`],
        e as Error
      );
    }

    // 2. Generate README file.
    const targetReadMePath = path.join(targetPath, "README.md");
    if (!(await fs.pathExists(targetReadMePath))) {
      const localReadMePath = path.join(
        getTemplatesFolder(),
        "plugins",
        "resource",
        "cicd",
        this.providerName,
        "README.md"
      );

      try {
        await fs.copyFile(localReadMePath, targetReadMePath);
      } catch (e) {
        throw new FileSystemError(
          [`Fail to write file: ${targetReadMePath}`, `Fail to write file: ${targetReadMePath}`],
          e as Error
        );
      }
    }

    // 3. Generate template file.
    const hostType = context.projectSetting.solutionSettings?.hostType;
    const replacements = {
      env_name: envName,
      build_script: generateBuildScript(context.projectSetting),
      hosting_type_contains_spfx: hostType === "SPFx",
      hosting_type_contains_azure: hostType === "Azure",
      cloud_resources_contains_sql:
        context.projectSetting.solutionSettings?.["azureResources"].includes("sql") ?? false,
      api_prefix: convertToAlphanumericOnly(context.projectSetting.appName),
      cloud_resources_contains_apim:
        context.projectSetting.solutionSettings?.["azureResources"].includes("apim") ?? false,
    };

    const targetTemplatePath = path.join(
      targetPath,
      this.targetTemplateName(templateName, envName)
    );
    if (!(await fs.pathExists(targetTemplatePath))) {
      const localTemplatePath = path.join(
        getTemplatesFolder(),
        "plugins",
        "resource",
        "cicd",
        this.providerName,
        this.sourceTemplateName(templateName)
      );
      const templateContent = await this.readLocalFile(localTemplatePath);
      const renderedContent = Mustache.render(templateContent, replacements);
      try {
        await fs.writeFile(targetTemplatePath, renderedContent);
      } catch (e) {
        throw new FileSystemError(
          [
            `Fail to write file: ${targetTemplatePath}`,
            `Fail to write file: ${targetTemplatePath}`,
          ],
          e as Error
        );
      }
    } else {
      return ok(true); // indicate that the template is existing before this scaffold.
    }

    return ok(false); // indicate it's newly scaffolded template.
  }

  public async readLocalFile(localPath: string): Promise<string> {
    if (!(await fs.pathExists(localPath))) {
      throw new InternalError([
        `local path: ${localPath} not found.`,
        `local path: ${localPath} not found.`,
      ]);
    }

    try {
      return (await fs.readFile(localPath)).toString();
    } catch (e) {
      throw new FileSystemError(
        [`Fail to read file: ${localPath}`, `Fail to read file: ${localPath}`],
        e as Error
      );
    }
  }
}
