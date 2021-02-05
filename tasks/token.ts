import { BigNumber, Contract } from "ethers";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { contractDeploy } from "./contract";
import { getRegistryContract } from "./registry";
import { sendTransaction } from "./utils";

task("token:deploy", "Deploys a new synthetic token")
  .addParam("name", "The name of the token", undefined, types.string)
  .addParam("symbol", "The ticker of the token", undefined, types.string)
  .addParam("decimals", "Decimals of the token", 18, types.int)
  .setAction(async ({ name, symbol, decimals }, hre) => {
    await tokenDeploy(hre, name, symbol, decimals);
  });

task("token:mint", "Mints to an address")
  .addParam(
    "name",
    "The name of the token in the registry or deployment address",
    undefined,
    types.string
  )
  .addParam("to", "Address of the receiver", undefined, types.string)
  .addParam("value", "Value to be minted", 0, types.int)
  .addFlag(
    "force",
    "Force mint if balance non-zero. By default the task doesn't mint to an address with positive balance"
  )
  .setAction(async ({ name, to, value, force }, hre) => {
    await mint(hre, name, to, BigNumber.from(value), force);
  });

export async function tokenDeploy(
  hre: HardhatRuntimeEnvironment,
  name: string,
  symbol: string,
  decimals: number = 18
) {
  return await contractDeploy(
    hre,
    "SyntheticToken",
    name,
    name,
    symbol,
    decimals
  );
}

export async function mint(
  hre: HardhatRuntimeEnvironment,
  registryNameOrAddress: string,
  to: string,
  value: BigNumber,
  force: boolean = false
) {
  console.log(
    `Minting \`${registryNameOrAddress}\` token to \`${to}\`, value: ${value}...`
  );

  const tokenRegistryEntry = getRegistryContract(hre, registryNameOrAddress);
  if (!tokenRegistryEntry) {
    throw `Token not found: ${registryNameOrAddress}`;
  }
  const contract: Contract = await hre.ethers.getContractAt(
    tokenRegistryEntry.name,
    tokenRegistryEntry.address
  );
  const balance = await contract.balanceOf(to);
  if (balance > 0 && !force) {
    console.log(
      `Address \`${to}\` already has nonzero balance of token \`${registryNameOrAddress}\` already. Skipping minting...`
    );
    console.log("Done");
    return;
  }

  const tx = await contract.populateTransaction.mint(to, value);
  await sendTransaction(hre, tx);
  console.log("Done");
}
