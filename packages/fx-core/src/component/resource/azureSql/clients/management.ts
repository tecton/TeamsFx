// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SqlManagementClient, SqlManagementModels } from "@azure/arm-sql";
import axios from "axios";
import { ErrorMessage } from "../errors";
import { Constants } from "../constants";
import { SqlResultFactory } from "../results";
import { AzureAccountProvider } from "@microsoft/teamsfx-api";
import { ManagementConfig } from "../types";

export class ManagementClient {
  manager: SqlManagementClient;
  config: ManagementConfig;
  totalFirewallRuleCount = 0;

  private constructor(manager: SqlManagementClient, config: ManagementConfig) {
    this.manager = manager;
    this.config = config;
  }

  public static async create(
    azureAccountProvider: AzureAccountProvider,
    config: ManagementConfig
  ): Promise<ManagementClient> {
    const credential = await azureAccountProvider.getAccountCredentialAsync();
    const manager = new SqlManagementClient(credential!, config.azureSubscriptionId);
    return new ManagementClient(manager, config);
  }

  async existAzureSQL(): Promise<boolean> {
    try {
      const result = await this.manager.servers.checkNameAvailability({
        name: this.config.sqlServer,
      });
      if (result.available) {
        return false;
      } else {
        return true;
      }
    } catch (error) {
      throw SqlResultFactory.SystemError(
        ErrorMessage.SqlCheckError.name,
        ErrorMessage.SqlCheckError.message(this.config.sqlEndpoint, error.message),
        error
      );
    }
  }

  async existAadAdmin(aadAdmin: string): Promise<boolean> {
    try {
      const result = await this.manager.serverAzureADAdministrators.listByServer(
        this.config.resourceGroup,
        this.config.sqlServer
      );
      if (result.find((item: { login: string }) => item.login === aadAdmin)) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      throw SqlResultFactory.UserError(
        ErrorMessage.SqlCheckAdminError.name,
        ErrorMessage.SqlCheckAdminError.message(this.config.sqlServer, error.message),
        error
      );
    }
  }

  async addAADadmin(tenantId: string, aadAdminObjectId: string, aadAdmin: string): Promise<void> {
    let model: SqlManagementModels.ServerAzureADAdministrator = {
      tenantId: tenantId,
      sid: aadAdminObjectId,
      login: aadAdmin,
    };
    const tmp: any = model;
    tmp.administratorType = Constants.sqlAdministratorType;
    model = tmp as unknown as SqlManagementModels.ServerAzureADAdministrator;
    try {
      await this.manager.serverAzureADAdministrators.createOrUpdate(
        this.config.resourceGroup,
        this.config.sqlServer,
        model
      );
    } catch (error) {
      throw SqlResultFactory.UserError(
        ErrorMessage.SqlAddAdminError.name,
        ErrorMessage.SqlAddAdminError.message(aadAdmin, error.message),
        error
      );
    }
  }

  async addLocalFirewallRule(): Promise<void> {
    try {
      const response = await axios.get(Constants.echoIpAddress);
      const localIp: string = response.data;
      const partials: string[] = localIp.split(".");

      partials[2] = Constants.ipBeginToken;
      partials[3] = Constants.ipBeginToken;
      const startIp: string = partials.join(".");

      partials[2] = Constants.ipEndToken;
      partials[3] = Constants.ipEndToken;
      const endIp: string = partials.join(".");
      const model: SqlManagementModels.FirewallRule = {
        startIpAddress: startIp,
        endIpAddress: endIp,
      };
      const ruleName = this.getRuleName(this.totalFirewallRuleCount);
      await this.manager.firewallRules.createOrUpdate(
        this.config.resourceGroup,
        this.config.sqlServer,
        ruleName,
        model
      );
      this.totalFirewallRuleCount++;
    } catch (error) {
      throw SqlResultFactory.UserError(
        ErrorMessage.SqlLocalFirwallError.name,
        ErrorMessage.SqlLocalFirwallError.message(this.config.sqlEndpoint, error.message),
        error
      );
    }
  }

  async deleteLocalFirewallRule(): Promise<void> {
    try {
      await Promise.all(
        Array.from(Array(this.totalFirewallRuleCount).keys()).map(async (i: number) => {
          const ruleName = this.getRuleName(i);
          await this.manager.firewallRules.deleteMethod(
            this.config.resourceGroup,
            this.config.sqlServer,
            ruleName
          );
        })
      );
    } catch (error) {
      throw SqlResultFactory.UserError(
        ErrorMessage.SqlDeleteLocalFirwallError.name,
        ErrorMessage.SqlDeleteLocalFirwallError.message(this.config.sqlEndpoint, error.message),
        error
      );
    }
  }

  getRuleName(suffix: number): string {
    return Constants.firewall.localRule + suffix;
  }

  async delay(s: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, s * 1000));
  }
}
