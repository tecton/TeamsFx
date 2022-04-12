// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import * as arm from "azure-arm-resource";
import * as msRestAzure from "ms-rest-azure";

import * as azureConfig from "../../src/commonlib/common/userPasswordConfig";

const user = azureConfig.AZURE_ACCOUNT_NAME || "";
const password = azureConfig.AZURE_ACCOUNT_PASSWORD || "";
const subscriptionId = azureConfig.AZURE_SUBSCRIPTION_ID || "";

function delay(ms: number) {
  // tslint:disable-next-line no-string-based-set-timeout
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export class ResourceGroupManager {
  private static client?: arm.ResourceManagementClient.ResourceManagementClient;

  private constructor() {
    ResourceGroupManager.client = undefined;
  }

  private static async init() {
    if (!ResourceGroupManager.client) {
      const c = await msRestAzure.loginWithUsernamePassword(user, password, {
        domain: azureConfig.AZURE_TENANT_ID,
      });
      ResourceGroupManager.client = new arm.ResourceManagementClient.ResourceManagementClient(
        c,
        subscriptionId
      );
    }
  }

  public static async getResourceGroup(name: string) {
    await ResourceGroupManager.init();
    return ResourceGroupManager.client!.resourceGroups.get(name);
  }

  public static async hasResourceGroup(name: string): Promise<boolean> {
    await ResourceGroupManager.init();
    try {
      await this.getResourceGroup(name);
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  public static async searchResourceGroups(contain: string) {
    await ResourceGroupManager.init();
    const groups = await ResourceGroupManager.client!.resourceGroups.list();
    return groups.filter((group) => group.name?.includes(contain));
  }

  public static async deleteResourceGroup(name: string, retryTimes = 5): Promise<boolean> {
    await ResourceGroupManager.init();
    return new Promise<boolean>(async (resolve) => {
      for (let i = 0; i < retryTimes; ++i) {
        try {
          await ResourceGroupManager.client!.resourceGroups.deleteMethod(name);
          return resolve(true);
        } catch (e) {
          await delay(2000);
          if (i < retryTimes - 1) {
            console.warn(`[Retry] clean up the Azure resoure group failed with name: ${name}`);
          }
        }
      }
      return resolve(false);
    });
  }

  public static async createOrUpdateResourceGroup(
    name: string,
    location: string
  ): Promise<boolean> {
    await ResourceGroupManager.init();
    return new Promise<boolean>(async (resolve) => {
      try {
        const resourceGroup: arm.ResourceModels.ResourceGroup = {
          location: location,
          name: name,
        };
        await ResourceGroupManager.client!.resourceGroups.createOrUpdate(name, resourceGroup);
        return resolve(true);
      } catch (e) {
        console.error(
          `Failed to create or update resource group ${name}. Error message: ${e.message}`
        );
        return resolve(false);
      }
    });
  }
}
