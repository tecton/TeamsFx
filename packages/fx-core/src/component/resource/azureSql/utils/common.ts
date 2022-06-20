// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import jwtDecode from "jwt-decode";
import { Constants } from "../constants";

export enum UserType {
  User = "User",
  ServicePrincipal = "ServicePrincipal",
}

export interface TokenInfo {
  name: string;
  objectId: string;
  userType: UserType;
}

export function parseToken(accessToken: string): TokenInfo {
  const jwt = jwtDecode(accessToken) as any;
  let authType: string;
  if (jwt.ver === Constants.jwtToken.ver1) {
    authType = jwt.appidacr;
  } else if (jwt.ver === Constants.jwtToken.ver2) {
    authType = jwt.azpacr;
  } else {
    throw new Error("invalid token");
  }

  if (authType === Constants.jwtToken.userType) {
    return {
      name: jwt.name,
      objectId: jwt.oid,
      userType: UserType.User,
    };
  } else {
    return {
      name: jwt.appid,
      objectId: jwt.oid,
      userType: UserType.ServicePrincipal,
    };
  }
}

export function formatEndpoint(endpoint: string): string {
  endpoint = endpoint.toLowerCase();
  endpoint = endpoint.replace(/[^a-z0-9-]/gi, "");
  if (endpoint[0] === "-") {
    endpoint = endpoint.slice(1);
  }
  return endpoint;
}
