// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { it } from "mocha";
import { TeamsAppSolution } from " ../../../src/plugins/solution";
import {
  SolutionContext,
  Platform,
  ok,
  PluginContext,
  Result,
  FxError,
  err,
  M365TokenProvider,
} from "@microsoft/teamsfx-api";
import {
  GLOBAL_CONFIG,
  PluginNames,
  REMOTE_TEAMS_APP_TENANT_ID,
  SolutionError,
  SOLUTION_PROVISION_SUCCEEDED,
} from "../../../src/plugins/solution/fx-solution/constants";
import {
  HostTypeOptionAzure,
  HostTypeOptionSPFx,
} from "../../../src/plugins/solution/fx-solution/question";
import * as uuid from "uuid";
import sinon from "sinon";
import { EnvConfig, MockM365TokenProvider } from "../resource/apim/testUtil";
import { CollaborationState } from "../../../src/common/permissionInterface";
import { newEnvInfo } from "../../../src";
import { LocalCrypto } from "../../../src/core/crypto";
import { CollaborationUtil } from "../../../src/plugins/solution/fx-solution/v2/collaborationUtil";
import { aadPlugin, appStudioPlugin } from "../../constants";
import { UserError } from "../../../../api/src/error";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("grantPermission() for Teamsfx projects", () => {
  const sandbox = sinon.createSandbox();
  const mockProjectTenantId = "mock_project_tenant_id";

  function mockSolutionContext(): SolutionContext {
    const mockM365TokenProvider = new MockM365TokenProvider(
      mockProjectTenantId,
      EnvConfig.servicePrincipalClientId,
      EnvConfig.servicePrincipalClientSecret
    );
    return {
      root: ".",
      envInfo: newEnvInfo(),
      answers: { platform: Platform.VSCode, email: "your_collaborator@yourcompany.com" },
      projectSettings: undefined,
      m365TokenProvider: mockM365TokenProvider,
      cryptoProvider: new LocalCrypto(""),
    };
  }

  afterEach(() => {
    sandbox.restore();
  });

  it("should return NotProvisioned state if Teamsfx project hasn't been provisioned", async () => {
    const solution = new TeamsAppSolution();
    const mockedCtx = mockSolutionContext();

    mockedCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
      },
    };
    sandbox.stub(mockedCtx.m365TokenProvider as M365TokenProvider, "getJsonObject").resolves(
      ok({
        tid: "fake_tid",
        oid: "fake_oid",
        unique_name: "fake_unique_name",
        name: "fake_name",
      })
    );

    const result = await solution.grantPermission(mockedCtx);
    expect(result.isErr()).to.be.false;
    if (!result.isErr()) {
      expect(result.value.state).equals(CollaborationState.NotProvisioned);
    }
  });

  it("should return error if cannot get current user info", async () => {
    const solution = new TeamsAppSolution();
    const mockedCtx = mockSolutionContext();

    mockedCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
      },
    };
    mockedCtx.envInfo.state.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, true);

    sandbox
      .stub(mockedCtx.m365TokenProvider as M365TokenProvider, "getJsonObject")
      .resolves(err(new UserError("source", "FailedToRetrieveUserInfo", "message")));

    const result = await solution.grantPermission(mockedCtx);
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.FailedToRetrieveUserInfo);
  });

  it("should return M365TenantNotMatch state if tenant is not match", async () => {
    const solution = new TeamsAppSolution();
    const mockedCtx = mockSolutionContext();

    mockedCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
      },
    };
    mockedCtx.envInfo.state.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, true);

    sandbox.stub(mockedCtx.m365TokenProvider as M365TokenProvider, "getJsonObject").resolves(
      ok({
        tid: "fake_tid",
        oid: "fake_oid",
        unique_name: "fake_unique_name",
        name: "fake_name",
      })
    );

    mockedCtx.envInfo.state
      .get(PluginNames.SOLUTION)
      ?.set(REMOTE_TEAMS_APP_TENANT_ID, mockProjectTenantId);

    const result = await solution.grantPermission(mockedCtx);
    expect(result.isErr()).to.be.false;
    if (!result.isErr()) {
      expect(result.value.state).equals(CollaborationState.M365TenantNotMatch);
    }
  });

  it("should return error if user email is undefined", async () => {
    const solution = new TeamsAppSolution();
    const mockedCtx = mockSolutionContext();

    mockedCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
      },
    };
    mockedCtx.envInfo.state.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, true);
    mockedCtx.answers = {
      email: undefined,
      platform: Platform.VSCode,
    };

    sandbox
      .stub(mockedCtx.m365TokenProvider as M365TokenProvider, "getJsonObject")
      .onCall(0)
      .resolves(
        ok({
          tid: mockProjectTenantId,
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      )
      .onCall(1)
      .resolves(err(new UserError("source", "name", "message")));

    mockedCtx.envInfo.state
      .get(PluginNames.SOLUTION)
      ?.set(REMOTE_TEAMS_APP_TENANT_ID, mockProjectTenantId);

    const result = await solution.grantPermission(mockedCtx);
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.EmailCannotBeEmptyOrSame);
  });

  it("should return error if cannot find user from email", async () => {
    const solution = new TeamsAppSolution();
    const mockedCtx = mockSolutionContext();

    mockedCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
      },
    };
    mockedCtx.envInfo.state.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, true);
    sandbox
      .stub(mockedCtx.m365TokenProvider as M365TokenProvider, "getJsonObject")
      .onCall(0)
      .resolves(
        ok({
          tid: mockProjectTenantId,
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      )
      .onCall(1)
      .resolves(err(new UserError("source", "name", "message")));

    mockedCtx.envInfo.state
      .get(PluginNames.SOLUTION)
      ?.set(REMOTE_TEAMS_APP_TENANT_ID, mockProjectTenantId);

    const result = await solution.grantPermission(mockedCtx);
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.CannotFindUserInCurrentTenant);
  });

  it("should return error if grant permission failed", async () => {
    const solution = new TeamsAppSolution();
    const mockedCtx = mockSolutionContext();

    mockedCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
      },
    };
    mockedCtx.envInfo.state.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, true);

    sandbox
      .stub(mockedCtx.m365TokenProvider as M365TokenProvider, "getJsonObject")
      .onCall(0)
      .resolves(
        ok({
          tid: mockProjectTenantId,
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      )
      .onCall(1)
      .resolves(
        ok({
          tid: mockProjectTenantId,
          oid: "fake_oid_2",
          unique_name: "fake_unique_name_2",
          name: "fake_name_2",
        })
      );

    sandbox
      .stub(CollaborationUtil, "getUserInfo")
      .onCall(0)
      .resolves({
        tenantId: mockProjectTenantId,
        aadId: "aadId",
        userPrincipalName: "userPrincipalName",
        displayName: "displayName",
        isAdministrator: true,
      })
      .onCall(1)
      .resolves({
        tenantId: mockProjectTenantId,
        aadId: "aadId",
        userPrincipalName: "userPrincipalName2",
        displayName: "displayName2",
        isAdministrator: true,
      });

    appStudioPlugin.grantPermission = async function (
      _ctx: PluginContext
    ): Promise<Result<any, FxError>> {
      return err(
        new UserError(
          "AppStudioPlugin",
          SolutionError.FailedToGrantPermission,
          "Grant permission failed."
        )
      );
    };

    aadPlugin.grantPermission = async function (
      _ctx: PluginContext
    ): Promise<Result<any, FxError>> {
      return ok([
        {
          name: "aad_app",
          resourceId: "fake_aad_app_resource_id",
          roles: "Owner",
          type: "M365",
        },
      ]);
    };

    mockedCtx.envInfo.state
      .get(PluginNames.SOLUTION)
      ?.set(REMOTE_TEAMS_APP_TENANT_ID, mockProjectTenantId);

    const result = await solution.grantPermission(mockedCtx);
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.FailedToGrantPermission);
  });

  it("happy path", async () => {
    const solution = new TeamsAppSolution();
    const mockedCtx = mockSolutionContext();

    mockedCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
        activeResourcePlugins: [
          "fx-resource-frontend-hosting",
          "fx-resource-identity",
          "fx-resource-aad-app-for-teams",
          "fx-resource-local-debug",
          "fx-resource-appstudio",
          "fx-resource-simple-auth",
        ],
      },
    };
    mockedCtx.envInfo.state.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, true);

    sandbox
      .stub(CollaborationUtil, "getUserInfo")
      .onCall(0)
      .resolves({
        tenantId: mockProjectTenantId,
        aadId: "aadId",
        userPrincipalName: "userPrincipalName",
        displayName: "displayName",
        isAdministrator: true,
      })
      .onCall(1)
      .resolves({
        tenantId: mockProjectTenantId,
        aadId: "aadId",
        userPrincipalName: "userPrincipalName2",
        displayName: "displayName2",
        isAdministrator: true,
      });

    appStudioPlugin.grantPermission = async function (
      _ctx: PluginContext
    ): Promise<Result<any, FxError>> {
      return ok([
        {
          name: "aad_app",
          resourceId: "fake_aad_app_resource_id",
          roles: "Owner",
          type: "M365",
        },
      ]);
    };

    aadPlugin.grantPermission = async function (
      _ctx: PluginContext
    ): Promise<Result<any, FxError>> {
      return ok([
        {
          name: "teams_app",
          resourceId: "fake_teams_app_resource_id",
          roles: "Administrator",
          type: "M365",
        },
      ]);
    };
    mockedCtx.envInfo.state
      .get(PluginNames.SOLUTION)
      ?.set(REMOTE_TEAMS_APP_TENANT_ID, mockProjectTenantId);

    const result = await solution.grantPermission(mockedCtx);
    if (result.isErr()) {
      chai.assert.fail("result is error");
    }
    expect(result.value.permissions!.length).equal(2);
  });

  it("happy path with spfx project", async () => {
    const solution = new TeamsAppSolution();
    const mockedCtx = mockSolutionContext();

    mockedCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionSPFx.id,
        name: "azure",
        version: "1.0",
        activeResourcePlugins: [
          "fx-resource-spfx",
          "fx-resource-local-debug",
          "fx-resource-appstudio",
        ],
      },
    };
    mockedCtx.envInfo.state.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, true);

    sandbox
      .stub(CollaborationUtil, "getUserInfo")
      .onCall(0)
      .resolves({
        tenantId: mockProjectTenantId,
        aadId: "aadId",
        userPrincipalName: "userPrincipalName",
        displayName: "displayName",
        isAdministrator: true,
      })
      .onCall(1)
      .resolves({
        tenantId: mockProjectTenantId,
        aadId: "aadId",
        userPrincipalName: "userPrincipalName2",
        displayName: "displayName2",
        isAdministrator: true,
      });

    appStudioPlugin.grantPermission = async function (
      _ctx: PluginContext
    ): Promise<Result<any, FxError>> {
      return ok([
        {
          name: "aad_app",
          resourceId: "fake_aad_app_resource_id",
          roles: "Owner",
          type: "M365",
        },
      ]);
    };

    aadPlugin.grantPermission = async function (
      _ctx: PluginContext
    ): Promise<Result<any, FxError>> {
      return ok([
        {
          name: "teams_app",
          resourceId: "fake_teams_app_resource_id",
          roles: "Administrator",
          type: "M365",
        },
      ]);
    };
    mockedCtx.envInfo.state
      .get(PluginNames.SOLUTION)
      ?.set(REMOTE_TEAMS_APP_TENANT_ID, mockProjectTenantId);

    const result = await solution.grantPermission(mockedCtx);
    if (result.isErr()) {
      chai.assert.fail("result is error");
    }
    expect(result.value.permissions!.length).equal(1);
  });
});
