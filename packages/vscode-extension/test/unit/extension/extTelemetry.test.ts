import * as chai from "chai";
import * as spies from "chai-spies";
import { Stage, UserError } from "@microsoft/teamsfx-api";
import { ExtTelemetry } from "../../../src/telemetry/extTelemetry";
import * as telemetryModule from "../../../src/telemetry/extTelemetry";
import { TelemetryEvent } from "../../../src/telemetry/extTelemetryEvents";
import sinon = require("sinon");
import * as commonUtils from "../../../src/utils/commonUtils";
import * as fs from "fs-extra";
import * as globalVariables from "../../../src/globalVariables";
import { Uri } from "vscode";
import * as globalState from "@microsoft/teamsfx-core/build/common/globalState";

chai.use(spies);
const spy = chai.spy;

const reporterSpy = spy.interface({
  sendTelemetryErrorEvent(
    eventName: string,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number },
    errorProps?: string[]
  ): void {},
  sendTelemetryEvent(
    eventName: string,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number }
  ): void {},
  sendTelemetryException(
    error: Error,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number }
  ): void {},
});

suite("ExtTelemetry", () => {
  suite("setHasSentTelemetry", () => {
    test("query-expfeature", () => {
      const eventName = "query-expfeature";
      ExtTelemetry.setHasSentTelemetry(eventName);
      chai.expect(ExtTelemetry.hasSentTelemetry).equals(false);
    });

    test("other-event", () => {
      const eventName = "other-event";
      ExtTelemetry.setHasSentTelemetry(eventName);
      chai.expect(ExtTelemetry.hasSentTelemetry).equals(true);
    });
  });

  suite("stageToEvent", () => {
    test("Stage.create", () => {
      const stage = Stage.create;
      chai.expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.CreateProject);
    });

    test("Stage.provision", () => {
      const stage = Stage.provision;
      chai.expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.Provision);
    });

    test("Stage.deploy", () => {
      const stage = Stage.deploy;
      chai.expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.Deploy);
    });

    test("Stage.publish", () => {
      const stage = Stage.publish;
      chai.expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.Publish);
    });

    test("Stage.creatEnv", () => {
      const stage = Stage.createEnv;
      chai.expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.CreateNewEnvironment);
    });

    test("unknown", () => {
      const stage = "unknown";
      chai.expect(ExtTelemetry.stageToEvent(stage as Stage)).equals(undefined);
    });
  });

  suite("Send Telemetry", () => {
    const sandbox = sinon.createSandbox();
    suiteSetup(() => {
      chai.util.addProperty(ExtTelemetry, "reporter", () => reporterSpy);
      sandbox.stub(fs, "pathExistsSync").returns(false);
      sandbox.stub(globalVariables, "workspaceUri").value(Uri.file("test"));
      sandbox.stub(globalVariables, "isSPFxProject").value(false);
      sandbox.stub(globalVariables, "isExistingUser").value("no");
    });

    suiteTeardown(() => {
      sandbox.restore();
    });

    test("sendTelemetryEvent", () => {
      ExtTelemetry.sendTelemetryEvent(
        "sampleEvent",
        { stringProp: "some string" },
        { numericMeasure: 123 }
      );

      chai.expect(reporterSpy.sendTelemetryEvent).to.have.been.called.with(
        "sampleEvent",
        {
          stringProp: "some string",
          component: "extension",
          "is-existing-user": "no",
          "is-spfx": "false",
        },
        { numericMeasure: 123 }
      );
    });

    test("sendTelemetryErrorEvent", () => {
      const error = new UserError(
        "test",
        "UserTestError",
        "test error message",
        "displayed test error message"
      );
      ExtTelemetry.sendTelemetryErrorEvent(
        "sampleEvent",
        error,
        { stringProp: "some string" },
        { numericMeasure: 123 },
        ["errorProps"]
      );

      chai.expect(reporterSpy.sendTelemetryErrorEvent).to.have.been.called.with(
        "sampleEvent",
        {
          stringProp: "some string",
          component: "extension",
          success: "no",
          "is-existing-user": "no",
          "is-spfx": "false",
          "error-type": "user",
          "error-message": `${error.message}${error.stack ? "\nstack:\n" + error.stack : ""}`,
          "error-code": "test.UserTestError",
        },
        { numericMeasure: 123 },
        ["errorProps"]
      );

      chai.expect(reporterSpy.sendTelemetryErrorEvent).to.not.have.been.called.with(
        "sampleEvent",
        {
          stringProp: "some string",
          component: "extension",
          success: "no",
          "is-existing-user": "no",
          "is-spfx": "false",
          "error-type": "user",
          "error-message": `${error.displayMessage}${
            error.stack ? "\nstack:\n" + error.stack : ""
          }`,
          "error-code": "test.UserTestError",
        },
        { numericMeasure: 123 },
        ["errorProps"]
      );
    });

    test("sendTelemetryException", () => {
      const error = new UserError("test", "UserTestError", "test error message");
      ExtTelemetry.sendTelemetryException(
        error,
        { stringProp: "some string" },
        { numericMeasure: 123 }
      );

      chai.expect(reporterSpy.sendTelemetryException).to.have.been.called.with(
        error,
        {
          stringProp: "some string",
          component: "extension",
          "is-existing-user": "no",
          "is-spfx": "false",
        },
        { numericMeasure: 123 }
      );
    });
  });

  suite("deactivate event", () => {
    test("cacheTelemetryEventAsync", () => {
      const clock = sinon.useFakeTimers();
      let state = "";
      sinon.stub(telemetryModule, "lastCorrelationId").value("correlation-id");
      sinon.stub(commonUtils, "getProjectId").returns("project-id");
      const globalStateUpdateStub = sinon
        .stub(globalState, "globalStateUpdate")
        .callsFake(async (key, value) => (state = value));
      const eventName = "deactivate";

      ExtTelemetry.cacheTelemetryEventAsync(eventName);

      sinon.assert.calledOnce(globalStateUpdateStub);
      const telemetryEvents = {
        eventName: eventName,
        properties: {
          "correlation-id": "correlation-id",
          "project-id": "project-id",
          timestamp: new clock.Date().toISOString(),
        },
      };
      const newValue = JSON.stringify(telemetryEvents);
      chai.expect(state).equals(newValue);
      clock.restore();
      sinon.restore();
    });

    test("sendCachedTelemetryEventsAsync", async () => {
      const timestamp = new Date().toISOString();
      const telemetryEvents = {
        eventName: "deactivate",
        properties: {
          "correlation-id": "correlation-id",
          "project-id": "project-id",
          timestamp: timestamp,
        },
      };
      const telemetryData = JSON.stringify(telemetryEvents);
      sinon.stub(globalState, "globalStateGet").callsFake(async () => telemetryData);
      sinon.stub(globalState, "globalStateUpdate");
      chai.util.addProperty(ExtTelemetry, "reporter", () => reporterSpy);

      await ExtTelemetry.sendCachedTelemetryEventsAsync();

      chai.expect(reporterSpy.sendTelemetryEvent).to.have.been.called.with("deactivate", {
        "correlation-id": "correlation-id",
        "project-id": "project-id",
        timestamp: timestamp,
      });
      sinon.restore();
    });
  });
});
