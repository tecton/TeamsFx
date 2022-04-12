const teamsfxSdk = require("@microsoft/teamsfx");

// Loads current app's configuration, the sample uses client credential flow to acquire token for your API.
const teamsFx = new teamsfxSdk.TeamsFx(teamsfxSdk.IdentityType.App, {
  // You can replace the default authorityHost url with actual value per your requirement.
  authorityHost: "https://login.microsoftonline.com",
  tenantId: process.env.TEAMSFX_API_FAKE_TENANT_ID,
  clientId: process.env.TEAMSFX_API_FAKE_CLIENT_ID,
  // Please add your client secret to .env.teamsfx.local before local debugging.
  clientSecret: process.env.TEAMSFX_API_FAKE_CLIENT_SECRET,
});
// Initializes a new axios instance to call fake API.
const appCredential = teamsFx.getCredential();
const authProvider = new teamsfxSdk.BearerTokenAuthProvider(
  // Please replace '<your-api-scope>' with actual api scope value.
  async () => (await appCredential.getToken("<your-api-scope>"))?.token
);
const fakeClient = teamsfxSdk.createApiClient(teamsFx.getConfig("API_FAKE_ENDPOINT"), authProvider);
export { fakeClient };

/* 
You can now call fake APIs without worrying about authentication. 
Here is an example for a GET request to "relative_path_of_target_api": 
const result = await fakeClient.get("relative_path_of_target_api"); 

You can refer https://aka.ms/teamsfx-connect-api to learn more. 
*/

/* 
Setting API configuration for cloud environment: 
We have already set the configuration to .env.teamsfx.local based on your answers. 
Before you deploy your code to cloud using TeamsFx, please follow https://aka.ms/teamsfx-add-appsettings to add following app settings with appropriate value to your Azure environment: 
TEAMSFX_API_FAKE_ENDPOINT
TEAMSFX_API_FAKE_TENANT_ID
TEAMSFX_API_FAKE_CLIENT_ID
TEAMSFX_API_FAKE_CLIENT_SECRET

You can refer https://aka.ms/teamsfx-connet-api to learn more. 
*/
