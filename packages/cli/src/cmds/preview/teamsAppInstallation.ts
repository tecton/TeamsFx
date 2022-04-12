// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import { LogLevel, OptionItem, SingleSelectConfig } from "@microsoft/teamsfx-api";

import graphLoginInstance, { GraphLogin } from "../../commonlib/graphLogin";
import { GetTeamsAppInstallationFailed, M365AccountInfoNotFound } from "./errors";
import CLIUIInstance from "../../userInteraction";
import { installApp } from "./constants";
import cliLogger from "../../commonlib/log";
import * as constants from "./constants";
import { openHubWebClient } from "./launch";
import open from "open";

const installOptionItem: OptionItem = {
  id: installApp.installInTeams,
  label: installApp.installInTeams,
  description: installApp.installInTeamsDescription,
  detail: installApp.installInTeamsDescription,
};

const configureOutlookOptionItem: OptionItem = {
  id: installApp.bot.configureOutlook,
  label: installApp.bot.configureOutlook,
  description: installApp.bot.configureOutlookDescription,
  detail: installApp.bot.configureOutlookDescription,
};

const continueOptionItem: OptionItem = {
  id: installApp.continue,
  label: installApp.continue,
  description: installApp.continueDescription,
  detail: installApp.continueDescription,
};

const cancelOptionItem: OptionItem = {
  id: installApp.cancel,
  label: installApp.cancel,
  description: installApp.cancelDescription,
  detail: installApp.cancelDescription,
};

const installAppSingleSelect: SingleSelectConfig = {
  name: installApp.installAppTitle,
  title: installApp.installAppTitle,
  options: [],
};

export async function showInstallAppInTeamsMessage(
  detected: boolean,
  tenantIdFromConfig: string,
  appId: string,
  botId: string | undefined,
  browser: constants.Browser,
  browserArguments: string[]
): Promise<boolean> {
  const messages = botId
    ? [
        installApp.bot.description,
        installApp.bot.guide1,
        installApp.bot.guide2,
        installApp.bot.finish,
      ]
    : [installApp.description, installApp.guide, installApp.finish];
  const message = messages.join("\n");
  cliLogger.necessaryLog(LogLevel.Warning, message);
  installAppSingleSelect.options = [installOptionItem];
  if (botId) {
    (installAppSingleSelect.options as OptionItem[]).push(configureOutlookOptionItem);
  }
  (installAppSingleSelect.options as OptionItem[]).push(continueOptionItem, cancelOptionItem);
  const result = await CLIUIInstance.selectOption(installAppSingleSelect);
  if (result.isOk()) {
    if (result.value.result === cancelOptionItem.id) {
      return false;
    } else if (result.value.result === installOptionItem.id) {
      await openHubWebClient(
        true,
        tenantIdFromConfig,
        appId,
        constants.Hub.teams,
        browser,
        browserArguments
      );
      return await showInstallAppInTeamsMessage(
        false,
        tenantIdFromConfig,
        appId,
        botId,
        browser,
        browserArguments
      );
    } else if (result.value.result === configureOutlookOptionItem.id) {
      const url = `https://dev.botframework.com/bots/channels?id=${botId}&channelId=outlook`;
      await open(url);
      return await showInstallAppInTeamsMessage(
        false,
        tenantIdFromConfig,
        appId,
        botId,
        browser,
        browserArguments
      );
    } else if (result.value.result === continueOptionItem.id) {
      const internalId = await getTeamsAppInternalId(appId);
      return internalId === undefined
        ? await showInstallAppInTeamsMessage(
            true,
            tenantIdFromConfig,
            appId,
            botId,
            browser,
            browserArguments
          )
        : true;
    }
  }
  return false;
}

export async function getTeamsAppInternalId(appId: string): Promise<string | undefined> {
  // TODO: handle GraphTokenProviderUserPassword
  const loginStatus = await (graphLoginInstance as GraphLogin).getStatus();
  if (loginStatus.accountInfo?.oid === undefined || loginStatus.token === undefined) {
    throw M365AccountInfoNotFound();
  }
  const url = `https://graph.microsoft.com/v1.0/users/${loginStatus.accountInfo.oid}/teamwork/installedApps?$expand=teamsApp,teamsAppDefinition&$filter=teamsApp/externalId eq '${appId}'`;
  let numRetries = 3;
  while (numRetries > 0) {
    try {
      --numRetries;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${loginStatus.token}` },
      });
      for (const teamsAppInstallation of response.data.value) {
        if (teamsAppInstallation.teamsApp.distributionMethod === "sideloaded") {
          return teamsAppInstallation.teamsApp.id;
        }
      }
      return undefined;
    } catch (error: any) {
      if (numRetries === 0) {
        throw GetTeamsAppInstallationFailed(error);
      }
      await delay(1000);
    }
  }
}

function delay(ms: number) {
  // tslint:disable-next-line no-string-based-set-timeout
  return new Promise((resolve) => setTimeout(resolve, ms));
}
