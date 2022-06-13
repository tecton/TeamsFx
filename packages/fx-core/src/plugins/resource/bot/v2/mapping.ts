// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform } from "@microsoft/teamsfx-api";
import { ServiceType } from "../../../../common/azure-hosting/interfaces";
import { TemplateProjectsScenarios } from "../constants";
import {
  FunctionsHttpTriggerOptionItem,
  FunctionsTimerTriggerOptionItem,
  AppServiceOptionItem,
  AppServiceOptionItemForVS,
} from "../question";
import { HostTypes } from "../resources/strings";
import { BicepModules, ProgrammingLanguage, Runtime } from "./enum";

const runtimeMap: Map<ProgrammingLanguage, Runtime> = new Map<ProgrammingLanguage, Runtime>([
  [ProgrammingLanguage.Js, Runtime.Node],
  [ProgrammingLanguage.Ts, Runtime.Node],
  [ProgrammingLanguage.Csharp, Runtime.Dotnet],
]);

const serviceMap: Map<string, ServiceType> = new Map<string, ServiceType>([
  [HostTypes.APP_SERVICE, ServiceType.AppService],
  [HostTypes.AZURE_FUNCTIONS, ServiceType.Functions],
]);

const langMap: Map<string, ProgrammingLanguage> = new Map<string, ProgrammingLanguage>([
  ["javascript", ProgrammingLanguage.Js],
  ["typescript", ProgrammingLanguage.Ts],
  ["csharp", ProgrammingLanguage.Csharp],
]);

const triggerScenariosMap: Map<string, string[]> = new Map<string, string[]>([
  [
    FunctionsHttpTriggerOptionItem.id,
    [
      TemplateProjectsScenarios.NOTIFICATION_FUNCTION_BASE_SCENARIO_NAME,
      TemplateProjectsScenarios.NOTIFICATION_FUNCTION_TRIGGER_HTTP_SCENARIO_NAME,
    ],
  ],
  [
    FunctionsTimerTriggerOptionItem.id,
    [
      TemplateProjectsScenarios.NOTIFICATION_FUNCTION_BASE_SCENARIO_NAME,
      TemplateProjectsScenarios.NOTIFICATION_FUNCTION_TRIGGER_TIMER_SCENARIO_NAME,
    ],
  ],
  [AppServiceOptionItem.id, [TemplateProjectsScenarios.NOTIFICATION_RESTIFY_SCENARIO_NAME]],
  [AppServiceOptionItemForVS.id, [TemplateProjectsScenarios.NOTIFICATION_WEBAPI_SCENARIO_NAME]],
]);

const PlatformRuntimeMap: Map<Platform, Runtime> = new Map<Platform, Runtime>([
  [Platform.VS, Runtime.Dotnet],
  [Platform.VSCode, Runtime.Node],
  [Platform.CLI, Runtime.Node],
  [Platform.CLI_HELP, Runtime.Node],
]);

const invalidInputMsg = "Invalid bot input";

export const moduleMap: { [key: string]: string } = {
  [ServiceType.Functions]: BicepModules.Functions,
};

export function getPlatformRuntime(platform: Platform): Runtime {
  const runtime = PlatformRuntimeMap.get(platform);
  if (runtime) {
    return runtime;
  }
  throw new Error(invalidInputMsg);
}

export function getRuntime(lang: ProgrammingLanguage): Runtime {
  const runtime = runtimeMap.get(lang);
  if (runtime) {
    return runtime;
  }
  throw new Error(invalidInputMsg);
}

export function getServiceType(hostType?: string): ServiceType {
  const serviceType = serviceMap.get(hostType ?? "");
  if (serviceType) {
    return serviceType;
  }
  throw new Error(invalidInputMsg);
}

export function getLanguage(lang?: string): ProgrammingLanguage {
  const language = langMap.get(lang?.toLowerCase() ?? "");
  if (language) {
    return language;
  }
  throw new Error(invalidInputMsg);
}

export function getTriggerScenarios(trigger: string): string[] {
  const scenarios = triggerScenariosMap.get(trigger);
  if (scenarios) {
    return scenarios;
  }
  throw new Error(invalidInputMsg);
}
