﻿// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using Microsoft.Bot.Schema;
namespace Microsoft.TeamsFx;

/// <summary>
/// Token response provided by Teams Bot SSO prompt
/// </summary>
public class TeamsBotSsoPromptTokenResponse: TokenResponse
{
    /// <summary>
    /// SSO token for user
    /// </summary>
    public string SsoToken;

    /// <summary>
    /// Expire time of SSO token
    /// </summary>
    public string SsoTokenExpiration;
}