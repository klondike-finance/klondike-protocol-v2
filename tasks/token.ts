import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy } from "./contract";

task("token:deploy", "Deploys a new synthetic token")
  .addParam("name", "The name of the token", undefined, types.string)
  .addParam("symbol", "The ticker of the token", undefined, types.string)
  .addParam("decimals", "Decimals of the token", 18, types.int)
  .setAction(async ({ name, symbol, decimals }, hre) => {
    await tokenDeploy(hre, name, symbol, decimals);
  });

export async function tokenDeploy(
  hre: HardhatRuntimeEnvironment,
  name: string,
  symbol: string,
  decimals: number = 18
) {
  return await contractDeploy(hre, "SyntheticToken", name, symbol, decimals);
}
