import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract, Wallet } from "ethers";
import { getContractAddress } from "ethers/lib/utils";
import { getRegistryContract, initRegistry, updateRegistry } from "./registry";
import { writeFileSync } from "fs";

task("contract:deploy", "Deploys a contract")
  .addParam(
    "name",
    "The name of the contract (i.e. solidity name)",
    undefined,
    types.string
  )
  .addParam(
    "registryName",
    "The name of the contract in the contract registry (e.g. token name)",
    undefined,
    types.string
  )
  .addVariadicPositionalParam("args", "Arguments for deploy")
  .setAction(async ({ name, registryName, args }, hre) => {
    await contractDeploy(hre, name, registryName, ...args);
  });

task("contract:verify", "Verifies contracts")
  .addVariadicPositionalParam(
    "namesOrAddresses",
    "Names of the contract in registry or addresses in registry"
  )
  .setAction(async ({ namesOrAddresses }, hre) => {
    for (const name of namesOrAddresses) {
      await contractVerify(hre, name);
    }
  });

export async function contractDeploy(
  hre: HardhatRuntimeEnvironment,
  name: string,
  registryName: string,
  ...args: Array<any>
): Promise<Contract> {
  console.log(
    `Deploying contract \`${name}\` with name \`${registryName}\` and args: ${args}...`
  );
  const [operator] = await hre.ethers.getSigners();
  const factory = (await hre.ethers.getContractFactory(name)).connect(operator);
  const tx = factory.getDeployTransaction(...args);
  console.log("Sending transaction to the pool...");
  const txResp = await operator.sendTransaction(tx);
  const address = getContractAddress(txResp).toLowerCase();
  console.log(
    `Sent tx \`${txResp.hash}\` to the pool. Waiting 1 confirmation...`
  );
  await txResp.wait();
  console.log(`Successfully deployed at \`${address}\``);
  updateRegistry(hre, registryName, { registryName, name, address, args });

  return await hre.ethers.getContractAt(name, address);
}

async function contractVerify(
  hre: HardhatRuntimeEnvironment,
  contractNameOrAddress: string
) {
  const entry = await getRegistryContract(hre, contractNameOrAddress);
  if (!entry) {
    throw `Contract \`${contractNameOrAddress}\` not found in registry`;
  }
  console.log(
    `Verifying contract \`${entry.name}\` with name \`${entry.registryName}\` at address \`${entry.address}\``
  );
  const argsContent = `module.exports = JSON.parse('${JSON.stringify(
    entry.args
  )}')`;
  const constructorArgsPath = `/tmp/verifyArgs${entry.registryName}.js`;
  writeFileSync(constructorArgsPath, argsContent);
  try {
    await hre.run("verify", {
      address: entry.address,
      constructorArgs: constructorArgsPath,
    });
  } catch (e) {
    console.log(e);
  }
  console.log("Done");
}
